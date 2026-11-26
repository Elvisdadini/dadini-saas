const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

const hoyISO = () => new Date().toISOString().slice(0, 10);

function cajaAbierta(db, usuarioId) {
  return (db.cajas || []).find((c) => c.usuario_id === usuarioId && c.estado === 'abierta') || null;
}

function movimientosDeCaja(db, cajaId) {
  return (db.movimientos_caja || []).filter((m) => m.caja_id === cajaId);
}

function resumenCaja(db, caja) {
  const movimientos = movimientosDeCaja(db, caja.id);
  const ingresos = movimientos.filter((m) => m.tipo === 'ingreso').reduce((s, m) => s + m.monto, 0);
  const egresos = movimientos.filter((m) => m.tipo === 'egreso').reduce((s, m) => s + m.monto, 0);
  const esperado = round2(Number(caja.saldo_inicial || 0) + ingresos - egresos);
  return {
    ...caja,
    ingresos: round2(ingresos),
    egresos: round2(egresos),
    saldo_esperado: esperado,
    movimientos,
  };
}

// Asegura que todo cobro tenga una caja asociada: si el usuario no abrió una,
// se abre automáticamente en Bs 0 para no bloquear la operación.
function asegurarCaja(db, req) {
  let caja = cajaAbierta(db, req.user.id);
  if (!caja) {
    caja = {
      id: nextId(db.cajas),
      codigo: nextCode(db.cajas, 'codigo', 'CAJ', 1),
      fecha: hoyISO(),
      usuario_id: req.user.id,
      estado: 'abierta',
      saldo_inicial: 0,
      apertura_en: new Date().toISOString(),
      apertura_automatica: true,
      notas: 'Apertura automática al registrar el primer movimiento',
    };
    db.cajas.push(caja);
  }
  return caja;
}

function registrarMovimiento(db, req, { caja, tipo, monto, motivo, referencia, pedido_id }) {
  const movimiento = {
    id: nextId(db.movimientos_caja),
    caja_id: caja.id,
    tipo: tipo === 'egreso' ? 'egreso' : 'ingreso',
    monto: round2(monto),
    motivo: motivo || '',
    referencia: referencia || null,
    pedido_id: pedido_id || null,
    usuario_id: req.user.id,
    fecha: new Date().toISOString(),
  };
  db.movimientos_caja.push(movimiento);
  return movimiento;
}

router.get('/actual', (req, res) => {
  const db = load();
  const caja = cajaAbierta(db, req.user.id);
  res.json({ caja: caja ? resumenCaja(db, caja) : null });
});

router.get('/resumen', (req, res) => {
  const db = load();
  const fecha = String(req.query.fecha || hoyISO()).slice(0, 10);
  const usuarioId = req.query.usuario_id ? Number(req.query.usuario_id) : null;
  const cajas = (db.cajas || [])
    .filter((c) => c.fecha === fecha && (!usuarioId || c.usuario_id === usuarioId))
    .map((c) => resumenCaja(db, c));
  res.json({ fecha, cajas, total: cajas.length });
});

router.post('/apertura', requirePermiso('caja.apertura'), allow('admin', 'dueno', 'supervisor', 'ventas', 'cobranzas'), (req, res) => {
  const db = load();
  const existente = cajaAbierta(db, req.user.id);
  if (existente) return res.status(400).json({ error: 'Ya tienes una caja abierta.', caja: resumenCaja(db, existente) });
  const caja = {
    id: nextId(db.cajas),
    codigo: nextCode(db.cajas, 'codigo', 'CAJ', 1),
    fecha: hoyISO(),
    usuario_id: req.user.id,
    estado: 'abierta',
    saldo_inicial: round2(num(req.body?.saldo_inicial, 0)),
    apertura_en: new Date().toISOString(),
    notas: String(req.body?.notas || ''),
  };
  db.cajas.push(caja);
  audit(db, req, 'Caja abierta', 'Caja', `${caja.codigo} · Bs ${caja.saldo_inicial.toFixed(2)}`);
  save();
  return res.status(201).json({ caja: resumenCaja(db, caja) });
});

router.post('/cierre', requirePermiso('caja.cierre'), allow('admin', 'dueno', 'supervisor', 'ventas', 'cobranzas'), (req, res) => {
  const db = load();
  const caja = cajaAbierta(db, req.user.id);
  if (!caja) return res.status(404).json({ error: 'No tienes una caja abierta.' });
  const resumen = resumenCaja(db, caja);
  const declarado = round2(num(req.body?.saldo_declarado, resumen.saldo_esperado));
  caja.estado = 'cerrada';
  caja.cierre_en = new Date().toISOString();
  caja.saldo_declarado = declarado;
  caja.saldo_esperado = resumen.saldo_esperado;
  caja.diferencia = round2(declarado - resumen.saldo_esperado);
  caja.ingresos = resumen.ingresos;
  caja.egresos = resumen.egresos;
  caja.notas_cierre = String(req.body?.notas || '');
  audit(db, req, 'Caja cerrada', 'Caja', `${caja.codigo} · diferencia Bs ${caja.diferencia.toFixed(2)}`);
  save();
  return res.json({ caja: caja });
});

router.post('/movimiento', requirePermiso('caja.apertura'), allow('admin', 'dueno', 'supervisor', 'ventas', 'cobranzas'), (req, res) => {
  const db = load();
  const tipo = req.body?.tipo === 'egreso' ? 'egreso' : 'ingreso';
  const monto = round2(num(req.body?.monto));
  if (!(monto > 0)) return res.status(400).json({ error: 'Ingresa un monto mayor a cero.' });
  const caja = asegurarCaja(db, req);
  const movimiento = registrarMovimiento(db, req, {
    caja, tipo, monto, motivo: req.body?.motivo, referencia: req.body?.referencia,
  });
  audit(db, req, 'Movimiento de caja', 'Caja', `${tipo} Bs ${monto.toFixed(2)} · ${movimiento.motivo || ''}`);
  save();
  return res.status(201).json({ caja: resumenCaja(db, caja), movimiento });
});

module.exports = router;
module.exports.asegurarCaja = asegurarCaja;
module.exports.registrarMovimiento = registrarMovimiento;
