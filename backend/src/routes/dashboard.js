const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { dashboard, sincronizarCobros } = require('../services');

const router = express.Router();

router.get('/', authRequired, (req, res) => {
  const db = load();
  sincronizarCobros(db);
  const data = dashboard(db, String(req.query.periodo || '30d'));
  const notificaciones = db.notificaciones.filter((n) => !n.leida);
  return res.json({ ...data, notificaciones });
});

router.post('/notificaciones/leer', authRequired, (req, res) => {
  const db = load();
  db.notificaciones.forEach((n) => { n.leida = true; });
  require('../db').save();
  return res.json({ ok: true });
});

module.exports = router;
