const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, nextCode, audit, round2, num } = require('../utils');
const { pedidoResumen } = require('../services');
const { distanciaKm, distanciaAcumulada, centroYDistanza, esCoordenaValida } = require('../geo');
const { subirFoto } = require('../fotos');
const { requireActividad } = require('../actividades');

async function subirComprobante(datos, prefijo) {
  if (typeof datos === 'string' && datos.startsWith('data:image/')) {
    return (await subirFoto(datos, prefijo)).url;
  }
  return null;
}

const router = express.Router();
router.use(authRequired);

function rutaResumen(db, ruta) {
  const repartidor = db.repartidores.find((r) => r.id === ruta.repartidor_id);
  const vehiculo = db.vehiculos.find((v) => v.id === ruta.vehiculo_id);
  const entregadas = ruta.paradas.filter((p) => p.estado === 'entregada').length;
  const fallidas = ruta.paradas.filter((p) => p.estado === 'fallida').length;
  const total = ruta.paradas.reduce((sum, parada) => {
    const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
    return sum + (pedido?.total || 0);
  }, 0);
  const puntos = ruta.paradas
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((parada) => {
      const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
      const cliente = db.clientes.find((c) => c.id === pedido?.cliente_id);
      return {
        pedido_id: parada.pedido_id,
        pedido_codigo: pedido?.codigo || '—',
        orden: parada.orden,
        estado: parada.estado,
        cliente_id: cliente?.id || null,
        cliente_nombre: cliente?.nombre || 'Cliente eliminado',
        direccion: cliente?.direccion || pedido?.entrega_direccion || '',
        latitud: cliente?.latitud ?? null,
        longitud: cliente?.longitud ?? null,
      };
    });
  const { centro, radio_km } = centroYDistanza(puntos);
  return {
    ...ruta,
    geo: {
      puntos,
      centro,
      radio_km,
      distancia_total_km: distanciaAcumulada(puntos),
      con_coordenadas: puntos.filter((p) => p.latitud !== null).length,
    },
    repartidor_nombre: repartidor?.nombre || 'Sin asignar',
    repartidor_emoji: repartidor?.emoji || '🚚',
    repartidor_telefono: repartidor?.telefono || '',
    vehiculo_placa: vehiculo?.placa || 'Sin vehículo',
    vehiculo_modelo: vehiculo ? `${vehiculo.marca} ${vehiculo.modelo}` : '',
    total_paradas: ruta.paradas.length,
    entregadas,
    fallidas,
    pendientes: ruta.paradas.length - entregadas - fallidas,
    progreso: ruta.paradas.length ? Math.round((entregadas / ruta.paradas.length) * 100) : 0,
    monto_total: round2(total),
  };
}

function aplicarDevoluciones(pedido, devueltos) {
  const descontados = [];
  if (!Array.isArray(devueltos)) return descontados;
  devueltos.forEach((dev) => {
    const item = (pedido.items || []).find((i) => i.producto_id === Number(dev.producto_id));
    if (!item) return;
    const cantidad = Math.min(item.cantidad, Math.max(0, Math.round(num(dev.cantidad))));
    if (!cantidad) return;
    item.cantidad -= cantidad;
    item.subtotal = round2(item.cantidad * item.precio);
    descontados.push({ producto_id: item.producto_id, nombre: item.nombre, cantidad });
  });
  if (!descontados.length) return descontados;
  pedido.items = (pedido.items || []).filter((i) => i.cantidad > 0);
  pedido.subtotal = round2((pedido.items || []).reduce((s, i) => s + i.subtotal, 0));
  pedido.total = round2(pedido.subtotal - num(pedido.descuento) + num(pedido.envio));
  if (pedido.forma_pago !== 'credito') {
    pedido.pagado = pedido.total;
    pedido.saldo = 0;
    pedido.estado_pago = 'pagado';
  } else {
    pedido.pagado = Math.min(num(pedido.pagado), pedido.total);
    pedido.saldo = round2(Math.max(0, pedido.total - pedido.pagado));
    pedido.estado_pago = pedido.saldo > 0 ? 'parcial' : 'pagado';
  }
  return descontados;
}

function ajustarPedidoEntrega(db, pedido, itemsFinales, ruta, req) {
  const ahora = new Date().toISOString();
  const abiertas = db.devoluciones_movil.filter((d) => d.ruta_id === ruta.id && d.estado !== 'reingresado');
  const cambios = [];

  const necesarios = new Map();
  (itemsFinales || []).forEach((final) => {
    const pid = Number(final.producto_id);
    const cantidad = Math.max(0, Math.round(num(final.cantidad)));
    const actual = Number((pedido.items || []).find((i) => i.producto_id === pid)?.cantidad || 0);
    if (cantidad > actual) necesarios.set(pid, (necesarios.get(pid) || 0) + (cantidad - actual));
  });
  for (const [pid, need] of necesarios) {
    const disponible = abiertas.reduce((sum, d) => sum + (d.lineas || []).filter((l) => l.producto_id === pid && !l.reacomodado).reduce((x, l) => x + l.cantidad, 0), 0);
    if (need > disponible) {
      const nombre = db.productos.find((p) => p.id === pid)?.nombre || 'Producto';
      throw new Error(`No hay ${need} unidades reacomodables de ${nombre} en esta ruta. Disponible: ${disponible}.`);
    }
  }

  (itemsFinales || []).forEach((final) => {
    const productoId = Number(final.producto_id);
    const cantidadFinal = Math.max(0, Math.round(num(final.cantidad)));
    let item = (pedido.items || []).find((i) => i.producto_id === productoId);
    if (!item && cantidadFinal > 0) {
      const producto = db.productos.find((p) => p.id === productoId);
      if (!producto) return;
      item = {
        producto_id: productoId,
        nombre: producto.nombre,
        emoji: producto.emoji,
        precio: num(producto.precio),
        costo_unitario: num(producto.costo),
        cantidad: 0,
        subtotal: 0,
        agregado_en_entrega: true,
      };
      pedido.items.push(item);
    }
    if (!item) return;
    const actual = Number(item.cantidad) || 0;

    if (cantidadFinal > actual) {
      let extra = cantidadFinal - actual;
      abiertas.forEach((dev) => {
        const linea = (dev.lineas || []).find((l) => l.producto_id === productoId && !l.reacomodado && l.cantidad > 0);
        if (linea && extra > 0) {
          const usar = Math.min(linea.cantidad, extra);
          linea.cantidad -= usar;
          if (linea.cantidad <= 0) linea.reacomodado = true;
          extra -= usar;
          cambios.push({ producto_id: productoId, tipo: 'aumentado', cantidad: usar });
        }
      });
      if (extra > 0) throw new Error(`No hay ${extra} unidades reacomodables de ${item.nombre} en esta ruta.`);
    } else if (cantidadFinal < actual) {
      const diferencia = actual - cantidadFinal;
      let dev = abiertas.find((d) => d.estado === 'pendiente');
      if (!dev) {
        dev = {
          id: nextId(db.devoluciones_movil),
          codigo: nextCode(db.devoluciones_movil, 'codigo', 'DEV', 1),
          tipo: 'distribucion', origen_tipo: 'carga', origen_id: ruta.id, ruta_id: ruta.id,
          pedido_id: pedido.id, cliente_id: pedido.cliente_id, lineas: [], notas: '',
          estado: 'pendiente', usuario_id: req.user.id, fecha: ahora,
          verificado_por: null, fecha_verificacion: null, reingresado_en: null,
        };
        db.devoluciones_movil.push(dev);
        abiertas.push(dev);
      }
      dev.lineas.push({ producto_id: productoId, cantidad: diferencia, motivo: 'Entrega parcial / rechazo parcial', estado: 'bueno', reacomodado: false });
      cambios.push({ producto_id: productoId, tipo: 'disminuido', cantidad: diferencia });
    }
    item.cantidad = cantidadFinal;
    item.subtotal = round2(item.cantidad * num(item.precio));
  });

  pedido.items = (pedido.items || []).filter((i) => i.cantidad > 0);
  pedido.subtotal = round2((pedido.items || []).reduce((s, i) => s + i.subtotal, 0));
  pedido.total = round2(pedido.subtotal - num(pedido.descuento) + num(pedido.envio));
  if (pedido.forma_pago !== 'credito') {
    pedido.pagado = pedido.total;
    pedido.saldo = 0;
    pedido.estado_pago = 'pagado';
  } else {
    pedido.pagado = Math.min(num(pedido.pagado), pedido.total);
    pedido.saldo = round2(Math.max(0, pedido.total - pedido.pagado));
    pedido.estado_pago = pedido.saldo > 0 ? 'parcial' : 'pagado';
  }
  pedido.updated_at = ahora;
  return cambios;
}

router.get('/', (req, res) => {
  const db = load();
  const { fecha, estado, repartidor_id, desde, hasta } = req.query;
  const propias = require('../alcance').filtrar(req, db.rutas, ['repartidor_id', 'usuario_id', 'creado_por']);
  let rutas = propias.map((r) => rutaResumen(db, r));
  if (fecha) rutas = rutas.filter((r) => r.fecha === fecha);
  if (desde) rutas = rutas.filter((r) => r.fecha >= desde);
  if (hasta) rutas = rutas.filter((r) => r.fecha <= hasta);
  if (estado && estado !== 'todas') rutas = rutas.filter((r) => r.estado === estado);
  if (repartidor_id) rutas = rutas.filter((r) => r.repartidor_id === Number(repartidor_id));
  const hoyISO = new Date().toISOString().slice(0, 10);
  return res.json({
    rutas: rutas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.id - a.id),
    resumen: {
      total: propias.length,
      hoy: propias.filter((r) => r.fecha === hoyISO).length,
      en_camino: propias.filter((r) => r.estado === 'en_camino').length,
      completadas: propias.filter((r) => r.estado === 'completada').length,
    },
  });
});

router.get('/disponibles', (req, res) => {
  const db = load();
  let pedidos = require('../alcance').filtrar(req,
    db.pedidos.filter((p) => !p.ruta_id && ['pendiente', 'preparando', 'enviado'].includes(p.estado) && p.estado !== 'cancelado'),
    ['vendedor_id', 'repartidor_asignado_id', 'usuario_id', 'responsable_cobro_id']);
  if (req.query.solo_reparto === 'true') pedidos = pedidos.filter((p) => ['delivery', 'ruta'].includes(p.canal));
  return res.json({ pedidos: pedidos.map((p) => pedidoResumen(db, p)) });
});

router.get('/:id', (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  if (!require('../alcance').esMio(ruta, req, ['repartidor_id', 'usuario_id', 'creado_por'])) {
    return res.status(403).json({ error: 'Esta ruta pertenece a otro usuario. No tienes acceso.' });
  }
  const paradas = [...ruta.paradas]
    .sort((a, b) => a.orden - b.orden)
    .map((parada) => {
      const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
      return {
        ...parada,
        pedido: pedido ? pedidoResumen(db, pedido) : null,
      };
    });
  return res.json({ ruta: { ...rutaResumen(db, ruta), paradas } });
});

router.post('/', allow('distribucion', 'ventas'), (req, res) => {
  const db = load();
  const { fecha, repartidor_id, vehiculo_id, pedidos_ids, notas } = req.body || {};
  if (!fecha) return res.status(400).json({ error: 'La fecha de la ruta es obligatoria.' });
  const repartidor = db.repartidores.find((r) => r.id === Number(repartidor_id) && r.activo);
  if (!repartidor) return res.status(400).json({ error: 'Selecciona un repartidor activo.' });
  const vehiculo = db.vehiculos.find((v) => v.id === Number(vehiculo_id) && v.activo);
  if (!vehiculo) return res.status(400).json({ error: 'Selecciona un vehículo activo.' });
  const ids = Array.isArray(pedidos_ids) ? pedidos_ids.map(Number) : [];
  const ruta = {
    id: nextId(db.rutas),
    codigo: nextCode(db.rutas, 'codigo', 'RUT', 1).replace('RUT-1', 'RUT-0'),
    fecha,
    repartidor_id: repartidor.id,
    vehiculo_id: vehiculo.id,
    estado: 'programada',
    notas: notas || '',
    paradas: [],
    created_at: new Date().toISOString(),
  };
  if (!/^RUT-\d{3}$/.test(ruta.codigo)) ruta.codigo = `RUT-${String(ruta.id).padStart(3, '0')}`;
  ids.forEach((pid, index) => {
    const pedido = db.pedidos.find((p) => p.id === pid);
    if (!pedido || pedido.estado === 'cancelado' || pedido.estado === 'entregado') return;
    db.rutas.forEach((r) => { if (r.id !== ruta.id) r.paradas = r.paradas.filter((p) => p.pedido_id !== pid); });
    pedido.ruta_id = ruta.id;
    ruta.paradas.push({ pedido_id: pedido.id, orden: index + 1, estado: 'pendiente', hora_estimada: `${String(9 + index).padStart(2, '0')}:00`, notas: '' });
  });
  db.rutas.push(ruta);
  audit(db, req, 'Ruta creada', 'Distribución', `${ruta.codigo} · ${repartidor.nombre} · ${ruta.paradas.length} paradas`);
  save();
  return res.status(201).json({ ruta: rutaResumen(db, ruta) });
});

router.patch('/:id/estado', requireActividad('supervisar'), allow('distribucion'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const { estado } = req.body || {};
  const transiciones = {
    programada: ['en_camino', 'cancelada'],
    en_camino: ['completada', 'cancelada'],
    completada: [],
    cancelada: [],
  };
  if (!transiciones[ruta.estado]?.includes(estado)) return res.status(400).json({ error: `No se puede pasar de "${ruta.estado}" a "${estado}".` });
  ruta.estado = estado;
  if (estado === 'en_camino') {
    ruta.iniciada_en = new Date().toISOString();
    ruta.paradas.forEach((p) => { if (p.estado === 'pendiente') p.estado = 'pendiente'; });
    ruta.paradas.forEach((p) => {
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      if (pedido && pedido.estado === 'pendiente') pedido.estado = 'enviado';
    });
  }
  if (estado === 'completada') {
    ruta.cerrada_en = new Date().toISOString();
    ruta.paradas.forEach((p) => {
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      if (pedido && p.estado === 'entregada') pedido.estado = 'entregado';
    });
  }
  if (estado === 'cancelada') {
    ruta.paradas.forEach((p) => {
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      if (pedido) { pedido.ruta_id = null; if (pedido.estado === 'enviado') pedido.estado = 'preparando'; }
    });
  }
  audit(db, req, 'Estado de ruta actualizado', 'Distribución', `${ruta.codigo} → ${estado}`);
  save();
  return res.json({ ruta: rutaResumen(db, ruta) });
});

router.post('/:id/paradas', allow('distribucion', 'ventas'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const pedido = db.pedidos.find((p) => p.id === Number(req.body?.pedido_id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (ruta.paradas.some((p) => p.pedido_id === pedido.id)) return res.status(400).json({ error: 'El pedido ya está en esta ruta.' });
  db.rutas.forEach((r) => { if (r.id !== ruta.id) r.paradas = r.paradas.filter((p) => p.pedido_id !== pedido.id); });
  pedido.ruta_id = ruta.id;
  ruta.paradas.push({ pedido_id: pedido.id, orden: ruta.paradas.length + 1, estado: 'pendiente', hora_estimada: '—', notas: '' });
  audit(db, req, 'Parada agregada', 'Distribución', `${pedido.codigo} → ${ruta.codigo}`);
  save();
  return res.json({ ruta: rutaResumen(db, ruta) });
});

router.delete('/:id/paradas/:pedidoId', allow('distribucion'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.pedidoId));
  ruta.paradas = ruta.paradas.filter((p) => p.pedido_id !== Number(req.params.pedidoId));
  ruta.paradas.forEach((p, i) => { p.orden = i + 1; });
  if (pedido && pedido.ruta_id === ruta.id) pedido.ruta_id = null;
  audit(db, req, 'Parada retirada', 'Distribución', `${pedido?.codigo || req.params.pedidoId} ← ${ruta.codigo}`);
  save();
  return res.json({ ruta: rutaResumen(db, ruta) });
});

router.patch('/:id/paradas/:pedidoId/entrega', requireActividad('entregar'), allow('distribucion', 'ventas'), async (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const parada = ruta.paradas.find((p) => p.pedido_id === Number(req.params.pedidoId));
  if (!parada) return res.status(404).json({ error: 'Parada no encontrada.' });
  const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const b = req.body || {};
  const decision = b.decision === 'rechazada' ? 'rechazada' : 'confirmada';
  const ahora = new Date().toISOString();
  let firmaUrl = null;
  let fotoUrl = null;
  try {
    firmaUrl = await subirComprobante(b.firma, 'firma');
    fotoUrl = await subirComprobante(b.foto, 'entrega');
  } catch (error) { return res.status(400).json({ error: error.message }); }
  let cambios = [];
  try {
    cambios = ajustarPedidoEntrega(db, pedido, b.items, ruta, req);
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  if (decision === 'rechazada' && !cambios.length) {
    let dev = db.devoluciones_movil.find((d) => d.ruta_id === ruta.id && d.estado === 'pendiente');
    if (!dev) {
      dev = {
        id: nextId(db.devoluciones_movil),
        codigo: nextCode(db.devoluciones_movil, 'codigo', 'DEV', 1),
        tipo: 'distribucion', origen_tipo: 'carga', origen_id: ruta.id, ruta_id: ruta.id,
        pedido_id: pedido.id, cliente_id: pedido.cliente_id, lineas: [], notas: 'Rechazo total del pedido',
        estado: 'pendiente', usuario_id: req.user.id, fecha: ahora,
        verificado_por: null, fecha_verificacion: null, reingresado_en: null,
      };
      db.devoluciones_movil.push(dev);
    }
    (pedido.items || []).forEach((item) => {
      dev.lineas.push({ producto_id: item.producto_id, cantidad: item.cantidad, motivo: 'Rechazo total', estado: 'bueno', reacomodado: false });
      cambios.push({ producto_id: item.producto_id, tipo: 'disminuido', cantidad: item.cantidad });
    });
  }

  if (firmaUrl) parada.firma_url = firmaUrl;
  if (fotoUrl) parada.foto_url = fotoUrl;
  if (decision === 'confirmada') {
    parada.estado = 'entregada';
    parada.hora_entrega = ahora;
    parada.resultado_entrega = cambios.length ? 'parcial' : 'entregado';
    pedido.estado = 'entregado';
    pedido.fecha_entrega = ahora;
    pedido.entregado_por = req.user.id;
    if (firmaUrl) pedido.firma_url = firmaUrl;
    if (fotoUrl) pedido.foto_url = fotoUrl;
  } else {
    parada.estado = 'fallida';
    parada.resultado_entrega = 'rechazado';
    parada.motivo = b.motivo || 'otro';
    parada.detalle_motivo = b.detalle_otros || '';
    pedido.estado = 'preparando';
  }
  parada.motivo = decision === 'rechazada' ? (b.motivo || 'otro') : null;
  parada.detalle_motivo = decision === 'rechazada' ? (b.detalle_otros || '') : null;

  db.visitas.unshift({
    id: nextId(db.visitas), cliente_id: pedido.cliente_id, tipo: 'distribucion', modulo: 'Distribución',
    latitud: b.latitud ?? null, longitud: b.longitud ?? null, precision: b.precision ?? null,
    estado: decision === 'confirmada' ? 'completada' : 'cancelada',
    resultado_entrega: parada.resultado_entrega,
    motivo: parada.motivo,
    productos_devueltos: cambios.filter((c) => c.tipo === 'disminuido'),
    ruta_venta: pedido.ruta_venta || null,
    dia_visita: db.clientes.find((c) => c.id === pedido.cliente_id)?.dia_visita || null,
    distribuidor_id: ruta.repartidor_id,
    pedido_id: pedido.id, ruta_id: ruta.id, usuario_id: req.user.id,
    firma_url: firmaUrl, foto_url: fotoUrl,
    notas: `${ruta.codigo} · ${pedido.codigo} → ${decision}${parada.motivo ? ` · ${parada.motivo}: ${parada.detalle_motivo || ''}` : ''}${cambios.length ? ` · ${cambios.map((c) => `${c.tipo} ${c.cantidad} uds.`).join(', ')}` : ''}`,
    fecha: ahora, created_at: ahora,
  });
  audit(db, req, decision === 'confirmada' ? 'Entrega confirmada' : 'Entrega rechazada', 'Distribución', `${ruta.codigo} · ${pedido.codigo} · ${parada.resultado_entrega}`);
  save();
  return res.json({ ruta: rutaResumen(db, ruta), pedido, parada, cambios, decision });
});

router.patch('/:id/paradas/:pedidoId', allow('distribucion'), async (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const parada = ruta.paradas.find((p) => p.pedido_id === Number(req.params.pedidoId));
  if (!parada) return res.status(404).json({ error: 'Parada no encontrada.' });
  const { estado, notas, hora_estimada, latitud, longitud, precision, resultado_entrega, productos_devueltos, motivo, firma, foto } = req.body || {};
  let firmaUrl = null;
  let fotoUrl = null;
  try {
    firmaUrl = await subirComprobante(firma, 'firma');
    fotoUrl = await subirComprobante(foto, 'entrega');
  } catch (error) { return res.status(400).json({ error: error.message }); }
  if (firmaUrl) parada.firma_url = firmaUrl;
  if (fotoUrl) parada.foto_url = fotoUrl;
  if (estado && ['pendiente', 'en_camino', 'entregada', 'fallida'].includes(estado)) parada.estado = estado;
  if (notas !== undefined) parada.notas = notas;
  if (hora_estimada !== undefined) parada.hora_estimada = hora_estimada;
  if (estado === 'entregada') parada.hora_entrega = new Date().toISOString();
  const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
  let descontados = [];
  if (pedido && estado === 'entregada') {
    descontados = aplicarDevoluciones(pedido, productos_devueltos);
    parada.resultado_entrega = resultado_entrega || (descontados.length ? 'parcial' : 'entregado');
    parada.productos_devueltos = descontados;
    parada.motivo = motivo || null;
  }
  if (pedido && estado === 'fallida') {
    parada.resultado_entrega = resultado_entrega || 'cerrado';
    parada.motivo = motivo || 'cerrado';
  }
  if (pedido) {
    if (estado === 'entregada') {
      pedido.estado = 'entregado';
      pedido.fecha_entrega = parada.hora_entrega || new Date().toISOString();
      pedido.entregado_por = req.user.id;
    }
    if (estado === 'en_camino' && ['pendiente', 'preparando'].includes(pedido.estado)) pedido.estado = 'enviado';
    if (estado === 'fallida') { pedido.estado = 'preparando'; pedido.ruta_id = null; }
    if (firmaUrl) pedido.firma_url = firmaUrl;
    if (fotoUrl) pedido.foto_url = fotoUrl;
    pedido.updated_at = new Date().toISOString();
  }
  const cliente = db.clientes.find((c) => c.id === pedido?.cliente_id);
  if (esCoordenaValida(latitud, longitud)) {
    db.visitas.unshift({
      id: nextId(db.visitas),
      cliente_id: cliente?.id || null,
      tipo: 'distribucion',
      modulo: 'Distribución',
      latitud: Number(latitud),
      longitud: Number(longitud),
      precision: Number(precision) || null,
      estado: estado === 'entregada' ? 'completada' : estado === 'fallida' ? 'cancelada' : 'en_curso',
      resultado: 'distribucion',
      resultado_entrega: parada.resultado_entrega || null,
      motivo: parada.motivo || null,
      productos_devueltos: descontados,
      ruta_venta: pedido?.ruta_venta || null,
      dia_visita: cliente?.dia_visita || null,
      distribuidor_id: ruta.repartidor_id,
      pedido_id: pedido?.id || null,
      ruta_id: ruta.id,
      usuario_id: req.user.id,
      firma_url: firmaUrl,
      foto_url: fotoUrl,
      notas: `${ruta.codigo} · ${pedido?.codigo || ''} → ${parada.resultado_entrega || estado}${descontados.length ? ` · devuelto: ${descontados.map((d) => `${d.cantidad} ${d.nombre}`).join(', ')}` : ''}`,
      fecha: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  }
  const productosDevueltos = estado === 'fallida'
    ? (pedido?.items || []).map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad, motivo: 'Entrega no exitosa' }))
    : descontados.map((d) => ({ producto_id: d.producto_id, cantidad: d.cantidad, motivo: 'Entrega parcial' }));
  if (productosDevueltos.length) {
    db.devoluciones_movil.push({
      id: nextId(db.devoluciones_movil),
      codigo: nextCode(db.devoluciones_movil, 'codigo', 'DEV', 1),
      tipo: 'distribucion',
      origen_tipo: 'carga',
      origen_id: ruta.id,
      ruta_id: ruta.id,
      pedido_id: pedido?.id || null,
      cliente_id: pedido?.cliente_id || null,
      lineas: productosDevueltos.map((d) => ({ producto_id: d.producto_id, cantidad: d.cantidad, motivo: d.motivo, estado: 'bueno', reacomodado: false })),
      notas: `Devolución automática ${ruta.codigo} · ${pedido?.codigo || ''} · ${parada.resultado_entrega || estado}`,
      estado: 'pendiente',
      usuario_id: req.user.id,
      fecha: new Date().toISOString(),
      verificado_por: null,
      fecha_verificacion: null,
      reingresado_en: null,
    });
  }
  audit(db, req, 'Parada actualizada', 'Distribución', `${ruta.codigo} · ${pedido?.codigo || ''} → ${parada.resultado_entrega || estado}`);
  save();
  return res.json({ ruta: { ...rutaResumen(db, ruta), paradas: ruta.paradas } });
});

router.post('/:id/reordenar', allow('distribucion'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const orden = Array.isArray(req.body?.orden) ? req.body.orden.map(Number) : [];
  if (orden.length !== ruta.paradas.length) return res.status(400).json({ error: 'El orden debe incluir todas las paradas.' });
  const nuevas = orden.map((pedidoId, index) => {
    const parada = ruta.paradas.find((p) => p.pedido_id === pedidoId);
    return parada ? { ...parada, orden: index + 1 } : null;
  }).filter(Boolean);
  ruta.paradas = nuevas;
  audit(db, req, 'Ruta reordenada', 'Distribución', ruta.codigo);
  save();
  return res.json({ ruta: rutaResumen(db, ruta) });
});

router.delete('/:id', requirePermiso('rutas_eliminar'), allow(), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  if (ruta.estado === 'en_camino') return res.status(400).json({ error: 'No puedes eliminar una ruta en camino.' });
  ruta.paradas.forEach((p) => {
    const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
    if (pedido && pedido.ruta_id === ruta.id) { pedido.ruta_id = null; if (pedido.estado === 'enviado') pedido.estado = 'preparando'; }
  });
  db.rutas = db.rutas.filter((r) => r.id !== ruta.id);
  audit(db, req, 'Ruta eliminada', 'Distribución', ruta.codigo);
  save();
  return res.json({ ok: true });
});

// Optimización por distancia (nearest-neighbor) y ETA con velocidad configurable.
router.post('/:id/optimizar', allow('admin', 'dueno', 'supervisor', 'distribucion'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  if (!ruta.paradas?.length) return res.status(400).json({ error: 'La ruta no tiene paradas.' });
  const puntos = ruta.paradas.map((parada) => {
    const pedido = db.pedidos.find((p) => p.id === parada.pedido_id);
    const cliente = db.clientes.find((c) => c.id === pedido?.cliente_id);
    return { parada, latitud: cliente?.latitud ?? null, longitud: cliente?.longitud ?? null };
  });
  const conCoords = puntos.filter((p) => esCoordenaValida(p.latitud, p.longitud));
  if (!conCoords.length) return res.status(400).json({ error: 'Ninguna parada tiene coordenadas válidas.' });
  const velocidad = Math.max(5, Number(db.configuracion?.rutas?.velocidad_kmh) || 25);
  const servicio = Math.max(0, Number(db.configuracion?.rutas?.minutos_por_parada) || 8);
  const [horaInicio, minutoInicio] = String(db.configuracion?.rutas?.hora_inicio || '09:00').split(':').map(Number);
  const inicioMinutos = (horaInicio || 9) * 60 + (minutoInicio || 0);

  // Se empieza por la primera parada pendiente con coordenadas y se sigue
  // con la más cercana; las paradas sin coordenadas quedan al final.
  const pendientes = conCoords.filter((p) => p.parada.estado !== 'entregada');
  const entregadas = conCoords.filter((p) => p.parada.estado === 'entregada');
  const sinCoords = puntos.filter((p) => !conCoords.includes(p));
  const ordenadas = [];
  let actual = pendientes.shift() || entregadas.shift();
  while (actual) {
    ordenadas.push(actual);
    if (!pendientes.length) break;
    let mejor = 0;
    let menor = Infinity;
    pendientes.forEach((p, i) => {
      const d = distanciaKm(actual, p);
      if (d < menor) { menor = d; mejor = i; }
    });
    actual = pendientes.splice(mejor, 1)[0];
  }
  const todas = [...ordenadas, ...pendientes, ...entregadas, ...sinCoords];
  let minutos = inicioMinutos;
  ruta.paradas = todas.map((punto, index) => {
    const anterior = index ? todas[index - 1] : null;
    const distkm = anterior ? distanciaKm(anterior, punto) : 0;
    const minutosViaje = Math.round((distanciaKm(anterior || punto, punto) / velocidad) * 60);
    minutos += minutosViaje + servicio;
    const hh = String(Math.floor(minutos / 60) % 24).padStart(2, '0');
    const mm = String(minutos % 60).padStart(2, '0');
    return {
      ...punto.parada,
      orden: index + 1,
      distancia_km_desde_anterior: round2(distkm),
      minutos_estimados: minutosViaje + servicio,
      hora_estimada: `${hh}:${mm}`,
    };
  });
  ruta.optimizada_en = new Date().toISOString();
  audit(db, req, 'Ruta optimizada por distancia', 'Distribución', `${ruta.codigo} · ${distanciaAcumulada(todas)} km`);
  save();
  return res.json({ ruta: rutaResumen(db, ruta), optimizada: true, velocidad_kmh: velocidad });
});

router.get('/:id/tracking', (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  return res.json({
    ruta_id: ruta.id,
    codigo: ruta.codigo,
    estado: ruta.estado,
    en_vivo: ruta.estado === 'en_camino',
    ultima_posicion: ruta.ultima_posicion || null,
    iniciada_en: ruta.iniciada_en || null,
    rastreo: (ruta.rastreo || []).slice(-100),
  });
});

router.patch('/:id/tracking', allow('distribucion', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const ruta = db.rutas.find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
  const { latitud, longitud, precision } = req.body || {};
  if (!esCoordenaValida(latitud, longitud)) return res.status(400).json({ error: 'Coordenadas inválidas.' });
  const punto = {
    latitud: Number(latitud), longitud: Number(longitud),
    precision: Number(precision) || null, fecha: new Date().toISOString(),
  };
  ruta.ultima_posicion = punto;
  if (!Array.isArray(ruta.rastreo)) ruta.rastreo = [];
  ruta.rastreo.push(punto);
  if (ruta.rastreo.length > 200) ruta.rastreo = ruta.rastreo.slice(-200);
  save();
  return res.json({ ok: true, ...punto });
});

module.exports = router;
