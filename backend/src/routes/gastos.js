const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, gasto) {
  const tipo = db.tipos_gasto.find((t) => t.id === gasto.tipo_gasto_id);
  const proveedor = db.proveedores.find((p) => p.id === gasto.proveedor_id);
  const usuario = db.usuarios.find((u) => u.id === gasto.usuario_id);
  return {
    ...gasto,
    tipo_nombre: tipo?.nombre || 'Sin tipo',
    categoria: tipo?.categoria || 'Otros',
    proveedor_nombre: proveedor?.nombre || '—',
    usuario_nombre: usuario?.nombre || '—',
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { tipo_gasto_id, categoria, desde, hasta, search } = req.query;
  let items = db.gastos.map((g) => resumen(db, g));
  if (tipo_gasto_id) items = items.filter((g) => g.tipo_gasto_id === Number(tipo_gasto_id));
  if (categoria && categoria !== 'todas') items = items.filter((g) => g.categoria === categoria);
  if (desde) items = items.filter((g) => String(g.fecha).slice(0, 10) >= desde);
  if (hasta) items = items.filter((g) => String(g.fecha).slice(0, 10) <= hasta);
  if (search) items = items.filter((g) => `${g.codigo} ${g.tipo_nombre} ${g.notas}`.toLowerCase().includes(String(search).toLowerCase()));
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    gastos: items,
    resumen: {
      total: round2(items.reduce((s, g) => s + g.monto, 0)),
      por_categoria: [...new Set(items.map((g) => g.categoria))].map((cat) => ({
        categoria: cat, total: round2(items.filter((g) => g.categoria === cat).reduce((s, g) => s + g.monto, 0)),
      })),
    },
  });
});

router.post('/', allow('admin', 'dueno', 'almacen', 'ventas', 'distribucion'), (req, res) => {
  const db = load();
  const b = req.body || {};
  const tipo = db.tipos_gasto.find((t) => t.id === Number(b.tipo_gasto_id) && t.activo);
  if (!tipo) return res.status(400).json({ error: 'Selecciona un tipo de gasto válido.' });
  const monto = round2(num(b.monto));
  if (monto <= 0) return res.status(400).json({ error: 'Ingresa un monto mayor a cero.' });
  if (tipo.requiere_comprobante && !b.comprobante) return res.status(400).json({ error: 'Este tipo de gasto requiere comprobante.' });
  const gasto = {
    id: nextId(db.gastos),
    codigo: nextCode(db.gastos, 'codigo', 'GAS', 1),
    tipo_gasto_id: tipo.id,
    proveedor_id: b.proveedor_id ? Number(b.proveedor_id) : null,
    monto,
    fecha: b.fecha || new Date().toISOString(),
    metodo: b.metodo || 'efectivo',
    comprobante: b.comprobante || '',
    notas: b.notas || '',
    usuario_id: req.user.id,
    created_at: new Date().toISOString(),
  };
  db.gastos.push(gasto);
  audit(db, req, 'Gasto registrado', 'Gastos', `${gasto.codigo} · ${tipo.nombre} · Bs ${monto.toFixed(2)}`);
  save();
  return res.status(201).json({ gasto: resumen(db, gasto) });
});

module.exports = router;
