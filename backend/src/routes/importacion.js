const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const importar = require('../importar');
const sync = require('../supabase-sync');

const router = express.Router();
router.use(authRequired);

// Importación dentro del proceso activo: evita que el job de sincronización
// vuelva a subir una instantánea antigua mientras se importa desde fuera.
router.post('/operacion', allow('admin', 'dueno'), async (req, res) => {
  const datos = req.body?.datos || req.body;
  try {
    const db = load();
    const conteo = importar.aplicar(db, datos);
    audit(db, req, 'Datos operativos importados', 'Sistema', `pedidos=${conteo.pedidos || 0}`);
    save();
    const enviado = await sync.sincronizar(db, 'importación de datos reales', { forzar: true });
    return res.json({ ok: true, conteo, snapshot: { ok: enviado.ok, error: enviado.error || null } });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

module.exports = router;
