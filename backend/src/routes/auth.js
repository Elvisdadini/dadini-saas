const express = require('express');
const crypto = require('crypto');
const { load, save } = require('../db');
const { sign, compare, compareAsync, hash, authRequired } = require('../auth');
const { audit } = require('../utils');
const { asegurarApkPorDefecto } = require('../apk');
const totp = require('../totp');
const secretos = require('../totp-secretos');

const router = express.Router();

// Challenges efímeros: el login con 2FA no emite JWT hasta verificar el código.
// Se guardan en memoria (no en DB) y expiran en 5 minutos.
const desafios = new Map();
setInterval(() => {
  const ahora = Date.now();
  for (const [id, d] of desafios) if (d.expira < ahora) desafios.delete(id);
}, 60 * 1000).unref();

function nuevoDesafio(user) {
  const id = crypto.randomUUID();
  desafios.set(id, { usuario_id: user.id, expira: Date.now() + 5 * 60 * 1000, intentos: 0 });
  return id;
}

function respuestaLogin(db, req, user) {
  user.ultimo_acceso = new Date().toISOString();
  save();
  const token = sign(user);
  // Se entrega el perfil completo en el login para que el frontend no tenga
  // que repetir GET /auth/me justo después de autenticarse.
  asegurarApkPorDefecto(db, req);
  return {
    token,
    user: {
      id: user.id, nombre: user.nombre, email: user.email, usuario: user.usuario || null,
      rol: user.rol, cargo: user.cargo, telefono: user.telefono, whatsapp: user.whatsapp || null,
      tiene_pin: Boolean(user.pin), permisos: require('../permisos').permisosUsuario(user),
      repartidor_id: user.repartidor_id || null, vehiculo_id: user.vehiculo_id || null,
      ruta_venta: user.ruta_venta || null, zona_venta: user.zona_venta || null,
      dias_visita: user.dias_visita || [], distribuidor_id: user.repartidor_id || null,
      dos_factor: Boolean(user.totp?.activo),
      sucursal_id: Number(user.sucursal_id || 1),
      sucursales: (db.sucursales || []).filter((s) => s.activa !== false).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })),
    },
    empresa: db.configuracion.empresa,
    plan: db.configuracion.plan,
    branding: db.configuracion.branding || {},
    apk: db.configuracion.apk || null,
  };
}

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
  if (user.totp?.activo) {
    return res.json({ requiere_2fa: true, challenge_id: nuevoDesafio(user) });
  }
  return res.json(respuestaLogin(db, req, user));
});

// Segundo factor: código TOTP de 6 dígitos o código de recuperación de un solo uso.
router.post('/2fa/verificar', (req, res) => {
  const db = load();
  const { challenge_id, codigo } = req.body || {};
  const desafio = desafios.get(String(challenge_id || ''));
  if (!desafio || desafio.expira < Date.now()) {
    return res.status(400).json({ error: 'El código de verificación expiró. Inicia sesión de nuevo.' });
  }
  if (desafio.intentos >= 5) {
    desafios.delete(String(challenge_id));
    return res.status(429).json({ error: 'Demasiados intentos. Inicia sesión de nuevo.' });
  }
  const user = db.usuarios.find((u) => u.id === desafio.usuario_id && u.activo);
  if (!user?.totp?.activo) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  const texto = String(codigo || '').trim().toUpperCase();
  const secreto = secretos.descifrar(user.totp.secreto_cifrado);
  let ok = false;
  if (/^\d{6}$/.test(texto)) {
    ok = Boolean(secreto) && totp.verificar(secreto, texto);
  } else {
    const hashCodigo = totp.hashRecuperacion(texto);
    const idx = (user.totp.recuperacion || []).indexOf(hashCodigo);
    if (idx >= 0) { user.totp.recuperacion.splice(idx, 1); ok = true; }
  }
  if (!ok) {
    desafio.intentos += 1;
    return res.status(401).json({ error: 'Código incorrecto. Usa el código de la app o uno de recuperación.' });
  }
  desafios.delete(String(challenge_id));
  audit(db, req, 'Verificación 2FA correcta', 'Usuarios', user.nombre);
  return res.json(respuestaLogin(db, req, user));
});

router.get('/2fa/estado', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  res.json({
    activo: Boolean(user?.totp?.activo),
    pendiente: Boolean(user?.totp?.secreto_cifrado && !user.totp.activo),
    recuperacion_restantes: (user?.totp?.recuperacion || []).length,
  });
});

// Alta: se muestra el secreto una sola vez para configurar la app de autenticación.
router.post('/2fa/iniciar', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  const secreto = totp.generarSecreto();
  user.totp = {
    activo: false,
    secreto_cifrado: secretos.cifrar(secreto),
    iniciado_en: new Date().toISOString(),
    recuperacion: [],
  };
  save();
  return res.json({
    secreto,
    uri: totp.uriTOTP(secreto, user.email || user.usuario || user.nombre),
    periodo: 30,
  });
});

router.post('/2fa/confirmar', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  if (!user?.totp?.secreto_cifrado || user.totp.activo) {
    return res.status(400).json({ error: 'No hay una configuración 2FA pendiente.' });
  }
  const secreto = secretos.descifrar(user.totp.secreto_cifrado);
  if (!totp.verificar(secreto, req.body?.codigo)) return res.status(400).json({ error: 'Código incorrecto.' });
  const codigos = totp.codigosRecuperacion();
  user.totp = {
    activo: true,
    secreto_cifrado: user.totp.secreto_cifrado,
    recuperacion: codigos.map(totp.hashRecuperacion),
    activado_en: new Date().toISOString(),
  };
  audit(db, req, 'Verificación en dos pasos activada', 'Usuarios', user.nombre);
  save();
  return res.json({ ok: true, codigos });
});

router.post('/2fa/desactivar', authRequired, (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === req.user.id);
  if (!user?.totp?.activo) return res.status(400).json({ error: 'La verificación en dos pasos no está activa.' });
  const secreto = secretos.descifrar(user.totp.secreto_cifrado);
  if (!totp.verificar(secreto, req.body?.codigo)) return res.status(400).json({ error: 'Código incorrecto.' });
  user.totp = { activo: false, secreto_cifrado: null, recuperacion: [], desactivado_en: new Date().toISOString() };
  audit(db, req, 'Verificación en dos pasos desactivada', 'Usuarios', user.nombre);
  save();
  return res.json({ ok: true });
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
