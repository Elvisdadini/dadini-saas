const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const syncRemote = require('./supabase-sync');
const { init: initDb, load, save, base, motor, flush, cerrarStore } = require('./db');

const app = express();
app.set('trust proxy', 1);
const PORT = config.port;

const advertencias = config.validarConfiguracion();
advertencias.forEach((mensaje) => console.warn(`[config] ${mensaje}`));

// En producción la configuración incompleta es un error de arranque, no un aviso.
if (config.nodeEnv === 'production') {
  const fatales = [];
  if (!process.env.JWT_SECRET || config.jwtSecret === 'dadini-saas-2026-secreto-local') fatales.push('JWT_SECRET');
  if (!process.env.CORS_ORIGIN) fatales.push('CORS_ORIGIN');
  if (fatales.length) {
    console.error(`[config] Variables obligatorias ausentes en producción: ${fatales.join(', ')}`);
    process.exit(1);
  }
}

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
const origenes = String(process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use(cors({ origin: origenes.length ? origenes : false }));
app.use('/api', rateLimit({ windowMs: 60_000, max: config.nodeEnv === 'production' ? 600 : 5000, standardHeaders: 'draft-7', legacyHeaders: false }));
// Bloquea escrituras mientras se está restaurando la base desde Supabase.
app.use((req, res, next) => {
  if (req.method !== 'GET' && syncRemote.estaEnMantenimiento()) {
    return res.status(503).json({ error: 'Sistema restaurando datos. Intenta de nuevo en unos segundos.' });
  }
  return next();
});
const limiteEstricto = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera un minuto.' },
});
app.use('/api/auth/login', limiteEstricto);
app.use('/api/auth/pin', limiteEstricto);
app.use('/api/auth/2fa/verificar', limiteEstricto);
app.use('/api/auth/2fa/iniciar', limiteEstricto);
app.use('/api/telemetria/error', limiteEstricto);
app.use('/api/whatsapp/masivo', limiteEstricto);
app.use(express.json({ limit: '10mb' }));
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use('/uploads', express.static(config.uploadDir, { fallthrough: true, dotfiles: 'deny' }));

app.get('/api/health', (req, res) => {
  const db = load();
  res.json({
    ok: true,
    servicio: 'DADINI SaaS API',
    version: '1.0.0',
    base: base(),
    motor: motor(),
    pedidos: db.pedidos.length,
    fecha: new Date().toISOString(),
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/sucursales', require('./routes/sucursales'));
app.use('/api/demanda', require('./routes/demanda'));
app.use('/api/rag', require('./routes/rag'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/producto-catalogo', require('./routes/producto-catalogo'));
app.use('/api/conteos-inventario', require('./routes/conteos-inventario'));
app.use('/api/qr-pagos', require('./routes/qrs-pago'));
app.use('/api/productos-imagenes', require('./routes/productos-imagenes'));
app.use('/api/catalogo-pdf', require('./routes/catalogo-pdf'));
app.use('/api/almacenes', require('./routes/almacenes'));
app.use('/api/clientes', require('./routes/clientes'));
app.use('/api/crm', require('./routes/crm'));
app.use('/api/pedidos', require('./routes/pedidos'));
app.use('/api/rutas', require('./routes/rutas'));
app.use('/api/cobranzas', require('./routes/cobranzas'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/rutas-venta', require('./routes/rutas-venta'));
app.use('/api/permisos', require('./routes/permisos'));
app.use('/api/ia', require('./routes/ia'));
app.use('/api/fiscal', require('./routes/fiscal'));
app.use('/api/kardex', require('./routes/kardex'));
app.use('/api/caja', require('./routes/caja'));
app.use('/api/reportes/automatico', require('./routes/reportes-auto'));
app.use('/api/reportes', require('./routes/reportes'));
app.use('/api/configuracion', require('./routes/configuracion'));
const { repartidoresRouter, vehiculosRouter } = require('./routes/logistica');
app.use('/api/repartidores', repartidoresRouter);
app.use('/api/vehiculos', vehiculosRouter);
app.use('/api/visitas', require('./routes/visitas'));
app.use('/api/geo', require('./routes/geo'));
app.use('/api/cargas', require('./routes/cargas'));
app.use('/api/campo', require('./routes/campo'));
app.use('/api/whatsapp', require('./routes/whatsapp'));
app.use('/api/telemetria', require('./routes/telemetria'));
app.use('/api/promociones', require('./routes/promociones'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/almacenes-moviles', require('./routes/almacenes-moviles'));
app.use('/api/solicitudes-carga', require('./routes/solicitudes-carga'));
app.use('/api/devoluciones', require('./routes/devoluciones'));
app.use('/api/objetivos', require('./routes/objetivos'));
app.use('/api/lista-distribucion', require('./routes/lista-distribucion'));
app.use('/api/confirmaciones-carga', require('./routes/confirmaciones-carga'));
app.use('/api/sincronizacion', require('./routes/sincronizacion'));
app.use('/api/proveedores', require('./routes/proveedores'));
app.use('/api/tipos-gasto', require('./routes/tipos-gasto'));
app.use('/api/solicitudes-compra', require('./routes/solicitudes-compra'));
app.use('/api/ordenes-compra', require('./routes/ordenes-compra'));
app.use('/api/gastos', require('./routes/gastos'));
app.use('/api/rentabilidad', require('./routes/rentabilidad'));
app.use('/api/nomina', require('./routes/nomina'));

// Sirve el frontend compilado si existe (despliegue de un solo proceso)
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (require('fs').existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    return res.sendFile(path.join(dist, 'index.html'));
  });
}

app.use((req, res) => res.status(404).json({ error: 'Ruta de API no encontrada.' }));

// eslint-disable-next-line no-unused-vars
app.use((error, req, res, next) => {
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  console.error(`[api][${requestId}]`, error);
  const publico = error.status || error.statusCode || 500;
  const mensaje = config.nodeEnv === 'production'
    ? 'Error interno del servidor. Intenta de nuevo o contacta al administrador.'
    : (error.message || 'Error interno del servidor.');
  res.status(publico).json({ error: mensaje, request_id: requestId });
});

async function arrancar() {
  await initDb();
  const db = load();
  if (syncRemote.estaConfigurado()) {
    syncRemote.iniciarSincronizacionPeriodica(load, save);
    console.log(`  Supabase sync activa · tabla ${config.supabase.table}`);
  }
  // Cobranzas se recalcula en segundo plano para que ningún GET tenga efectos
  // secundarios (antes lo hacía /api/dashboard en cada navegación).
  const { sincronizarCobros } = require('./services');
  setInterval(() => {
    try { sincronizarCobros(load()); } catch (error) { console.error('[cobranzas]', error.message); }
  }, 5 * 60 * 1000).unref();
  // Reportes automáticos: prepara los chats wa.me a la hora configurada.
  // No envía por sí solo (no hay Business API): deja los links listos para abrir.
  const reportesAuto = require('./reportes-auto');
  setInterval(() => {
    try {
      const db = load();
      const cfg = reportesAuto.asegurar(db);
      if (!reportesAuto.debeEjecutar(cfg)) return;
      const mensaje = reportesAuto.generarMensaje(db, cfg, reportesAuto.hoyLocal());
      const { envios } = reportesAuto.preparar(db, cfg, mensaje);
      save();
      console.log(`[reportes-auto] ${envios.length} chat(s) preparados para ${cfg.hora}`);
    } catch (error) { console.error('[reportes-auto]', error.message); }
  }, 60 * 1000).unref();
  const servidor = app.listen(PORT, () => {
    console.log(`\n  DADINI SaaS API escuchando en http://localhost:${PORT}`);
    console.log(`  Motor de datos: ${motor()} · ${base()}`);
    console.log(`  Datos: ${db.pedidos.length} pedidos · ${db.productos.length} productos · ${db.rutas.length} rutas`);
    console.log('  Acceso corporativo: usa tu usuario y contraseña asignados.\n');
  });

  const detener = async () => {
    await flush();
    await cerrarStore();
    servidor.close(() => process.exit(0));
  };
  process.on('SIGTERM', detener);
  process.on('SIGINT', detener);
}

arrancar().catch((error) => {
  console.error('[api] No se pudo iniciar:', error);
  process.exit(1);
});
