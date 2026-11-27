const express = require('express');
const { load, save } = require('../db');
const { authRequired } = require('../auth');
const { enriquecer } = require('../notificaciones-rutas');

const router = express.Router();
router.use(authRequired);

// Devuelve solo las notificaciones nuevas para el dispositivo. El id se guarda
// en localStorage y se envía como desde_id para no repetir avisos.
router.get('/pendientes', (req, res) => {
  const db = load();
  const desde = Number(req.query.desde_id) || 0;
  const lista = (db.notificaciones || [])
    .filter((n) => Number(n.id) > desde)
    .filter((n) => !n.usuario_id || Number(n.usuario_id) === Number(req.user.id))
    .sort((a, b) => Number(a.id) - Number(b.id))
    .slice(0, 20);
  res.json({ notificaciones: enriquecer(lista), ultimo_id: lista.length ? Number(lista[lista.length - 1].id) : desde });
});

router.post('/leer/:id', (req, res) => {
  const db = load();
  const nota = (db.notificaciones || []).find((n) => n.id === Number(req.params.id));
  if (!nota) return res.status(404).json({ error: 'Notificación no encontrada.' });
  nota.leida = true;
  save();
  return res.json({ ok: true });
});

module.exports = router;
