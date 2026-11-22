const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

function resumen(db, d) {
  const usuario = db.usuarios.find((u) => u.id === d.usuario_id);
  return {
    ...d,
    usuario_nombre: usuario?.nombre || '—',
    total_unidades: (d.lineas || []).reduce((s, l) => s + l.cantidad, 0),
    buenas: (d.lineas || []).filter((l) => l.estado !== 'danado').reduce((s, l) => s + l.cantidad, 0),
    danadas: (d.lineas || []).filter((l) => l.estado === 'danado').reduce((s, l) => s + l.cantidad, 0),
    reacomodadas: (d.lineas || []).filter((l) => l.reacomodado).reduce((s, l) => s + l.cantidad, 0),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, tipo, fecha, desde, hasta } = req.query;
  let items = db.devoluciones_movil.map((d) => resumen(db, d));
  if (estado && estado !== 'todos') items = items.filter((d) => d.estado === estado);
  if (tipo && tipo !== 'todos') items = items.filter((d) => d.tipo === tipo);
  if (fecha) items = items.filter((d) => String(d.fecha).slice(0, 10) === fecha);
  if (desde) items = items.filter((d) => String(d.fecha).slice(0, 10) >= desde);
  if (hasta) items = items.filter((d) => String(d.fecha).slice(0, 10) <= hasta);
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    devoluciones: items,
    resumen: {
      total: items.length,
      pendientes: items.filter((d) => d.estado === 'pendiente').length,
      reingresadas: items.filter((d) => d.estado === 'reingresado').length,
      unidades_buenas: items.filter((d) => d.estado === 'reingresado').reduce((s, d) => s + d.buenas, 0),
      reacomodadas: items.reduce((s, d) => s + d.reacomodadas, 0),
    },
  });
});

router.get('/disponible', (req, res) => {
  const db = load();
  const rutaId = Number(req.query.ruta_id);
  const mapa = new Map();
  (db.devoluciones_movil || [])
    .filter((d) => (rutaId ? d.ruta_id === rutaId : true) && d.estado !== 'reingresado')
    .forEach((dev) => {
      (dev.lineas || []).filter((l) => !l.reacomodado && l.cantidad > 0).forEach((l) => {
        const producto = db.productos.find((p) => p.id === l.producto_id);
        const prev = mapa.get(l.producto_id) || {
          producto_id: l.producto_id,
          nombre: producto?.nombre || 'Producto',
          emoji: producto?.emoji || '📦',
          precio: Number(producto?.precio) || 0,
          unidades_por_caja: Number(producto?.unidades_por_caja) || 1,
          disponible: 0,
          origen: [],
        };
        prev.disponible += l.cantidad;
        prev.origen.push(`${dev.codigo}: ${l.motivo || 'rechazo'}`);
        mapa.set(l.producto_id, prev);
      });
    });
  const productos = [...mapa.values()];
  return res.json({
    productos,
    total_unidades: productos.reduce((s, p) => s + p.disponible, 0),
    ruta_id: rutaId || null,
  });
});

router.post('/', allow('distribucion', 'vendedor_camion', 'ventas', 'almacen', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const { tipo, origen_tipo, origen_id, ruta_id, pedido_id, cliente_id, lineas, notas } = req.body || {};
  const items = (lineas || []).map((l) => ({
    producto_id: Number(l.producto_id),
    cantidad: Math.max(0, Math.round(num(l.cantidad))),
    motivo: l.motivo || 'No entregado',
    estado: 'bueno',
    reacomodado: false,
  })).filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) return res.status(400).json({ error: 'No hay productos para devolver.' });
  const dev = {
    id: nextId(db.devoluciones_movil),
    codigo: nextCode(db.devoluciones_movil, 'codigo', 'DEV', 1),
    tipo: tipo === 'venta_directa' ? 'venta_directa' : 'distribucion',
    origen_tipo: origen_tipo || (tipo === 'venta_directa' ? 'almacen_movil' : 'carga'),
    origen_id: origen_id || null,
    ruta_id: ruta_id || null,
    pedido_id: pedido_id || null,
    cliente_id: cliente_id || null,
    lineas: items,
    notas: notas || '',
    estado: 'pendiente',
    usuario_id: req.user.id,
    fecha: new Date().toISOString(),
    verificado_por: null,
    fecha_verificacion: null,
    reingresado_en: null,
  };
  db.devoluciones_movil.push(dev);
  audit(db, req, 'Devolución de almacén móvil registrada', 'Inventario', `${dev.codigo} · ${items.length} productos`);
  save();
  return res.status(201).json({ devolucion: resumen(db, dev) });
});

router.patch('/:id/verificar', allow('almacen', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const dev = db.devoluciones_movil.find((d) => d.id === Number(req.params.id));
  if (!dev) return res.status(404).json({ error: 'Devolución no encontrada.' });
  const estados = Array.isArray(req.body?.lineas) ? req.body.lineas : [];
  estados.forEach((e) => {
    const linea = dev.lineas.find((l) => l.producto_id === Number(e.producto_id));
    if (linea) linea.estado = e.estado === 'danado' ? 'danado' : 'bueno';
  });
  dev.estado = 'verificado';
  dev.verificado_por = req.user.id;
  dev.fecha_verificacion = new Date().toISOString();
  audit(db, req, 'Devolución verificada', 'Inventario', dev.codigo);
  save();
  return res.json({ devolucion: resumen(db, dev) });
});

router.post('/:id/reingresar', allow('almacen', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const dev = db.devoluciones_movil.find((d) => d.id === Number(req.params.id));
  if (!dev) return res.status(404).json({ error: 'Devolución no encontrada.' });
  if (dev.estado === 'reingresado') return res.status(400).json({ error: 'Ya fue reingresada.' });
  if (dev.estado !== 'verificado') return res.status(400).json({ error: 'Primero verifica el estado de los productos.' });
  const almacenId = Number(req.body?.almacen_id) || 1;
  const reingresadas = [];
  dev.lineas.filter((l) => l.estado !== 'danado' && !l.reacomodado).forEach((l) => {
    let fila = db.stock.find((s) => s.producto_id === l.producto_id && s.almacen_id === almacenId);
    if (!fila) {
      fila = { id: nextId(db.stock), producto_id: l.producto_id, almacen_id: almacenId, cantidad: 0 };
      db.stock.push(fila);
    }
    fila.cantidad += l.cantidad;
    db.movimientos.unshift({
      id: nextId(db.movimientos), producto_id: l.producto_id, almacen_id: almacenId,
      tipo: 'entrada', cantidad: l.cantidad, motivo: 'Reingreso de devolución verificada',
      referencia: dev.codigo, usuario_id: req.user.id, fecha: new Date().toISOString(),
    });
    reingresadas.push({ producto_id: l.producto_id, cantidad: l.cantidad });
  });
  dev.estado = 'reingresado';
  dev.reingresado_en = new Date().toISOString();
  audit(db, req, 'Devolución reingresada al almacén', 'Inventario', `${dev.codigo} · ${reingresadas.length} productos`);
  save();
  return res.json({ devolucion: resumen(db, dev), reingresadas });
});

router.post('/:id/reacomodar', allow('distribucion', 'vendedor_camion', 'ventas', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const dev = db.devoluciones_movil.find((d) => d.id === Number(req.params.id));
  if (!dev) return res.status(404).json({ error: 'Devolución no encontrada.' });
  const cliente = db.clientes.find((c) => c.id === Number(req.body?.cliente_id) && c.activo);
  if (!cliente) return res.status(400).json({ error: 'Selecciona un cliente válido.' });
  const items = (req.body?.lineas || []).map((l) => ({
    producto_id: Number(l.producto_id),
    cantidad: Math.max(0, Math.round(num(l.cantidad))),
    motivo: l.motivo || 'Reacomodado tras entrega parcial/rechazo',
  })).filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) return res.status(400).json({ error: 'Indica los productos a reacomodar.' });

  const lineas = [];
  items.forEach((item) => {
    const disponible = dev.lineas.find((l) => l.producto_id === item.producto_id && !l.reacomodado);
    const cantidad = Math.min(disponible?.cantidad || 0, item.cantidad);
    if (cantidad <= 0) return;
    if (disponible) {
      disponible.reacomodado = true;
      disponible.cantidad -= cantidad;
      if (disponible.cantidad <= 0) disponible.reacomodado = true;
    }
    const producto = db.productos.find((p) => p.id === item.producto_id);
    lineas.push({
      producto_id: item.producto_id,
      nombre: producto?.nombre || 'Producto',
      emoji: producto?.emoji || '📦',
      cantidad,
      precio: 0,
      costo_unitario: num(producto?.costo),
      subtotal: 0,
      reacomodado: true,
      motivo: item.motivo,
    });
  });
  if (!lineas.length) return res.status(400).json({ error: 'No hay unidades disponibles para reacomodar.' });

  const ahora = new Date().toISOString();
  const pedido = {
    id: nextId(db.pedidos),
    codigo: nextCode(db.pedidos, 'codigo', 'VTA', 1001),
    cliente_id: cliente.id,
    vendedor_id: req.user.id,
    canal: 'ruta',
    estado: 'entregado',
    estado_pago: 'pagado',
    forma_pago: 'efectivo',
    es_reacomodo: true,
    origen_devolucion_id: dev.id,
    almacen_movil_id: dev.origen_id || null,
    ruta_id: dev.ruta_id || null,
    dias_credito: null,
    interes_pagado: 0,
    almacen_id: 1,
    subtotal: 0,
    descuento: 0,
    descuento_promociones: 0,
    promociones_aplicadas: [],
    bonificaciones: [],
    envio: 0,
    total: 0,
    pagado: 0,
    saldo: 0,
    items: lineas,
    notas: `Producto reacomodado desde ${dev.codigo} (entrega parcial/rechazo)`,
    entrega_direccion: cliente.direccion,
    created_at: ahora,
    updated_at: ahora,
  };
  db.pedidos.push(pedido);
  dev.reacomodado_en = ahora;
  dev.reacomodado_a = pedido.codigo;
  db.visitas.unshift({
    id: nextId(db.visitas), cliente_id: cliente.id, tipo: 'distribucion', modulo: 'Distribución',
    latitud: cliente.latitud || null, longitud: cliente.longitud || null, precision: null,
    estado: 'completada', resultado_entrega: 'reacomodado', motivo: 'Reacomodo desde devolución',
    pedido_id: pedido.id, ruta_id: dev.ruta_id || null, usuario_id: req.user.id,
    notas: `Productos reacomodados ${pedido.codigo} desde ${dev.codigo}`,
    fecha: ahora, created_at: ahora,
  });
  audit(db, req, 'Producto reacomodado', 'Distribución', `${dev.codigo} → ${cliente.nombre} · ${pedido.codigo}`);
  save();
  return res.json({ pedido, devolucion: resumen(db, dev) });
});

module.exports = router;
