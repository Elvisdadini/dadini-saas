const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit, nextId, round2 } = require('../utils');
const tenant = require('../tenant');

const router = express.Router();
router.use(authRequired);

function publica(db, sucursal) {
  const pedidos = (db.pedidos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id) && p.estado !== 'cancelado');
  return {
    ...sucursal,
    clientes: (db.clientes || []).filter((c) => Number(c.sucursal_id || 1) === Number(sucursal.id)).length,
    pedidos: pedidos.length,
    ventas: round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0)),
    productos: (db.productos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id)).length,
    usuarios: (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursal.id)).length,
    cartera: round2(pedidos.reduce((s, p) => s + Number(p.saldo || 0), 0)),
  };
}

function visibles(req, db) {
  const admin = ['admin', 'dueno'].includes(req.user.rol);
  return (db.sucursales || []).filter((s) => admin || Number(s.id) === Number(req.user.sucursal_id || 1));
}

router.get('/', (req, res) => {
  const db = tenant.dbReal() || load();
  const lista = visibles(req, db).map((s) => publica(db, s));
  return res.json({ sucursales: lista, total: lista.length, actual: req.sucursal_id || 1 });
});

router.get('/mi', (req, res) => {
  const db = tenant.dbReal() || load();
  const sucursal = (db.sucursales || []).find((s) => Number(s.id) === Number(req.sucursal_id || 1));
  return res.json({
    sucursal: publica(db, sucursal || { id: 1, nombre: 'Casa Matriz', codigo: 'CASA-MATRIZ' }),
    disponibles: visibles(req, db).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })),
  });
});

router.post('/', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Indica el nombre de la sucursal.' });
  const sucursal = {
    id: nextId(db.sucursales),
    codigo: String(req.body?.codigo || '').trim().toUpperCase() || `SUC-${String(nextId(db.sucursales)).padStart(3, '0')}`,
    nombre, direccion: String(req.body?.direccion || ''), activa: req.body?.activa !== false,
    created_at: new Date().toISOString(),
  };
  if ((db.sucursales || []).some((s) => s.codigo === sucursal.codigo)) return res.status(400).json({ error: 'Ese código ya existe.' });
  db.sucursales.push(sucursal);
  audit(db, req, 'Sucursal creada', 'Sucursales', `${sucursal.codigo} · ${nombre}`);
  save();
  return res.status(201).json({ ok: true, sucursal: publica(tenant.dbReal() || db, sucursal) });
});

router.put('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const sucursal = (db.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  ['nombre', 'codigo', 'direccion', 'activa'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) sucursal[campo] = campo === 'activa' ? req.body[campo] === true || req.body[campo] === 'true' : String(req.body[campo]).trim();
  });
  audit(db, req, 'Sucursal actualizada', 'Sucursales', sucursal.nombre);
  save();
  return res.json({ ok: true, sucursal });
});

router.post('/:id/usuarios', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  const ids = Array.isArray(req.body?.usuario_ids) ? req.body.usuario_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un usuario.' });
  const asignados = [];
  (real.usuarios || []).forEach((u) => {
    if (ids.includes(Number(u.id))) { u.sucursal_id = sucursal.id; asignados.push(u.nombre); }
  });
  audit(db, req, 'Usuarios asignados a sucursal', 'Sucursales', `${sucursal.nombre} · ${asignados.length} usuarios`);
  save();
  return res.json({ ok: true, asignados });
});

module.exports = router;
