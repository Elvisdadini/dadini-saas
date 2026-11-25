const { hoy, round2, daysBetween, normalize } = require('./utils');
const { vencimientoDe, interesDe, config: configCredito } = require('./credito');
const { buildIndices } = require('./indexes');

function fechaCorta(isoString) {
  return String(isoString || '').slice(0, 10);
}

function inactivo(db, productoId) {
  const producto = db.productos.find((p) => p.id === Number(productoId));
  return producto ? producto.activo === false : false;
}

function stockDe(db, productoId, indices) {
  if (indices) return indices.stockPorProducto.get(Number(productoId)) || 0;
  if (inactivo(db, productoId)) return 0;
  return db.stock.filter((s) => s.producto_id === productoId).reduce((sum, s) => sum + s.cantidad, 0);
}

function stockEn(db, productoId, almacenId, indices) {
  if (indices) return indices.stockPorClave.get(`${Number(productoId)}:${Number(almacenId)}`) || 0;
  if (inactivo(db, productoId)) return 0;
  const row = db.stock.find((s) => s.producto_id === productoId && s.almacen_id === Number(almacenId));
  return row ? row.cantidad : 0;
}

function productoResumen(db, producto, indices) {
  const total = stockDe(db, producto.id, indices);
  const desactivado = producto.activo === false;
  return {
    ...producto,
    activo: !desactivado,
    stock_total: total,
    bajo_stock: !desactivado && total <= (producto.stock_minimo || 0),
    stock_por_almacen: db.almacenes.map((a) => ({
      almacen_id: a.id,
      almacen: a.nombre,
      cantidad: desactivado ? 0 : stockEn(db, producto.id, a.id, indices),
    })),
  };
}

function pedidoResumen(db, pedido, detalle = false, indices) {
  const cliente = indices ? indices.clientes.get(Number(pedido.cliente_id)) : db.clientes.find((c) => c.id === pedido.cliente_id);
  const vendedor = indices ? indices.usuarios.get(Number(pedido.vendedor_id)) : db.usuarios.find((u) => u.id === pedido.vendedor_id);
  const almacen = indices ? indices.almacenes.get(Number(pedido.almacen_id)) : db.almacenes.find((a) => a.id === pedido.almacen_id);
  const ruta = indices ? indices.rutas.get(Number(pedido.ruta_id)) : db.rutas.find((r) => r.id === pedido.ruta_id);
  const dias = daysBetween(pedido.created_at);
  const vencimiento = vencimientoDe(db, pedido);
  const credito = interesDe(db, pedido);
  const cfgCobro = configCredito(db);
  const diasVencidoCalc = pedido.saldo > 0 ? daysBetween(vencimiento) : 0;
  const enMora = pedido.saldo > 0 && diasVencidoCalc > Number(cfgCobro.dias_gracia || 0);
  const cobradorId = indices
    ? indices.cobradorId
    : ((db.configuracion?.cobranza?.cobrador_id && Number(db.configuracion.cobranza.cobrador_id))
      || db.usuarios.find((u) => u.rol === 'cobranzas' && u.activo)?.id
      || null);
  const responsableCobroId = enMora ? (cobradorId || pedido.vendedor_id) : pedido.vendedor_id;
  const base = {
    ...pedido,
    cliente_nombre: cliente?.nombre || 'Cliente eliminado',
    cliente_tipo: cliente?.tipo || 'minorista',
    cliente_zona: cliente?.zona || '',
    cliente_telefono: cliente?.telefono || '',
    cliente_whatsapp: cliente?.whatsapp || cliente?.telefono || '',
    cliente_latitud: cliente?.latitud ?? null,
    cliente_longitud: cliente?.longitud ?? null,
    vendedor_nombre: vendedor?.nombre || 'Sin asignar',
    almacen_nombre: almacen?.nombre || '—',
    ruta_codigo: ruta?.codigo || null,
    carga_id: pedido.carga_id || null,
    carga_codigo: indices ? indices.cargas.get(Number(pedido.carga_id))?.codigo || null : db.cargas?.find((c) => c.id === pedido.carga_id)?.codigo || null,
    dias_desde_venta: dias,
    vencimiento,
    vencido: pedido.saldo > 0 && vencimiento < hoy(),
    dias_vencido: diasVencidoCalc,
    en_mora: enMora,
    responsable_cobro_id: responsableCobroId,
    responsable_cobro_nombre: (indices ? indices.usuarios.get(Number(responsableCobroId)) : db.usuarios.find((u) => u.id === responsableCobroId))?.nombre || 'Sin asignar',
    cobrador_id: enMora ? cobradorId : null,
    migrado_cobranzas_en: pedido.migrado_cobranzas_en || null,
    dias_credito: credito.dias_credito,
    tasa_interes_mensual: credito.tasa_mensual,
    interes_generado: credito.generado,
    interes_pagado: credito.pagado,
    interes_pendiente: credito.pendiente,
    total_a_cobrar: credito.total_a_cobrar,
    items_count: Array.isArray(pedido.items) ? pedido.items.reduce((s, i) => s + i.cantidad, 0) : 0,
    descuento_promociones: pedido.descuento_promociones || 0,
    promociones_aplicadas: pedido.promociones_aplicadas || [],
    bonificaciones: pedido.bonificaciones || [],
    almacen_movil_id: pedido.almacen_movil_id || null,
    es_venta_directa: Boolean(pedido.es_venta_directa),
    categoria_cliente_id: pedido.categoria_cliente_id || null,
    es_reacomodo: Boolean(pedido.es_reacomodo),
    origen_devolucion_id: pedido.origen_devolucion_id || null,
  };
  if (!detalle) return base;
  const pagos = (indices ? indices.pagosPorPedido.get(Number(pedido.id)) || [] : db.pagos.filter((p) => p.pedido_id === pedido.id))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return { ...base, pagos, cliente: cliente || null, vendedor: vendedor || null };
}

function recalcularCliente(db, clienteId) {
  const cliente = db.clientes.find((c) => c.id === clienteId);
  if (!cliente) return;
  cliente.saldo = round2(
    db.pedidos
      .filter((p) => p.cliente_id === clienteId && p.estado !== 'cancelado')
      .reduce((s, p) => s + (p.saldo || 0), 0),
  );
}

function rangoFechas(desde, hasta) {
  const fin = hasta || hoy();
  const inicio = desde || new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);
  return [inicio, fin];
}

function dashboard(db, periodo = '30d') {
  const indices = buildIndices(db);
  const hoyISO = hoy();
  const ayerISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const ventas = db.pedidos.filter((p) => p.estado !== 'cancelado');
  const hoyVentas = ventas.filter((p) => fechaCorta(p.created_at) === hoyISO);
  const ayerVentas = ventas.filter((p) => fechaCorta(p.created_at) === ayerISO);
  const totalHoy = round2(hoyVentas.reduce((s, p) => s + p.total, 0));
  const totalAyer = round2(ayerVentas.reduce((s, p) => s + p.total, 0));

  const dias = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30;
  const desde = new Date(Date.now() - (dias - 1) * 86400000).toISOString().slice(0, 10);
  const delPeriodo = ventas.filter((p) => fechaCorta(p.created_at) >= desde);
  const anteriorInicio = new Date(Date.now() - (dias * 2 - 1) * 86400000).toISOString().slice(0, 10);
  const anteriorFin = new Date(Date.now() - dias * 86400000).toISOString().slice(0, 10);
  const anterior = ventas.filter((p) => fechaCorta(p.created_at) >= anteriorInicio && fechaCorta(p.created_at) <= anteriorFin);

  const totalPeriodo = round2(delPeriodo.reduce((s, p) => s + p.total, 0));
  const totalAnterior = round2(anterior.reduce((s, p) => s + p.total, 0));
  const variacion = totalAnterior > 0 ? round2(((totalPeriodo - totalAnterior) / totalAnterior) * 100) : 0;

  // Un único reparto por fecha: antes se filtraban todas las ventas 2× por día.
  const porFecha = new Map();
  ventas.forEach((p) => {
    const f = fechaCorta(p.created_at);
    const prev = porFecha.get(f) || { total: 0, pedidos: 0 };
    prev.total += p.total || 0;
    prev.pedidos += 1;
    porFecha.set(f, prev);
  });
  const serieDias = [];
  const serieLen = periodo === '7d' ? 7 : periodo === '90d' ? 30 : 14;
  for (let i = serieLen - 1; i >= 0; i--) {
    const fecha = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const fechaAnterior = new Date(Date.now() - (i + (periodo === '90d' ? 30 : serieLen)) * 86400000).toISOString().slice(0, 10);
    const dia = porFecha.get(fecha) || { total: 0, pedidos: 0 };
    const diaAnterior = porFecha.get(fechaAnterior) || { total: 0, pedidos: 0 };
    serieDias.push({
      fecha,
      total: round2(dia.total),
      pedidos: dia.pedidos,
      anterior: round2(diaAnterior.total),
    });
  }

  const porCanal = ['mostrador', 'delivery', 'ruta', 'whatsapp'].map((canal) => {
    const items = delPeriodo.filter((p) => p.canal === canal);
    return { canal, total: round2(items.reduce((s, p) => s + p.total, 0)), pedidos: items.length };
  });

  const productosMap = new Map();
  delPeriodo.forEach((p) => p.items?.forEach((it) => {
    const prev = productosMap.get(it.producto_id) || { producto_id: it.producto_id, nombre: it.nombre, emoji: it.emoji, cantidad: 0, total: 0 };
    prev.cantidad += it.cantidad;
    prev.total = round2(prev.total + it.subtotal);
    productosMap.set(it.producto_id, prev);
  }));
  const topProductos = [...productosMap.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  const margen = round2(delPeriodo.reduce((sum, p) => sum + (p.items || []).reduce((s, it) => s + (it.precio - (it.costo_unitario || 0)) * it.cantidad, 0), 0));
  const porCobrar = round2(db.pedidos.filter((p) => p.saldo > 0 && p.estado !== 'cancelado').reduce((s, p) => s + p.saldo, 0));
  const vencidas = db.pedidos.filter((p) => p.saldo > 0 && p.estado !== 'cancelado' && new Date(new Date(p.created_at).getTime() + (db.configuracion.empresa.dias_credito || 15) * 86400000).toISOString().slice(0, 10) < hoyISO);
  const pendientes = db.pedidos.filter((p) => ['pendiente', 'preparando'].includes(p.estado));
  const enRuta = db.pedidos.filter((p) => p.estado === 'enviado');
  const stockBajo = db.productos.filter((p) => p.activo && stockDe(db, p.id, indices) <= p.stock_minimo).map((p) => ({ ...p, stock_total: stockDe(db, p.id, indices) }));

  const rutas = db.rutas.filter((r) => r.fecha === hoyISO);
  const rutasActivas = rutas.map((r) => {
    const repartidor = indices.repartidores.get(Number(r.repartidor_id));
    const totalParadas = r.paradas.length;
    const entregadas = r.paradas.filter((p) => p.estado === 'entregada').length;
    return {
      id: r.id,
      codigo: r.codigo,
      estado: r.estado,
      repartidor: repartidor?.nombre || 'Sin asignar',
      emoji: repartidor?.emoji || '🚚',
      total_paradas: totalParadas,
      entregadas,
      progreso: totalParadas ? Math.round((entregadas / totalParadas) * 100) : 0,
    };
  });

  const recientes = [...db.pedidos]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 6)
    .map((p) => pedidoResumen(db, p, false, indices));

  const ticketPromedio = delPeriodo.length ? round2(totalPeriodo / delPeriodo.length) : 0;

  return {
    kpis: {
      ventas_hoy: totalHoy,
      ventas_ayer: totalAyer,
      ventas_periodo: totalPeriodo,
      variacion_periodo: variacion,
      pedidos_hoy: hoyVentas.length,
      pedidos_pendientes: pendientes.length,
      por_cobrar: porCobrar,
      cobranzas_vencidas: vencidas.length,
      monto_vencido: round2(vencidas.reduce((s, p) => s + p.saldo, 0)),
      en_ruta: enRuta.length,
      stock_bajo: stockBajo.length,
      ticket_promedio: ticketPromedio,
      margen_periodo: margen,
      clientes_activos: new Set(delPeriodo.map((p) => p.cliente_id)).size,
    },
    serie: serieDias,
    por_canal: porCanal,
    top_productos: topProductos,
    stock_bajo: stockBajo.slice(0, 5),
    rutas: rutasActivas,
    recientes,
    alertas: [
      ...stockBajo.slice(0, 3).map((p) => ({ tipo: 'stock', titulo: `Stock bajo: ${p.nombre}`, detalle: `Quedan ${p.stock_total} ${p.unidad} (mínimo ${p.stock_minimo})` })),
      ...(vencidas.length ? [{ tipo: 'cobranza', titulo: `${vencidas.length} facturas vencidas`, detalle: `Bs ${round2(vencidas.reduce((s, p) => s + p.saldo, 0)).toFixed(2)} pendientes de cobro` }] : []),
      ...(pendientes.length ? [{ tipo: 'venta', titulo: `${pendientes.length} pedidos por preparar`, detalle: 'Revisa la cola de ventas para despachar a tiempo' }] : []),
      ...(() => {
        const venc = require('./kardex').vencimientos(db, 30).filter((l) => l.estado !== 'vigente');
        return venc.length ? [{ tipo: 'vencimiento', titulo: `${venc.length} lote(s) vencen pronto`, detalle: `Revisa Kardex y lotes: ${venc.slice(0, 3).map((l) => l.lote).join(', ')}` }] : [];
      })(),
    ],
  };
}

function reporte(db, desde, hasta) {
  const indices = buildIndices(db);
  const [inicio, fin] = rangoFechas(desde, hasta);
  const ventas = db.pedidos.filter((p) => {
    const f = fechaCorta(p.created_at);
    return p.estado !== 'cancelado' && f >= inicio && f <= fin;
  });
  const total = round2(ventas.reduce((s, p) => s + p.total, 0));
  const costo = round2(ventas.reduce((s, p) => s + (p.items || []).reduce((x, it) => x + (it.costo_unitario || 0) * it.cantidad, 0), 0));
  const porDiaMap = new Map();
  ventas.forEach((p) => {
    const f = fechaCorta(p.created_at);
    const prev = porDiaMap.get(f) || { fecha: f, total: 0, pedidos: 0 };
    prev.total = round2(prev.total + p.total);
    prev.pedidos += 1;
    porDiaMap.set(f, prev);
  });
  const prodMap = new Map();
  const catMap = new Map();
  ventas.forEach((p) => (p.items || []).forEach((it) => {
    const prod = indices.productos.get(Number(it.producto_id));
    const prev = prodMap.get(it.producto_id) || { producto_id: it.producto_id, nombre: it.nombre, emoji: it.emoji, categoria: prod?.categoria || '—', cantidad: 0, total: 0, margen: 0 };
    prev.cantidad += it.cantidad;
    prev.total = round2(prev.total + it.subtotal);
    prev.margen = round2(prev.margen + (it.precio - (it.costo_unitario || 0)) * it.cantidad);
    prodMap.set(it.producto_id, prev);
    const cat = catMap.get(prev.categoria) || { categoria: prev.categoria, total: 0, cantidad: 0 };
    cat.total = round2(cat.total + it.subtotal);
    cat.cantidad += it.cantidad;
    catMap.set(prev.categoria, cat);
  }));
  const vendedorMap = new Map();
  const canalMap = new Map();
  const clienteMap = new Map();
  ventas.forEach((p) => {
    const v = indices.usuarios.get(Number(p.vendedor_id));
    const prev = vendedorMap.get(p.vendedor_id) || { vendedor: v?.nombre || 'Sin asignar', total: 0, pedidos: 0 };
    prev.total = round2(prev.total + p.total);
    prev.pedidos += 1;
    vendedorMap.set(p.vendedor_id, prev);
    const c = canalMap.get(p.canal) || { canal: p.canal, total: 0, pedidos: 0 };
    c.total = round2(c.total + p.total);
    c.pedidos += 1;
    canalMap.set(p.canal, c);
    const cl = indices.clientes.get(Number(p.cliente_id));
    const pc = clienteMap.get(p.cliente_id) || { cliente: cl?.nombre || '—', zona: cl?.zona || '—', total: 0, pedidos: 0, saldo: 0 };
    pc.total = round2(pc.total + p.total);
    pc.pedidos += 1;
    pc.saldo = round2(pc.saldo + p.saldo);
    clienteMap.set(p.cliente_id, pc);
  });
  return {
    rango: { desde: inicio, hasta: fin },
    resumen: {
      total,
      pedidos: ventas.length,
      ticket_promedio: ventas.length ? round2(total / ventas.length) : 0,
      margen: round2(total - costo),
      costo,
      utilidad_porcentaje: total ? round2(((total - costo) / total) * 100) : 0,
      unidades: ventas.reduce((s, p) => s + (p.items || []).reduce((x, it) => x + it.cantidad, 0), 0),
    },
    por_dia: [...porDiaMap.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    productos: [...prodMap.values()].sort((a, b) => b.total - a.total),
    categorias: [...catMap.values()].sort((a, b) => b.total - a.total),
    vendedores: [...vendedorMap.values()].sort((a, b) => b.total - a.total),
    canales: [...canalMap.values()].sort((a, b) => b.total - a.total),
    clientes: [...clienteMap.values()].sort((a, b) => b.total - a.total),
  };
}

function buscarPedidos(db, filtros = {}) {
  const indices = buildIndices(db);
  let items = [...db.pedidos];
  const { estado, estado_pago, canal, cliente_id, vendedor_id, desde, hasta, search, ruta_id, sin_ruta } = filtros;
  if (estado && estado !== 'todos') items = items.filter((p) => p.estado === estado);
  if (estado_pago && estado_pago !== 'todos') items = items.filter((p) => p.estado_pago === estado_pago);
  if (canal && canal !== 'todos') items = items.filter((p) => p.canal === canal);
  if (cliente_id) items = items.filter((p) => p.cliente_id === Number(cliente_id));
  if (vendedor_id) items = items.filter((p) => p.vendedor_id === Number(vendedor_id));
  if (ruta_id) items = items.filter((p) => p.ruta_id === Number(ruta_id));
  if (sin_ruta === 'true') items = items.filter((p) => !p.ruta_id && ['pendiente', 'preparando', 'enviado'].includes(p.estado));
  if (desde) items = items.filter((p) => fechaCorta(p.created_at) >= desde);
  if (hasta) items = items.filter((p) => fechaCorta(p.created_at) <= hasta);
  let resumen = items.map((p) => pedidoResumen(db, p, false, indices));
  if (search) {
    const q = normalize(search);
    resumen = resumen.filter((p) => normalize(`${p.codigo} ${p.cliente_nombre} ${p.cliente_zona} ${p.vendedor_nombre}`).includes(q));
  }
  return resumen.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function sincronizarCobros(db) {
  const indices = buildIndices(db);
  let cambios = 0;
  const ahora = new Date().toISOString();
  const cobradores = db.usuarios.filter((u) => u.rol === 'cobranzas' && u.activo);
  db.pedidos.forEach((pedido) => {
    if (pedido.estado === 'cancelado' || !(pedido.saldo > 0)) return;
    const r = pedidoResumen(db, pedido, false, indices);
    const responsable = r.en_mora ? (r.responsable_cobro_id || pedido.vendedor_id) : pedido.vendedor_id;
    if (responsable !== pedido.responsable_cobro_id) {
      pedido.responsable_cobro_id = responsable;
      pedido.cobrador_id = r.en_mora ? r.cobrador_id : null;
      if (r.en_mora && !pedido.migrado_cobranzas_en) pedido.migrado_cobranzas_en = ahora;
      cambios += 1;
    }
  });
  const cfgCobranza = db.configuracion?.cobranza || {};
  if (cfgCobranza.bloquear_clientes_con_mora) {
    const conMora = new Set(db.pedidos
      .filter((p) => p.saldo > 0 && p.estado !== 'cancelado' && pedidoResumen(db, p, false, indices).en_mora)
      .map((p) => p.cliente_id));
    db.clientes.forEach((cliente) => {
      const debe = conMora.has(cliente.id);
      if (debe && !cliente.bloqueado_por_deuda) {
        cliente.bloqueado_por_deuda = true;
        cliente.activo = false;
        cliente.motivo_bloqueo = 'Cuenta vencida con la empresa';
        cliente.bloqueado_en = ahora;
        cambios += 1;
      } else if (!debe && cliente.bloqueado_por_deuda) {
        cliente.bloqueado_por_deuda = false;
        cliente.activo = true;
        cliente.motivo_bloqueo = null;
        cliente.bloqueado_en = null;
        cambios += 1;
      }
    });
  }
  if (cambios) require('./db').save();
  return { cambios, cobradores: cobradores.length };
}

module.exports = {
  sincronizarCobros,
  stockDe,
  stockEn,
  productoResumen,
  pedidoResumen,
  recalcularCliente,
  dashboard,
  reporte,
  buscarPedidos,
  fechaCorta,
  rangoFechas,
};
