// Índices en memoria construidos una vez por request.
// Convierten los .find() repetidos dentro de bucles (N+1) en búsquedas O(1).
// Se pasan de forma opcional para no romper los llamadores existentes.

function porId(items, clave = 'id') {
  const mapa = new Map();
  (items || []).forEach((item) => {
    if (item && item[clave] !== undefined && item[clave] !== null) {
      mapa.set(Number(item[clave]), item);
    }
  });
  return mapa;
}

function buildIndices(db) {
  const stockPorProducto = new Map();
  const stockPorClave = new Map();
  (db.stock || []).forEach((s) => {
    const productoId = Number(s.producto_id);
    const almacenId = Number(s.almacen_id);
    stockPorProducto.set(productoId, (stockPorProducto.get(productoId) || 0) + Number(s.cantidad || 0));
    stockPorClave.set(`${productoId}:${almacenId}`, Number(s.cantidad || 0));
  });

  const pagosPorPedido = new Map();
  (db.pagos || []).forEach((p) => {
    const pedidoId = Number(p.pedido_id);
    if (!pagosPorPedido.has(pedidoId)) pagosPorPedido.set(pedidoId, []);
    pagosPorPedido.get(pedidoId).push(p);
  });

  const productosPorSku = new Map();
  const nombresProductos = new Map();
  (db.productos || []).forEach((p) => {
    if (!p) return;
    [p.sku, p.codigo, p.codigo_barras].forEach((clave) => {
      if (clave === undefined || clave === null || clave === '') return;
      const normalizada = String(clave).trim().toLowerCase();
      if (!productosPorSku.has(normalizada)) productosPorSku.set(normalizada, p);
    });
    if (p.nombre) {
      const nombre = String(p.nombre).trim().toLowerCase();
      if (!nombresProductos.has(nombre)) nombresProductos.set(nombre, p);
    }
  });

  const usuariosActivos = (db.usuarios || []).filter((u) => u && u.activo);
  const cobradorId = Number(db.configuracion?.cobranza?.cobrador_id)
    || usuariosActivos.find((u) => u.rol === 'cobranzas')?.id
    || null;

  return {
    clientes: porId(db.clientes),
    usuarios: porId(db.usuarios),
    almacenes: porId(db.almacenes),
    rutas: porId(db.rutas),
    cargas: porId(db.cargas),
    productos: porId(db.productos),
    repartidores: porId(db.repartidores),
    vehiculos: porId(db.vehiculos),
    stockPorProducto,
    stockPorClave,
    pagosPorPedido,
    productosPorSku,
    nombresProductos,
    cobradorId,
  };
}

module.exports = { buildIndices, porId };
