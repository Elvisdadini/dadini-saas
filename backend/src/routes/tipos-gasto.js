const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit } = require('../utils');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  res.json({ tipos: db.tipos_gasto, total: db.tipos_gasto.length });
});

function normalizar(body) {
  return {
    nombre: String(body.nombre || '').trim(),
    categoria: body.categoria || 'Operación',
    descripcion: body.descripcion || '',
    requiere_comprobante: Boolean(body.requiere_comprobante),
    activo: body.activo !== false,
  };
}

router.post('/', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {});
  if (!datos.nombre) return res.status(400).json({ error: 'El nombre del tipo de gasto es obligatorio.' });
  const tipo = { id: nextId(db.tipos_gasto), codigo: nextCode(db.tipos_gasto, 'codigo', 'TGA', 1), ...datos };
  db.tipos_gasto.push(tipo);
  audit(db, req, 'Tipo de gasto creado', 'Gastos', tipo.nombre);
  save();
  return res.status(201).json({ tipo });
});

router.put('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const tipo = db.tipos_gasto.find((t) => t.id === Number(req.params.id));
  if (!tipo) return res.status(404).json({ error: 'Tipo de gasto no encontrado.' });
  Object.assign(tipo, normalizar(req.body || {}));
  audit(db, req, 'Tipo de gasto actualizado', 'Gastos', tipo.nombre);
  save();
  return res.json({ tipo });
});

module.exports = router;
