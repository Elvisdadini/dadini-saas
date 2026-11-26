const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit, nextId } = require('../utils');
const { generarKey, hashKey } = require('../api-auth');
const webhooks = require('../webhooks');
const { configuradoParaCifrar } = require('../cripto');

const router = express.Router();
router.use(authRequired);
const ADMIN = allow('admin', 'dueno');

router.get('/api-keys', ADMIN, (req, res) => {
  const db = load();
  const keys = (db.api_tokens || []).map((t) => ({
    id: t.id, nombre: t.nombre, prefijo: t.prefijo, ultimos4: t.ultimos4,
    scopes: t.scopes || [], activo: t.activo !== false,
    creado_en: t.creado_en, ultimo_uso: t.ultimo_uso || null, expira_en: t.expira_en || null,
    sucursal_id: t.sucursal_id || 1,
  }));
  res.json({ api_keys: keys, total: keys.length });
});

router.post('/api-keys', ADMIN, (req, res) => {
  const db = load();
  if (!Array.isArray(db.api_tokens)) db.api_tokens = [];
  const key = generarKey();
  const scopes = Array.isArray(req.body?.scopes) ? req.body.scopes.map(String) : [];
  const token = {
    id: nextId(db.api_tokens), nombre: String(req.body?.nombre || 'Integración').trim(),
    hash: hashKey(key), prefijo: key.slice(0, 18), ultimos4: key.slice(-4),
    scopes, activo: true, creado_por: req.user.id, sucursal_id: Number(req.body?.sucursal_id) || req.user.sucursal_id || 1,
    expira_en: req.body?.expira_en || null, created_at: new Date().toISOString(), ultimo_uso: null,
  };
  db.api_tokens.push(token);
  audit(db, req, 'API key creada', 'Integraciones', token.nombre);
  save();
  return res.status(201).json({ ok: true, api_key: { id: token.id, nombre: token.nombre, prefijo: token.prefijo, scopes }, key });
});

router.delete('/api-keys/:id', ADMIN, (req, res) => {
  const db = load();
  const token = (db.api_tokens || []).find((t) => t.id === Number(req.params.id));
  if (!token) return res.status(404).json({ error: 'API key no encontrada.' });
  token.activo = false;
  token.revocado_en = new Date().toISOString();
  audit(db, req, 'API key revocada', 'Integraciones', token.nombre);
  save();
  return res.json({ ok: true });
});

router.get('/webhooks', ADMIN, (req, res) => {
  const db = load();
  webhooks.asegurar(db);
  const entregas = (db.webhook_entregas || []).slice().sort((a, b) => b.id - a.id).slice(0, 50);
  return res.json({
    webhooks: (db.webhooks || []).map((w) => webhooks.publico(db, w)),
    entregas, eventos: webhooks.EVENTOS, cifrado: configuradoParaCifrar(),
  });
});

router.post('/webhooks', ADMIN, (req, res) => {
  const db = load();
  try {
    const creado = webhooks.crear(db, req.body || {});
    audit(db, req, 'Webhook creado', 'Integraciones', creado.webhook.nombre);
    save();
    return res.status(201).json({ ok: true, ...creado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.delete('/webhooks/:id', ADMIN, (req, res) => {
  const db = load();
  const w = (db.webhooks || []).find((x) => x.id === Number(req.params.id));
  if (!w) return res.status(404).json({ error: 'Webhook no encontrado.' });
  w.activo = false;
  audit(db, req, 'Webhook desactivado', 'Integraciones', w.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
