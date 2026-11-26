// Aislamiento por sucursal (tenant) con contexto por request.
// Con una sola sucursal el comportamiento es idéntico al modo anterior:
// todas las filas llevan sucursal_id=1 y el filtro devuelve la base completa.
const { AsyncLocalStorage } = require('async_hooks');
const { ENTIDADES } = require('./store');

const SIMBOLO = Symbol.for('dadini_sucursal_entidad');
const contexto = new AsyncLocalStorage();
let real = null;

// Catálogos globales: usuarios (acceso), auditoría (inmutable) y notificaciones.
const GLOBALES = new Set(['usuarios', 'auditoria', 'notificaciones', 'sucursales', 'api_tokens', 'webhooks', 'webhook_entregas']);
const FILTRABLES = ENTIDADES.filter((e) => !GLOBALES.has(e));

function registrar(db) { real = db; }
function dbReal() { return real; }
function actual() { return contexto.getStore() || null; }
function ejecutar(sucursalId, fn) { return contexto.run({ sucursal_id: sucursalId || null }, fn); }

function asegurar(db) {
  let cambios = 0;
  if (!Array.isArray(db.sucursales) || !db.sucursales.length) {
    db.sucursales = [{
      id: 1, codigo: 'CASA-MATRIZ', nombre: 'Casa Matriz', activa: true,
      created_at: new Date().toISOString(),
    }];
    cambios += 1;
  }
  ENTIDADES.forEach((entidad) => {
    if (!Array.isArray(db[entidad])) return;
    db[entidad].forEach((fila) => {
      if (fila && fila.sucursal_id === undefined) { fila.sucursal_id = 1; cambios += 1; }
    });
  });
  (db.usuarios || []).forEach((u) => {
    if (u.sucursal_id === undefined) { u.sucursal_id = 1; cambios += 1; }
  });
  return cambios > 0;
}

function vistaDe(db, sucursalId) {
  const vista = { ...db };
  FILTRABLES.forEach((entidad) => {
    const filas = (db[entidad] || []).filter((f) => Number(f?.sucursal_id ?? 1) === Number(sucursalId));
    Object.defineProperty(filas, SIMBOLO, { value: entidad, enumerable: false });
    vista[entidad] = filas;
  });
  return vista;
}

// Devuelve al objeto global solo las filas de la sucursal del request,
// conservando intactas las de las demás sucursales.
function integrar(vista, sucursalId) {
  if (!real || !vista) return;
  const id = Number(sucursalId);
  FILTRABLES.forEach((entidad) => {
    const propias = Array.isArray(vista[entidad]) ? vista[entidad] : [];
    const otras = (real[entidad] || []).filter((f) => Number(f?.sucursal_id ?? 1) !== id);
    real[entidad] = [...otras, ...propias.map((f) => { f.sucursal_id = id; return f; })];
  });
}

function entidadDe(coleccion) {
  return coleccion ? coleccion[SIMBOLO] : null;
}

function maxId(entidad) {
  const filas = entidad && real ? (real[entidad] || []) : [];
  return filas.reduce((max, f) => Math.max(max, Number(f.id) || 0), 0) + 1;
}

function maxCodigo(entidad, campo, prefijo, inicio) {
  const filas = entidad && real ? (real[entidad] || []) : [];
  const max = filas.reduce((acc, item) => {
    const coincide = String(item[campo] || '').match(/(\d+)$/);
    return coincide ? Math.max(acc, Number(coincide[1])) : acc;
  }, inicio - 1);
  return `${prefijo}-${max + 1}`;
}

function resolver(req) {
  const user = req.user;
  if (!user) return null;
  const admin = user.rol === 'admin' || user.rol === 'dueno';
  const cabecera = Number(req.headers['x-sucursal-id'] || 0);
  if (admin && cabecera && (real?.sucursales || []).some((s) => s.id === cabecera && s.activa !== false)) {
    return cabecera;
  }
  return Number(user.sucursal_id || 1);
}

module.exports = {
  asegurar, vistaDe, integrar, registrar, dbReal, actual, ejecutar,
  entidadDe, maxId, maxCodigo, resolver, FILTRABLES, GLOBALES,
};
