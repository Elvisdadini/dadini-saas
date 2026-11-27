const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const config = require('./config');
const { permisosUsuario, tienePermiso } = require('./permisos');

const SECRET = config.jwtSecret;
const EXPIRES = config.jwtExpires;

function sign(user) {
  return jwt.sign(
    { id: user.id, email: user.email, rol: user.rol, nombre: user.nombre },
    SECRET,
    { expiresIn: EXPIRES },
  );
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

// Información financiera sensible: nunca sale para vendedores, distribuidores
// ni supervisores. El filtro se aplica a TODA respuesta JSON de la API, así
// la APK ( mismo SPA ) y la web reciben exactamente los mismos datos.
const OCULTOS = {
  'finanzas.ver_margenes': ['margen', 'margen_bruto', 'margen_periodo', 'margen_total', 'utilidad',
    'utilidad_bruta', 'utilidad_neta', 'utilidad_porcentaje', 'rentabilidad', 'ganancia', 'ganancia_bruta',
    'ganancia_neta', 'costo_ventas', 'capital_total', 'capital_almacenes', 'capital_movil'],
  'inventario.ver_costos': ['costo', 'costo_unitario', 'costo_total', 'valor_inventario'],
};

function limpiar(value, bloqueados, profundidad = 0) {
  if (profundidad > 12 || value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((v) => limpiar(v, bloqueados, profundidad + 1));
  const resultado = {};
  Object.entries(value).forEach(([clave, v]) => {
    if (bloqueados.has(clave)) return;
    resultado[clave] = limpiar(v, bloqueados, profundidad + 1);
  });
  return resultado;
}

function protegerRespuesta(req, res) {
  if (['admin', 'dueno'].includes(req.user.rol)) return;
  const bloqueados = new Set();
  Object.entries(OCULTOS).forEach(([permiso, claves]) => {
    if (!tienePermiso(req.user, permiso)) claves.forEach((c) => bloqueados.add(c));
  });
  if (!bloqueados.size) return;
  const json = res.json.bind(res);
  res.json = (cuerpo) => json(limpiar(cuerpo, bloqueados));
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Sesión requerida. Inicia sesión para continuar.' });
  try {
    const payload = verify(token);
    const db = require('./db').load();
    const user = db.usuarios.find((u) => u.id === payload.id && u.activo);
    if (!user) return res.status(401).json({ error: 'La cuenta ya no está activa.' });
    req.user = {
      id: user.id, nombre: user.nombre, email: user.email, usuario: user.usuario || null,
      tiene_pin: Boolean(user.pin), rol: user.rol, cargo: user.cargo,
      repartidor_id: user.repartidor_id || null,
      vehiculo_id: user.vehiculo_id || null,
      ruta_venta: user.ruta_venta || null,
      zona_venta: user.zona_venta || null,
      categoria_cliente_id: user.categoria_cliente_id || null,
      es_venta_directa: Boolean(user.es_venta_directa),
      almacen_movil_id: user.almacen_movil_id || null,
      dias_visita: Array.isArray(user.dias_visita) ? user.dias_visita : [],
      distribuidor_id: user.repartidor_id || null,
      permisos: permisosUsuario(user),
      sucursal_id: Number(user.sucursal_id || 1),
      bloqueos: user.bloqueos || null,
    };
    req.db = db;
    protegerRespuesta(req, res);
    const tenant = require('./tenant');
    return tenant.ejecutar(tenant.resolver(req), () => {
      req.db = require('./db').load();
      req.sucursal_id = tenant.actual()?.sucursal_id || 1;
      return next();
    });
  } catch (error) {
    return res.status(401).json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' });
  }
}

function allow(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sesión requerida.' });
    if (['admin', 'dueno'].includes(req.user.rol) || roles.includes(req.user.rol)) return next();
    return res.status(403).json({ error: 'Tu rol no tiene permiso para esta acción.' });
  };
}

// Permiso granular: se evalúa contra los permisos vigentes del usuario en la
// base (no contra el token), así un cambio de administración aplica al instante.
function requirePermiso(...codigos) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sesión requerida.' });
    if (req.user.rol === 'admin' || req.user.rol === 'dueno') return next();
    if (codigos.some((codigo) => tienePermiso(req.user, codigo))) return next();
    return res.status(403).json({ error: 'No tienes permiso para esta acción. Solicita acceso a administración.' });
  };
}

// Accesos de dueño del sistema: ni un administrador de empresa puede entrar.
function soloDueno(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sesión requerida.' });
  if (req.user.rol !== 'dueno') {
    return res.status(403).json({ error: 'Esta función está reservada al dueño del sistema.' });
  }
  return next();
}

function hash(password) {
  return bcrypt.hashSync(password, 10);
}

function compare(password, hashed) {
  return bcrypt.compareSync(password, hashed);
}

// Versión no bloqueante para el login (evita congelar el event loop).
function compareAsync(password, hashed) {
  return bcrypt.compare(password, hashed);
}

module.exports = { sign, verify, authRequired, allow, requirePermiso, soloDueno, hash, compare, compareAsync, limpiar };
