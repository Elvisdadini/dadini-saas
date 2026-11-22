const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { num, round2 } = require('../utils');
const { toCSV } = require('../utils');

const router = express.Router();
router.use(authRequired);

function calcularFila(db, pedido) {
  const cliente = db.clientes.find((c) => c.id === pedido.cliente_id);
  const vendedor = db.usuarios.find((u) => u.id === pedido.vendedor_id);
  const distribuidor = db.repartidores.find((r) => r.id === (pedido.repartidor_asignado_id || db.rutas.find((x) => x.id === pedido.ruta_id)?.repartidor_id));
  let unidades = 0;
  let cajas = 0;
  let peso = 0;
  const resumenProductos = [];
  (pedido.items || []).forEach((item) => {
    const producto = db.productos.find((p) => p.id === item.producto_id);
    const cantidad = Number(item.cantidad) || 0;
    const upc = Math.max(1, num(producto?.unidades_por_caja, 1));
    unidades += cantidad;
    cajas += Math.floor(cantidad / upc) + (cantidad % upc > 0 ? 1 : 0);
    peso += cantidad * num(producto?.peso_kg, 0.25);
    resumenProductos.push(`${cantidad} x ${producto?.nombre || item.nombre || item.producto_id} (${Math.floor(cantidad / upc) + (cantidad % upc > 0 ? 1 : 0)} cajas)`);
  });
  return {
    pedido_id: pedido.id,
    pedido_codigo: pedido.codigo,
    fecha: pedido.created_at,
    cliente_id: cliente?.id || null,
    cliente: cliente?.nombre || 'Cliente eliminado',
    cliente_zona: cliente?.zona || '',
    vendedor: vendedor?.nombre || 'Sin asignar',
    distribuidor_id: distribuidor?.id || null,
    distribuidor_codigo: distribuidor ? `REP-${String(distribuidor.id).padStart(3, '0')}` : '—',
    distribuidor: distribuidor?.nombre || 'Sin asignar',
    ruta_venta: pedido.ruta_venta || '—',
    almacen_id: pedido.almacen_id,
    total: round2(pedido.total),
    estado: pedido.estado,
    forma_pago: pedido.forma_pago,
    unidades,
    cajas,
    peso_kg: round2(peso),
    producto_resumen: resumenProductos.join('; '),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { desde, hasta, distribuidor_id, ruta_venta, almacen_id, estado, search } = req.query;
  let pedidos = db.pedidos.filter((p) => p.estado !== 'cancelado');
  if (desde) pedidos = pedidos.filter((p) => String(p.created_at).slice(0, 10) >= desde);
  if (hasta) pedidos = pedidos.filter((p) => String(p.created_at).slice(0, 10) <= hasta);
  if (ruta_venta && ruta_venta !== 'todas') pedidos = pedidos.filter((p) => p.ruta_venta === ruta_venta);
  if (almacen_id) pedidos = pedidos.filter((p) => p.almacen_id === Number(almacen_id));
  if (estado && estado !== 'todos') pedidos = pedidos.filter((p) => p.estado === estado);
  if (distribuidor_id) pedidos = pedidos.filter((p) => p.repartidor_asignado_id === Number(distribuidor_id) || db.rutas.find((x) => x.id === p.ruta_id)?.repartidor_id === Number(distribuidor_id));
  const filas = pedidos.map((p) => calcularFila(db, p));
  let visibles = filas;
  if (search) visibles = filas.filter((f) => `${f.cliente} ${f.pedido_codigo} ${f.vendedor}`.toLowerCase().includes(String(search).toLowerCase()));
  visibles.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const resumen = {
    pedidos: visibles.length,
    unidades: visibles.reduce((s, f) => s + f.unidades, 0),
    cajas: visibles.reduce((s, f) => s + f.cajas, 0),
    peso_kg: round2(visibles.reduce((s, f) => s + f.peso_kg, 0)),
    monto: round2(visibles.reduce((s, f) => s + f.total, 0)),
  };
  return res.json({
    filas: visibles,
    resumen,
    distribuidores: db.repartidores.map((r) => ({ id: r.id, nombre: r.nombre, codigo: `REP-${String(r.id).padStart(3, '0')}` })),
  });
});

router.get('/export', (req, res) => {
  const db = load();
  const { desde, hasta, distribuidor_id, ruta_venta, almacen_id, estado } = req.query;
  let pedidos = db.pedidos.filter((p) => p.estado !== 'cancelado');
  if (desde) pedidos = pedidos.filter((p) => String(p.created_at).slice(0, 10) >= desde);
  if (hasta) pedidos = pedidos.filter((p) => String(p.created_at).slice(0, 10) <= hasta);
  if (ruta_venta && ruta_venta !== 'todas') pedidos = pedidos.filter((p) => p.ruta_venta === ruta_venta);
  if (almacen_id) pedidos = pedidos.filter((p) => p.almacen_id === Number(almacen_id));
  if (estado && estado !== 'todos') pedidos = pedidos.filter((p) => p.estado === estado);
  if (distribuidor_id) pedidos = pedidos.filter((p) => p.repartidor_asignado_id === Number(distribuidor_id) || db.rutas.find((x) => x.id === p.ruta_id)?.repartidor_id === Number(distribuidor_id));
  const filas = pedidos.map((p) => calcularFila(db, p));
  const csv = toCSV(filas, [
    { label: 'Pedido', value: (f) => f.pedido_codigo },
    { label: 'Fecha', value: (f) => f.fecha },
    { label: 'Cliente', value: (f) => f.cliente },
    { label: 'Zona', value: (f) => f.cliente_zona },
    { label: 'Vendedor', value: (f) => f.vendedor },
    { label: 'Distribuidor', value: (f) => f.distribuidor },
    { label: 'Cod. distribuidor', value: (f) => f.distribuidor_codigo },
    { label: 'Total Bs', value: (f) => f.total },
    { label: 'Unidades', value: (f) => f.unidades },
    { label: 'Cajas', value: (f) => f.cajas },
    { label: 'Peso kg', value: (f) => f.peso_kg },
    { label: 'Productos', value: (f) => f.producto_resumen },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="lista-distribucion.csv"');
  return res.send(csv);
});

module.exports = router;
