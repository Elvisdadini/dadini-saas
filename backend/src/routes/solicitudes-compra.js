const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, solicitud) {
  const almacen = db.almacenes.find((a) => a.id === solicitud.almacen_id);
  const usuario = db.usuarios.find((u) => u.id === solicitud.usuario_id);
  const orden = db.ordenes_compra.find((o) => o.solicitud_id === solicitud.id);
  const proveedor = db.proveedores.find((p) => p.id === (solicitud.proveedor_id || orden?.proveedor_id));
  return {
    ...solicitud,
    almacen_nombre: almacen?.nombre || '—',
    solicitante: usuario?.nombre || '—',
    proveedor_nombre: proveedor?.nombre || 'Sin asignar',
    orden_codigo: orden?.codigo || null,
    total_estimado: round2((solicitud.items || []).reduce((s, i) => s + num(i.cantidad_aprobada ?? i.cantidad) * num(i.precio_estimado), 0)),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, almacen_id, search } = req.query;
  let items = db.solicitudes_compra.map((s) => resumen(db, s));
  if (estado && estado !== 'todos') items = items.filter((s) => s.estado === estado);
  if (almacen_id) items = items.filter((s) => s.almacen_id === Number(almacen_id));
  if (search) items = items.filter((s) => `${s.codigo} ${s.solicitante} ${s.proveedor_nombre}`.toLowerCase().includes(String(search).toLowerCase()));
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    solicitudes: items,
    resumen: {
      pendientes: items.filter((s) => s.estado === 'pendiente').length,
      aprobadas: items.filter((s) => s.estado === 'aprobada').length,
      recibidas: items.filter((s) => s.estado === 'recibida').length,
    },
  });
});

router.post('/', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const b = req.body || {};
  const items = (b.items || []).map((i) => {
    const producto = db.productos.find((p) => p.id === Number(i.producto_id));
    const cantidad = Math.max(0, Math.round(num(i.cantidad)));
    return {
      producto_id: Number(i.producto_id),
      nombre: producto?.nombre || 'Producto',
      cantidad,
      precio_estimado: num(i.precio_estimado) || num(producto?.costo),
      proveedor_id: i.proveedor_id ? Number(i.proveedor_id) : null,
    };
  }).filter((i) => i.producto_id && i.cantidad > 0);
  if (!items.length) return res.status(400).json({ error: 'Agrega al menos un producto a reponer.' });
  const solicitud = {
    id: nextId(db.solicitudes_compra),
    codigo: nextCode(db.solicitudes_compra, 'codigo', 'SOL-COMP', 1),
    fecha: new Date().toISOString(),
    almacen_id: Number(b.almacen_id) || 1,
    usuario_id: req.user.id,
    proveedor_id: b.proveedor_id ? Number(b.proveedor_id) : null,
    items,
    notas: b.notas || '',
    estado: 'pendiente',
    aprobado_por: null,
    fecha_aprobacion: null,
    recibido_por: null,
    fecha_recepcion: null,
  };
  db.solicitudes_compra.push(solicitud);
  audit(db, req, 'Solicitud de compra creada', 'Compras', `${solicitud.codigo} · ${items.length} productos`);
  save();
  return res.status(201).json({ solicitud: resumen(db, solicitud) });
});

router.put('/:id', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const solicitud = db.solicitudes_compra.find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado !== 'pendiente') return res.status(403).json({ error: 'La solicitud ya fue aprobada y no puede editarse.' });
  const b = req.body || {};
  if (b.almacen_id !== undefined) solicitud.almacen_id = Number(b.almacen_id);
  if (b.proveedor_id !== undefined) solicitud.proveedor_id = b.proveedor_id ? Number(b.proveedor_id) : null;
  if (b.notas !== undefined) solicitud.notas = b.notas;
  if (Array.isArray(b.items)) {
    solicitud.items = b.items.map((i) => {
      const producto = db.productos.find((p) => p.id === Number(i.producto_id));
      return {
        producto_id: Number(i.producto_id),
        nombre: producto?.nombre || i.nombre || 'Producto',
        cantidad: Math.max(0, Math.round(num(i.cantidad))),
        precio_estimado: num(i.precio_estimado) || num(producto?.costo),
        proveedor_id: i.proveedor_id ? Number(i.proveedor_id) : null,
      };
    }).filter((i) => i.producto_id && i.cantidad > 0);
    if (!solicitud.items.length) return res.status(400).json({ error: 'La solicitud debe tener al menos un producto.' });
  }
  audit(db, req, 'Solicitud de compra editada', 'Compras', solicitud.codigo);
  save();
  return res.json({ solicitud: resumen(db, solicitud) });
});

router.put('/:id/aprobar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const solicitud = db.solicitudes_compra.find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado !== 'pendiente') return res.status(400).json({ error: 'La solicitud ya fue gestionada.' });
  const proveedorId = Number(req.body?.proveedor_id) || solicitud.proveedor_id;
  if (!proveedorId) return res.status(400).json({ error: 'Selecciona un proveedor para aprobar.' });
  (req.body?.items || []).forEach((ajuste) => {
    const item = solicitud.items.find((i) => i.producto_id === Number(ajuste.producto_id));
    if (item) item.cantidad_aprobada = Math.max(0, Math.round(num(ajuste.cantidad)));
  });
  solicitud.items.forEach((i) => { if (i.cantidad_aprobada === undefined) i.cantidad_aprobada = i.cantidad; });
  solicitud.proveedor_id = proveedorId;
  solicitud.estado = 'aprobada';
  solicitud.aprobado_por = req.user.id;
  solicitud.fecha_aprobacion = new Date().toISOString();

  const orden = {
    id: nextId(db.ordenes_compra),
    codigo: nextCode(db.ordenes_compra, 'codigo', 'OC', 1),
    solicitud_id: solicitud.id,
    proveedor_id: proveedorId,
    almacen_id: solicitud.almacen_id,
    fecha: new Date().toISOString(),
    items: solicitud.items.map((i) => ({ ...i, cantidad: i.cantidad_aprobada })),
    total: round2(solicitud.items.reduce((s, i) => s + i.cantidad_aprobada * num(i.precio_estimado), 0)),
    estado: 'pendiente',
    pago_estado: 'pendiente',
    notas: solicitud.notas || '',
    created_at: new Date().toISOString(),
  };
  db.ordenes_compra.push(orden);
  audit(db, req, 'Solicitud de compra aprobada', 'Compras', `${solicitud.codigo} → ${orden.codigo}`);
  save();
  return res.json({ solicitud: resumen(db, solicitud), orden });
});

router.put('/:id/rechazar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const solicitud = db.solicitudes_compra.find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  solicitud.estado = 'rechazada';
  solicitud.motivo_rechazo = req.body?.motivo || 'Sin motivo especificado';
  solicitud.aprobado_por = req.user.id;
  audit(db, req, 'Solicitud de compra rechazada', 'Compras', solicitud.codigo);
  save();
  return res.json({ solicitud: resumen(db, solicitud) });
});

router.post('/:id/recibir', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const solicitud = db.solicitudes_compra.find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado !== 'aprobada') return res.status(400).json({ error: 'La solicitud debe estar aprobada para recibirse.' });
  const orden = db.ordenes_compra.find((o) => o.solicitud_id === solicitud.id);
  const ahora = new Date().toISOString();
  const recibidos = [];
  orden.items.forEach((item) => {
    const cantidad = Math.round(num(req.body?.cantidades?.[item.producto_id] ?? item.cantidad));
    if (cantidad <= 0) return;
    let fila = db.stock.find((s) => s.producto_id === item.producto_id && s.almacen_id === Number(solicitud.almacen_id));
    if (!fila) {
      fila = { id: nextId(db.stock), producto_id: item.producto_id, almacen_id: Number(solicitud.almacen_id), cantidad: 0 };
      db.stock.push(fila);
    }
    fila.cantidad += cantidad;
    db.movimientos.unshift({
      id: nextId(db.movimientos), producto_id: item.producto_id, almacen_id: Number(solicitud.almacen_id),
      tipo: 'entrada', cantidad, motivo: `Recepción ${orden.codigo}`,
      referencia: orden.codigo, usuario_id: req.user.id, fecha: ahora,
    });
    recibidos.push({ producto_id: item.producto_id, nombre: item.nombre, cantidad });
  });
  db.ordenes_compra.forEach((o) => {
    if (o.solicitud_id === solicitud.id) o.estado = 'recibida';
  });
  solicitud.estado = 'recibida';
  solicitud.recibido_por = req.user.id;
  solicitud.fecha_recepcion = ahora;
  audit(db, req, 'Compra recibida', 'Compras', `${orden.codigo} · ${recibidos.length} productos`);
  save();
  return res.json({ solicitud: resumen(db, solicitud), orden, recibidos });
});

module.exports = router;
