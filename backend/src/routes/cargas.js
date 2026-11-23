const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');
const { pedidoResumen } = require('../services');

const router = express.Router();
router.use(authRequired);

const ESTADOS = ['preparando', 'preparada', 'en_ruta', 'descargada', 'cancelada'];
const TRANSICIONES = {
  preparando: ['preparada', 'cancelada'],
  preparada: ['en_ruta', 'cancelada'],
  en_ruta: ['descargada'],
  descargada: [],
  cancelada: [],
};

function cajas(clase, upc) {
  const unidadesPorCaja = Math.max(1, Math.round(num(upc, 1) || 1));
  const cajasCompletas = Math.floor(clase / unidadesPorCaja);
  const unidadesSueltas = clase % unidadesPorCaja;
  return {
    unidades_por_caja: unidadesPorCaja,
    cajas_completas: cajasCompletas,
    unidades_sueltas: unidadesSueltas,
    cajas_a_preparar: cajasCompletas + (unidadesSueltas > 0 ? 1 : 0),
  };
}

function generarLineas(db, pedidos) {
  const mapa = new Map();
  pedidos.forEach((pedido) => {
    (pedido.items || []).forEach((item) => {
      const producto = db.productos.find((p) => p.id === item.producto_id);
      if (!producto) return;
      const prev = mapa.get(producto.id) || {
        producto_id: producto.id,
        nombre: producto.nombre,
        emoji: producto.emoji,
        sku: producto.sku,
        unidad: producto.unidad,
        cantidad_unidades: 0,
        pedidos: 0,
      };
      prev.cantidad_unidades += Number(item.cantidad) || 0;
      prev.pedidos += 1;
      mapa.set(producto.id, prev);
    });
  });
  return [...mapa.values()].map((linea) => ({
    ...linea,
    cantidad_unidades: Math.round(linea.cantidad_unidades),
    ...cajas(linea.cantidad_unidades, db.productos.find((p) => p.id === linea.producto_id)?.unidades_por_caja),
  })).sort((a, b) => b.cantidad_unidades - a.cantidad_unidades);
}

function entregadoPorProducto(pedidos) {
  const mapa = new Map();
  pedidos.filter((p) => p.estado === 'entregado').forEach((pedido) => {
    (pedido.items || []).forEach((item) => {
      mapa.set(item.producto_id, (mapa.get(item.producto_id) || 0) + Number(item.cantidad || 0));
    });
  });
  return mapa;
}

function resumenCarga(db, carga) {
  const vendedor = db.usuarios.find((u) => u.id === carga.vendedor_id);
  const repartidor = db.repartidores.find((r) => r.id === carga.repartidor_id);
  const vehiculo = db.vehiculos.find((v) => v.id === carga.vehiculo_id);
  const almacen = db.almacenes.find((a) => a.id === carga.almacen_id);
  const ruta = db.rutas.find((r) => r.id === carga.ruta_id);
  const pedidos = db.pedidos.filter((p) => carga.pedidos_ids.includes(p.id));
  const entregado = entregadoPorProducto(pedidos);
  const lineas = (carga.lineas || []).map((linea) => {
    const ya = entregado.get(linea.producto_id) || 0;
    const restante = Math.max(0, linea.cantidad_unidades - ya);
    return {
      ...linea,
      entregado_unidades: ya,
      restante_unidades: restante,
      ...cajas(restante, linea.unidades_por_caja),
    };
  });
  const totales = {
    unidades: lineas.reduce((s, l) => s + l.cantidad_unidades, 0),
    cajas: lineas.reduce((s, l) => s + l.cajas_a_preparar, 0),
    restante_unidades: lineas.reduce((s, l) => s + l.restante_unidades, 0),
    restante_cajas: lineas.reduce((s, l) => s + l.cajas_a_preparar, 0),
    monto: round2(pedidos.reduce((s, p) => s + p.total, 0)),
    pedidos: pedidos.length,
    entregados: pedidos.filter((p) => p.estado === 'entregado').length,
  };
  return {
    ...carga,
    vendedor_nombre: vendedor?.nombre || 'Sin asignar',
    repartidor_nombre: repartidor?.nombre || 'Sin asignar',
    repartidor_emoji: repartidor?.emoji || '🚚',
    vehiculo_placa: vehiculo?.placa || 'Sin vehículo',
    vehiculo_modelo: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : '',
    almacen_nombre: almacen?.nombre || '—',
    ruta_codigo: ruta?.codigo || null,
    ruta_estado: ruta?.estado || null,
    lineas,
    totales,
    pedidos_detalle: pedidos.map((p) => pedidoResumen(db, p)),
  };
}

function pedidosElegibles(db, fecha, vendedorId, almacenId) {
  return db.pedidos.filter((p) => {
    if (p.estado === 'cancelado' || p.estado === 'entregado' || p.carga_id) return false;
    if (fecha && p.created_at.slice(0, 10) !== fecha) return false;
    if (vendedorId && p.vendedor_id !== Number(vendedorId)) return false;
    if (almacenId && p.almacen_id !== Number(almacenId)) return false;
    return ['pendiente', 'preparando', 'enviado'].includes(p.estado);
  });
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, fecha, vendedor_id } = req.query;
  let cargas = db.cargas.map((c) => resumenCarga(db, c));
  if (estado && estado !== 'todas') cargas = cargas.filter((c) => c.estado === estado);
  if (fecha) cargas = cargas.filter((c) => c.fecha === fecha);
  if (vendedor_id) cargas = cargas.filter((c) => c.vendedor_id === Number(vendedor_id));
  cargas.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const almacenesMoviles = cargas
    .filter((c) => ['preparada', 'en_ruta'].includes(c.estado))
    .map((c) => ({
      id: c.id,
      codigo: c.codigo,
      nombre: `Almacén móvil · ${c.vehiculo_placa}`,
      repartidor: c.repartidor_nombre,
      pedidos: c.totales.pedidos,
      unidades: c.totales.restante_unidades,
      cajas: c.totales.restante_cajas,
      estado: c.estado,
    }));
  return res.json({
    cargas,
    almacenes_moviles: almacenesMoviles,
    resumen: {
      total: db.cargas.length,
      preparando: db.cargas.filter((c) => c.estado === 'preparando').length,
      en_ruta: db.cargas.filter((c) => c.estado === 'en_ruta').length,
      descargadas: db.cargas.filter((c) => c.estado === 'descargada').length,
      unidades_moviles: almacenesMoviles.reduce((s, a) => s + a.unidades, 0),
    },
  });
});

router.get('/preparar', (req, res) => {
  const db = load();
  const fecha = req.query.fecha || new Date().toISOString().slice(0, 10);
  const vendedorId = req.query.vendedor_id ? Number(req.query.vendedor_id) : null;
  const almacenId = req.query.almacen_id ? Number(req.query.almacen_id) : null;
  const pedidos = pedidosElegibles(db, fecha, vendedorId, almacenId);
  const vendedores = [...new Set(pedidos.map((p) => p.vendedor_id))]
    .map((id) => db.usuarios.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({
      id: u.id,
      nombre: u.nombre,
      pedidos: pedidos.filter((p) => p.vendedor_id === u.id).length,
      repartidor_id: u.repartidor_id || null,
      vehiculo_id: u.vehiculo_id || null,
    }));
  const primeraSugerencia = vendedores.find((v) => v.repartidor_id) || null;
  const lineas = generarLineas(db, pedidos);
  return res.json({
    fecha,
    pedidos: pedidos.map((p) => pedidoResumen(db, p)),
    lineas,
    totales: {
      pedidos: pedidos.length,
      unidades: lineas.reduce((s, l) => s + l.cantidad_unidades, 0),
      cajas: lineas.reduce((s, l) => s + l.cajas_a_preparar, 0),
      monto: round2(pedidos.reduce((s, p) => s + p.total, 0)),
    },
    vendedores,
    sugerencia: {
      vendedor_id: primeraSugerencia?.id || null,
      repartidor_id: primeraSugerencia?.repartidor_id || null,
      vehiculo_id: primeraSugerencia?.vehiculo_id || null,
    },
    vendedores_disponibles: db.usuarios.filter((u) => u.rol === 'ventas' && u.activo).map((u) => ({ id: u.id, nombre: u.nombre })),
    repartidores: db.repartidores.filter((r) => r.activo),
    vehiculos: db.vehiculos.filter((v) => v.activo && v.estado === 'operativo'),
    almacenes: db.almacenes.filter((a) => a.activo),
  });
});

function resolverDistribuidor(db, pedido) {
  if (pedido.repartidor_asignado_id) {
    const rep = db.repartidores.find((r) => r.id === Number(pedido.repartidor_asignado_id));
    if (rep) return rep;
  }
  const ruta = pedido.ruta_id ? db.rutas.find((r) => r.id === pedido.ruta_id) : null;
  if (ruta?.repartidor_id) {
    const rep = db.repartidores.find((r) => r.id === ruta.repartidor_id);
    if (rep) return rep;
  }
  const vendedor = db.usuarios.find((u) => u.id === pedido.vendedor_id);
  if (vendedor?.repartidor_id) {
    const rep = db.repartidores.find((r) => r.id === vendedor.repartidor_id);
    if (rep) return rep;
  }
  const cliente = db.clientes.find((c) => c.id === pedido.cliente_id);
  if (cliente?.distribuidor_id) {
    const rep = db.repartidores.find((r) => r.id === cliente.distribuidor_id);
    if (rep) return rep;
  }
  return null;
}

function lineasDePedido(db, pedido) {
  const mapa = new Map();
  (pedido.items || []).forEach((item) => {
    const producto = db.productos.find((p) => p.id === item.producto_id);
    if (!producto) return;
    const prev = mapa.get(producto.id) || {
      producto_id: producto.id,
      nombre: producto.nombre,
      emoji: producto.emoji,
      sku: producto.sku,
      unidad: producto.unidad,
      presentacion: producto.presentacion,
      unidades_por_caja: Math.max(1, Math.round(num(producto.unidades_por_caja, 1) || 1)),
      cantidad_unidades: 0,
      pedidos: 0,
    };
    prev.cantidad_unidades += Number(item.cantidad) || 0;
    prev.pedidos += 1;
    mapa.set(producto.id, prev);
  });
  return [...mapa.values()]
    .map((l) => ({ ...l, ...cajas(l.cantidad_unidades, l.unidades_por_caja) }))
    .sort((a, b) => b.cantidad_unidades - a.cantidad_unidades);
}

// Manifiesto imprimible: productos a preparar, carga agrupada por distribuidor
// con sus vendedores, y lista de pedidos/clientes con los totales de la carga.
router.get('/manifiesto', (req, res) => {
  const db = load();
  const fecha = String(req.query.fecha || new Date().toISOString().slice(0, 10));
  const distribuidorId = req.query.distribuidor_id ? Number(req.query.distribuidor_id) : null;
  const estado = req.query.estado && req.query.estado !== 'todos' ? req.query.estado : null;

  let pedidos = db.pedidos.filter((p) => p.estado !== 'cancelado');
  if (fecha) pedidos = pedidos.filter((p) => String(p.created_at || '').slice(0, 10) === fecha || p.fecha_entrega_programada === fecha);
  if (estado) pedidos = pedidos.filter((p) => p.estado === estado);

  const enriquecidos = pedidos.map((p) => {
    const base = pedidoResumen(db, p);
    const dist = resolverDistribuidor(db, p);
    const vendedor = db.usuarios.find((u) => u.id === p.vendedor_id);
    const lineas = lineasDePedido(db, p);
    const unidades = lineas.reduce((s, l) => s + l.cantidad_unidades, 0);
    const cajasTotal = lineas.reduce((s, l) => s + l.cajas_a_preparar, 0);
    const peso = lineas.reduce((s, l) => s + l.cantidad_unidades * num(db.productos.find((x) => x.id === l.producto_id)?.peso_kg, 0.25), 0);
    return {
      ...base,
      distribuidor_id: dist?.id || null,
      distribuidor_codigo: dist?.codigo || null,
      distribuidor_nombre: dist?.nombre || 'Sin distribuidor asignado',
      distribuidor_emoji: dist?.emoji || '📦',
      distribuidor_zona: dist?.zona || '',
      vendedor_id: vendedor?.id || p.vendedor_id || null,
      vendedor_nombre: vendedor?.nombre || base.vendedor_nombre || 'Sin vendedor',
      cliente_id: p.cliente_id,
      cliente_nombre: base.cliente_nombre,
      cliente_zona: base.cliente_zona,
      cliente_telefono: base.cliente_telefono,
      items: p.items || [],
      lineas,
      unidades,
      cajas: cajasTotal,
      peso_kg: round2(peso),
      fecha_entrega: p.fecha_entrega_programada || String(p.created_at || '').slice(0, 10),
    };
  }).filter((p) => !distribuidorId || p.distribuidor_id === distribuidorId);

  const grupos = new Map();
  enriquecidos.forEach((p) => {
    const key = p.distribuidor_id ?? 'sin';
    if (!grupos.has(key)) {
      grupos.set(key, {
        id: p.distribuidor_id,
        codigo: p.distribuidor_codigo,
        nombre: p.distribuidor_nombre,
        emoji: p.distribuidor_emoji,
        zona: p.distribuidor_zona,
        pedidos: [],
        vendedores: new Map(),
        clientes: new Map(),
        productos: new Map(),
      });
    }
    const g = grupos.get(key);
    g.pedidos.push(p);

    if (!g.vendedores.has(p.vendedor_id)) g.vendedores.set(p.vendedor_id, { id: p.vendedor_id, nombre: p.vendedor_nombre, pedidos: 0, unidades: 0, cajas: 0, monto: 0 });
    const v = g.vendedores.get(p.vendedor_id);
    v.pedidos += 1; v.unidades += p.unidades; v.cajas += p.cajas; v.monto += p.total;

    if (!g.clientes.has(p.cliente_id)) g.clientes.set(p.cliente_id, { id: p.cliente_id, nombre: p.cliente_nombre, zona: p.cliente_zona, telefono: p.cliente_telefono, pedidos: [], unidades: 0, cajas: 0, monto: 0 });
    const c = g.clientes.get(p.cliente_id);
    c.pedidos.push({ id: p.id, codigo: p.codigo, fecha: p.fecha_entrega, estado: p.estado, vendedor: p.vendedor_nombre, items: p.items_count, unidades: p.unidades, cajas: p.cajas, total: p.total });
    c.unidades += p.unidades; c.cajas += p.cajas; c.monto += p.total;

    p.lineas.forEach((l) => {
      if (!g.productos.has(l.producto_id)) g.productos.set(l.producto_id, { ...l, pedidos: 0, cantidad_unidades: 0 });
      const pl = g.productos.get(l.producto_id);
      pl.pedidos += 1;
      pl.cantidad_unidades += l.cantidad_unidades;
      const calc = cajas(pl.cantidad_unidades, pl.unidades_por_caja);
      pl.cajas_completas = calc.cajas_completas;
      pl.unidades_sueltas = calc.unidades_sueltas;
      pl.cajas_a_preparar = calc.cajas_a_preparar;
    });
  });

  const distribuidores = [...grupos.values()].map((g) => {
    const vendedoresAsignados = g.id ? db.usuarios.filter((u) => u.repartidor_id === g.id && u.activo).map((u) => ({ id: u.id, nombre: u.nombre, rol: u.rol })) : [];
    const vistos = new Set(vendedoresAsignados.map((v) => v.id));
    const vendedores = [
      ...vendedoresAsignados.map((u) => ({ ...u, pedidos: g.vendedores.get(u.id)?.pedidos || 0, unidades: g.vendedores.get(u.id)?.unidades || 0, cajas: g.vendedores.get(u.id)?.cajas || 0, monto: g.vendedores.get(u.id)?.monto || 0 })),
      ...[...g.vendedores.values()].filter((v) => v.id && !vistos.has(v.id)),
    ];
    return {
      id: g.id, codigo: g.codigo, nombre: g.nombre, emoji: g.emoji, zona: g.zona,
      vendedores,
      vendedores_nombres: vendedores.map((v) => v.nombre).join(', '),
      pedidos: g.pedidos,
      clientes: [...g.clientes.values()].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      productos: [...g.productos.values()].sort((a, b) => b.cantidad_unidades - a.cantidad_unidades),
      totales: {
        pedidos: g.pedidos.length,
        clientes: g.clientes.size,
        unidades: g.pedidos.reduce((s, p) => s + p.unidades, 0),
        cajas: g.pedidos.reduce((s, p) => s + p.cajas, 0),
        monto: round2(g.pedidos.reduce((s, p) => s + p.total, 0)),
        peso_kg: round2(g.pedidos.reduce((s, p) => s + p.peso_kg, 0)),
      },
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre));

  const productosMap = new Map();
  enriquecidos.forEach((p) => p.lineas.forEach((l) => {
    if (!productosMap.has(l.producto_id)) productosMap.set(l.producto_id, { ...l, cantidad_unidades: 0, pedidos: 0, distribuidores: new Set() });
    const item = productosMap.get(l.producto_id);
    item.cantidad_unidades += l.cantidad_unidades;
    item.pedidos += 1;
    item.distribuidores.add(p.distribuidor_nombre);
    const calc = cajas(item.cantidad_unidades, item.unidades_por_caja);
    item.cajas_completas = calc.cajas_completas;
    item.unidades_sueltas = calc.unidades_sueltas;
    item.cajas_a_preparar = calc.cajas_a_preparar;
  }));
  const productos = [...productosMap.values()].map((p) => ({ ...p, distribuidores: [...p.distribuidores] })).sort((a, b) => b.cantidad_unidades - a.cantidad_unidades);

  const clientesMap = new Map();
  enriquecidos.forEach((p) => {
    if (!clientesMap.has(p.cliente_id)) clientesMap.set(p.cliente_id, { id: p.cliente_id, nombre: p.cliente_nombre, zona: p.cliente_zona, telefono: p.cliente_telefono, pedidos: [], vendedores: new Set(), unidades: 0, cajas: 0, monto: 0 });
    const c = clientesMap.get(p.cliente_id);
    c.pedidos.push({ id: p.id, codigo: p.codigo, fecha: p.fecha_entrega, estado: p.estado, vendedor: p.vendedor_nombre, distribuidor: p.distribuidor_nombre, items: p.items_count, unidades: p.unidades, cajas: p.cajas, total: p.total });
    c.vendedores.add(p.vendedor_nombre);
    c.unidades += p.unidades; c.cajas += p.cajas; c.monto += p.total;
  });
  const clientes = [...clientesMap.values()].map((c) => ({ ...c, vendedores: [...c.vendedores] })).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return res.json({
    fecha,
    filtros: { fecha, distribuidor_id: distribuidorId, estado: estado || 'todos' },
    pedidos: enriquecidos,
    distribuidores,
    clientes,
    productos,
    catalogo_distribuidores: db.repartidores.filter((r) => r.activo),
    totales: {
      pedidos: enriquecidos.length,
      clientes: clientes.length,
      distribuidores: distribuidores.length,
      vendedores: new Set(enriquecidos.map((p) => p.vendedor_id)).size,
      productos: productos.length,
      unidades: enriquecidos.reduce((s, p) => s + p.unidades, 0),
      cajas: enriquecidos.reduce((s, p) => s + p.cajas, 0),
      monto: round2(enriquecidos.reduce((s, p) => s + p.total, 0)),
      peso_kg: round2(enriquecidos.reduce((s, p) => s + p.peso_kg, 0)),
    },
  });
});

router.post('/', allow('ventas', 'preventista', 'distribucion'), (req, res) => {
  const db = load();
  const body = req.body || {};
  const fecha = body.fecha || new Date().toISOString().slice(0, 10);
  const vendedorId = Number(body.vendedor_id) || null;
  if (!vendedorId) return res.status(400).json({ error: 'Selecciona el vendedor responsable de la carga.' });
  const elegibles = pedidosElegibles(db, fecha, vendedorId, body.almacen_id);
  const pedidos = body.pedidos_ids?.length
    ? elegibles.filter((p) => body.pedidos_ids.map(Number).includes(p.id))
    : elegibles;
  if (!pedidos.length) return res.status(400).json({ error: 'No hay pedidos pendientes para preparar con esos filtros.' });

  const vendedor = db.usuarios.find((u) => u.id === vendedorId);
  const repartidorId = Number(body.repartidor_id) || vendedor?.repartidor_id || null;
  const vehiculoId = Number(body.vehiculo_id) || vendedor?.vehiculo_id || null;
  if (!repartidorId || !vehiculoId) return res.status(400).json({ error: 'El vendedor no tiene repartidor/vehículo asignado. Selecciónalos manualmente.' });

  const lineas = generarLineas(db, pedidos);
  const ahora = new Date().toISOString();
  const carga = {
    id: nextId(db.cargas),
    codigo: nextCode(db.cargas, 'codigo', 'CAR', 1),
    fecha,
    almacen_id: Number(body.almacen_id) || pedidos[0].almacen_id,
    vendedor_id: vendedorId,
    repartidor_id: repartidorId,
    vehiculo_id: vehiculoId,
    estado: 'preparando',
    pedidos_ids: pedidos.map((p) => p.id),
    lineas,
    totales: {
      unidades: lineas.reduce((s, l) => s + l.cantidad_unidades, 0),
      cajas: lineas.reduce((s, l) => s + l.cajas_a_preparar, 0),
    },
    notas: body.notas || '',
    ruta_id: null,
    created_at: ahora,
    updated_at: ahora,
    cerrada_en: null,
    salida_en: null,
    descargada_en: null,
  };
  db.cargas.push(carga);

  const ruta = {
    id: nextId(db.rutas),
    codigo: nextCode(db.rutas, 'codigo', 'RUT', 1),
    fecha,
    repartidor_id: repartidorId,
    vehiculo_id: vehiculoId,
    estado: 'programada',
    notas: `Carga ${carga.codigo} · preparada por ${vendedor?.nombre || 'Ventas'}`,
    paradas: pedidos.map((p, i) => ({
      pedido_id: p.id,
      orden: i + 1,
      estado: 'pendiente',
      hora_estimada: `${String(9 + i).padStart(2, '0')}:00`,
      notas: '',
    })),
    created_at: ahora,
    carga_id: carga.id,
  };
  db.rutas.push(ruta);
  carga.ruta_id = ruta.id;

  pedidos.forEach((p) => {
    p.carga_id = carga.id;
    p.ruta_id = ruta.id;
    if (p.estado === 'pendiente') p.estado = 'preparando';
    p.updated_at = ahora;
  });

  audit(db, req, 'Carga preparada', 'Ventas / Distribución', `${carga.codigo} · ${pedidos.length} pedidos · ${carga.totales.cajas} cajas · ${ruta.codigo}`);
  save();
  return res.status(201).json({ carga: resumenCarga(db, carga) });
});

router.get('/:id', (req, res) => {
  const db = load();
  const carga = db.cargas.find((c) => c.id === Number(req.params.id));
  if (!carga) return res.status(404).json({ error: 'Carga no encontrada.' });
  return res.json({ carga: resumenCarga(db, carga) });
});

router.patch('/:id/estado', allow('ventas', 'preventista', 'distribucion'), (req, res) => {
  const db = load();
  const carga = db.cargas.find((c) => c.id === Number(req.params.id));
  if (!carga) return res.status(404).json({ error: 'Carga no encontrada.' });
  const estado = req.body?.estado;
  if (!TRANSICIONES[carga.estado]?.includes(estado)) {
    return res.status(400).json({ error: `No se puede pasar de "${carga.estado}" a "${estado}".` });
  }
  const ahora = new Date().toISOString();
  if (estado === 'descargada') {
    const pendientes = db.pedidos.filter((p) => carga.pedidos_ids.includes(p.id) && p.estado !== 'entregado' && p.estado !== 'cancelado');
    if (pendientes.length) return res.status(400).json({ error: `Aún hay ${pendientes.length} pedidos sin entregar en esta carga.` });
    const ruta = db.rutas.find((r) => r.id === carga.ruta_id);
    if (ruta) ruta.estado = 'completada';
    carga.descargada_en = ahora;
  }
  if (estado === 'en_ruta') {
    const ruta = db.rutas.find((r) => r.id === carga.ruta_id);
    if (ruta) ruta.estado = 'en_camino';
    carga.salida_en = ahora;
  }
  if (estado === 'preparada') carga.cerrada_en = ahora;
  carga.estado = estado;
  carga.updated_at = ahora;
  audit(db, req, 'Estado de carga actualizado', 'Ventas / Distribución', `${carga.codigo} → ${estado}`);
  save();
  return res.json({ carga: resumenCarga(db, carga) });
});

module.exports = router;
