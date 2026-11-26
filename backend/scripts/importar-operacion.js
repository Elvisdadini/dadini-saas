// Importa datos operativos desde un JSON histórico al store actual (Postgres
// o JSON). NO sobrescribe usuarios, 2FA, configuración, integraciones ni
// sucursales: solo reemplaza las colecciones operativas.
// Uso: DATABASE_URL=... npm run importar:operacion -- "ruta/al/dadini.json"
const fs = require('fs');
const { SEED_VERSION } = require('../src/seed');
const dbmod = require('../src/db');
const tenant = require('../src/tenant');
const cadena = require('../src/auditoria-chain');
const { asegurarEstructura } = require('../src/permisos');
const { recalcularCliente } = require('../src/services');

(async () => {
  const archivo = process.argv[2] || process.env.ARCHIVO_DATOS;
  if (!archivo) throw new Error('Indica la ruta del JSON: npm run importar:operacion -- "ruta/archivo.json"');
  const viejo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  await dbmod.init();
  const db = dbmod.load();
  const copiar = (clave) => JSON.parse(JSON.stringify(Array.isArray(viejo[clave]) ? viejo[clave] : []));
  ['productos', 'stock', 'almacenes', 'clientes', 'pedidos', 'pagos', 'movimientos', 'rutas', 'visitas'].forEach((clave) => {
    db[clave] = copiar(clave);
  });
  db.version = SEED_VERSION;
  db.sincronizacion = {
    ...(db.sincronizacion || {}),
    ultimo_cambio_local: new Date().toISOString(),
    estado: 'sincronizando',
  };
  (db.clientes || []).forEach((c) => recalcularCliente(db, c.id));
  tenant.asegurar(db);
  cadena.asegurar(db);
  asegurarEstructura(db);
  await dbmod.guardarAhora();
  const conteo = {};
  ['productos', 'clientes', 'pedidos', 'pagos', 'movimientos'].forEach((k) => { conteo[k] = (db[k] || []).length; });
  console.log(`[importar:operacion] ${JSON.stringify(conteo)}`);
  console.log(`[importar:operacion] motor=${dbmod.motor()} base=${dbmod.base()}`);
  await dbmod.cerrarStore();
})().catch((error) => {
  console.error('[importar:operacion]', error.message);
  process.exit(1);
});
