const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, num, round2 } = require('../utils');
const alcance = require('../alcance');

function objetivosVisibles(req, lista) {
  if (alcance.verTodo(req)) return lista;
  const id = Number(req.user.id);
  return lista.filter((o) => Number(o.vendedor_id) === id
    || (!o.vendedor_id && (!o.ruta_venta || o.ruta_venta === req.user.ruta_venta)));
}

const router = express.Router();
router.use(authRequired);

const MES_ACTUAL = () => new Date().toISOString().slice(0, 7);

function diasLaborablesDelMes(mes) {
  const [anio, mesNum] = mes.split('-').map(Number);
  const total = new Date(anio, mesNum, 0).getDate();
  let laborables = 0;
  for (let dia = 1; dia <= total; dia += 1) {
    const d = new Date(anio, mesNum - 1, dia).getDay();
    if (d !== 0 && d !== 6) laborables += 1;
  }
  return laborables;
}

function resumen(db, objetivo) {
  const vendedor = db.usuarios.find((u) => u.id === objetivo.vendedor_id);
  const producto = db.productos.find((p) => p.id === objetivo.producto_id);
  return {
    ...objetivo,
    vendedor_nombre: vendedor?.nombre || 'Todos los vendedores',
    producto_nombre: producto?.nombre || '—',
    dias_laborables: objetivo.dias_laborables || diasLaborablesDelMes(objetivo.mes),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { mes, vendedor_id } = req.query;
  if (vendedor_id && !alcance.verTodo(req) && Number(vendedor_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Solo puedes consultar tus propios objetivos.' });
  }
  let items = objetivosVisibles(req, db.objetivos_mensuales).map((o) => resumen(db, o));
  if (mes) items = items.filter((o) => o.mes === mes);
  if (vendedor_id) items = items.filter((o) => o.vendedor_id === Number(vendedor_id));
  items.sort((a, b) => String(b.mes).localeCompare(String(a.mes)));
  return res.json({ objetivos: items, total: items.length });
});

router.post('/', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const b = req.body || {};
  const mes = b.mes || MES_ACTUAL();
  const objetivo = {
    id: nextId(db.objetivos_mensuales),
    mes,
    vendedor_id: b.vendedor_id ? Number(b.vendedor_id) : null,
    ruta_venta: b.ruta_venta || null,
    tipo: ['monto', 'producto', 'volumen'].includes(b.tipo) ? b.tipo : 'monto',
    producto_id: b.producto_id ? Number(b.producto_id) : null,
    meta_monto: num(b.meta_monto),
    meta_unidades: num(b.meta_unidades),
    dias_laborables: num(b.dias_laborables, diasLaborablesDelMes(mes)),
    notas: b.notas || '',
    creado_por: req.user.id,
    activo: true,
    created_at: new Date().toISOString(),
  };
  db.objetivos_mensuales.push(objetivo);
  audit(db, req, 'Objetivo mensual creado', 'Ventas', `${objetivo.mes} · ${objetivo.tipo} · Bs ${objetivo.meta_monto}`);
  save();
  return res.status(201).json({ objetivo: resumen(db, objetivo) });
});

router.put('/:id', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const objetivo = db.objetivos_mensuales.find((o) => o.id === Number(req.params.id));
  if (!objetivo) return res.status(404).json({ error: 'Objetivo no encontrado.' });
  const b = req.body || {};
  ['mes', 'ruta_venta', 'tipo', 'notas'].forEach((c) => { if (b[c] !== undefined) objetivo[c] = b[c]; });
  ['vendedor_id', 'producto_id'].forEach((c) => { if (b[c] !== undefined) objetivo[c] = b[c] ? Number(b[c]) : null; });
  ['meta_monto', 'meta_unidades', 'dias_laborables'].forEach((c) => { if (b[c] !== undefined) objetivo[c] = num(b[c]); });
  if (b.activo !== undefined) objetivo.activo = Boolean(b.activo);
  audit(db, req, 'Objetivo mensual actualizado', 'Ventas', objetivo.mes);
  save();
  return res.json({ objetivo: resumen(db, objetivo) });
});

router.get('/avance', (req, res) => {
  const db = load();
  const mes = req.query.mes || MES_ACTUAL();
  const vendedorId = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
  if (vendedorId && !alcance.verTodo(req) && vendedorId !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Solo puedes consultar tu propio avance.' });
  }
  const objetivos = objetivosVisibles(req, db.objetivos_mensuales).filter((o) => o.activo && o.mes === mes
    && (!vendedorId || o.vendedor_id === vendedorId || !o.vendedor_id));
  if (!objetivos.length) return res.json({ objetivo: null, objetivos: [], avance: null });

  const desde = `${mes}-01`;
  const hasta = `${mes}-31`;
  const hoyISO = new Date().toISOString().slice(0, 10);
  const vendedorIds = [...new Set(objetivos.map((o) => o.vendedor_id).filter(Boolean))];
  const rutaVenta = objetivos.find((o) => o.ruta_venta)?.ruta_venta || null;
  let pedidosMes = db.pedidos.filter((p) => p.estado !== 'cancelado'
    && String(p.created_at).slice(0, 10) >= desde
    && String(p.created_at).slice(0, 10) <= hasta
    && (!vendedorIds.length || vendedorIds.includes(p.vendedor_id)));
  if (!alcance.verTodo(req)) {
    pedidosMes = pedidosMes.filter((p) => Number(p.vendedor_id) === Number(req.user.id)
      || Number(p.usuario_id) === Number(req.user.id));
  }
  const pedidosHoy = pedidosMes.filter((p) => String(p.created_at).slice(0, 10) === hoyISO);
  const ventasMes = round2(pedidosMes.reduce((s, p) => s + p.total, 0));
  const ventasHoy = round2(pedidosHoy.reduce((s, p) => s + p.total, 0));
  const meta = round2(objetivos.reduce((s, o) => s + num(o.meta_monto), 0));
  const dias = Math.max(...objetivos.map((o) => num(o.dias_laborables, diasLaborablesDelMes(mes))));
  const metaDiaria = dias ? round2(meta / dias) : 0;
  const faltaDiaria = Math.max(0, round2(metaDiaria - ventasHoy));
  const clientesDia = db.clientes.filter((c) => c.activo && c.dia_visita === ((new Date().getDay() || 7) > 5 ? 1 : new Date().getDay())
    && (!vendedorIds.length || vendedorIds.includes(c.vendedor_id))
    && (!rutaVenta || c.ruta_venta === rutaVenta)).length;
  const conPedidoHoy = new Set(pedidosHoy.map((p) => p.cliente_id)).size;
  const sinPedidoHoy = Math.max(0, clientesDia - conPedidoHoy);
  const montoPorCliente = sinPedidoHoy ? round2(faltaDiaria / sinPedidoHoy) : 0;
  const porProducto = objetivos.filter((o) => o.producto_id).map((o) => {
    const vendido = pedidosMes.reduce((s, p) => s + (p.items || []).filter((i) => i.producto_id === o.producto_id).reduce((x, i) => x + i.cantidad, 0), 0);
    return {
      objetivo_id: o.id,
      producto_id: o.producto_id,
      producto_nombre: db.productos.find((p) => p.id === o.producto_id)?.nombre || 'Producto',
      tipo: o.tipo,
      meta_unidades: num(o.meta_unidades),
      vendido,
      progreso: num(o.meta_unidades) ? round2((vendido / num(o.meta_unidades)) * 100) : 0,
    };
  });

  const objetivoCombinado = {
    ...resumen(db, objetivos[0]),
    tipo: objetivos.length > 1 ? 'combinado' : objetivos[0].tipo,
    meta_monto: meta,
    dias_laborables: dias,
  };

  return res.json({
    objetivo: objetivoCombinado,
    objetivos: objetivos.map((o) => resumen(db, o)),
    avance: {
      mes,
      ventas_mes: ventasMes,
      ventas_hoy: ventasHoy,
      meta: meta,
      meta_diaria: metaDiaria,
      falta_diaria: faltaDiaria,
      dias_laborables: dias,
      progreso: meta ? round2((ventasMes / meta) * 100) : 0,
      clientes_dia: clientesDia,
      con_pedido_hoy: conPedidoHoy,
      sin_pedido_hoy: sinPedidoHoy,
      monto_por_cliente: montoPorCliente,
      productos: porProducto,
      unidades_producto: porProducto.reduce((s, p) => s + p.vendido, 0),
      meta_unidades: porProducto.reduce((s, p) => s + p.meta_unidades, 0),
      progreso_producto: porProducto.length ? round2(porProducto.reduce((s, p) => s + p.progreso, 0) / porProducto.length) : 0,
      pedidos_mes: pedidosMes.length,
      pedidos_hoy: pedidosHoy.length,
    },
  });
});

module.exports = router;
