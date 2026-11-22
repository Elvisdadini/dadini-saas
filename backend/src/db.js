const path = require('path');
const store = require('./store');
const { buildSeed, SEED_VERSION } = require('./seed');

let db = null;
let colaGuardado = Promise.resolve();

async function init() {
  const jsonDir = process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data');
  await store.init({ jsonDir });
  db = await store.leer();
  if (!db || db.version !== SEED_VERSION) {
    db = buildSeed();
    await store.guardar(db);
    console.log(`[db] Base demo inicializada en ${store.base()}`);
  }
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

module.exports = {
  init, load, save, reset, flush,
  base: store.base,
  motor: store.modo,
  cerrarStore: store.cerrar,
  DB_FILE: store.base,
  DATA_DIR: process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data'),
};
