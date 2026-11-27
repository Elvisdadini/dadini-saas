const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { audit, nextId } = require('../utils');
const kardex = require('../kardex');

const router = express.Router();
router.use(authRequired);

const GESTION = ['admin', 'dueno', 'almacen', 'supervisor'];

function enriquecer(db, fila) {
  const producto = (db.productos || []).find((p) => p.id === Number(fila.producto_id));
  const almacen = (db.almacenes || []).find((a) => a.id === Number(fila.almacen_id));
  const movil = (db.almacenes_moviles || []).find((a) => a.id === Number(fila.almacen_movil_id));
  const usuario = (db.usuarios || []).find((u) => u.id === fila.usuario_id);
  return {
    ...fila,
    producto_nombre: producto?.nombre || 'Producto eliminado',
    producto_sku: producto?.sku || '',
    almacen_nombre: movil?.nombre || almacen?.nombre || '—',
    usuario_nombre: usuario?.nombre || 'Sistema',
  };
}

router.get('/', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const { producto_id, almacen_id, tipo, desde, hasta, limit } = req.query;
  let movimientos = (db.kardex || []).map((m) => enriquecer(db, m));
  if (producto_id) movimientos = movimientos.filter((m) => Number(m.producto_id) === Number(producto_id));
  if (almacen_id) movimientos = movimientos.filter((m) => Number(m.almacen_id) === Number(almacen_id));
  if (tipo && tipo !== 'todos') movimientos = movimientos.filter((m) => m.tipo === tipo);
  if (desde) movimientos = movimientos.filter((m) => String(m.fecha).slice(0, 10) >= desde);
  if (hasta) movimientos = movimientos.filter((m) => String(m.fecha).slice(0, 10) <= hasta);
  movimientos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
  const total = movimientos.length;
  if (limit) movimientos = movimientos.slice(0, Number(limit));
  const vencimientos = kardex.vencimientos(db, 60).map((l) => enriquecer(db, l));
  res.json({
    movimientos,
    total,
    lotes: (db.lotes || []).map((l) => enriquecer(db, l)),
    vencimientos,
    resumen: {
      lotes_activos: (db.lotes || []).filter((l) => Number(l.cantidad) > 0).length,
      vencidos: vencimientos.filter((l) => l.estado === 'vencido').length,
      proximos: vencimientos.filter((l) => l.estado === 'proximo').length,
      entradas: (db.kardex || []).filter((m) => m.tipo.includes('entrada')).reduce((s, m) => s + m.cantidad, 0),
      salidas: (db.kardex || []).filter((m) => m.tipo.includes('salida') || m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0),
    },
  });
});

router.get('/producto/:id', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const id = Number(req.params.id);
  const lotes = (db.lotes || []).filter((l) => Number(l.producto_id) === id).map((l) => enriquecer(db, l));
  const movimientos = (db.kardex || []).filter((m) => Number(m.producto_id) === id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id)
    .map((m) => enriquecer(db, m));
  res.json({ lotes, movimientos, total: movimientos.length });
});

router.get('/alertas', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const dias = Number(req.query.dias) || 60;
  const lista = kardex.vencimientos(db, dias)
    .filter((l) => l.estado !== 'vigente')
    .map((l) => enriquecer(db, l));
  res.json({ alertas: lista, vencidos: lista.filter((l) => l.estado === 'vencido').length, proximos: lista.filter((l) => l.estado === 'proximo').length });
});

router.post('/entrada', requirePermiso('kardex.crear'), allow(...GESTION), (req, res) => {
  const db = load();
  const b = req.body || {};
  if (!b.producto_id || !b.almacen_id) return res.status(400).json({ error: 'Selecciona producto y almacén.' });
  try {
    const resultado = kardex.registrarEntrada(db, {
      producto_id: b.producto_id, almacen_id: b.almacen_id, almacen_movil_id: b.almacen_movil_id,
      cantidad: b.cantidad, lote: b.lote, fecha_vencimiento: b.fecha_vencimiento,
      motivo: b.motivo || 'Entrada de inventario', referencia: b.referencia,
      usuario_id: req.user.id,
    });
    audit(db, req, 'Entrada por lote registrada', 'Inventario', `${b.cantidad} uds. · lote ${resultado.lote.lote}`);
    save();
    return res.status(201).json({ ok: true, ...resultado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/transferencia', requirePermiso('kardex.editar'), allow(...GESTION), (req, res) => {
  const db = load();
  const b = req.body || {};
  if (!b.producto_id || !b.origen_id || !b.destino_id) return res.status(400).json({ error: 'Faltan producto o almacenes.' });
  if (Number(b.origen_id) === Number(b.destino_id)) return res.status(400).json({ error: 'El origen y destino deben ser distintos.' });
  try {
    const resultado = kardex.transferir(db, {
      producto_id: b.producto_id, origen_id: b.origen_id, destino_id: b.destino_id,
      origen_movil_id: b.origen_movil_id, destino_movil_id: b.destino_movil_id,
      cantidad: b.cantidad, motivo: b.motivo, referencia: b.referencia, usuario_id: req.user.id,
    });
    audit(db, req, 'Transferencia FEFO registrada', 'Inventario', `${resultado.consumido} uds.`);
    save();
    return res.json({ ok: true, ...resultado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

function asegurarSolicitudes(db) {
  if (!Array.isArray(db.solicitudes_vencimiento)) db.solicitudes_vencimiento = [];
  return db.solicitudes_vencimiento;
}

function notificar(db, titulo, detalle, usuarioId = null) {
  if (!Array.isArray(db.notificaciones)) db.notificaciones = [];
  db.notificaciones.unshift({
    id: nextId(db.notificaciones), tipo: 'vencimiento', titulo, detalle,
    ruta: '/inventario/kardex',
    leida: false, fecha: new Date().toISOString(), usuario_id: usuarioId,
  });
}

router.get('/solicitudes-vencimiento', (req, res) => {
  const db = load();
  let lista = [...asegurarSolicitudes(db)];
  if (!['admin', 'dueno', 'supervisor'].includes(req.user.rol)) {
    lista = lista.filter((s) => Number(s.solicitado_por) === Number(req.user.id));
  }
  lista.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  res.json({ solicitudes: lista, total: lista.length });
});

router.post('/solicitudes-vencimiento', requirePermiso('kardex.solicitar_cambio'), (req, res) => {
  const db = load();
  const lote = (db.lotes || []).find((l) => l.id === Number(req.body?.lote_id));
  if (!lote) return res.status(404).json({ error: 'Lote no encontrado.' });
  const fecha = String(req.body?.fecha_solicitada || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ error: 'Indica una fecha válida.' });
  const motivo = String(req.body?.motivo || '').trim();
  if (!motivo) return res.status(400).json({ error: 'Indica el motivo del cambio.' });
  const lista = asegurarSolicitudes(db);
  const solicitud = {
    id: nextId(lista),
    lote_id: lote.id,
    producto_id: lote.producto_id,
    lote: lote.lote,
    fecha_actual: lote.fecha_vencimiento || null,
    fecha_solicitada: fecha,
    motivo,
    solicitado_por: req.user.id,
    solicitado_por_nombre: req.user.nombre,
    estado: 'pendiente',
    aprobado_por: null,
    supervisor_id: null,
    creado_en: new Date().toISOString(),
    resuelto_en: null,
  };
  lista.push(solicitud);
  notificar(db, 'Solicitud de cambio de vencimiento', `${lote.lote} · ${solicitud.fecha_actual || 'sin fecha'} → ${fecha}`);
  save();
  return res.status(201).json({ ok: true, solicitud });
});

router.post('/solicitudes-vencimiento/:id/aprobar', requirePermiso('kardex.aprobar_cambio'), allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const solicitud = asegurarSolicitudes(db).find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'La solicitud ya fue resuelta.' });
  const supervisor = (db.usuarios || []).find((u) => u.id === Number(req.body?.supervisor_id));
  if (!supervisor) return res.status(400).json({ error: 'Selecciona el supervisor que verificará el cambio.' });
  const lote = (db.lotes || []).find((l) => l.id === solicitud.lote_id);
  if (!lote) return res.status(404).json({ error: 'El lote ya no existe.' });
  lote.fecha_vencimiento = solicitud.fecha_solicitada;
  lote.fecha_actualizada_en = new Date().toISOString();
  solicitud.estado = 'aprobada';
  solicitud.aprobado_por = req.user.id;
  solicitud.supervisor_id = supervisor.id;
  solicitud.resuelto_en = new Date().toISOString();
  audit(db, req, 'Fecha de vencimiento corregida', 'Inventario', `${lote.lote} → ${solicitud.fecha_solicitada}`);
  notificar(db, 'Cambio de vencimiento aprobado', `${lote.lote} ahora vence ${solicitud.fecha_solicitada}. Verifica: ${supervisor.nombre}`, supervisor.id);
  save();
  return res.json({ ok: true, solicitud, lote });
});

router.post('/solicitudes-vencimiento/:id/rechazar', requirePermiso('kardex.aprobar_cambio'), allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const solicitud = asegurarSolicitudes(db).find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'La solicitud ya fue resuelta.' });
  solicitud.estado = 'rechazada';
  solicitud.nota = String(req.body?.nota || '').trim() || null;
  solicitud.resuelto_en = new Date().toISOString();
  audit(db, req, 'Solicitud de vencimiento rechazada', 'Inventario', solicitud.lote);
  save();
  return res.json({ ok: true, solicitud });
});

module.exports = router;
