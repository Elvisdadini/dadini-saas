// Importa datos operativos desde un JSON histórico al store actual (Postgres
// o JSON). NO sobrescribe usuarios, 2FA, configuración, integraciones ni
// sucursales. El servidor en marcha puede hacer lo mismo vía
// POST /api/importacion/operacion.
// Uso: DATABASE_URL=... npm run importar:operacion -- "ruta/al/dadini.json"
const fs = require('fs');
const dbmod = require('../src/db');
const importar = require('../src/importar');

(async () => {
  const archivo = process.argv[2] || process.env.ARCHIVO_DATOS;
  if (!archivo) throw new Error('Indica la ruta del JSON: npm run importar:operacion -- "ruta/archivo.json"');
  const viejo = JSON.parse(fs.readFileSync(archivo, 'utf8'));
  await dbmod.init();
  const conteo = importar.aplicar(dbmod.load(), viejo);
  await dbmod.guardarAhora();
  const sync = require('../src/supabase-sync');
  const enviado = await sync.sincronizar(dbmod.load(), 'importación de datos reales', { forzar: true });
  console.log(`[importar:operacion] snapshot=${JSON.stringify({ ok: enviado.ok, error: enviado.error || null })}`);
  console.log(`[importar:operacion] ${JSON.stringify(conteo)}`);
  console.log(`[importar:operacion] motor=${dbmod.motor()} base=${dbmod.base()}`);
  await dbmod.cerrarStore();
})().catch((error) => {
  console.error('[importar:operacion]', error.message);
  process.exit(1);
});
