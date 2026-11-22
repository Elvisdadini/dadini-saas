const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { toCSV, round2, normalize, matches } = require('../utils');
const { pedidoResumen } = require('../services');

const router = express.Router();
router.use(authRequired);

function filtrosDe(req) {
  const q = req.query;
  return {
    desde: q.desde || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
    hasta: q.hasta || new Date().toISOString().slice(0, 10),
    ruta_venta: q.ruta_venta || '',
    vendedor_id: q.vendedor_id ? Number(q.vendedor_id) : null,
    distribuidor_id: q.distribuidor_id ? Number(q.distribuidor_id) : null,
    dia_visita: q.dia_visita ? Number(q.dia_visita) : null,
    resultado: q.resultado || '',
    motivo: q.motivo || '',
    forma_pago: q.forma_pago || '',
    estado: q.estado || '',
    search: q.search || '',
    movimiento_tipo: q.movimiento_tipo || '',
    con_whatsapp: q.con_whatsapp || '',
    solo_coordenadas: q.solo_coordenadas || '',
    en_mora: q.en_mora || '',
    categoria_cliente_id: q.categoria_cliente_id ? Number(q.categoria_cliente_id) : null,
    venta_directa: q.venta_directa || '',
    solo_reacomodo: q.solo_reacomodo || '',
  };
}

function enRango(fecha, f) { return String(fecha).slice(0, 10) >= f.desde && String(fecha).slice(0, 10) <= f.hasta; }

function construir(db, f) {
  let visitas = db.visitas.filter((v) => ['preventa', 'distribucion'].includes(v.tipo) && enRango(v.fecha, f));
  if (f.ruta_venta && f.ruta_venta !== 'todas') visitas = visitas.filter((v) => v.ruta_venta === f.ruta_venta || db.clientes.find((c) => c.id === v.cliente_id)?.ruta_venta === f.ruta_venta);
  if (f.vendedor_id) visitas = visitas.filter((v) => v.usuario_id === f.vendedor_id || db.pedidos.find((p) => p.id === v.pedido_id)?.vendedor_id === f.vendedor_id);
  if (f.distribuidor_id) visitas = visitas.filter((v) => v.distribuidor_id === f.distribuidor_id || db.usuarios.find((u) => u.id === v.usuario_id)?.repartidor_id === f.distribuidor_id);
  if (f.dia_visita) visitas = visitas.filter((v) => v.dia_visita === f.dia_visita || db.clientes.find((c) => c.id === v.cliente_id)?.dia_visita === f.dia_visita);
  if (f.resultado && f.resultado !== 'todos') visitas = visitas.filter((v) => (v.resultado || v.resultado_entrega) === f.resultado);
  if (f.motivo && f.motivo !== 'todos') visitas = visitas.filter((v) => v.motivo === f.motivo);
  if (f.search) visitas = visitas.filter((v) => matches(`${v.cliente_nombre || ''} ${v.notas || ''} ${v.codigo || ''}`, f.search));

  let pedidos = db.pedidos.filter((p) => (p.es_preventa || p.es_reacomodo) && enRango(p.created_at, f));
  if (f.ruta_venta && f.ruta_venta !== 'todas') pedidos = pedidos.filter((p) => p.ruta_venta === f.ruta_venta);
  if (f.vendedor_id) pedidos = pedidos.filter((p) => p.vendedor_id === f.vendedor_id);
  if (f.distribuidor_id) pedidos = pedidos.filter((p) => p.repartidor_asignado_id === f.distribuidor_id);
  if (f.dia_visita) pedidos = pedidos.filter((p) => db.clientes.find((c) => c.id === p.cliente_id)?.dia_visita === f.dia_visita);
  if (f.forma_pago && f.forma_pago !== 'todos') pedidos = pedidos.filter((p) => p.forma_pago === f.forma_pago);
  if (f.estado && f.estado !== 'todos') pedidos = pedidos.filter((p) => p.estado === f.estado);
  if (f.en_mora === 'true') pedidos = pedidos.filter((p) => pedidoResumen(db, p).en_mora);
  if (f.en_mora === 'false') pedidos = pedidos.filter((p) => !pedidoResumen(db, p).en_mora);
  if (f.categoria_cliente_id) pedidos = pedidos.filter((p) => p.categoria_cliente_id === f.categoria_cliente_id || db.clientes.find((c) => c.id === p.cliente_id)?.categoria_cliente_id === f.categoria_cliente_id);
  if (f.venta_directa === 'true') pedidos = pedidos.filter((p) => p.es_venta_directa);
  if (f.venta_directa === 'false') pedidos = pedidos.filter((p) => !p.es_venta_directa);
  if (f.solo_reacomodo === 'true') pedidos = pedidos.filter((p) => p.es_reacomodo);
  if (f.search) pedidos = pedidos.filter((p) => matches(`${p.codigo} ${p.cliente_nombre || ''}`, f.search));

  const visitasEnriquecidas = visitas.map((v) => {
    const cliente = db.clientes.find((c) => c.id === v.cliente_id);
    const pedido = db.pedidos.find((p) => p.id === v.pedido_id);
    const vendedor = db.usuarios.find((u) => u.id === v.usuario_id);
    const distribuidor = db.repartidores.find((r) => r.id === (v.distribuidor_id || db.usuarios.find((u) => u.id === v.usuario_id)?.repartidor_id));
    return {
      id: v.id,
      fecha: v.fecha,
      tipo: v.tipo,
      cliente: cliente?.nombre || '—',
      cliente_codigo: cliente?.codigo || '',
      ruta_venta: cliente?.ruta_venta || v.ruta_venta || '—',
      dia_visita: cliente?.dia_visita || v.dia_visita || null,
      vendedor: vendedor?.nombre || '—',
      distribuidor: distribuidor?.nombre || '—',
      resultado: v.resultado || v.resultado_entrega || '—',
      motivo: v.motivo || '—',
      pedido: pedido?.codigo || '—',
      notas: v.notas || '',
      latitud: v.latitud,
      longitud: v.longitud,
      productos_devueltos: v.productos_devueltos || [],
    };
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const pedidosEnriquecidos = pedidos.map((p) => {
    const r = pedidoResumen(db, p);
    return {
      id: p.id,
      codigo: p.codigo,
      fecha: p.created_at,
      cliente: r.cliente_nombre,
      ruta_venta: p.ruta_venta || '—',
      vendedor: r.vendedor_nombre,
      distribuidor: db.repartidores.find((x) => x.id === p.repartidor_asignado_id)?.nombre || '—',
      forma_pago: p.forma_pago,
      estado: p.estado,
      entrega_programada: p.fecha_entrega_programada || '—',
      total: p.total,
      saldo: p.saldo,
      unidades: r.items_count,
    };
  }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  const visitasPreventa = visitasEnriquecidas.filter((v) => v.tipo === 'preventa');
  const entregas = visitasEnriquecidas.filter((v) => v.tipo === 'distribucion');
  const resumen = {
    visitas: visitasPreventa.length,
    con_pedido: visitasPreventa.filter((v) => v.resultado === 'pedido').length,
    sin_pedido: visitasPreventa.filter((v) => v.resultado === 'no_pedido').length,
    conversion: visitasPreventa.length ? round2((visitasPreventa.filter((v) => v.resultado === 'pedido').length / visitasPreventa.length) * 100) : 0,
    pedidos: pedidosEnriquecidos.length,
    monto_contado: round2(pedidosEnriquecidos.filter((p) => p.forma_pago !== 'credito').reduce((s, p) => s + p.total, 0)),
    monto_credito: round2(pedidosEnriquecidos.filter((p) => p.forma_pago === 'credito').reduce((s, p) => s + p.total, 0)),
    entregas: entregas.length,
    entregadas: entregas.filter((e) => e.resultado === 'entregado').length,
    parciales: entregas.filter((e) => e.resultado === 'parcial').length,
    cerradas: entregas.filter((e) => e.resultado === 'cerrado').length,
    unidades_devueltas: entregas.reduce((s, e) => s + (e.productos_devueltos || []).reduce((x, d) => x + d.cantidad, 0), 0),
  };

  const porVendedor = [...new Set(visitasPreventa.map((v) => v.vendedor))].map((nombre) => ({
    nombre,
    visitas: visitasPreventa.filter((v) => v.vendedor === nombre).length,
    pedidos: pedidosEnriquecidos.filter((p) => p.vendedor === nombre).length,
  }));
  const porDia = [1, 2, 3, 4, 5, 6, 7].map((dia) => ({
    dia,
    visitas: visitasPreventa.filter((v) => v.dia_visita === dia).length,
    pedidos: pedidosEnriquecidos.filter((p) => db.clientes.find((c) => c.id === db.pedidos.find((x) => x.id === p.id)?.cliente_id)?.dia_visita === dia).length,
  }));
  const motivos = [...new Set(visitasPreventa.filter((v) => v.resultado === 'no_pedido').map((v) => v.motivo))].map((motivo) => ({
    motivo,
    total: visitasPreventa.filter((v) => v.resultado === 'no_pedido' && v.motivo === motivo).length,
  }));

  const nombreUsuario = (id) => db.usuarios.find((u) => u.id === id)?.nombre || 'Sistema';
  const nombreCliente = (id) => db.clientes.find((c) => c.id === id)?.nombre || '—';
  const nombreRepartidor = (id) => db.repartidores.find((r) => r.id === id)?.nombre || '—';
  const whatsappDe = (pedidoId, clienteId, fecha) => (db.mensajes_whatsapp || []).find((m) =>
    (pedidoId && m.pedido_id === pedidoId) || (clienteId && m.cliente_id === clienteId && String(m.fecha).slice(0, 10) === String(fecha).slice(0, 10)));

  const movimientos = [];
  db.visitas.filter((v) => enRango(v.fecha, f)).forEach((v) => {
    const wa = whatsappDe(v.pedido_id, v.cliente_id, v.fecha);
    movimientos.push({
      id: `vis-${v.id}`,
      fecha: v.fecha,
      tipo: v.tipo === 'distribucion' ? 'entrega' : v.tipo === 'preventa' ? 'visita' : v.tipo,
      accion: v.resultado || v.resultado_entrega || v.estado || 'visita',
      motivo: v.motivo || '—',
      empleado: nombreUsuario(v.usuario_id),
      cliente: nombreCliente(v.cliente_id),
      pedido: db.pedidos.find((p) => p.id === v.pedido_id)?.codigo || '—',
      ruta_venta: v.ruta_venta || db.clientes.find((c) => c.id === v.cliente_id)?.ruta_venta || '—',
      distribuidor: nombreRepartidor(v.distribuidor_id),
      monto: 0,
      latitud: v.latitud,
      longitud: v.longitud,
      whatsapp: wa ? { estado: wa.estado, tipo: wa.tipo, mensaje: wa.mensaje } : null,
      notas: v.notas || '',
    });
  });
  db.pedidos.filter((p) => p.es_preventa && enRango(p.created_at, f)).forEach((p) => {
    const wa = whatsappDe(p.id, p.cliente_id, p.created_at);
    movimientos.push({
      id: `ped-${p.id}`,
      fecha: p.created_at,
      tipo: p.es_reacomodo ? 'reacomodo' : 'pedido',
      accion: p.es_reacomodo ? 'producto reacomodado fuera del pedido' : `creado · ${p.forma_pago}`,
      motivo: '—',
      empleado: nombreUsuario(p.vendedor_id),
      cliente: nombreCliente(p.cliente_id),
      pedido: p.codigo,
      ruta_venta: p.ruta_venta || '—',
      distribuidor: nombreRepartidor(p.repartidor_asignado_id),
      monto: p.total,
      latitud: db.visitas.find((v) => v.pedido_id === p.id)?.latitud ?? null,
      longitud: db.visitas.find((v) => v.pedido_id === p.id)?.longitud ?? null,
      whatsapp: wa ? { estado: wa.estado, tipo: wa.tipo, mensaje: wa.mensaje } : null,
      notas: p.notas || '',
    });
  });
  db.pagos.filter((pago) => enRango(pago.fecha, f)).forEach((pago) => {
    const pedido = db.pedidos.find((p) => p.id === pago.pedido_id);
    const wa = whatsappDe(pago.pedido_id, pago.cliente_id, pago.fecha);
    movimientos.push({
      id: `pag-${pago.id}`,
      fecha: pago.fecha,
      tipo: 'cobranza',
      accion: 'pago registrado',
      motivo: pago.metodo || '—',
      empleado: nombreUsuario(pago.usuario_id),
      cliente: nombreCliente(pago.cliente_id),
      pedido: pedido?.codigo || '—',
      ruta_venta: pedido?.ruta_venta || '—',
      distribuidor: '—',
      monto: pago.monto,
      latitud: db.visitas.find((v) => v.tipo === 'cobranza' && v.pedido_id === pago.pedido_id)?.latitud ?? null,
      longitud: db.visitas.find((v) => v.tipo === 'cobranza' && v.pedido_id === pago.pedido_id)?.longitud ?? null,
      whatsapp: wa ? { estado: wa.estado, tipo: wa.tipo, mensaje: wa.mensaje } : null,
      notas: pago.nota || '',
    });
  });
  (db.mensajes_whatsapp || []).filter((m) => enRango(m.fecha, f)).forEach((m) => {
    movimientos.push({
      id: `wa-${m.id}`,
      fecha: m.fecha,
      tipo: 'whatsapp',
      accion: `mensaje ${m.tipo} · ${m.estado}`,
      motivo: '—',
      empleado: nombreUsuario(m.usuario_id),
      cliente: nombreCliente(m.cliente_id),
      pedido: db.pedidos.find((p) => p.id === m.pedido_id)?.codigo || '—',
      ruta_venta: '—',
      distribuidor: '—',
      monto: m.monto || 0,
      latitud: m.latitud,
      longitud: m.longitud,
      whatsapp: { estado: m.estado, tipo: m.tipo, mensaje: m.mensaje },
      notas: '',
    });
  });

  (db.devoluciones_movil || []).filter((d) => enRango(d.fecha, f)).forEach((d) => {
    movimientos.push({
      id: `dev-${d.id}`,
      fecha: d.fecha,
      tipo: 'devolucion',
      accion: `${d.codigo} · ${d.estado}`,
      motivo: d.notas || '—',
      empleado: nombreUsuario(d.usuario_id),
      cliente: nombreCliente(d.cliente_id),
      pedido: db.pedidos.find((p) => p.id === d.pedido_id)?.codigo || '—',
      ruta_venta: '—',
      distribuidor: '—',
      monto: 0,
      latitud: null,
      longitud: null,
      whatsapp: null,
      notas: (d.lineas || []).map((l) => `${db.productos.find((p) => p.id === l.producto_id)?.nombre || l.producto_id} ×${l.cantidad}`).join(', '),
    });
  });

  let movimientosFiltrados = movimientos;
  if (f.movimiento_tipo && f.movimiento_tipo !== 'todos') movimientosFiltrados = movimientosFiltrados.filter((m) => m.tipo === f.movimiento_tipo);
  if (f.con_whatsapp === 'true') movimientosFiltrados = movimientosFiltrados.filter((m) => m.whatsapp);
  if (f.solo_coordenadas === 'true') movimientosFiltrados = movimientosFiltrados.filter((m) => m.latitud && m.longitud);
  if (f.solo_reacomodo === 'true') movimientosFiltrados = movimientosFiltrados.filter((m) => m.tipo === 'reacomodo' || m.notas?.includes('reacomodado'));
  if (f.search) movimientosFiltrados = movimientosFiltrados.filter((m) => matches(`${m.cliente} ${m.pedido} ${m.empleado} ${m.notas}`, f.search));
  movimientosFiltrados.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

  resumen.movimientos = movimientosFiltrados.length;
  resumen.con_whatsapp = movimientosFiltrados.filter((m) => m.whatsapp).length;
  resumen.con_coordenadas = movimientosFiltrados.filter((m) => m.latitud && m.longitud).length;
  return { filtros: f, resumen, visitas: visitasEnriquecidas, pedidos: pedidosEnriquecidos, por_vendedor: porVendedor, por_dia: porDia, motivos, movimientos: movimientosFiltrados };
}

router.get('/reporte', (req, res) => {
  const db = load();
  const resultado = construir(db, filtrosDe(req));
  return res.json({
    ...resultado,
    catalogos: {
      rutas: ['R1', 'R2'],
      vendedores: db.usuarios.filter((u) => ['ventas', 'preventista'].includes(u.rol)).map((u) => ({ id: u.id, nombre: u.nombre })),
      distribuidores: db.repartidores.map((r) => ({ id: r.id, nombre: r.nombre })),
      motivos: ['cerrado', 'con_stock', 'sin_dinero', 'otro'],
      categorias: db.cliente_categorias || [],
    },
  });
});

router.get('/export', (req, res) => {
  const db = load();
  const { movimientos } = construir(db, filtrosDe(req));
  const csv = toCSV(movimientos, [
    { label: 'Fecha hora', value: (m) => m.fecha },
    { label: 'Tipo', value: (m) => m.tipo },
    { label: 'Accion', value: (m) => m.accion },
    { label: 'Empleado', value: (m) => m.empleado },
    { label: 'Cliente', value: (m) => m.cliente },
    { label: 'Pedido', value: (m) => m.pedido },
    { label: 'Ruta', value: (m) => m.ruta_venta },
    { label: 'Distribuidor', value: (m) => m.distribuidor },
    { label: 'Motivo', value: (m) => m.motivo },
    { label: 'Monto', value: (m) => m.monto },
    { label: 'Latitud', value: (m) => m.latitud ?? '' },
    { label: 'Longitud', value: (m) => m.longitud ?? '' },
    { label: 'WhatsApp', value: (m) => (m.whatsapp ? `${m.whatsapp.tipo}:${m.whatsapp.estado}` : '') },
    { label: 'Mensaje', value: (m) => m.whatsapp?.mensaje || '' },
    { label: 'Notas', value: (m) => m.notas },
  ]);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="reporte-campo.csv"');
  return res.send(csv);
});

module.exports = router;
