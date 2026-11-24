const path = require('path');
const store = require('./store');
const { buildSeed, SEED_VERSION } = require('./seed');
const { asegurarEstructura } = require('./permisos');
const sync = require('./supabase-sync');
const { verificarVencimientos } = require('./qr-alertas');

let db = null;
let colaGuardado = Promise.resolve();

async function init() {
  const jsonDir = process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data');
  await store.init({ jsonDir });
  db = await store.leer();
  if (!db || db.version !== SEED_VERSION) {
    db = buildSeed();
    await store.guardar(db);
    console.log(`[db] Base inicializada en ${store.base()}`);
  }
  // Si el contenedor se recreó (nuevo deploy de Render), recuperamos la última
  // instantánea de Supabase antes de dejar operar la app.
  let restaurado = false;
  if (process.env.DADINI_RESTORE !== 'false') {
    try {
      const resultado = await sync.restaurar(db);
      if (resultado.ok && resultado.restaurado) {
        restaurado = true;
        console.log(`[db] Base restaurada desde Supabase (${resultado.actualizado_en})`);
      } else if (!resultado.ok && resultado.error) {
        console.warn('[db] Restauración desde Supabase omitida:', resultado.error);
      }
    } catch (error) {
      console.warn('[db] No se pudo restaurar desde Supabase:', error.message);
    }
  }

  // Avisos de QRs por vencer o vencidos (2 semanas antes).
  const notificacionesAntes = (db.notificaciones || []).length;
  verificarVencimientos(db);

  // Migración suave: agrega rutas/zonas/tipos y los permisos de usuarios
  // existentes sin borrar ningún dato operativo.
  if (asegurarEstructura(db) || restaurado || (db.notificaciones || []).length !== notificacionesAntes) await store.guardar(db);
  return db;
}

function load() {
  if (!db) throw new Error('La base de datos aún no se ha inicializado.');
  return db;
}

// Las rutas mutan el objeto en memoria y llaman a save() de forma síncrona.
// El guardado real se encola para respetar el orden y no bloquear la respuesta.
function save() {
  if (!db) return null;
  colaGuardado = colaGuardado
    .then(() => store.guardar(db))
    .catch((error) => console.error('[db] Error al guardar:', error.message));
  return db;
}

async function reset() {
  db = buildSeed();
  await store.guardar(db);
  return db;
}

async function flush() {
  await colaGuardado;
}

// Guarda de forma inmediata y propaga el error (save() solo lo loguea).
// Lo usa el botón "Sincronizar" para poder mostrar errores exactos al usuario.
async function guardarAhora() {
  await colaGuardado;
  if (!db) throw new Error('La base de datos aún no se ha inicializado.');
  await store.guardar(db);
  return { base: store.base(), bytes: JSON.stringify(db).length };
}

function estadoGuardado() {
  return { base: store.base(), motor: store.modo };
}

module.exports = {
  init, load, save, reset, flush, guardarAhora, estadoGuardado,
  base: store.base,
  motor: store.modo,
  cerrarStore: store.cerrar,
  DB_FILE: store.base,
  DATA_DIR: process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data'),
};
