const express = require('express');
const { load, save } = require('../db');
const { sign, compare, compareAsync, hash, authRequired } = require('../auth');
const { audit } = require('../utils');
const { asegurarApkPorDefecto } = require('../apk');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, usuario, password, pin } = req.body || {};
  const identificador = String(usuario || email || '').trim().toLowerCase();
  if (!identificador || !(password || pin)) return res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
  const db = load();
  const user = db.usuarios.find((u) =>
    (u.usuario && String(u.usuario).toLowerCase() === identificador)
    || String(u.email).toLowerCase() === identificador);
  if (!user) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  if (!user.activo) return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.' });
  const valido = pin
    ? (Boolean(user.pin) && await compareAsync(String(pin), user.pin))
    : await compareAsync(String(password || ''), user.password);
  if (!valido) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  user.ultimo_acceso = new Date().toISOString();
  save();
  const token = sign(user);
  // Se entrega el perfil completo en el login para que el frontend no tenga
  // que repetir GET /auth/me justo después de autenticarse.
  asegurarApkPorDefecto(db, req);
  return res.json({
    token,
    user: {
      id: user.id, nombre: user.nombre, email: user.email, usuario: user.usuario || null,
      rol: user.rol, cargo: user.cargo, telefono: user.telefono, whatsapp: user.whatsapp || null,
      tiene_pin: Boolean(user.pin), permisos: require('../permisos').permisosUsuario(user),
      repartidor_id: user.repartidor_id || null, vehiculo_id: user.vehiculo_id || null,
      ruta_venta: user.ruta_venta || null, zona_venta: user.zona_venta || null,
      dias_visita: user.dias_visita || [], distribuidor_id: user.repartidor_id || null,
    },
    empresa: db.configuracion.empresa,
    plan: db.configuracion.plan,
    branding: db.configuracion.branding || {},
    apk: db.configuracion.apk || null,
  });
});

// El usuario define su PIN para ingresar sin escribir la contraseña completa.
router.post('/pin', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  const { pin, password } = req.body || {};
  const valor = String(pin || '');
  if (!/^\d{4,8}$/.test(valor)) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
  if (!compare(String(password || ''), user.password)) return res.status(403).json({ error: 'Contraseña incorrecta.' });
  user.pin = hash(valor);
  audit(db, req, 'PIN actualizado', 'Usuarios', user.nombre);
  save();
  return res.json({ ok: true });
});

router.get('/me', authRequired, (req, res) => {
  asegurarApkPorDefecto(req.db, req);
  return res.json({
    user: req.user,
    empresa: req.db.configuracion.empresa,
    plan: req.db.configuracion.plan,
    branding: req.db.configuracion.branding || {},
    apk: req.db.configuracion.apk || null,
  });
});

router.put('/perfil', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  const { nombre, telefono, cargo } = req.body || {};
  if (nombre) user.nombre = String(nombre).trim();
  if (telefono !== undefined) user.telefono = String(telefono).trim();
  if (cargo !== undefined) user.cargo = String(cargo).trim();
  audit(db, req, 'Perfil actualizado', 'Usuarios', 'Actualizó sus datos personales');
  save();
  return res.json({ user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, cargo: user.cargo, telefono: user.telefono } });
});

router.put('/password', authRequired, (req, res) => {
  const { actual, nueva } = req.body || {};
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  if (!compare(String(actual || ''), user.password)) return res.status(400).json({ error: 'La contraseña actual no es correcta.' });
  if (!nueva || String(nueva).length < 8) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  user.password = hash(String(nueva));
  audit(db, req, 'Contraseña actualizada', 'Usuarios', 'Cambió su contraseña de acceso');
  save();
  return res.json({ ok: true });
});

module.exports = router;
