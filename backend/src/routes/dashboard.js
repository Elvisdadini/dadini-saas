const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { dashboard } = require('../services');

const router = express.Router();

// GET puro: la actualización de responsables/bloqueos de cobranza la ejecuta
// un job en segundo plano (ver server.js) o POST /api/cobranzas/sincronizar.
router.get('/', authRequired, (req, res) => {
  const db = load();
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
