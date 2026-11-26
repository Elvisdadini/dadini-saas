const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const demanda = require('../demanda');

const router = express.Router();
router.use(authRequired);

router.get('/sugerencias', (req, res) => {
  const db = load();
  return res.json(demanda.sugerencias(db, req.query));
});

router.get('/producto/:id', (req, res) => {
  const db = load();
  const detalle = demanda.detalle(db, req.params.id, req.query);
  if (!detalle) return res.status(404).json({ error: 'Producto no encontrado.' });
  return res.json(detalle);
});

module.exports = router;
