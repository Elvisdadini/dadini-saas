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
    };
    req.db = db;
    return next();
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

module.exports = { sign, verify, authRequired, allow, requirePermiso, hash, compare, compareAsync };
