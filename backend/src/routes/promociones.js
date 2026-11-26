const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');
const { evaluar } = require('../promociones');

const router = express.Router();
router.use(authRequired);

function resumen(promo) {
  const tipos = { volumen: 'Descuento por volumen', bonificacion: 'Bonificación', '2x1': '2x1 / NxM', mixto: 'Promoción mixta' };
  return { ...promo, tipo_label: tipos[promo.tipo] || promo.tipo };
}

router.get('/sugerencias-vencimientos', (req, res) => {
  const db = load();
  const hoy = new Date().toISOString().slice(0, 10);
  const sugerencias = (db.lotes || [])
    .filter((l) => Number(l.cantidad) > 0 && l.fecha_vencimiento)
    .map((l) => {
      const producto = (db.productos || []).find((p) => p.id === Number(l.producto_id));
      return {
        lote_id: l.id,
        producto_id: l.producto_id,
        producto_nombre: producto?.nombre || `#${l.producto_id}`,
        sku: producto?.sku || '',
        lote: l.lote,
        cantidad: Number(l.cantidad),
        fecha_vencimiento: l.fecha_vencimiento,
        dias_para_vencer: Math.round((Date.parse(l.fecha_vencimiento) - Date.parse(hoy)) / 86400000),
      };
    })
    .filter((l) => l.dias_para_vencer <= 60)
    .sort((a, b) => a.dias_para_vencer - b.dias_para_vencer)
    .slice(0, 20);
  return res.json({ sugerencias, alerta: sugerencias.some((s) => s.dias_para_vencer <= 15) });
});

router.get('/', (req, res) => {
  const db = load();
  const { tipo, estado, search } = req.query;
  let promos = require('../alcance').filtrar(req, db.promociones, ['usuario_id']).map(resumen);
  if (tipo && tipo !== 'todas') promos = promos.filter((p) => p.tipo === tipo);
  if (estado === 'activas') promos = promos.filter((p) => p.activa);
  if (estado === 'inactivas') promos = promos.filter((p) => !p.activa);
  if (search) promos = promos.filter((p) => `${p.codigo} ${p.nombre}`.toLowerCase().includes(String(search).toLowerCase()));
  return res.json({
    promociones: promos.sort((a, b) => num(b.prioridad) - num(a.prioridad)),
    resumen: {
      total: db.promociones.length,
      activas: db.promociones.filter((p) => p.activa).length,
      por_tipo: ['volumen', 'bonificacion', '2x1', 'mixto'].map((t) => ({ tipo: t, total: db.promociones.filter((p) => p.tipo === t).length })),
    },
  });
});

router.post('/evaluar', (req, res) => {
  const db = load();
  const { items, almacen_id, fecha, categoria_cliente_id, cliente_id } = req.body || {};
  const cliente = cliente_id ? db.clientes.find((c) => c.id === Number(cliente_id)) : null;
  const categoria = categoria_cliente_id || cliente?.categoria_cliente_id || null;
  const resultado = evaluar(db, items, Number(almacen_id) || db.almacenes[0]?.id || 1, fecha || new Date().toISOString().slice(0, 10), categoria);
  return res.json(resultado);
});

function normalizar(body) {
  return {
    nombre: String(body.nombre || '').trim(),
    tipo: ['volumen', 'bonificacion', '2x1', 'mixto'].includes(body.tipo) ? body.tipo : 'volumen',
    descripcion: body.descripcion || '',
    productos_ids: (body.productos_ids || []).map(Number),
    categorias: body.categorias || [],
    categorias_clientes: Array.isArray(body.categorias_clientes) ? body.categorias_clientes.map(Number) : [],
    reglas: body.reglas || [],
    dos_por_uno: body.dos_por_uno || null,
    bonificacion: body.bonificacion || null,
    mixto: body.mixto || null,
    fecha_inicio: body.fecha_inicio || new Date().toISOString().slice(0, 10),
    fecha_fin: body.fecha_fin || null,
    activa: body.activa !== false,
    prioridad: num(body.prioridad, 5),
    imagenes: Array.isArray(body.imagenes) ? body.imagenes.slice(0, 2) : [],
  };
}

// Las imágenes llegan como dataURL optimizadas por el frontend. Se suben a
// Supabase y se guarda solo la URL pública en la promoción.
async function procesarImagenes(datos, anteriores = []) {
  const resultado = [];
  for (const imagen of datos.imagenes) {
    if (typeof imagen === 'string' && imagen.startsWith('data:image/')) {
      const { subirFoto } = require('../fotos');
      const subida = await subirFoto(imagen, 'promocion');
      resultado.push(subida.url);
    } else if (typeof imagen === 'string' && imagen.startsWith('http')) {
      resultado.push(imagen);
    }
  }
  datos.imagenes = resultado.slice(0, 2);
  for (const url of anteriores) {
    if (url && !datos.imagenes.includes(url)) {
      const { eliminarFoto } = require('../fotos');
      await eliminarFoto(url).catch(() => {});
    }
  }
  return datos;
}

router.post('/', requirePermiso('promociones.crear'), allow('admin', 'ventas', 'almacen'), async (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {});
  if (!datos.nombre) return res.status(400).json({ error: 'El nombre de la promoción es obligatorio.' });
  try { await procesarImagenes(datos); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  const ahora = new Date().toISOString();
  const promo = {
    id: nextId(db.promociones),
    codigo: nextCode(db.promociones, 'codigo', 'PROM', 1),
    ...datos,
    usuario_id: req.user.id,
    created_at: ahora,
    updated_at: ahora,
  };
  db.promociones.push(promo);
  audit(db, req, 'Promoción creada', 'Inventario', `${promo.codigo} · ${promo.nombre}`);
  save();
  return res.status(201).json({ promocion: resumen(promo) });
});

router.put('/:id', requirePermiso('promociones.editar'), allow('admin', 'ventas', 'almacen'), async (req, res) => {
  const db = load();
  const promo = db.promociones.find((p) => p.id === Number(req.params.id));
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada.' });
  const datos = normalizar(req.body || {});
  try { await procesarImagenes(datos, promo.imagenes || []); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  Object.assign(promo, datos, { updated_at: new Date().toISOString() });
  audit(db, req, 'Promoción actualizada', 'Inventario', promo.nombre);
  save();
  return res.json({ promocion: resumen(promo) });
});

router.patch('/:id/estado', requirePermiso('promociones.editar'), allow('admin', 'ventas', 'almacen'), (req, res) => {
  const db = load();
  const promo = db.promociones.find((p) => p.id === Number(req.params.id));
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada.' });
  promo.activa = Boolean(req.body?.activa);
  promo.updated_at = new Date().toISOString();
  save();
  return res.json({ promocion: resumen(promo) });
});

router.delete('/:id', requirePermiso('promociones.eliminar'), allow('admin', 'almacen'), async (req, res) => {
  const db = load();
  const promo = db.promociones.find((p) => p.id === Number(req.params.id));
  if (!promo) return res.status(404).json({ error: 'Promoción no encontrada.' });
  db.promociones = db.promociones.filter((p) => p.id !== promo.id);
  const { eliminarFoto } = require('../fotos');
  for (const url of promo.imagenes || []) await eliminarFoto(url).catch(() => {});
  audit(db, req, 'Promoción eliminada', 'Inventario', promo.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
