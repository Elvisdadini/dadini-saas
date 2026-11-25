const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const auto = require('../reportes-auto');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  const cfg = auto.asegurar(db);
  return res.json({
    config: auto.publica(cfg),
    vista_previa: auto.generarMensaje(db, cfg),
    ultimo: cfg.ultimo || null,
    usuarios: (db.usuarios || []).filter((u) => u.activo !== false).map((u) => ({
      id: u.id, nombre: u.nombre, cargo: u.cargo || u.rol,
      con_whatsapp: Boolean(u.whatsapp || u.telefono),
    })),
  });
});

router.put('/config', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const cfg = auto.asegurar(db);
  const b = req.body || {};
  if (b.habilitado !== undefined) cfg.habilitado = b.habilitado === true || b.habilitado === 'true';
  if (b.hora !== undefined) {
    const hora = String(b.hora);
    if (!auto.HORA.test(hora)) return res.status(400).json({ error: 'La hora debe tener formato HH:MM (24 horas).' });
    cfg.hora = hora;
  }
  if (b.frecuencia !== undefined) {
    if (!['diario', 'lun_vie'].includes(b.frecuencia)) return res.status(400).json({ error: 'Frecuencia inválida.' });
    cfg.frecuencia = b.frecuencia;
  }
  if (b.destinatarios !== undefined) {
    if (!Array.isArray(b.destinatarios)) return res.status(400).json({ error: 'Destinatarios debe ser una lista.' });
    cfg.destinatarios = [...new Set(b.destinatarios.map(Number).filter(Boolean))];
  }
  if (b.incluir !== undefined) {
    if (!b.incluir || typeof b.incluir !== 'object') return res.status(400).json({ error: 'Incluir debe ser un objeto.' });
    Object.keys(auto.INCLUIDOS).forEach((clave) => {
      if (b.incluir[clave] !== undefined) cfg.incluir[clave] = b.incluir[clave] === true || b.incluir[clave] === 'true';
    });
  }
  audit(db, req, 'Reportes automáticos configurados', 'Reportes',
    `${cfg.habilitado ? 'activo' : 'inactivo'} · ${cfg.hora} · ${cfg.destinatarios.length} destinatarios`);
  save();
  return res.json({ ok: true, config: auto.publica(cfg), vista_previa: auto.generarMensaje(db, cfg) });
});

router.post('/vista-previa', (req, res) => {
  const db = load();
  const cfg = auto.asegurar(db);
  const incluir = req.body?.incluir && typeof req.body.incluir === 'object'
    ? { ...cfg.incluir, ...req.body.incluir }
    : cfg.incluir;
  return res.json({ mensaje: auto.generarMensaje(db, { ...cfg, incluir }) });
});

router.post('/enviar', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const cfg = auto.asegurar(db);
  if (!cfg.destinatarios.length) return res.status(400).json({ error: 'Configura al menos un destinatario con WhatsApp.' });
  const mensaje = auto.generarMensaje(db, cfg);
  const { envios, omitidos } = auto.preparar(db, cfg, mensaje, req.user.id);
  audit(db, req, 'Reporte automático generado', 'Reportes', `${envios.length} chats preparados · ${cfg.hora}`);
  save();
  return res.json({ ok: true, mensaje, envios, omitidos, ultimo: cfg.ultimo });
});

module.exports = router;
