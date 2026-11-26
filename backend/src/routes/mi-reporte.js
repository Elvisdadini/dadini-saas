// Mi reporte: exclusivamente los resultados del usuario autenticado.
// Ningún bloque usa agregados globales: todas las colecciones se filtran
// primero por pertenencia y luego por fecha.
const express = require('express');
const { load } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { rangoFechas, fechaCorta } = require('../services');
const { round2, num } = require('../utils');
const alcance = require('../alcance');
const horario = require('../horario');

const router = express.Router();
router.use(authRequired);
router.use(requirePermiso('mi_reporte.ver'));
// Admin/dueño pasan por allow(), pero el reporte sigue siendo el suyo.
router.use(allow('ventas', 'preventista', 'vendedor_camion', 'distribucion', 'cobranzas'));

function enRango(fecha, desde, hasta) {
  const f = fechaCorta(fecha);
  return Boolean(f) && f >= desde && f <= hasta;
}

function agruparPorDia(filas, fechaDe, acumular) {
  const mapa = new Map();
  filas.forEach((fila) => {
    const fecha = fechaCorta(fechaDe(fila));
    if (!fecha) return;
    const actual = mapa.get(fecha) || { fecha };
    acumular(actual, fila);
    mapa.set(fecha, actual);
  });
  return [...mapa.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function misPedidos(req, db, desde, hasta) {
  const campos = req.user.rol === 'cobranzas'
    ? ['responsable_cobro_id', 'cobrador_id', 'vendedor_id', 'usuario_id']
    : ['vendedor_id', 'repartidor_asignado_id', 'usuario_id'];
  return alcance.filtrar(req, (db.pedidos || []).filter((p) => p.estado !== 'cancelado' && enRango(p.created_at, desde, hasta)), campos);
}

function misRutas(req, db, desde, hasta) {
  const id = Number(req.user.id);
  const repartidor = Number(req.user.repartidor_id);
  return (db.rutas || []).filter((r) => enRango(r.fecha, desde, hasta) && (
    alcance.verTodo(req)
    || Number(r.usuario_id) === id || Number(r.creado_por) === id
    || (req.user.rol === 'distribucion' && Number(r.repartidor_id) === repartidor)
    || (req.user.rol !== 'distribucion' && Number(r.repartidor_id) === id)
  ));
}

function misPagos(req, db, desde, hasta) {
  const campos = req.user.rol === 'cobranzas'
    ? ['usuario_id', 'responsable_cobro_id', 'cobrador_id']
    : ['usuario_id', 'vendedor_id', 'responsable_cobro_id'];
  return alcance.filtrar(req, (db.pagos || []).filter((p) => enRango(p.fecha, desde, hasta)), campos);
}

function misDevoluciones(req, db, desde, hasta) {
  return alcance.filtrar(req,
    (db.devoluciones_movil || []).filter((d) => enRango(d.fecha, desde, hasta)),
    ['usuario_id', 'vendedor_id', 'repartidor_id']);
}

function misVisitas(req, db, desde, hasta) {
  return alcance.filtrar(req,
    (db.visitas || []).filter((v) => enRango(v.fecha, desde, hasta)),
    ['usuario_id', 'distribuidor_id']);
}

function nombre(db, id, coleccion = 'usuarios') {
  return (db[coleccion] || []).find((x) => x.id === Number(id))?.nombre || '—';
}

router.get('/', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const mes = String(req.query.mes || horario.fechaBolivia().slice(0, 7)).slice(0, 7);
  const hoy = horario.fechaBolivia();

  const pedidos = misPedidos(req, db, desde, hasta);
  const rutas = misRutas(req, db, desde, hasta);
  const pagos = misPagos(req, db, desde, hasta);
  const devoluciones = misDevoluciones(req, db, desde, hasta);
  const visitas = misVisitas(req, db, desde, hasta);

  // ---- Ventas del período ----
  const total = round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0));
  const unidades = pedidos.reduce((s, p) => s + (p.items || []).reduce((t, i) => t + Number(i.cantidad || 0), 0), 0);
  const descuentos = round2(pedidos.reduce((s, p) => s + Number(p.descuento || 0), 0));
  const clientesMap = new Map();
  const productosMap = new Map();
  pedidos.forEach((p) => {
    const c = clientesMap.get(p.cliente_id) || { cliente_id: p.cliente_id, cliente: nombre(db, p.cliente_id, 'clientes'), pedidos: 0, total: 0 };
    c.pedidos += 1;
    c.total = round2(c.total + Number(p.total || 0));
    clientesMap.set(p.cliente_id, c);
    (p.items || []).forEach((i) => {
      const prod = productosMap.get(i.producto_id) || { producto_id: i.producto_id, nombre: i.nombre || nombre(db, i.producto_id, 'productos'), cantidad: 0, total: 0 };
      prod.cantidad += Number(i.cantidad || 0);
      prod.total = round2(prod.total + Number(i.subtotal || 0));
      productosMap.set(i.producto_id, prod);
    });
  });
  const clientesPorDia = new Map();
  pedidos.forEach((p) => {
    const fecha = fechaCorta(p.created_at);
    const clientes = clientesPorDia.get(fecha) || new Set();
    clientes.add(p.cliente_id);
    clientesPorDia.set(fecha, clientes);
  });
  const ventasPorDia = agruparPorDia(pedidos, (p) => p.created_at, (fila, p) => {
    fila.total = round2((fila.total || 0) + Number(p.total || 0));
    fila.pedidos = (fila.pedidos || 0) + 1;
  }).map((fila) => ({ ...fila, clientes: clientesPorDia.get(fila.fecha)?.size || 0, anterior: 0 }));

  // ---- Objetivo del mes (solo el del usuario) ----
  const desdeMes = `${mes}-01`;
  const hastaMes = `${mes}-31`;
  const pedidosMes = misPedidos(req, db, desdeMes, hastaMes);
  const objetivos = (db.objetivos_mensuales || []).filter((o) => o.activo !== false && o.mes === mes
    && (Number(o.vendedor_id) === Number(req.user.id)
      || (!o.vendedor_id && (!o.ruta_venta || o.ruta_venta === req.user.ruta_venta))));
  const meta = round2(objetivos.reduce((s, o) => s + num(o.meta_monto), 0));
  const metaUnidades = objetivos.reduce((s, o) => s + num(o.meta_unidades), 0);
  const ventasMes = round2(pedidosMes.reduce((s, p) => s + Number(p.total || 0), 0));
  const unidadesMes = pedidosMes.reduce((s, p) => s + (p.items || []).reduce((t, i) => t + Number(i.cantidad || 0), 0), 0);
  const ventasHoy = round2(pedidosMes.filter((p) => fechaCorta(p.created_at) === hoy).reduce((s, p) => s + Number(p.total || 0), 0));
  const dias = Number(objetivos[0]?.dias_laborables) || 22;
  const objetivo = {
    mes,
    meta, meta_unidades: metaUnidades,
    ventas_mes: ventasMes, unidades_mes: unidadesMes, ventas_hoy: ventasHoy,
    progreso: meta > 0 ? round2((ventasMes / meta) * 100) : null,
    progreso_unidades: metaUnidades > 0 ? round2((unidadesMes / metaUnidades) * 100) : null,
    meta_diaria: meta > 0 ? round2(meta / dias) : null,
    falta: round2(Math.max(0, meta - ventasMes)),
    dias_laborables: dias,
    asignado: objetivos.length > 0,
    detalle: objetivos.map((o) => ({ tipo: o.tipo, meta_monto: num(o.meta_monto), meta_unidades: num(o.meta_unidades), producto_id: o.producto_id || null })),
  };

  // ---- Entregas propias ----
  let paradas = 0;
  const entregasPorDia = new Map();
  const entregasRecientes = [];
  rutas.forEach((r) => {
    const fila = entregasPorDia.get(r.fecha) || { fecha: r.fecha, paradas: 0, entregadas: 0, fallidas: 0, monto: 0 };
    (r.paradas || []).forEach((p) => {
      const pedido = (db.pedidos || []).find((x) => x.id === Number(p.pedido_id));
      paradas += 1;
      fila.paradas += 1;
      fila.monto = round2(fila.monto + Number(pedido?.total || 0));
      const estado = p.estado === 'entregada' ? 'entregadas' : p.estado === 'fallida' ? 'fallidas' : 'pendientes';
      fila[estado] = (fila[estado] || 0) + 1;
      if (estado === 'entregadas') entregasRecientes.push({
        pedido_id: pedido?.id || null, codigo: pedido?.codigo || `Parada ${p.orden}`,
        cliente: nombre(db, pedido?.cliente_id, 'clientes'), fecha: r.fecha,
        estado: p.resultado_entrega || p.estado, hora: p.hora_entrega || null,
        monto: Number(pedido?.total || 0),
      });
    });
    entregasPorDia.set(r.fecha, fila);
  });
  const diasEntrega = [...entregasPorDia.values()];
  entregasRecientes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const entregas = {
    resumen: {
      rutas: rutas.length, paradas,
      entregadas: diasEntrega.reduce((s, f) => s + (f.entregadas || 0), 0),
      fallidas: diasEntrega.reduce((s, f) => s + (f.fallidas || 0), 0),
      pendientes: diasEntrega.reduce((s, f) => s + (f.pendientes || 0), 0),
      monto: round2(diasEntrega.reduce((s, f) => s + (f.monto || 0), 0)),
    },
    por_dia: [...entregasPorDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    recientes: entregasRecientes.slice(0, 12),
  };

  // ---- Cobranzas propias ----
  const cobrosPorDia = agruparPorDia(pagos, (p) => p.fecha, (fila, p) => {
    fila.cobros = (fila.cobros || 0) + 1;
    fila.monto = round2((fila.monto || 0) + Number(p.monto || 0));
  });
  const saldoPendiente = round2(pedidos.filter((p) => Number(p.saldo) > 0).reduce((s, p) => s + Number(p.saldo || 0), 0));
  const cobranzas = {
    resumen: {
      cobros: pagos.length,
      monto: round2(pagos.reduce((s, p) => s + Number(p.monto || 0), 0)),
      interes: round2(pagos.reduce((s, p) => s + Number(p.interes || 0), 0)),
      cuentas_pendientes: pedidos.filter((p) => Number(p.saldo) > 0).length,
      saldo_pendiente: saldoPendiente,
    },
    por_dia: cobrosPorDia,
    recientes: [...pagos].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 12).map((p) => ({
      codigo: p.codigo || p.numero_comprobante || 'REC',
      cliente: nombre(db, p.cliente_id, 'clientes'),
      pedido_codigo: (db.pedidos || []).find((x) => x.id === Number(p.pedido_id))?.codigo || null,
      monto: Number(p.monto || 0), metodo: p.metodo,
      comprobante: p.numero_comprobante || p.codigo || null,
      fecha: fechaCorta(p.fecha),
    })),
  };

  // ---- Devoluciones propias ----
  const unidadesDe = (d) => (d.lineas || []).reduce((s, l) => s + Number(l.cantidad || 0), 0);
  const devolucionesPorDia = agruparPorDia(devoluciones, (d) => d.fecha, (fila, d) => {
    fila.devoluciones = (fila.devoluciones || 0) + 1;
    fila.unidades = (fila.unidades || 0) + unidadesDe(d);
  });
  const devolucionesResumen = {
    total: devoluciones.length,
    unidades: devoluciones.reduce((s, d) => s + unidadesDe(d), 0),
    buenas: devoluciones.reduce((s, d) => s + (d.lineas || []).filter((l) => l.estado === 'bueno').reduce((t, l) => t + Number(l.cantidad || 0), 0), 0),
    danadas: devoluciones.reduce((s, d) => s + (d.lineas || []).filter((l) => l.estado !== 'bueno').reduce((t, l) => t + Number(l.cantidad || 0), 0), 0),
    reingresadas: devoluciones.filter((d) => d.estado === 'reingresado').length,
  };
  const devolucionesResp = {
    resumen: devolucionesResumen,
    por_dia: devolucionesPorDia,
    recientes: [...devoluciones].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 12).map((d) => ({
      codigo: d.codigo, fecha: fechaCorta(d.fecha), estado: d.estado,
      cliente: nombre(db, d.cliente_id, 'clientes'), unidades: unidadesDe(d), notas: d.notas || '',
    })),
  };

  // ---- Visitas propias (contexto de conversión) ----
  const visitasResumen = {
    total: visitas.length,
    completadas: visitas.filter((v) => v.estado === 'completada' || v.resultado || v.pedido_id).length,
    con_pedido: visitas.filter((v) => v.resultado === 'pedido' || v.pedido_id).length,
  };
  visitasResumen.sin_pedido = Math.max(0, visitasResumen.completadas - visitasResumen.con_pedido);

  return res.json({
    usuario: { id: req.user.id, nombre: req.user.nombre, rol: req.user.rol },
    rango: { desde, hasta },
    mes,
    ventas: {
      resumen: {
        total, pedidos: pedidos.length, unidades, descuentos,
        clientes: clientesMap.size,
        ticket: pedidos.length ? round2(total / pedidos.length) : 0,
      },
      por_dia: ventasPorDia,
      productos: [...productosMap.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 15),
      clientes: [...clientesMap.values()].sort((a, b) => b.total - a.total).slice(0, 15),
      recientes: [...pedidos].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 12).map((p) => ({
        id: p.id, codigo: p.codigo, cliente: nombre(db, p.cliente_id, 'clientes'),
        fecha: fechaCorta(p.created_at), total: Number(p.total || 0), estado: p.estado,
      })),
    },
    objetivo,
    entregas,
    cobranzas,
    devoluciones: devolucionesResp,
    visitas: visitasResumen,
    generado_en: new Date().toISOString(),
  });
});

module.exports = router;
