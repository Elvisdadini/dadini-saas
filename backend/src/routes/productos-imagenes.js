const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit, round2 } = require('../utils');
const { obtenerCliente } = require('../supabase-client');
const { ensureBucket } = require('../supabase-storage');

const router = express.Router();
router.use(authRequired);

const BUCKET = 'productos';
const MAX_BYTES = 200 * 1024; // máximo 200 KB por imagen

function cliente() {
  const supabase = obtenerCliente();
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}
function asegurarBucket() {
  return ensureBucket(BUCKET);
}

function normalizar(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+gr\b/g, 'gr')
    .replace(/\bvanilla\b/g, 'vainilla')
    .replace(/\b(\w{4,})s\b/g, '$1')
    .replace(/\s+/g, ' ');
}

function resolverProducto(db, clave) {
  const normalizada = normalizar(clave);
  const porSku = new Map(db.productos.map((p) => [normalizar(p.sku), p]));
  const porNombre = new Map(db.productos.map((p) => [normalizar(p.nombre), p]));
  const exacto = porSku.get(normalizada) || porNombre.get(normalizada);
  if (exacto) return exacto;
  const buscadas = new Set(normalizar(clave).split(' ').filter((p) => p.length > 2));
  let mejor = null;
  let puntaje = 0;
  for (const p of db.productos) {
    const disponibles = new Set(normalizar(`${p.nombre} ${p.sku}`).split(' ').filter((w) => w.length > 2));
    let coincidencias = 0;
    buscadas.forEach((w) => { if (disponibles.has(w)) coincidencias += 1; });
    const score = coincidencias / Math.max(1, buscadas.size);
    if (score > puntaje) { puntaje = score; mejor = p; }
  }
  return puntaje >= 0.6 ? mejor : null;
}

function nombreArchivo(sku, extension = 'webp') {
  return `${String(sku || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'producto'}.${extension}`;
}

function decodificar(dataUrl) {
  const valor = String(dataUrl || '');
  const coincidence = valor.match(/^data:image\/(webp|jpeg|png);base64,/i);
  if (!coincidence) return null;
  const buffer = Buffer.from(valor.slice(valor.indexOf(',') + 1), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  const tipo = coincidence[1].toLowerCase();
  return { buffer, mime: `image/${tipo}`, extension: tipo === 'jpeg' ? 'jpg' : tipo };
}

async function subirUno(sku, dataUrl, bucketListo = false) {
  if (!bucketListo) await asegurarBucket();
  const imagen = decodificar(dataUrl);
  if (!imagen) return { ok: false, error: `Imagen inválida o mayor a 200 KB (${sku}).` };
  const { buffer, mime, extension } = imagen;
  const archivo = nombreArchivo(sku, extension);
  const storage = cliente().storage;
  const { error } = await storage.from(BUCKET).upload(archivo, buffer, {
    contentType: mime,
    cacheControl: '3600',
    upsert: true,
  });
  if (error) return { ok: false, error: error.message };
  const { data } = storage.from(BUCKET).getPublicUrl(archivo);
  return { ok: true, sku, url: data.publicUrl, bytes: buffer.length };
}

router.post('/upload', allow('admin', 'dueno', 'almacen'), async (req, res) => {
  const db = load();
  const { sku, imagen } = req.body || {};
  if (!sku) return res.status(400).json({ error: 'Indica el SKU del producto.' });
  try {
    const resultado = await subirUno(sku, imagen);
    if (!resultado.ok) return res.status(400).json({ error: resultado.error });
    const producto = resolverProducto(db, sku);
    if (producto) producto.imagen_url = resultado.url;
    audit(db, req, 'Imagen de producto cargada', 'Inventario', `${sku} · ${round2(resultado.bytes / 1024)} KB`);
    save();
    return res.status(201).json({ ...resultado, producto_id: producto?.id || null });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

// Carga masiva: el navegador optimiza cada imagen a WebP y envía lotes.
router.post('/lote', allow('admin', 'dueno', 'almacen'), async (req, res) => {
  const db = load();
  const imagenes = Array.isArray(req.body?.imagenes) ? req.body.imagenes : [];
  if (!imagenes.length) return res.status(400).json({ error: 'No se enviaron imágenes.' });
  if (imagenes.length > 60) return res.status(400).json({ error: 'Máximo 60 imágenes por lote.' });
  const correctas = [];
  const errores = [];
  try {
    await asegurarBucket();
    for (const item of imagenes) {
      // El nombre del archivo suele ser el nombre del producto (ej.
      // "Cookie chips chocolate.jpg"), no el SKU (SNA001). Se intenta
      // coincidencia exacta y, si no, tolerante a tildes/abreviaturas.
      const producto = resolverProducto(db, item?.sku);
      if (!producto) {
        errores.push(`No existe un producto con SKU o nombre "${item?.sku}".`);
        continue;
      }
      const resultado = await subirUno(item?.sku, item?.imagen, true);
      if (resultado.ok) {
        correctas.push({ ...resultado, producto_id: producto.id, producto_nombre: producto.nombre });
        producto.imagen_url = resultado.url;
      } else errores.push(resultado.error);
    }
    if (correctas.length) {
      audit(db, req, 'Imágenes de producto cargadas', 'Inventario', `${correctas.length} imágenes · ${errores.length} errores`);
      save();
    }
    return res.json({ cargadas: correctas.length, errores, resultados: correctas });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.get('/estado', (req, res) => {
  const db = load();
  return res.json({
    bucket: BUCKET,
    configurado: Boolean(obtenerCliente()),
    con_imagen: db.productos.filter((p) => p.imagen_url).length,
    total: db.productos.length,
    maximo_kb: Math.round(MAX_BYTES / 1024),
  });
});

router.delete('/:sku', allow('admin', 'dueno', 'almacen'), async (req, res) => {
  const db = load();
  const archivo = nombreArchivo(req.params.sku);
  try {
    await cliente().storage.from(BUCKET).remove([archivo]);
    const producto = db.productos.find((p) => String(p.sku).toLowerCase() === String(req.params.sku).toLowerCase());
    if (producto) producto.imagen_url = null;
    audit(db, req, 'Imagen de producto eliminada', 'Inventario', req.params.sku);
    save();
    return res.json({ ok: true });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

module.exports = router;
