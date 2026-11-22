const path = require('path');
const store = require('./store');
const { buildSeed } = require('./seed');
const { vaciarOperacion } = require('./operacion');
const { asegurarEstructura } = require('./permisos');

(async () => {
  // Este script siempre genera el archivo JSON que se versiona y usa Render.
  ['DB_HOST', 'DB_NAME', 'DB_USER'].forEach((clave) => { delete process.env[clave]; });
  const jsonDir = process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data');
  await store.init({ jsonDir });
  const db = buildSeed();
  asegurarEstructura(db);
  vaciarOperacion(db);
  await store.guardar(db);
  console.log(`Base de producción preparada en ${store.base()}`);
  console.log(`Usuarios activos: ${db.usuarios.filter((u) => u.activo).length} · Productos: ${db.productos.length} · Pedidos: ${db.pedidos.length} · Clientes: ${db.clientes.length}`);
  await store.cerrar();
  process.exit(0);
})().catch((error) => {
  console.error('[preparar-produccion] No se pudo preparar la base:', error);
  process.exit(1);
});
