const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, boleta) {
  const usuario = db.usuarios.find((u) => u.id === boleta.usuario_id);
  return {
    ...boleta,
    empleado: usuario?.nombre || '—',
    cargo: usuario?.cargo || '—',
    telefono: usuario?.telefono || '',
  };
}

router.get('/boletas', (req, res) => {
  const db = load();
  const { periodo, estado, usuario_id } = req.query;
  let items = db.boletas_pago.map((b) => resumen(db, b));
  if (periodo) items = items.filter((b) => b.periodo === periodo);
  if (estado && estado !== 'todos') items = items.filter((b) => b.estado === estado);
  if (usuario_id) items = items.filter((b) => b.usuario_id === Number(usuario_id));
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    boletas: items,
    resumen: {
      total: round2(items.reduce((s, b) => s + b.total, 0)),
      pendientes: items.filter((b) => b.estado === 'pendiente').length,
      pagadas: items.filter((b) => b.estado === 'pagada').length,
    },
  });
});

router.post('/generar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const periodo = req.body?.periodo || new Date().toISOString().slice(0, 7);
  if (db.boletas_pago.some((b) => b.periodo === periodo)) {
    return res.status(400).json({ error: `Ya existen boletas generadas para ${periodo}.` });
  }
  const empleados = db.usuarios.filter((u) => u.activo && !['admin', 'dueno'].includes(u.rol));
  const desde = `${periodo}-01`;
  const hasta = `${periodo}-31`;
  const generadas = [];
  empleados.forEach((empleado) => {
    const ventas = db.pedidos.filter((p) => p.vendedor_id === empleado.id && p.estado !== 'cancelado'
      && String(p.created_at).slice(0, 10) >= desde && String(p.created_at).slice(0, 10) <= hasta);
    const montoVentas = round2(ventas.reduce((s, p) => s + p.total, 0));
    const comisionVentas = round2(montoVentas * num(empleado.comision_venta_pct) / 100);
    const entregas = db.visitas.filter((v) => v.usuario_id === empleado.id && v.resultado_entrega
      && String(v.fecha).slice(0, 10) >= desde && String(v.fecha).slice(0, 10) <= hasta);
    const comisionDistribucion = round2(entregas.length * num(empleado.comision_distribucion_pct));
    const salarioBase = round2(num(empleado.salario_base));
    const bono = round2(num(empleado.bono_fijo));
    const descuento = round2(num(empleado.descuento_fijo));
    const conceptos = db.conceptos_nomina.filter((c) => c.usuario_id === empleado.id && c.activo);
    const detalleConceptos = [];
    let totalConceptos = 0;
    conceptos.forEach((c) => {
      let valor = 0;
      if (c.base === 'fijo') valor = num(c.monto);
      if (c.base === 'ventas') valor = round2(montoVentas * num(c.porcentaje) / 100);
      if (c.base === 'entregas') valor = round2(entregas.length * num(c.monto));
      if (c.tipo === 'descuento') valor = -valor;
      totalConceptos += valor;
      detalleConceptos.push({ codigo: c.codigo, nombre: c.nombre, tipo: c.tipo, base: c.base, valor: round2(valor) });
    });
    const boleta = {
      id: nextId(db.boletas_pago),
      codigo: nextCode(db.boletas_pago, 'codigo', 'BOL', 1),
      periodo,
      usuario_id: empleado.id,
      salario_base: salarioBase,
      comision_ventas: comisionVentas,
      comision_distribucion: comisionDistribucion,
      bono,
      descuento,
      total: round2(salarioBase + comisionVentas + comisionDistribucion + bono - descuento + totalConceptos),
      detalle: {
        ventas_monto: montoVentas,
        ventas_pedidos: ventas.length,
        entregas: entregas.length,
        comision_venta_pct: num(empleado.comision_venta_pct),
        comision_distribucion_pct: num(empleado.comision_distribucion_pct),
        antiguedad_anios: num(empleado.antiguedad_anios),
        conceptos: detalleConceptos,
      },
      estado: 'pendiente',
      fecha: new Date().toISOString(),
      pagada_en: null,
      metodo_pago: null,
      notas: req.body?.notas || '',
    };
    db.boletas_pago.push(boleta);
    generadas.push(boleta);
  });
  db.gastos.push(...generadas.map((b) => ({
    id: nextId(db.gastos) + generadas.indexOf(b),
    codigo: `GAS-NOM-${b.codigo}`,
    tipo_gasto_id: db.tipos_gasto.find((t) => t.nombre.toLowerCase().includes('sueldo'))?.id || 4,
    proveedor_id: null,
    monto: b.total,
    fecha: new Date().toISOString(),
    metodo: 'planilla',
    comprobante: b.codigo,
    notas: `Planilla ${b.periodo} · ${b.empleado || ''}`,
    usuario_id: req.user.id,
    created_at: new Date().toISOString(),
  })));
  audit(db, req, 'Planilla generada', 'Gastos', `${periodo} · ${generadas.length} boletas`);
  save();
  return res.status(201).json({ boletas: generadas.map((b) => resumen(db, b)), periodo });
});

router.patch('/boletas/:id/pagar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const boleta = db.boletas_pago.find((b) => b.id === Number(req.params.id));
  if (!boleta) return res.status(404).json({ error: 'Boleta no encontrada.' });
  boleta.estado = 'pagada';
  boleta.pagada_en = new Date().toISOString();
  boleta.metodo_pago = req.body?.metodo || 'efectivo';
  audit(db, req, 'Boleta de pago pagada', 'Gastos', boleta.codigo);
  save();
  return res.json({ boleta: resumen(db, boleta) });
});

router.get('/conceptos', (req, res) => {
  const db = load();
  const { usuario_id } = req.query;
  let items = db.conceptos_nomina;
  if (usuario_id) items = items.filter((c) => c.usuario_id === Number(usuario_id));
  items = items.map((c) => ({
    ...c,
    empleado: db.usuarios.find((u) => u.id === c.usuario_id)?.nombre || '—',
  }));
  res.json({ conceptos: items, total: items.length });
});

router.post('/conceptos', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const b = req.body || {};
  if (!db.usuarios.find((u) => u.id === Number(b.usuario_id))) return res.status(400).json({ error: 'Selecciona un empleado válido.' });
  if (!b.nombre) return res.status(400).json({ error: 'El nombre del concepto es obligatorio.' });
  const concepto = {
    id: nextId(db.conceptos_nomina),
    codigo: nextCode(db.conceptos_nomina, 'codigo', 'CON-NOM', 1),
    usuario_id: Number(b.usuario_id),
    nombre: String(b.nombre).trim(),
    tipo: ['bono', 'comision', 'descuento', 'otro'].includes(b.tipo) ? b.tipo : 'bono',
    base: ['fijo', 'ventas', 'entregas'].includes(b.base) ? b.base : 'fijo',
    monto: num(b.monto),
    porcentaje: num(b.porcentaje),
    activo: b.activo !== false,
    fecha: new Date().toISOString(),
  };
  db.conceptos_nomina.push(concepto);
  audit(db, req, 'Concepto de nómina creado', 'Gastos', `${concepto.codigo} · ${concepto.nombre}`);
  save();
  res.status(201).json({ concepto });
});

router.put('/conceptos/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const concepto = db.conceptos_nomina.find((c) => c.id === Number(req.params.id));
  if (!concepto) return res.status(404).json({ error: 'Concepto no encontrado.' });
  const b = req.body || {};
  ['nombre', 'tipo', 'base'].forEach((campo) => { if (b[campo] !== undefined) concepto[campo] = b[campo]; });
  ['monto', 'porcentaje'].forEach((campo) => { if (b[campo] !== undefined) concepto[campo] = num(b[campo]); });
  if (b.activo !== undefined) concepto.activo = Boolean(b.activo);
  audit(db, req, 'Concepto de nómina actualizado', 'Gastos', concepto.codigo);
  save();
  res.json({ concepto });
});

router.delete('/conceptos/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const concepto = db.conceptos_nomina.find((c) => c.id === Number(req.params.id));
  if (!concepto) return res.status(404).json({ error: 'Concepto no encontrado.' });
  db.conceptos_nomina = db.conceptos_nomina.filter((c) => c.id !== concepto.id);
  audit(db, req, 'Concepto de nómina eliminado', 'Gastos', concepto.codigo);
  save();
  res.json({ ok: true });
});

module.exports = router;
