const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, c) {
  const carga = db.cargas.find((x) => x.id === c.carga_id);
  const almacenista = db.usuarios.find((u) => u.id === c.almacenista_id);
  const distribuidor = db.repartidores.find((r) => r.id === c.distribuidor_id);
  const usuarioDistribuidor = db.usuarios.find((u) => u.id === c.usuario_distribuidor_id);
  return {
    ...c,
    carga_codigo: carga?.codigo || '—',
    ruta_codigo: db.rutas.find((r) => r.id === carga?.ruta_id)?.codigo || '—',
    almacenista_nombre: almacenista?.nombre || 'Almacén',
    distribuidor_nombre: distribuidor?.nombre || 'Sin asignar',
    usuario_distribuidor_nombre: usuarioDistribuidor?.nombre || '—',
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { carga_id, distribuidor_id, estado } = req.query;
  let items = db.confirmaciones_carga.map((c) => resumen(db, c));
  if (carga_id) items = items.filter((c) => c.carga_id === Number(carga_id));
  if (distribuidor_id) items = items.filter((c) => c.distribuidor_id === Number(distribuidor_id));
  if (estado && estado !== 'todos') items = items.filter((c) => c.estado_distribuidor === estado);
  items.sort((a, b) => String(b.fecha_almacen).localeCompare(String(a.fecha_almacen)));
  return res.json({
    confirmaciones: items,
    resumen: {
      pendientes: items.filter((c) => c.estado_distribuidor === 'pendiente').length,
      confirmadas: items.filter((c) => c.estado_distribuidor === 'confirmada').length,
    },
  });
});

router.post('/', allow('almacen', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const { carga_id, observaciones_almacen, novedades } = req.body || {};
  const carga = db.cargas.find((c) => c.id === Number(carga_id));
  if (!carga) return res.status(404).json({ error: 'Carga no encontrada.' });
  const distribuidorId = db.rutas.find((r) => r.id === carga.ruta_id)?.repartidor_id || null;
  const usuarioDistribuidor = db.usuarios.find((u) => u.repartidor_id === distribuidorId);
  const ahora = new Date().toISOString();
  const existente = db.confirmaciones_carga.find((c) => c.carga_id === carga.id);
  const _confirm = existente || {
    id: nextId(db.confirmaciones_carga),
    carga_id: carga.id,
    distribuidor_id: distribuidorId,
    usuario_distribuidor_id: usuarioDistribuidor?.id || null,
    estado_almacen: 'confirmada',
    estado_distribuidor: 'pendiente',
    fecha_almacen: ahora,
  };
  _confirm.observaciones_almacen = observaciones_almacen || '';
  _confirm.novedades = Array.isArray(novedades) ? novedades : [];
  _confirm.fecha_almacen = ahora;
  if (!existente) db.confirmaciones_carga.push(_confirm);

  if (usuarioDistribuidor) {
    db.notificaciones.unshift({
      id: nextId(db.notificaciones),
      tipo: 'carga',
      titulo: `Carga ${carga.codigo} lista para confirmar`,
      detalle: `El almacén confirmó la carga. Revisa novedades: ${_confirm.novedades.length ? _confirm.novedades.map((n) => n.tipo).join(', ') : 'sin novedades'}`,
      leida: false,
      fecha: ahora,
      usuario_id: usuarioDistribuidor.id,
    });
  }
  audit(db, req, 'Carga confirmada por almacén', 'Inventario', `${carga.codigo} · ${_confirm.novedades.length} novedades`);
  save();
  return res.status(201).json({ confirmacion: resumen(db, _confirm) });
});

router.patch('/:id/confirmar-distribuidor', allow('distribucion', 'ventas', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const confirmacion = db.confirmaciones_carga.find((c) => c.id === Number(req.params.id));
  if (!confirmacion) return res.status(404).json({ error: 'Confirmación no encontrada.' });
  confirmacion.estado_distribuidor = 'confirmada';
  confirmacion.observaciones_distribuidor = req.body?.observaciones_distribuidor || '';
  confirmacion.novedades_distribuidor = Array.isArray(req.body?.novedades) ? req.body.novedades : [];
  confirmacion.fecha_distribuidor = new Date().toISOString();
  audit(db, req, 'Carga confirmada por distribuidor', 'Distribución', `${confirmacion.carga_id} · ${confirmacion.observaciones_distribuidor || 'sin observaciones'}`);
  save();
  return res.json({ confirmacion: resumen(db, confirmacion) });
});

module.exports = router;
