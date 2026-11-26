// Cambios de producto: el vendedor registra el producto con detalle, adjunta
// foto y razón; el distribuidor verifica que el producto bueno entregado sea
// el mismo y confirma o rechaza el cambio.
const { nextId, round2 } = require('./utils');

const MOTIVOS = {
  defecto: 'Defecto del producto',
  vencimiento_corto: 'Fecha de vencimiento corta',
  baja_rotacion: 'Baja rotación del producto',
  producto_incorrecto: 'No fue el producto que pidió el cliente',
};

function asegurar(db) {
  if (!Array.isArray(db.cambios_producto)) db.cambios_producto = [];
  return db.cambios_producto;
}

function crear(db, datos, usuario, fotoUrl = null) {
  const lista = asegurar(db);
  const clienteId = Number(datos.cliente_id);
  if (!clienteId) throw new Error('Selecciona el cliente.');
  const productoId = Number(datos.producto_id);
  if (!productoId) throw new Error('Selecciona el producto con detalle.');
  const cantidad = Math.max(1, Math.round(Number(datos.cantidad) || 0));
  const motivo = String(datos.motivo || '');
  if (!MOTIVOS[motivo]) throw new Error('Selecciona una razón válida.');
  const razon = String(datos.razon || '').trim();
  if (!razon) throw new Error('Detalla la razón del cambio.');
  const id = nextId(lista);
  const ahora = new Date().toISOString();
  const cambio = {
    id,
    codigo: `CAM-${String(id).padStart(4, '0')}`,
    cliente_id: clienteId,
    pedido_id: datos.pedido_id ? Number(datos.pedido_id) : null,
    vendedor_id: usuario.id,
    vendedor_nombre: usuario.nombre || 'Vendedor',
    producto_id: productoId,
    producto_nombre: String(datos.producto_nombre || ''),
    reemplazo_id: datos.reemplazo_id ? Number(datos.reemplazo_id) : productoId,
    reemplazo_nombre: String(datos.reemplazo_nombre || datos.producto_nombre || ''),
    cantidad,
    motivo,
    razon,
    foto_url: fotoUrl,
    almacen_id: Number(datos.almacen_id) || 1,
    estado: 'pendiente',
    distribuidor_id: null,
    confirmado_por: null,
    confirmado_en: null,
    producto_entregado_id: null,
    foto_entrega_url: null,
    nota_distribuidor: null,
    creado_en: ahora,
    actualizado_en: ahora,
  };
  lista.push(cambio);
  return cambio;
}

function confirmar(db, id, datos, usuario, fotoUrl = null) {
  const cambio = asegurar(db).find((c) => c.id === Number(id));
  if (!cambio) throw new Error('Cambio no encontrado.');
  if (cambio.estado !== 'pendiente') throw new Error('Este cambio ya fue confirmado o rechazado.');
  const entregado = Number(datos?.producto_entregado_id);
  if (!entregado) throw new Error('Indica el producto bueno que entregaste.');
  const esperado = Number(cambio.reemplazo_id || cambio.producto_id);
  if (entregado !== esperado) {
    throw new Error(`El producto entregado (${entregado}) no coincide con el registrado para el cambio (${esperado}).`);
  }
  const ahora = new Date().toISOString();
  cambio.estado = 'confirmado';
  cambio.distribuidor_id = usuario.id;
  cambio.confirmado_por = usuario.id;
  cambio.confirmado_en = ahora;
  cambio.producto_entregado_id = entregado;
  cambio.foto_entrega_url = fotoUrl || cambio.foto_entrega_url || null;
  cambio.nota_distribuidor = String(datos?.nota || '').trim() || null;
  cambio.actualizado_en = ahora;

  // Trazabilidad de inventario: no se reincorpora el producto con detalle al
  // stock vendible; solo se deja constancia de la salida del bueno y la merma.
  if (!Array.isArray(db.movimientos)) db.movimientos = [];
  const movimiento = (productoId, tipo, motivo) => ({
    id: nextId(db.movimientos), producto_id: productoId, almacen_id: cambio.almacen_id,
    tipo, cantidad: cambio.cantidad, motivo: `${motivo} · ${cambio.codigo}`,
    referencia: cambio.codigo, usuario_id: usuario.id, fecha: ahora,
  });
  db.movimientos.unshift(movimiento(entregado, 'salida', 'Entrega de producto bueno por cambio'));
  db.movimientos.unshift(movimiento(cambio.producto_id, 'entrada', 'Producto con detalle, no comercializable'));
  return cambio;
}

function rechazar(db, id, datos, usuario) {
  const cambio = asegurar(db).find((c) => c.id === Number(id));
  if (!cambio) throw new Error('Cambio no encontrado.');
  if (cambio.estado !== 'pendiente') throw new Error('Este cambio ya fue resuelto.');
  cambio.estado = 'rechazado';
  cambio.confirmado_por = usuario.id;
  cambio.confirmado_en = new Date().toISOString();
  cambio.nota_distribuidor = String(datos?.nota || '').trim() || null;
  cambio.actualizado_en = cambio.confirmado_en;
  return cambio;
}

function listar(db, filtros = {}, usuario = {}) {
  let lista = [...asegurar(db)];
  const rol = usuario.rol;
  if (!['admin', 'dueno', 'supervisor'].includes(rol)) {
    if (rol === 'distribucion') {
      // El distribuidor ve los pendientes y los que él confirmó.
      lista = lista.filter((c) => c.estado === 'pendiente' || c.distribuidor_id === usuario.id);
    } else {
      lista = lista.filter((c) => Number(c.vendedor_id) === Number(usuario.id));
    }
  }
  if (filtros.estado && filtros.estado !== 'todos') lista = lista.filter((c) => c.estado === filtros.estado);
  if (filtros.cliente_id) lista = lista.filter((c) => Number(c.cliente_id) === Number(filtros.cliente_id));
  if (filtros.vendedor_id) lista = lista.filter((c) => Number(c.vendedor_id) === Number(filtros.vendedor_id));
  if (filtros.motivo && filtros.motivo !== 'todos') lista = lista.filter((c) => c.motivo === filtros.motivo);
  if (filtros.search) {
    const q = String(filtros.search).toLowerCase();
    lista = lista.filter((c) => `${c.codigo} ${c.producto_nombre || ''} ${c.razon || ''}`.toLowerCase().includes(q));
  }
  lista.sort((a, b) => String(b.creado_en).localeCompare(String(a.creado_en)));
  return {
    cambios: lista.slice(0, Number(filtros.limit) || 200),
    total: lista.length,
    resumen: {
      pendientes: lista.filter((c) => c.estado === 'pendiente').length,
      confirmados: lista.filter((c) => c.estado === 'confirmado').length,
      rechazados: lista.filter((c) => c.estado === 'rechazado').length,
    },
  };
}

module.exports = { MOTIVOS, asegurar, crear, confirmar, rechazar, listar };
