const express = require('express');
const { load } = require('../db');
const { authRequired, requirePermiso } = require('../auth');
const { rangoFechas, fechaCorta } = require('../services');
const { round2 } = require('../utils');
const alcance = require('../alcance');

const router = express.Router();
router.use(authRequired);

function nombre(db, id, coleccion = 'usuarios') {
  return (db[coleccion] || []).find((x) => x.id === Number(id))?.nombre || 'Sin asignar';
}

router.get('/drilldown', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const vendedorId = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
  const clienteId = req.query.cliente_id ? Number(req.query.cliente_id) : null;
  const nivel = String(req.query.nivel || 'vendedores');
  const pedidos = alcance.filtrar(req, db.pedidos, ['vendedor_id', 'usuario_id', 'repartidor_asignado_id'])
    .filter((p) => p.estado !== 'cancelado')
    .filter((p) => { const f = fechaCorta(p.created_at); return f >= desde && f <= hasta; });
  const visitas = alcance.filtrar(req, db.visitas || [], ['usuario_id', 'distribuidor_id'])
    .filter((v) => { const f = fechaCorta(v.fecha); return f >= desde && f <= hasta; });
  const totalVentas = round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0));
  const totalDescuento = round2(pedidos.reduce((s, p) => s + Number(p.descuento || 0), 0));
  let filas = [];

  if (nivel === 'vendedores') {
    const mapa = new Map();
    pedidos.forEach((p) => {
      const id = Number(p.vendedor_id) || 0;
      const f = mapa.get(id) || { vendedor_id: id, vendedor: nombre(db, id), pedidos: 0, clientes: new Set(), unidades: 0, total: 0, descuento: 0 };
      f.pedidos += 1;
      f.clientes.add(Number(p.cliente_id));
      f.unidades += (p.items || []).reduce((s, i) => s + Number(i.cantidad || 0), 0);
      f.total = round2(f.total + Number(p.total || 0));
      f.descuento = round2(f.descuento + Number(p.descuento || 0));
      mapa.set(id, f);
    });
    filas = [...mapa.values()].map((f) => ({
      ...f, clientes: f.clientes.size, cliente_ids: [...f.clientes],
      visitas: visitas.filter((v) => Number(v.usuario_id) === f.vendedor_id).length,
    })).sort((a, b) => b.total - a.total);
  } else if (nivel === 'clientes' && vendedorId) {
    const mapa = new Map();
    pedidos.filter((p) => Number(p.vendedor_id) === vendedorId).forEach((p) => {
      const id = Number(p.cliente_id);
      const f = mapa.get(id) || { cliente_id: id, cliente: nombre(db, id, 'clientes'), pedidos: 0, unidades: 0, total: 0, descuento: 0, productos: new Set() };
      f.pedidos += 1;
      f.unidades += (p.items || []).reduce((s, i) => s + Number(i.cantidad || 0), 0);
      f.total = round2(f.total + Number(p.total || 0));
      f.descuento = round2(f.descuento + Number(p.descuento || 0));
      (p.items || []).forEach((i) => f.productos.add(Number(i.producto_id)));
      mapa.set(id, f);
    });
    filas = [...mapa.values()].map((f) => ({
      ...f, productos: f.productos.size, producto_ids: [...f.productos],
      visitas: visitas.filter((v) => Number(v.cliente_id) === f.cliente_id && Number(v.usuario_id) === vendedorId).length,
    })).sort((a, b) => b.total - a.total);
  } else if (nivel === 'productos') {
    const mapa = new Map();
    const seleccion = vendedorId ? pedidos.filter((p) => Number(p.vendedor_id) === vendedorId) : pedidos;
    const clientes = clienteId ? seleccion.filter((p) => Number(p.cliente_id) === clienteId) : seleccion;
    clientes.forEach((p) => (p.items || []).forEach((i) => {
      const id = Number(i.producto_id);
      const f = mapa.get(id) || { producto_id: id, producto: i.nombre || nombre(db, id, 'productos'), unidades: 0, total: 0, descuento: round2(Number(p.descuento || 0)), pedidos: 0 };
      f.unidades += Number(i.cantidad || 0);
      f.total = round2(f.total + Number(i.subtotal || 0));
      f.pedidos += 1;
      mapa.set(id, f);
    }));
    filas = [...mapa.values()].sort((a, b) => b.unidades - a.unidades);
  } else if (nivel === 'visitas') {
    const mapa = new Map();
    const visFiltradas = visitas.filter((v) => (!vendedorId || Number(v.usuario_id) === vendedorId)
      && (!clienteId || Number(v.cliente_id) === clienteId));
    visFiltradas.forEach((v) => {
      const id = clienteId ? Number(v.cliente_id) : Number(v.usuario_id);
      const f = mapa.get(id) || {
        vendedor_id: Number(v.usuario_id), cliente_id: Number(v.cliente_id),
        vendedor: clienteId ? nombre(db, v.cliente_id, 'clientes') : nombre(db, v.usuario_id),
        asignadas: 0, completadas: 0, con_pedido: 0, sin_pedido: 0,
      };
      f.asignadas += 1;
      if (['completada', 'entregada', 'cancelada'].includes(v.estado) || v.resultado) f.completadas += 1;
      if (v.resultado === 'pedido' || v.pedido_id) f.con_pedido += 1;
      else f.sin_pedido += 1;
      mapa.set(id, f);
    });
    filas = [...mapa.values()].sort((a, b) => b.asignadas - a.asignadas);
  } else if (nivel === 'descuentos') {
    filas = pedidos.filter((p) => Number(p.descuento || 0) > 0
      && (!clienteId || Number(p.cliente_id) === clienteId)).map((p) => ({
      pedido_id: p.id, codigo: p.codigo, cliente: nombre(db, p.cliente_id, 'clientes'),
      vendedor: nombre(db, p.vendedor_id), fecha: fechaCorta(p.created_at),
      total: Number(p.total || 0), descuento: Number(p.descuento || 0),
      porcentaje: p.descuento_porcentaje ? Number(p.descuento_porcentaje) : null,
    })).sort((a, b) => b.descuento - a.descuento);
  }

  return res.json({
    nivel, desde, hasta, filtros: { vendedor_id: vendedorId, cliente_id: clienteId },
    filas, resumen: { ventas: totalVentas, pedidos: pedidos.length, descuentos: totalDescuento, clientes: new Set(pedidos.map((p) => p.cliente_id)).size },
  });
});

module.exports = router;
