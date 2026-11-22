const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { round2, num } = require('../utils');
const { toCSV } = require('../utils');

const router = express.Router();
router.use(authRequired);

function construir(db, desde, hasta, agrupacion = 'dia') {
  const enRango = (fecha) => String(fecha).slice(0, 10) >= desde && String(fecha).slice(0, 10) <= hasta;
  const pedidos = db.pedidos.filter((p) => p.estado !== 'cancelado' && enRango(p.created_at));
  const ventas = round2(pedidos.reduce((s, p) => s + p.total, 0));
  const costoVentas = round2(pedidos.reduce((s, p) => s + (p.items || []).reduce((x, i) => x + num(i.costo_unitario) * i.cantidad, 0), 0));
  const margen = round2(ventas - costoVentas);
  const gastos = db.gastos.filter((g) => enRango(g.fecha));
  const totalGastos = round2(gastos.reduce((s, g) => s + g.monto, 0));
  const ordenes = db.ordenes_compra.filter((o) => enRango(o.fecha));
  const compras = round2(ordenes.reduce((s, o) => s + o.total, 0));
  const pagosProveedor = round2(db.pagos_proveedor.filter((p) => enRango(p.fecha)).reduce((s, p) => s + p.monto, 0));
  const cobros = round2(db.pagos.filter((p) => enRango(p.fecha)).reduce((s, p) => s + p.monto, 0));
  const utilidadNeta = round2(margen - totalGastos);
  const capitalAlmacenes = round2(db.stock.reduce((s, fila) => {
    const producto = db.productos.find((p) => p.id === fila.producto_id);
    return s + fila.cantidad * num(producto?.costo);
  }, 0));
  const capitalMovil = round2((db.almacenes_moviles || []).reduce((s, almacen) => s + (almacen.lineas || []).reduce((x, linea) => {
    const producto = db.productos.find((p) => p.id === linea.producto_id);
    return x + linea.cantidad * num(producto?.costo);
  }, 0), 0));

  const claveDe = (fecha) => {
    const f = String(fecha).slice(0, 10);
    if (agrupacion === 'mes') return f.slice(0, 7);
    if (agrupacion === 'semana') {
      const d = new Date(f);
      const dia = d.getDay() || 7;
      d.setDate(d.getDate() - dia + 1);
      return d.toISOString().slice(0, 10);
    }
    return f;
  };
  const mapa = new Map();
  const asegurar = (clave) => {
    if (!mapa.has(clave)) mapa.set(clave, { clave, ventas: 0, costo: 0, gastos: 0, compras: 0, pedidos: 0 });
    return mapa.get(clave);
  };
  pedidos.forEach((p) => {
    const fila = asegurar(claveDe(p.created_at));
    fila.ventas += p.total;
    fila.costo += (p.items || []).reduce((x, i) => x + num(i.costo_unitario) * i.cantidad, 0);
    fila.pedidos += 1;
  });
  gastos.forEach((g) => { asegurar(claveDe(g.fecha)).gastos += g.monto; });
  ordenes.forEach((o) => { asegurar(claveDe(o.fecha)).compras += o.total; });
  const serie = [...mapa.values()].sort((a, b) => a.clave.localeCompare(b.clave)).map((f) => ({
    ...f,
    ventas: round2(f.ventas), costo: round2(f.costo), gastos: round2(f.gastos), compras: round2(f.compras),
    utilidad: round2(f.ventas - f.costo - f.gastos),
  }));

  const porCategoriaGasto = [...new Set(gastos.map((g) => db.tipos_gasto.find((t) => t.id === g.tipo_gasto_id)?.categoria || 'Otros'))].map((categoria) => ({
    categoria,
    total: round2(gastos.filter((g) => (db.tipos_gasto.find((t) => t.id === g.tipo_gasto_id)?.categoria || 'Otros') === categoria).reduce((s, g) => s + g.monto, 0)),
  }));
  const porProveedor = [...new Set(ordenes.map((o) => o.proveedor_id))].map((id) => ({
    proveedor: db.proveedores.find((p) => p.id === id)?.nombre || '—',
    total: round2(ordenes.filter((o) => o.proveedor_id === id).reduce((s, o) => s + o.total, 0)),
  }));

  return {
    periodo: { desde, hasta, agrupacion },
    kpis: {
      ventas, costo_ventas: costoVentas, margen_bruto: margen, gastos: totalGastos,
      utilidad_neta: utilidadNeta, rentabilidad: ventas ? round2((utilidadNeta / ventas) * 100) : 0,
      compras, pagos_proveedor: pagosProveedor, cobros, deuda_proveedores: round2(compras - pagosProveedor),
      pedidos: pedidos.length, ticket_promedio: pedidos.length ? round2(ventas / pedidos.length) : 0,
      capital_almacenes: capitalAlmacenes,
      capital_movil: capitalMovil,
      capital_total: round2(capitalAlmacenes + capitalMovil),
      ganancia_neta: utilidadNeta,
    },
    serie,
    por_categoria_gasto: porCategoriaGasto,
    por_proveedor: porProveedor,
  };
}

router.get('/', (req, res) => {
  const db = load();
  const desde = req.query.desde || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);
  const agrupacion = ['dia', 'semana', 'mes'].includes(req.query.agrupacion) ? req.query.agrupacion : 'dia';
  res.json(construir(db, desde, hasta, agrupacion));
});

router.get('/export', (req, res) => {
  const db = load();
  const desde = req.query.desde || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  const hasta = req.query.hasta || new Date().toISOString().slice(0, 10);
  const datos = construir(db, desde, hasta, req.query.agrupacion || 'dia');
  const csv = toCSV(datos.serie, [
    { label: 'Clave', value: (f) => f.clave },
    { label: 'Ventas', value: (f) => f.ventas },
    { label: 'Costo', value: (f) => f.costo },
    { label: 'Gastos', value: (f) => f.gastos },
    { label: 'Compras', value: (f) => f.compras },
    { label: 'Utilidad', value: (f) => f.utilidad },
    { label: 'Pedidos', value: (f) => f.pedidos },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rentabilidad.csv"');
  res.send(csv);
});

module.exports = router;
