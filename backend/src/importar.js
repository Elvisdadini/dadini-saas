// Reemplaza las colecciones operativas con datos de un JSON histórico sin
// tocar usuarios, 2FA, configuración, integraciones ni sucursales.
const { SEED_VERSION } = require('./seed');
const tenant = require('./tenant');
const cadena = require('./auditoria-chain');
const { asegurarEstructura } = require('./permisos');
const { recalcularCliente } = require('./services');

const COLECCIONES = ['productos', 'stock', 'almacenes', 'clientes', 'pedidos', 'pagos', 'movimientos', 'rutas', 'visitas',
  'cajas', 'movimientos_caja'];

function aplicar(db, viejo) {
  if (!viejo || typeof viejo !== 'object') throw new Error('El archivo debe contener un objeto JSON.');
  COLECCIONES.forEach((clave) => {
    if (Array.isArray(viejo[clave])) db[clave] = JSON.parse(JSON.stringify(viejo[clave]));
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
  const conteo = {};
  COLECCIONES.forEach((k) => { if (Array.isArray(db[k])) conteo[k] = db[k].length; });
  return conteo;
}

module.exports = { aplicar, COLECCIONES };
