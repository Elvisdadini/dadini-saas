// Entidades que se dejan en cero para iniciar operación real.
// Se conservan usuarios, almacenes, productos, stock, repartidores, vehículos,
// proveedores, tipos de gasto, categorías de cliente y configuración.
const ENTIDADES_OPERATIVAS = [
  'clientes', 'pedidos', 'pagos', 'movimientos', 'rutas', 'visitas', 'cargas',
  'solicitudes_carga', 'confirmaciones_carga', 'devoluciones_movil',
  'mensajes_whatsapp', 'notificaciones', 'auditoria', 'promociones',
  'almacenes_moviles', 'objetivos_mensuales', 'solicitudes_compra',
  'ordenes_compra', 'gastos', 'pagos_proveedor', 'boletas_pago', 'conceptos_nomina',
];

function vaciarOperacion(db) {
  ENTIDADES_OPERATIVAS.forEach((entidad) => { db[entidad] = []; });
  if (db.configuracion) {
    db.configuracion.apk = null;
    db.configuracion.apk_desactivada = false;
  }
  db.generado_en = new Date().toISOString();
  return db;
}

module.exports = { vaciarOperacion, ENTIDADES_OPERATIVAS };
