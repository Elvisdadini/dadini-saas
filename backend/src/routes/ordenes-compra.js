const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, orden) {
  const proveedor = db.proveedores.find((p) => p.id === orden.proveedor_id);
  const solicitud = db.solicitudes_compra.find((s) => s.id === orden.solicitud_id);
  const pagos = db.pagos_proveedor.filter((p) => p.orden_compra_id === orden.id);
  const pagado = round2(pagos.reduce((s, p) => s + p.monto, 0));
  return {
    ...orden,
    proveedor_nombre: proveedor?.nombre || '—',
    solicitud_codigo: solicitud?.codigo || '—',
    pagado,
    saldo: round2(orden.total - pagado),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, pago_estado, proveedor_id, search } = req.query;
  let items = db.ordenes_compra.map((o) => resumen(db, o));
  if (estado && estado !== 'todos') items = items.filter((o) => o.estado === estado);
  if (pago_estado && pago_estado !== 'todos') items = items.filter((o) => o.pago_estado === pago_estado);
  if (proveedor_id) items = items.filter((o) => o.proveedor_id === Number(proveedor_id));
  if (search) items = items.filter((o) => `${o.codigo} ${o.proveedor_nombre} ${o.solicitud_codigo}`.toLowerCase().includes(String(search).toLowerCase()));
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    ordenes: items,
    resumen: {
      total: items.reduce((s, o) => s + o.total, 0),
      pagado: items.reduce((s, o) => s + o.pagado, 0),
      saldo: items.reduce((s, o) => s + o.saldo, 0),
      pendientes_pago: items.filter((o) => o.saldo > 0).length,
    },
  });
});

router.post('/:id/pagar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const orden = db.ordenes_compra.find((o) => o.id === Number(req.params.id));
  if (!orden) return res.status(404).json({ error: 'Orden no encontrada.' });
  const info = resumen(db, orden);
  const monto = round2(num(req.body?.monto));
  if (monto <= 0) return res.status(400).json({ error: 'Ingresa un monto mayor a cero.' });
  if (monto > info.saldo + 0.01) return res.status(400).json({ error: `El monto supera el saldo (Bs ${info.saldo.toFixed(2)}).` });
  const pago = {
    id: nextId(db.pagos_proveedor),
    codigo: nextCode(db.pagos_proveedor, 'codigo', 'PAG-PROV', 1),
    orden_compra_id: orden.id,
    proveedor_id: orden.proveedor_id,
    monto,
    metodo: req.body?.metodo || 'transferencia',
    referencia: req.body?.referencia || '',
    notas: req.body?.notas || '',
    fecha: new Date().toISOString(),
    usuario_id: req.user.id,
  };
  db.pagos_proveedor.push(pago);
  const nuevoPagado = round2(info.pagado + monto);
  orden.pago_estado = nuevoPagado >= orden.total ? 'pagado' : 'parcial';
  audit(db, req, 'Pago a proveedor registrado', 'Compras', `${orden.codigo} · Bs ${monto.toFixed(2)}`);
  save();
  return res.status(201).json({ pago, orden: resumen(db, orden) });
});

module.exports = router;
