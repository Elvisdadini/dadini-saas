const { init, reset, base, motor, cerrarStore } = require('./db');

(async () => {
  await init();
  const db = await reset();
  console.log(`Base demo regenerada en ${base()} (motor: ${motor()})`);
  console.log(`Usuarios: ${db.usuarios.length} · Productos: ${db.productos.length} · Pedidos: ${db.pedidos.length} · Rutas: ${db.rutas.length}`);
  console.log('Acceso: admin@dadini.bo / Dadini2026!');
  await cerrarStore();
  process.exit(0);
})().catch((error) => {
  console.error('[seed] No se pudo regenerar la base:', error);
  process.exit(1);
});
