const { init, reset, save, flush, base, motor, cerrarStore } = require('./db');
const { vaciarOperacion } = require('./operacion');

(async () => {
  const modoDemo = process.argv.includes('--demo');
  await init();
  const db = await reset();
  if (!modoDemo) { vaciarOperacion(db); save(); }
  await flush();
  console.log(`Base ${modoDemo ? 'demo' : 'de producción'} regenerada en ${base()} (motor: ${motor()})`);
  console.log(`Usuarios activos: ${db.usuarios.filter((u) => u.activo).length} · Productos: ${db.productos.length} · Pedidos: ${db.pedidos.length} · Clientes: ${db.clientes.length}`);
  console.log('Acceso: usa tu cuenta corporativa asignada por administración');
  await cerrarStore();
  process.exit(0);
})().catch((error) => {
  console.error('[seed] No se pudo regenerar la base:', error);
  process.exit(1);
});
