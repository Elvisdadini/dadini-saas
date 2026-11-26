// Autenticación de la API pública: keys de alta entropía guardadas solo como
// hash SHA-256. No modifica el JWT de la app ni los permisos de los usuarios.
const crypto = require('crypto');

const PREFIJO = 'ddsk_live_';

function generarKey() {
  return `${PREFIJO}${crypto.randomBytes(24).toString('base64url')}`;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key || '')).digest('hex');
}

function coincide(a, b) {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function apiKeyRequired(req, res, next) {
  const cabecera = req.headers['x-api-key'] || '';
  const key = String(cabecera).trim();
  if (!key.startsWith(PREFIJO)) return next(Object.assign(new Error('API key inválida.'), { status: 401 }));
  const db = require('./db').load();
  const token = (db.api_tokens || []).find((t) => t.hash === hashKey(key));
  if (!token || token.activo === false || (token.expira_en && token.expira_en < new Date().toISOString())) {
    return next(Object.assign(new Error('API key inválida, revocada o expirada.'), { status: 401 }));
  }
  token.ultimo_uso = new Date().toISOString();
  req.apiToken = { id: token.id, nombre: token.nombre, scopes: token.scopes || [], sucursal_id: token.sucursal_id || 1 };
  req.user = { id: null, nombre: `API ${token.nombre || token.prefijo || ''}`, rol: 'api', permisos: [] };
  const tenant = require('./tenant');
  return tenant.ejecutar(req.apiToken.sucursal_id, () => next());
}

function requireScopes(...scopes) {
  return (req, res, next) => {
    const propios = req.apiToken?.scopes || [];
    if (!scopes.every((s) => propios.includes(s))) {
      return next(Object.assign(new Error('Esta API key no tiene el alcance necesario.'), { status: 403 }));
    }
    return next();
  };
}

module.exports = { PREFIJO, generarKey, hashKey, coincide, apiKeyRequired, requireScopes };
