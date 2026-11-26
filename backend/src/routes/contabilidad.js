// Área de contabilidad: cierre/arqueo validado, cobranzas, pagos y gastos
// revisados por el contador, libros contables e impuestos.
const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { audit, round2, num, toCSV } = require('../utils');
const { rangoFechas, fechaCorta } = require('../services');

const router = express.Router();
router.use(authRequired);
router.use(requirePermiso('contabilidad.ver'));
router.use(allow('admin', 'dueno', 'contador'));

const hoy = () => new Date().toISOString().slice(0, 10);
function nombre(db, id) { return (db.usuarios || []).find((u) => u.id === Number(id))?.nombre || '—'; }
function ids(body) {
  return Array.isArray(body?.ids)
    ? body.ids.map(Number).filter(Boolean)
    : (body?.id ? [Number(body.id)] : []);
}

router.get('/', (req, res) => {
  const db = load();
  const cajas = db.cajas || [];
  const pagos = db.pagos || [];
  const gastos = db.gastos || [];
  return res.json({
    resumen: {
      cajas_cerradas: cajas.filter((c) => c.estado === 'cerrada').length,
      cajas_sin_validar: cajas.filter((c) => c.estado === 'cerrada' && !c.validado_por).length,
      pagos_totales: pagos.length,
      pagos_sin_validar: pagos.filter((p) => !p.validado_por).length,
      monto_sin_validar: round2(pagos.filter((p) => !p.validado_por).reduce((s, p) => s + num(p.monto), 0)),
      gastos_totales: gastos.length,
      gastos_sin_validar: gastos.filter((g) => !g.validado_por).length,
      monto_gastos_sin_validar: round2(gastos.filter((g) => !g.validado_por).reduce((s, g) => s + num(g.monto), 0)),
    },
    permisos: {
      caja: true, cobranzas: true, pagos: true, gastos: true,
    },
    generado_en: new Date().toISOString(),
  });
});

router.get('/cajas', (req, res) => {
  const db = load();
  const fecha = req.query.fecha || hoy();
  const cajas = (db.cajas || []).filter((c) => !fecha || c.fecha === fecha).map((c) => ({
    ...c, usuario_nombre: nombre(db, c.usuario_id),
    validado: Boolean(c.validado_por), validado_nombre: c.validado_por ? nombre(db, c.validado_por) : null,
  })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({ fecha, cajas, total: cajas.length });
});

router.post('/cajas/:id/validar', requirePermiso('contabilidad.validar_caja'), (req, res) => {
  const db = load();
  const caja = (db.cajas || []).find((c) => c.id === Number(req.params.id));
  if (!caja) return res.status(404).json({ error: 'Caja no encontrada.' });
  if (caja.estado !== 'cerrada') return res.status(400).json({ error: 'Solo se puede validar una caja cerrada/arqueada.' });
  caja.validado_por = req.user.id;
  caja.validado_en = new Date().toISOString();
  caja.estado = 'validada';
  caja.nota_validacion = String(req.body?.nota || '').trim() || null;
  audit(db, req, 'Arqueo validado por contabilidad', 'Caja', `${caja.codigo} · ${nombre(db, caja.usuario_id)}`);
  save();
  return res.json({ ok: true, caja: { ...caja, usuario_nombre: nombre(db, caja.usuario_id) } });
});

router.get('/pagos', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const pagos = (db.pagos || []).filter((p) => {
    const f = fechaCorta(p.fecha);
    return f >= desde && f <= hasta && (req.query.solo_pendientes !== 'true' || !p.validado_por);
  }).map((p) => ({
    ...p,
    cliente_nombre: (db.clientes || []).find((c) => c.id === Number(p.cliente_id))?.nombre || '—',
    pedido_codigo: (db.pedidos || []).find((x) => x.id === Number(p.pedido_id))?.codigo || null,
    usuario_nombre: nombre(db, p.usuario_id),
    validado: Boolean(p.validado_por),
  })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({ pagos, rango: { desde, hasta }, total: pagos.length });
});

router.post('/pagos/validar', requirePermiso('contabilidad.validar_pagos'), (req, res) => {
  const db = load();
  const seleccion = ids(req.body);
  if (!seleccion.length) return res.status(400).json({ error: 'Selecciona al menos un pago.' });
  const ahora = new Date().toISOString();
  let validados = 0;
  (db.pagos || []).forEach((p) => {
    if (!seleccion.includes(Number(p.id))) return;
    p.validado = true;
    p.validado_por = req.user.id;
    p.validado_en = ahora;
    validados += 1;
  });
  audit(db, req, 'Pagos validados por contabilidad', 'Cobranzas', `${validados} comprobantes · Bs ${round2((db.pagos || []).filter((p) => seleccion.includes(Number(p.id))).reduce((s, p) => s + num(p.monto), 0)).toFixed(2)}`);
  save();
  return res.json({ ok: true, validados });
});

router.get('/gastos', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const gastos = (db.gastos || []).filter((g) => {
    const f = fechaCorta(g.fecha);
    return f >= desde && f <= hasta && (req.query.solo_pendientes !== 'true' || !g.validado_por);
  }).map((g) => ({
    ...g,
    tipo: (db.tipos_gasto || []).find((t) => t.id === Number(g.tipo_gasto_id))?.nombre || '—',
    usuario_nombre: nombre(db, g.usuario_id),
    validado: Boolean(g.validado_por),
  })).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({ gastos, rango: { desde, hasta }, total: gastos.length });
});

router.post('/gastos/validar', requirePermiso('contabilidad.validar_gastos'), (req, res) => {
  const db = load();
  const seleccion = ids(req.body);
  if (!seleccion.length) return res.status(400).json({ error: 'Selecciona al menos un gasto.' });
  const ahora = new Date().toISOString();
  let validados = 0;
  (db.gastos || []).forEach((g) => {
    if (!seleccion.includes(Number(g.id))) return;
    g.validado = true;
    g.validado_por = req.user.id;
    g.validado_en = ahora;
    validados += 1;
  });
  audit(db, req, 'Gastos validados por contabilidad', 'Gastos', `${validados} comprobantes`);
  save();
  return res.json({ ok: true, validados });
});

// Libro diario sencillo: ingresos por ventas/cobros y egresos por gastos.
function libro(db, desde, hasta) {
  const filas = [];
  (db.pedidos || []).filter((p) => p.estado !== 'cancelado' && fechaCorta(p.created_at) >= desde && fechaCorta(p.created_at) <= hasta)
    .forEach((p) => filas.push({
      fecha: fechaCorta(p.created_at), cuenta: 'Ventas', detalle: p.codigo,
      debe: 0, haber: round2(num(p.total)), monto: round2(num(p.total)),
    }));
  (db.pagos || []).filter((p) => fechaCorta(p.fecha) >= desde && fechaCorta(p.fecha) <= hasta)
    .forEach((p) => filas.push({
      fecha: fechaCorta(p.fecha), cuenta: 'Caja / Bancos', detalle: p.codigo || p.numero_comprobante || 'Cobro',
      debe: round2(num(p.monto)), haber: 0, monto: round2(num(p.monto)),
    }));
  (db.gastos || []).filter((g) => fechaCorta(g.fecha) >= desde && fechaCorta(g.fecha) <= hasta)
    .forEach((g) => filas.push({
      fecha: fechaCorta(g.fecha), cuenta: 'Gastos', detalle: g.codigo || g.comprobante || 'Gasto',
      debe: round2(num(g.monto)), haber: 0, monto: round2(num(g.monto)),
    }));
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

router.get('/libros', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const filas = libro(db, desde, hasta);
  return res.json({
    libros: filas, rango: { desde, hasta },
    totales: {
      debe: round2(filas.reduce((s, f) => s + f.debe, 0)),
      haber: round2(filas.reduce((s, f) => s + f.haber, 0)),
    },
  });
});

router.get('/libros/export', requirePermiso('contabilidad.libros'), (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const csv = toCSV(libro(db, desde, hasta), [
    { label: 'Fecha', value: (r) => r.fecha },
    { label: 'Cuenta', value: (r) => r.cuenta },
    { label: 'Detalle', value: (r) => r.detalle },
    { label: 'Debe', value: (r) => r.debe.toFixed(2) },
    { label: 'Haber', value: (r) => r.haber.toFixed(2) },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="libro-diario-${desde}-${hasta}.csv"`);
  return res.send(csv);
});

router.get('/impuestos', requirePermiso('contabilidad.impuestos'), (req, res) => {
  const db = load();
  const mes = String(req.query.mes || hoy().slice(0, 7)).slice(0, 7);
  const facturas = (db.pedidos || []).filter((p) => p.factura && String(p.factura.fecha || p.created_at).slice(0, 7) === mes)
    .map((p) => ({
      numero: p.factura.numero, fecha: p.factura.fecha, cliente: (db.clientes || []).find((c) => c.id === p.cliente_id)?.nombre || '—',
      total: round2(num(p.factura.total)), iva: round2(num(p.factura.iva)), it: round2(num(p.factura.it)),
      estado: p.factura.estado,
    }));
  return res.json({
    mes, facturas,
    totales: {
      facturado: round2(facturas.reduce((s, f) => s + f.total, 0)),
      iva: round2(facturas.reduce((s, f) => s + f.iva, 0)),
      it: round2(facturas.reduce((s, f) => s + f.it, 0)),
    },
    normativa: db.configuracion?.fiscal?.normativa?.version || null,
  });
});

module.exports = router;
