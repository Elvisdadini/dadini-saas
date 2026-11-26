const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit } = require('../utils');
const { esCoordenaValida, distanciaKm } = require('../geo');
const { subirFoto } = require('../fotos');

const router = express.Router();
router.use(authRequired);

const TIPOS = ['venta', 'cobranza', 'distribucion', 'alta_cliente', 'visita', 'preventa'];

function enriquecer(db, visita) {
  const cliente = db.clientes.find((c) => c.id === visita.cliente_id);
  const pedido = db.pedidos.find((p) => p.id === visita.pedido_id);
  const usuario = db.usuarios.find((u) => u.id === visita.usuario_id);
  const distanciaCliente = cliente && esCoordenaValida(cliente.latitud, cliente.longitud)
    ? distanciaKm(visita, cliente)
    : null;
  return {
    ...visita,
    cliente_nombre: cliente?.nombre || '—',
    cliente_zona: cliente?.zona || '',
    cliente_direccion: cliente?.direccion || '',
    pedido_codigo: pedido?.codigo || null,
    usuario_nombre: usuario?.nombre || 'Sistema',
    distancia_cliente_km: distanciaCliente,
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { tipo, cliente_id, pedido_id, ruta_id, activas, limit, resultado, motivo, ruta_venta, dia_visita, usuario_id, distribuidor_id, desde, hasta } = req.query;
  let visitas = require('../alcance').filtrar(req, db.visitas, ['usuario_id', 'distribuidor_id']);
  if (tipo && tipo !== 'todas') visitas = visitas.filter((v) => v.tipo === tipo);
  if (cliente_id) visitas = visitas.filter((v) => v.cliente_id === Number(cliente_id));
  if (pedido_id) visitas = visitas.filter((v) => v.pedido_id === Number(pedido_id));
  if (ruta_id) visitas = visitas.filter((v) => v.ruta_id === Number(ruta_id));
  if (activas === 'true') visitas = visitas.filter((v) => v.estado === 'en_curso');
  if (resultado && resultado !== 'todos') visitas = visitas.filter((v) => v.resultado === resultado);
  if (motivo && motivo !== 'todos') visitas = visitas.filter((v) => v.motivo === motivo);
  if (ruta_venta && ruta_venta !== 'todas') visitas = visitas.filter((v) => v.ruta_venta === ruta_venta);
  if (dia_visita) visitas = visitas.filter((v) => v.dia_visita === Number(dia_visita));
  if (usuario_id) visitas = visitas.filter((v) => v.usuario_id === Number(usuario_id));
  if (distribuidor_id) {
    const vendedorIds = db.usuarios.filter((u) => u.repartidor_id === Number(distribuidor_id)).map((u) => u.id);
    visitas = visitas.filter((v) => v.distribuidor_id === Number(distribuidor_id)
      || v.repartidor_id === Number(distribuidor_id) || vendedorIds.includes(v.usuario_id));
  }
  if (desde) visitas = visitas.filter((v) => String(v.fecha).slice(0, 10) >= desde);
  if (hasta) visitas = visitas.filter((v) => String(v.fecha).slice(0, 10) <= hasta);
  visitas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  const total = visitas.length;
  return res.json({
    visitas: visitas.slice(0, Number(limit) || 200).map((v) => enriquecer(db, v)),
    total,
  });
});

router.get('/resumen', (req, res) => {
  const db = load();
  const hoyISO = new Date().toISOString().slice(0, 10);
  const porTipo = TIPOS.map((tipo) => ({
    tipo,
    total: db.visitas.filter((v) => v.tipo === tipo).length,
    hoy: db.visitas.filter((v) => v.tipo === tipo && String(v.fecha).slice(0, 10) === hoyISO).length,
  }));
  return res.json({
    total: db.visitas.length,
    hoy: db.visitas.filter((v) => String(v.fecha).slice(0, 10) === hoyISO).length,
    en_curso: db.visitas.filter((v) => v.estado === 'en_curso').length,
    con_geolocalizacion: db.visitas.filter((v) => esCoordenaValida(v.latitud, v.longitud)).length,
    por_tipo: porTipo,
  });
});

router.get('/agenda', (req, res) => {
  const db = load();
  const usuario = db.usuarios.find((u) => u.id === req.user.id);
  const esAdmin = ['admin', 'dueno'].includes(req.user.rol);
  const diaSemana = new Date().getDay() || 7;
  const hoyDia = diaSemana > 5 ? 1 : diaSemana;
  const dia = Number(req.query.dia) || hoyDia;
  const ruta = req.query.ruta_venta || usuario?.ruta_venta || null;
  const zonaExplicita = Boolean(req.query.zona);
  const zona = req.query.zona || usuario?.zona_venta || null;
  const vendedorId = req.query.vendedor_id
    ? Number(req.query.vendedor_id)
    : (esAdmin ? null : req.user.id);

  // Todas las zonas que el vendedor visita ese día (una ruta puede tener
  // varias). Se usan para que la agenda no omita clientes de esas zonas.
  const rutasDelDia = (db.rutas_venta || []).filter((r) => r.activa !== false
    && Number(r.vendedor_id) === Number(vendedorId || req.user.id)
    && (r.dias_visita || [r.dia_visita]).map(Number).includes(dia));
  const zonasDelDia = new Set();
  rutasDelDia.forEach((r) => {
    const delDia = r.zonas_por_dia?.[dia] ?? r.zonas_por_dia?.[String(dia)];
    if (Array.isArray(delDia)) {
      delDia.forEach((id) => {
        const zona = (db.zonas || []).find((z) => z.id === Number(id));
        zonasDelDia.add(Number(id));
        if (zona) zonasDelDia.add(String(zona.nombre).toLowerCase());
      });
      return;
    }
    (r.zona_ids || (r.zona_id ? [r.zona_id] : [])).forEach((id) => zonasDelDia.add(Number(id)));
    (r.zonas || (r.zona ? [r.zona] : [])).forEach((nombre) => zonasDelDia.add(String(nombre).toLowerCase()));
  });
  if (usuario?.zona_venta) zonasDelDia.add(String(usuario.zona_venta).toLowerCase());
  const pasaZona = (cliente) => {
    if (zonaExplicita) return cliente.zona === zona || cliente.ruta_venta === ruta;
    if (!zonasDelDia.size) return true;
    return zonasDelDia.has(String(cliente.zona || '').toLowerCase())
      || zonasDelDia.has(Number(cliente.zona_id))
      || cliente.ruta_venta === ruta;
  };
  const vendedor = vendedorId ? db.usuarios.find((u) => u.id === vendedorId) : null;
  const distribuidorId = vendedor?.repartidor_id || usuario?.repartidor_id || null;
  const hoyISO = new Date().toISOString().slice(0, 10);

  const aplicaFiltros = (cliente) => cliente.activo
    && cliente.dia_visita === dia
    && (!ruta || cliente.ruta_venta === ruta)
    && pasaZona(cliente)
    && (!vendedorId || cliente.vendedor_id === vendedorId || cliente.vendedor_id === req.user.id);

  const clientes = db.clientes
    .filter(aplicaFiltros)
    .map((c) => {
      const visitasCliente = db.visitas
        .filter((v) => v.cliente_id === c.id && v.tipo === 'preventa' && String(v.fecha).slice(0, 10) === hoyISO)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      const pedidos = db.pedidos.filter((p) => p.cliente_id === c.id && p.es_preventa && String(p.created_at).slice(0, 10) === hoyISO);
      const inicioMes = `${hoyISO.slice(0, 7)}-01`;
      const pedidosMes = db.pedidos.filter((p) => p.cliente_id === c.id && p.estado !== 'cancelado' && String(p.created_at).slice(0, 10) >= inicioMes);
      const visitasMes = db.visitas.filter((v) => v.cliente_id === c.id && v.tipo === 'preventa' && String(v.fecha).slice(0, 10) >= inicioMes);
      return {
        ...c,
        visitada: visitasCliente.length > 0,
        ultima_visita: visitasCliente[0] || null,
        pedidos_hoy: pedidos.length,
        total_pedidos_hoy: round2Local(pedidos.reduce((s, p) => s + p.total, 0)),
        compras_mes: pedidosMes.length,
        visitas_mes: visitasMes.length,
        pedidos_mes: pedidosMes.length,
        total_mes: round2Local(pedidosMes.reduce((s, p) => s + p.total, 0)),
        sin_compra_mes: pedidosMes.length === 0,
      };
    });

  const visitasHoy = db.visitas.filter((v) => v.tipo === 'preventa'
    && (!vendedorId || v.usuario_id === vendedorId)
    && String(v.fecha).slice(0, 10) === hoyISO);

  return res.json({
    dia,
    ruta_venta: ruta,
    zona,
    zonas_del_dia: [...zonasDelDia].filter((z) => typeof z === 'string'),
    vendedor_id: vendedorId,
    vendedor_nombre: vendedor?.nombre || usuario?.nombre || '—',
    distribuidor_id: distribuidorId,
    distribuidor_nombre: db.repartidores.find((r) => r.id === distribuidorId)?.nombre || '—',
    clientes,
    vendedores: esAdmin ? db.usuarios.filter((u) => ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol)).map((u) => ({ id: u.id, nombre: u.nombre, ruta_venta: u.ruta_venta })) : [],
    resumen: {
      asignados: clientes.length,
      visitados: visitasHoy.length,
      con_pedido: visitasHoy.filter((v) => v.resultado === 'pedido').length,
      sin_pedido: visitasHoy.filter((v) => v.resultado === 'no_pedido').length,
      pedidos: db.pedidos.filter((p) => p.es_preventa && (!vendedorId || p.vendedor_id === vendedorId) && String(p.created_at).slice(0, 10) === hoyISO).length,
      sin_compra_mes: clientes.filter((c) => c.sin_compra_mes).length,
      visitas_mes: clientes.reduce((s, c) => s + c.visitas_mes, 0),
      compras_mes: clientes.reduce((s, c) => s + c.compras_mes, 0),
      total_mes: round2Local(clientes.reduce((s, c) => s + c.total_mes, 0)),
    },
    por_dia: [1, 2, 3, 4, 5, 6, 7].map((d) => ({
      dia: d,
      total: db.clientes.filter((c) => c.activo && c.dia_visita === d
        && (!ruta || c.ruta_venta === ruta)
        && pasaZona(c)
        && (!vendedorId || c.vendedor_id === vendedorId)).length,
    })),
  });
});

function round2Local(n) { return Math.round((Number(n) || 0) * 100) / 100; }

router.post('/', allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas', 'distribucion'), async (req, res) => {
  const db = load();
  const body = req.body || {};
  if (!esCoordenaValida(body.latitud, body.longitud)) {
    return res.status(400).json({ error: 'Se requieren coordenadas válidas (latitud y longitud).' });
  }
  const tipo = TIPOS.includes(body.tipo) ? body.tipo : 'visita';
  if (body.cliente_id) {
    const cliente = db.clientes.find((c) => c.id === Number(body.cliente_id));
    if (cliente && !cliente.activo && tipo !== 'cobranza') {
      return res.status(403).json({ error: `Cliente bloqueado: ${cliente.motivo_bloqueo || 'sin motivo registrado'}. Solo se permiten visitas de cobranza.` });
    }
  }
  let fotoComprobante = null;
  if (typeof body.foto === 'string' && body.foto.startsWith('data:image/')) {
    try { fotoComprobante = (await subirFoto(body.foto, 'visita')).url; }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  let firmaUrl = null;
  if (typeof body.firma === 'string' && body.firma.startsWith('data:image/')) {
    try { firmaUrl = (await subirFoto(body.firma, 'firma')).url; }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const cambios = [];
  for (const cambio of (Array.isArray(body.cambios) ? body.cambios : [])) {
    const item = {
      producto_id: Number(cambio.producto_id) || null,
      nombre_producto: String(cambio.nombre_producto || ''),
      cantidad: Math.max(1, Math.round(Number(cambio.cantidad) || 1)),
      motivo: String(cambio.motivo || ''),
      detalle: String(cambio.detalle || ''),
      lote: String(cambio.lote || ''),
      fecha_vencimiento: String(cambio.fecha_vencimiento || '').slice(0, 10) || null,
      foto_url: null,
    };
    if (typeof cambio.foto === 'string' && cambio.foto.startsWith('data:image/')) {
      try { item.foto_url = (await subirFoto(cambio.foto, 'cambio')).url; }
      catch (error) { return res.status(400).json({ error: error.message }); }
    }
    cambios.push(item);
  }
  const ahora = new Date().toISOString();
  const visita = {
    id: nextId(db.visitas),
    cliente_id: body.cliente_id ? Number(body.cliente_id) : null,
    tipo,
    modulo: body.modulo || (tipo === 'cobranza' ? 'Cobranzas' : tipo === 'distribucion' ? 'Distribución' : 'Ventas'),
    latitud: Number(body.latitud),
    longitud: Number(body.longitud),
    precision: Number(body.precision) || null,
    estado: body.estado || 'en_curso',
    resultado: body.resultado || null,
    motivo: body.motivo || null,
    detalle: String(body.detalle || ''),
    foto_url: fotoComprobante,
    firma_url: firmaUrl,
    cambios,
    pedido_id: body.pedido_id ? Number(body.pedido_id) : null,
    ruta_id: body.ruta_id ? Number(body.ruta_id) : null,
    ruta_venta: body.ruta_venta || req.user.ruta_venta || null,
    dia_visita: body.dia_visita ? Number(body.dia_visita) : null,
    distribuidor_id: body.distribuidor_id ? Number(body.distribuidor_id) : (req.user.repartidor_id || null),
    usuario_id: req.user.id,
    notas: body.notas || '',
    fecha: ahora,
    created_at: ahora,
  };
  db.visitas.unshift(visita);
  audit(db, req, 'Visita geolocalizada', 'Geolocalización', `${tipo} · ${visita.cliente_id || 'sin cliente'}`);
  save();
  return res.status(201).json({ visita: enriquecer(db, visita) });
});

router.patch('/:id', allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas', 'distribucion'), (req, res) => {
  const db = load();
  const visita = db.visitas.find((v) => v.id === Number(req.params.id));
  if (!visita) return res.status(404).json({ error: 'Visita no encontrada.' });
  if (['pendiente', 'en_curso', 'completada', 'cancelada'].includes(req.body?.estado)) visita.estado = req.body.estado;
  if (req.body?.notas !== undefined) visita.notas = req.body.notas;
  if (esCoordenaValida(req.body?.latitud, req.body?.longitud)) {
    visita.latitud = Number(req.body.latitud);
    visita.longitud = Number(req.body.longitud);
  }
  save();
  return res.json({ visita: enriquecer(db, visita) });
});

module.exports = router;
