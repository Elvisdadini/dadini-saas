const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { audit } = require('../utils');
const { subirFoto } = require('../fotos');
const cambios = require('../cambios');

const router = express.Router();
router.use(authRequired);

async function foto(datos, prefijo) {
  if (typeof datos === 'string' && datos.startsWith('data:image/')) {
    return (await subirFoto(datos, prefijo)).url;
  }
  return null;
}

router.get('/', (req, res) => {
  const db = load();
  return res.json(cambios.listar(db, req.query, req.user));
});

router.get('/catalogo', (req, res) => {
  res.json({ motivos: Object.entries(cambios.MOTIVOS).map(([clave, label]) => ({ clave, label })) });
});

router.get('/:id', (req, res) => {
  const db = load();
  const cambio = cambios.asegurar(db).find((c) => c.id === Number(req.params.id));
  if (!cambio) return res.status(404).json({ error: 'Cambio no encontrado.' });
  if (!['admin', 'dueno', 'supervisor', 'distribucion'].includes(req.user.rol)
    && Number(cambio.vendedor_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'No tienes acceso a este cambio.' });
  }
  return res.json({ cambio });
});

router.post('/', requirePermiso('cambios.crear'), allow('admin', 'dueno', 'ventas', 'preventista', 'vendedor_camion'), async (req, res) => {
  const db = load();
  try {
    const url = await foto(req.body?.foto, 'cambio-producto');
    const cambio = cambios.crear(db, req.body || {}, req.user, url);
    audit(db, req, 'Cambio de producto registrado', 'Ventas', `${cambio.codigo} · ${cambio.producto_nombre}`);
    save();
    return res.status(201).json({ ok: true, cambio });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/:id/confirmar', requirePermiso('cambios.editar'), allow('admin', 'dueno', 'distribucion'), async (req, res) => {
  const db = load();
  try {
    const url = await foto(req.body?.foto_entrega, 'cambio-confirmado');
    const cambio = cambios.confirmar(db, req.params.id, req.body || {}, req.user, url);
    audit(db, req, 'Cambio de producto confirmado', 'Distribución', `${cambio.codigo} · ${cambio.estado}`);
    save();
    return res.json({ ok: true, cambio });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/:id/rechazar', requirePermiso('cambios.editar'), allow('admin', 'dueno', 'distribucion'), (req, res) => {
  const db = load();
  try {
    const cambio = cambios.rechazar(db, req.params.id, req.body || {}, req.user);
    audit(db, req, 'Cambio de producto rechazado', 'Distribución', cambio.codigo);
    save();
    return res.json({ ok: true, cambio });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.delete('/:id', requirePermiso('cambios.eliminar'), allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const lista = cambios.asegurar(db);
  const cambio = lista.find((c) => c.id === Number(req.params.id));
  if (!cambio) return res.status(404).json({ error: 'Cambio no encontrado.' });
  db.cambios_producto = lista.filter((c) => c.id !== cambio.id);
  audit(db, req, 'Cambio de producto eliminado', 'Ventas', cambio.codigo);
  save();
  return res.json({ ok: true });
});

module.exports = router;
