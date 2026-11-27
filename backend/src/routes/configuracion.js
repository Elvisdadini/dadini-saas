const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const config = require('../config');
const { load, save } = require('../db');
const { authRequired, allow, soloDueno } = require('../auth');
const { audit, num, round2 } = require('../utils');
const { normalizarConfig, config: configCredito } = require('../credito');
const { asegurarApkPorDefecto } = require('../apk');

const directorioApk = path.join(config.uploadDir, 'apk');
fs.mkdirSync(directorioApk, { recursive: true });
const { randomUUID } = require('crypto');
const almacenamientoApk = multer.diskStorage({
  destination: directorioApk,
  // UUID evita colisiones entre cargas simultáneas y no expone la hora exacta.
  filename: (req, archivo, callback) => callback(null, `dadini-${randomUUID()}.apk`),
});
const subirApk = multer({
  storage: almacenamientoApk,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, archivo, callback) => {
    if (path.extname(archivo.originalname).toLowerCase() !== '.apk') return callback(new Error('Solo se permiten archivos .apk'));
    return callback(null, true);
  },
});

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  asegurarApkPorDefecto(db, req);
  const plan = db.configuracion.plan;
  const uso = {
    usuarios: db.usuarios.filter((u) => u.activo).length,
    almacenes: db.almacenes.filter((a) => a.activo).length,
    productos: db.productos.filter((p) => p.activo).length,
    pedidos_mes: db.pedidos.filter((p) => p.created_at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length,
  };
  return res.json({
    configuracion: db.configuracion,
    credito: configCredito(db),
    uso,
    plan: {
      ...plan,
      uso_usuarios: uso.usuarios,
      uso_almacenes: uso.almacenes,
      porcentaje_usuarios: plan.usuarios_incluidos ? Math.round((uso.usuarios / plan.usuarios_incluidos) * 100) : 0,
      porcentaje_almacenes: plan.almacenes_incluidos ? Math.round((uso.almacenes / plan.almacenes_incluidos) * 100) : 0,
    },
  });
});

// Panel del dueño: planes, descuentos globales y reglas de cobranza.
// Ni un administrador de empresa puede entrar aquí.
router.get('/panel-dueno', soloDueno, (req, res) => {
  const db = load();
  return res.json({
    configuracion: {
      plan: db.configuracion.plan, planes: db.configuracion.planes || [],
      descuentos_globales: db.configuracion.descuentos_globales || [],
      cobranza: db.configuracion.cobranza || {},
      empresas: db.empresas || [],
    },
  });
});

router.put('/panel-dueno', soloDueno, (req, res) => {
  const db = load();
  const { planes, descuentos_globales, cobranza, plan } = req.body || {};
  if (planes) db.configuracion.planes = planes;
  if (descuentos_globales) db.configuracion.descuentos_globales = descuentos_globales;
  if (cobranza) db.configuracion.cobranza = { ...(db.configuracion.cobranza || {}), ...cobranza };
  if (plan) {
    ['nombre', 'precio', 'ciclo', 'vence', 'estado'].forEach((c) => { if (plan[c] !== undefined) db.configuracion.plan[c] = plan[c]; });
    ['usuarios_incluidos', 'almacenes_incluidos'].forEach((c) => { if (plan[c] !== undefined) db.configuracion.plan[c] = num(plan[c]); });
  }
  audit(db, req, 'Panel del dueño actualizado', 'Sistema', 'Planes, descuentos y cobranza');
  save();
  return res.json({ ok: true, configuracion: db.configuracion });
});

router.put('/', allow(), (req, res) => {
  const db = load();
  const { empresa, plan, credito, planes, descuentos_globales, cobranza, branding, reposicion, rutas: cfgRutas, apk, ventas: cfgVentas } = req.body || {};
  if (empresa) {
    const campos = ['nombre', 'slogan', 'nit', 'direccion', 'telefono', 'email', 'ciudad', 'pais', 'moneda', 'horario'];
    campos.forEach((c) => { if (empresa[c] !== undefined) db.configuracion.empresa[c] = empresa[c]; });
    ['tarifa_envio', 'stock_minimo', 'dias_credito'].forEach((c) => { if (empresa[c] !== undefined) db.configuracion.empresa[c] = num(empresa[c]); });
  }
  if (plan) {
    ['nombre', 'precio', 'ciclo', 'vence', 'estado'].forEach((c) => { if (plan[c] !== undefined) db.configuracion.plan[c] = plan[c]; });
    ['usuarios_incluidos', 'almacenes_incluidos'].forEach((c) => { if (plan[c] !== undefined) db.configuracion.plan[c] = num(plan[c]); });
  }
  if (credito) {
    db.configuracion.credito = { ...configCredito(db), ...normalizarConfig(credito) };
  }
  if (planes) db.configuracion.planes = planes;
  if (descuentos_globales) db.configuracion.descuentos_globales = descuentos_globales;
  if (cobranza) db.configuracion.cobranza = { ...(db.configuracion.cobranza || {}), ...cobranza };
  if (cfgRutas) {
    db.configuracion.rutas = { ...(db.configuracion.rutas || {}), ...cfgRutas };
    ['velocidad_kmh', 'minutos_por_parada'].forEach((c) => {
      if (db.configuracion.rutas[c] !== undefined) db.configuracion.rutas[c] = num(db.configuracion.rutas[c]);
    });
  }
  if (reposicion) {
    db.configuracion.reposicion = { ...(db.configuracion.reposicion || {}), ...reposicion };
    ['dias_historial', 'lead_time_dias', 'stock_seguridad_dias'].forEach((c) => {
      if (db.configuracion.reposicion[c] !== undefined) db.configuracion.reposicion[c] = num(db.configuracion.reposicion[c]);
    });
  }
  if (cfgVentas) {
    const actual = { ...(db.configuracion.ventas || {}), ...cfgVentas };
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(actual.hora_cierre_ventas || '')) actual.hora_cierre_ventas = '17:00';
    db.configuracion.ventas = actual;
  }
  if (apk) db.configuracion.apk = { ...(db.configuracion.apk || {}), ...apk };
  if (branding) {
    db.configuracion.branding = {
      ...(db.configuracion.branding || {}),
      ...branding,
      radio: num(branding.radio, 14),
    };
  }
  audit(db, req, 'Configuración actualizada', 'Sistema', 'Se actualizaron parámetros de empresa, crédito, planes y cobranza');
  save();
  return res.json({ configuracion: db.configuracion });
});

// Cierre del día: bloquea ventas de vendedores mientras almacén prepara las
// hojas de ruta y carga del día siguiente. Se reabre automáticamente al día
// siguiente porque la fecha guardada deja de coincidir.
router.post('/cerrar-dia', allow('admin', 'dueno', 'supervisor', 'almacen'), (req, res) => {
  const horario = require('../horario');
  const db = horario.cerrarDia(req);
  audit(db, req, 'Día cerrado para ventas', 'Sistema', horario.fechaBolivia());
  save();
  return res.json({ ok: true, estado: horario.estadoVentas() });
});

router.post('/abrir-dia', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const horario = require('../horario');
  const db = horario.abrirDia(req);
  audit(db, req, 'Día reabierto para ventas', 'Sistema', horario.fechaBolivia());
  save();
  return res.json({ ok: true, estado: horario.estadoVentas() });
});

router.get('/estado-ventas', (req, res) => res.json(require('../horario').estadoVentas()));

// Verificación de la cadena de hashes: detecta edición o borrado de registros.
router.get('/auditoria/verificar', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  return res.json(require('../auditoria-chain').verificar(db));
});

router.get('/auditoria', allow(), (req, res) => {
  const db = load();
  const { search, accion, limit } = req.query;
  let registros = [...db.auditoria];
  if (search) registros = registros.filter((r) => `${r.usuario} ${r.accion} ${r.entidad} ${r.detalle}`.toLowerCase().includes(String(search).toLowerCase()));
  if (accion && accion !== 'todas') registros = registros.filter((r) => r.accion === accion);
  const acciones = [...new Set(db.auditoria.map((r) => r.accion))].sort();
  return res.json({ registros: registros.slice(0, Number(limit) || 100), acciones });
});

router.post('/apk', allow('admin', 'dueno'), subirApk.single('apk'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Selecciona un archivo .apk.' });
  const db = load();
  const protocolo = (req.get('x-forwarded-proto') || req.protocol).split(',')[0].trim();
  const urlBase = `${protocolo}://${req.get('host')}`;
  db.configuracion.apk_desactivada = false;
  db.configuracion.apk = {
    nombre: req.file.originalname,
    archivo: req.file.filename,
    url: `${urlBase}/uploads/apk/${req.file.filename}`,
    tamano_bytes: req.file.size,
    version: req.body.version || '1.0.0',
    notas: req.body.notas || '',
    subido_por: req.user.id,
    subido_en: new Date().toISOString(),
  };
  audit(db, req, 'APK actualizada', 'Sistema', `${req.file.originalname} (${req.file.size} bytes)`);
  save();
  return res.status(201).json({ apk: db.configuracion.apk });
});

router.delete('/apk', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const apk = db.configuracion.apk;
  if (apk?.archivo) {
    const ruta = path.join(directorioApk, apk.archivo);
    if (fs.existsSync(ruta)) fs.unlinkSync(ruta);
  }
  db.configuracion.apk = null;
  db.configuracion.apk_desactivada = true;
  audit(db, req, 'APK eliminada', 'Sistema', apk?.nombre || 'APK');
  save();
  return res.json({ ok: true });
});

module.exports = router;
