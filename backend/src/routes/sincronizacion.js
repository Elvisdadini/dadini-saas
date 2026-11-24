const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const sync = require('../supabase-sync');
const job = require('../sync-job');

const router = express.Router();
router.use(authRequired);

// Progreso del botón "Sincronizar todos los cambios" del Shell.
router.get('/progreso', (req, res) => {
  res.json(job.progreso());
});

router.post('/forzar', allow('admin', 'dueno', 'almacen'), (req, res) => {
  res.status(202).json(job.iniciar());
});

router.get('/estado', (req, res) => {
  const db = load();
  res.json({ ...sync.estado(), registro: db.sincronizacion || null });
});

router.post('/sincronizar', allow('admin', 'dueno'), async (req, res) => {
  const db = load();
  const resultado = await sync.sincronizar(db, 'manual');
  save();
  res.json(resultado);
});

// Recupera manualmente la última instantánea desde Supabase (útil tras un
// reinicio o para traer datos de otro dispositivo).
router.post('/restaurar', allow('admin', 'dueno'), async (req, res) => {
  const db = load();
  const resultado = await sync.restaurar(db, { forzar: req.body?.forzar === true });
  if (resultado.ok && resultado.restaurado) save();
  res.json(resultado);
});

module.exports = router;
