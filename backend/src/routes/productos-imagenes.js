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

function nombreArchivo(sku) {
  return `${String(sku || '').trim().toLowerCase().replace(/[^a-z0-9-_]/g, '') || 'producto'}.webp`;
}

function decodificar(dataUrl) {
  const valor = String(dataUrl || '');
  if (!/^data:image\/(webp|jpeg|png);base64,/i.test(valor)) return null;
  const buffer = Buffer.from(valor.slice(valor.indexOf(',') + 1), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  return buffer;
}

async function subirUno(sku, dataUrl, bucketListo = false) {
  if (!bucketListo) await asegurarBucket();
  const buffer = decodificar(dataUrl);
  if (!buffer) return { ok: false, error: `Imagen inválida o mayor a 200 KB (${sku}).` };
  const archivo = nombreArchivo(sku);
  const storage = cliente().storage;
  const { error } = await storage.from(BUCKET).upload(archivo, buffer, {
    contentType: 'image/webp',
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
    const normalizar = (s) => String(s || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
    const clave = normalizar(sku);
    const producto = db.productos.find((p) => normalizar(p.sku) === clave || normalizar(p.nombre) === clave);
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
    const normalizar = (s) => String(s || '').trim().toLowerCase().replace(/[_\s]+/g, ' ');
    const porSku = new Map(db.productos.map((p) => [normalizar(p.sku), p]));
    const porNombre = new Map(db.productos.map((p) => [normalizar(p.nombre), p]));
    for (const item of imagenes) {
      const clave = normalizar(item?.sku);
      // El nombre del archivo suele ser el nombre del producto (ej.
      // "Cookie chips chocolate.jpg"), no el SKU (SNA001).
      const producto = porSku.get(clave) || porNombre.get(clave);
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
