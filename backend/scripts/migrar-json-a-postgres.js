// Migración única del archivo JSON actual a Postgres (modo principal).
// Uso: DATABASE_URL=postgres://... npm run migrar:pg
// El JSON de origen se conserva intacto: solo se escribe en Postgres.
const fs = require('fs');
const path = require('path');
const store = require('../src/store');

(async () => {
  const dir = process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data');
  const archivo = path.join(dir, 'dadini.json');
  if (!fs.existsSync(archivo)) throw new Error(`No existe ${archivo}`);
  const db = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  await store.init({ jsonDir: dir });
  if (store.modo() !== 'postgres') {
    throw new Error('Define DATABASE_URL (o DB_HOST/DB_NAME/DB_USER/DB_PASSWORD) antes de migrar.');
  }
  await store.guardar(db);
  const conteo = {};
  ['clientes', 'productos', 'pedidos', 'proveedores'].forEach((k) => { conteo[k] = (db[k] || []).length; });
  console.log(`[migrar:pg] Base escrita en ${store.base()} (esquema ${store.esquema})`);
  console.log(`[migrar:pg] ${JSON.stringify(conteo)}`);
  await store.cerrar();
})().catch((error) => {
  console.error('[migrar:pg]', error.message);
  process.exit(1);
});
