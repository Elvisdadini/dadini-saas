const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, nextCode, audit, num, round2, hoy, addDaysISO } = require('../utils');
const { pedidoResumen, recalcularCliente, buscarPedidos, stockEn } = require('../services');
const { config: configCredito, vencimientoDe, diasCredito, normalizarConfig, interesDe } = require('../credito');
const { esCoordenaValida, validarGeocerca } = require('../geo');
const { subirFoto } = require('../fotos');
const { calcularImpuestos, normativaVigente } = require('../fiscal-normativa');
const cajaModule = require('./caja');
const kardex = require('../kardex');
const { evaluar: evaluarPromociones } = require('../promociones');
const { buildIndices, porId } = require('../indexes');

const router = express.Router();
router.use(authRequired);

const CANALES = ['mostrador', 'delivery', 'ruta', 'whatsapp'];
const FORMAS = ['efectivo', 'qr', 'transferencia', 'credito'];

function precioParaCliente(db, producto, cliente) {
  const categoria = db.cliente_categorias?.find((c) => c.id === cliente?.categoria_cliente_id && c.activa);
  if (!categoria) return producto.precio;
  const especial = (categoria.precios || []).find((p) => p.producto_id === producto.id);
  if (especial && Number(especial.precio) > 0) return round2(Number(especial.precio));
  return round2(Math.max(0, producto.precio * (1 - num(categoria.descuento_porcentaje) / 100) - num(categoria.descuento_fijo)));
}

function setStock(db, productoId, almacenId, cantidad) {
  let row = db.stock.find((s) => s.producto_id === productoId && s.almacen_id === almacenId);
  if (!row) {
    row = { id: nextId(db.stock), producto_id: productoId, almacen_id: almacenId, cantidad: 0 };
    db.stock.push(row);
  }
  row.cantidad = Math.max(0, Math.round(cantidad));
}

router.get('/', (req, res) => {
  const db = load();
  const pedidos = buscarPedidos(db, req.query);
  const counts = {
    todos: db.pedidos.length,
    pendiente: db.pedidos.filter((p) => p.estado === 'pendiente').length,
    preparando: db.pedidos.filter((p) => p.estado === 'preparando').length,
    enviado: db.pedidos.filter((p) => p.estado === 'enviado').length,
    entregado: db.pedidos.filter((p) => p.estado === 'entregado').length,
    cancelado: db.pedidos.filter((p) => p.estado === 'cancelado').length,
    por_cobrar: db.pedidos.filter((p) => p.saldo > 0 && p.estado !== 'cancelado').length,
  };
  return res.json({ pedidos, counts });
});

router.get('/programados', (req, res) => {
  const db = load();
  const { fecha, ruta_venta, forma_pago, estado, distribuidor_id, cliente_id } = req.query;
  const fechaObjetivo = fecha || addDaysISO(new Date(), 1);
  let pedidos = db.pedidos.filter((p) => p.es_preventa && p.estado !== 'cancelado' && p.fecha_entrega_programada === fechaObjetivo);
  if (ruta_venta && ruta_venta !== 'todas') pedidos = pedidos.filter((p) => p.ruta_venta === ruta_venta);
  if (forma_pago && forma_pago !== 'todos') pedidos = pedidos.filter((p) => p.forma_pago === forma_pago);
  if (estado && estado !== 'todos') pedidos = pedidos.filter((p) => p.estado === estado);
  if (distribuidor_id) pedidos = pedidos.filter((p) => p.repartidor_asignado_id === Number(distribuidor_id));
  if (cliente_id) pedidos = pedidos.filter((p) => p.cliente_id === Number(cliente_id));
  const resumen = {
    pedidos: pedidos.length,
    unidades: pedidos.reduce((s, p) => s + (p.items || []).reduce((x, i) => x + i.cantidad, 0), 0),
    contado: pedidos.filter((p) => p.forma_pago !== 'credito').length,
    credito: pedidos.filter((p) => p.forma_pago === 'credito').length,
    monto: round2(pedidos.reduce((s, p) => s + p.total, 0)),
  };
  return res.json({
    fecha: fechaObjetivo,
    pedidos: pedidos.map((p) => pedidoResumen(db, p)),
    resumen,
  });
});

router.get('/:id', (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  return res.json({ pedido: pedidoResumen(db, pedido, true), configuracion: db.configuracion.empresa });
});

router.post('/', requirePermiso('ventas.crear'), allow('ventas', 'preventista', 'vendedor_camion'), (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const indices = buildIndices(db);
  const { cliente_id, items, canal, forma_pago, almacen_id, descuento, envio, notas, entrega_direccion, vendedor_id, dias_credito: diasSolicitados, latitud, longitud, precision, almacen_movil_id, whatsapp_cliente } = req.body || {};
  const cliente = indices.clientes.get(Number(cliente_id));
  if (!cliente) return res.status(400).json({ error: 'Selecciona un cliente válido.' });
  if (cliente.bloqueado_por_deuda || !cliente.activo) return res.status(403).json({ error: `Cliente bloqueado: ${cliente.motivo_bloqueo || 'cuenta pendiente con la empresa'}. Regulariza la deuda para venderle.` });
  const geocerca = validarGeocerca(db, req, cliente, req.body || {}, 'registrar la venta');
  if (geocerca.aplica && !geocerca.dentro) return res.status(403).json({ error: geocerca.motivo, geocerca });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Agrega al menos un producto a la venta.' });
  if (!CANALES.includes(canal)) return res.status(400).json({ error: 'Canal de venta inválido.' });
  if (!FORMAS.includes(forma_pago)) return res.status(400).json({ error: 'Forma de pago inválida.' });
  const almacen = indices.almacenes.get(Number(almacen_id));
  if (almacen && !almacen.activo) return res.status(400).json({ error: 'Selecciona un almacén válido.' });
  if (!almacen) return res.status(400).json({ error: 'Selecciona un almacén válido.' });
  const almacenMovil = almacen_movil_id ? db.almacenes_moviles?.find((a) => a.id === Number(almacen_movil_id) && a.estado === 'activo') : null;
  if (almacen_movil_id && !almacenMovil) return res.status(400).json({ error: 'El almacén móvil seleccionado no está activo.' });

  const consolidado = new Map();
  for (const raw of items) {
    const producto = indices.productos.get(Number(raw.producto_id));
    const cantidad = Math.round(num(raw.cantidad));
    if (!producto || !producto.activo || cantidad <= 0) return res.status(400).json({ error: 'Hay un producto o cantidad inválida en el carrito.' });
    const permitido = !producto.categorias_clientes?.length || producto.categorias_clientes.map(Number).includes(Number(cliente.categoria_cliente_id));
    if (!permitido) return res.status(400).json({ error: `El producto ${producto.nombre} no está disponible para la categoría del cliente.` });
    const prev = consolidado.get(producto.id) || { producto, cantidad: 0, precio: null };
    prev.cantidad += cantidad;
    // El precio SIEMPRE lo calcula el servidor: Ignoramos cualquier `precio`
    // enviado por el cliente para evitar manipulación de montos.
    if (!prev.precio) prev.precio = precioParaCliente(db, producto, cliente);
    consolidado.set(producto.id, prev);
  }

  const evaluacion = evaluarPromociones(
    db,
    [...consolidado.values()].map((v) => ({ producto_id: v.producto.id, cantidad: v.cantidad, precio: v.precio || v.producto.precio })),
    almacen.id,
    new Date().toISOString().slice(0, 10),
    cliente.categoria_cliente_id || null,
    () => {
      const hoyStock = new Date().toISOString().slice(0, 10);
      return (productoId) => kardex.lotesDe(db, productoId, almacen.id, almacenMovil?.id || null)
        .filter((l) => Number(l.cantidad) > 0 && (!l.fecha_vencimiento || l.fecha_vencimiento >= hoyStock))
        .reduce((s, l) => s + Number(l.cantidad), 0);
    },
  );
  if (evaluacion.insuficientes.length) {
    const falta = evaluacion.insuficientes[0];
    return res.status(400).json({ error: `Stock insuficiente de ${falta.nombre} en ${almacen.nombre}. Disponible: ${falta.disponible}, requerido: ${falta.requerido} (incluye bonificaciones).` });
  }

  const lineas = evaluacion.lineas.map((l) => ({
    producto_id: l.producto_id,
    nombre: l.nombre,
    emoji: l.emoji,
    cantidad: l.cantidad,
    precio: l.precio,
    costo_unitario: l.costo_unitario,
    descuento: l.descuento,
    subtotal: l.subtotal_final,
  }));
  evaluacion.bonificaciones.forEach((b) => {
    lineas.push({
      producto_id: b.producto_id,
      nombre: b.nombre,
      emoji: b.emoji,
      cantidad: b.cantidad,
      precio: 0,
      costo_unitario: b.costo_unitario,
      descuento: 0,
      subtotal: 0,
      bonificacion: true,
      promocion_id: b.promocion_id,
      promocion_codigo: b.promocion_codigo,
      motivo: b.motivo,
    });
  });

  const subtotal = round2(lineas.reduce((s, l) => s + l.subtotal, 0));
  const desc = Math.min(subtotal, round2(num(descuento)));
  const costoEnvio = envio !== undefined ? round2(num(envio)) : canal === 'delivery' ? num(db.configuracion.empresa.tarifa_envio, 0) : 0;
  const total = round2(subtotal - desc + costoEnvio);

  if (forma_pago === 'credito') {
    if (!cliente.limite_credito) return res.status(400).json({ error: 'El cliente no tiene crédito habilitado.' });
    if (cliente.saldo + total > cliente.limite_credito) {
      return res.status(400).json({ error: `El cliente supera su límite de crédito (Bs ${cliente.limite_credito}). Saldo actual: Bs ${cliente.saldo}.` });
    }
  }

  const ahora = new Date().toISOString();
  const diasCreditoVenta = forma_pago === 'credito'
    ? Math.max(1, Math.round(num(diasSolicitados) || diasCredito(db, {})))
    : null;
  // Un vendedor común no puede imputar la venta a otro usuario: solo roles
  // directivos pueden elegir vendedor explícitamente.
  const puedeAsignarVendedor = ['admin', 'dueno'].includes(req.user.rol);
  let vendedorAsignado = req.user.id;
  if (vendedor_id && Number(vendedor_id) !== req.user.id) {
    if (!puedeAsignarVendedor) return res.status(403).json({ error: 'No tienes permiso para asignar la venta a otro vendedor.' });
    const destino = indices.usuarios.get(Number(vendedor_id));
    if (!destino || !destino.activo) return res.status(400).json({ error: 'El vendedor seleccionado no es válido.' });
    vendedorAsignado = destino.id;
  }

  const pedido = {
    id: nextId(db.pedidos),
    codigo: nextCode(db.pedidos, 'codigo', 'VTA', 1001),
    cliente_id: cliente.id,
    whatsapp_cliente: String(whatsapp_cliente || '').replace(/\D/g, '') || cliente.whatsapp || cliente.telefono || null,
    vendedor_id: vendedorAsignado,
    canal,
    estado: 'pendiente',
    estado_pago: forma_pago === 'credito' ? 'pendiente' : 'pagado',
    forma_pago,
    dias_credito: diasCreditoVenta,
    interes_pagado: 0,
    almacen_id: almacen.id,
    almacen_movil_id: almacenMovil?.id || null,
    es_venta_directa: Boolean(almacenMovil),
    categoria_cliente_id: cliente.categoria_cliente_id || null,
    subtotal,
    descuento: desc,
    descuento_promociones: evaluacion.descuento_total,
    promociones_aplicadas: evaluacion.aplicadas,
    bonificaciones: evaluacion.bonificaciones,
    envio: costoEnvio,
    total,
    pagado: forma_pago === 'credito' ? 0 : total,
    saldo: forma_pago === 'credito' ? total : 0,
    items: lineas,
    notas: notas || '',
    entrega_direccion: entrega_direccion || cliente.direccion,
    created_at: ahora,
    updated_at: ahora,
    ruta_id: null,
  };
  if (diasCreditoVenta) pedido.fecha_vencimiento = vencimientoDe(db, pedido);
  const vendedor = indices.usuarios.get(Number(pedido.vendedor_id));
  const esPreventa = vendedor?.rol === 'preventista' || req.body?.prevenir === true;
  if (esPreventa) {
    pedido.es_preventa = true;
    pedido.ruta_venta = vendedor?.ruta_venta || null;
    pedido.repartidor_asignado_id = vendedor?.repartidor_id || cliente?.distribuidor_id || null;
    pedido.fecha_entrega_programada = addDaysISO(new Date(), 1);
    pedido.estado = 'preparando';
    if (pedido.repartidor_asignado_id) {
      let ruta = db.rutas.find((r) => r.fecha === pedido.fecha_entrega_programada && r.repartidor_id === pedido.repartidor_asignado_id && r.estado !== 'cancelada');
      if (!ruta) {
        ruta = {
          id: nextId(db.rutas),
          codigo: nextCode(db.rutas, 'codigo', 'RUT', 1),
          fecha: pedido.fecha_entrega_programada,
          repartidor_id: pedido.repartidor_asignado_id,
          vehiculo_id: vendedor?.vehiculo_id || null,
          estado: 'programada',
          notas: `Programación automática de preventa ${pedido.ruta_venta || ''}`,
          paradas: [],
          created_at: ahora,
        };
        db.rutas.push(ruta);
      }
      ruta.paradas.push({ pedido_id: pedido.id, orden: ruta.paradas.length + 1, estado: 'pendiente', hora_estimada: '09:00', notas: '' });
      pedido.ruta_id = ruta.id;
    }
  }
  if (whatsapp_cliente) {
    const telefono = String(whatsapp_cliente).replace(/\D/g, '');
    if (telefono) cliente.whatsapp = telefono;
  }
  // Factura conforme al régimen fiscal vigente a la fecha de la venta.
  const fiscal = db.configuracion.fiscal || {};
  if (fiscal.facturacion_activa !== false) {
    const reglas = fiscal.normativa?.reglas || [];
    const hoyFactura = ahora.slice(0, 10);
    const vigentes = normativaVigente(reglas, hoyFactura);
    const impuestos = calcularImpuestos(reglas, total, hoyFactura);
    const dosificacion = fiscal.dosificacion || {};
    const correlativo = Math.max(Number(dosificacion.ultimo_numero) || 0, Number(dosificacion.numero_inicial) || 1) + 1;
    dosificacion.ultimo_numero = correlativo;
    fiscal.dosificacion = dosificacion;
    const clienteFactura = db.clientes.find((c) => c.id === cliente.id);
    const requiereDatos = vigentes.some((r) => r.id === 'rnd-102100000011-comprador-1000') && total > 1000;
    pedido.factura = {
      numero: `${String(fiscal.sucursal || 'MATRIZ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-_]+/g, '-') || 'matriz'}-${fiscal.punto_venta || '0'}-${String(correlativo).padStart(6, '0')}`,
      correlativo,
      fecha: hoyFactura,
      nit: fiscal.nit || '',
      razon_social: fiscal.razon_social || db.configuracion?.empresa?.nombre || 'DADINI',
      actividad: fiscal.actividad || '',
      modalidad: fiscal.modalidad || 'computarizada_sfv',
      autorizacion: fiscal.autorizacion || '',
      codigo_control: fiscal.codigo_control || '',
      comprador: requiereDatos
        ? { nombre: cliente.nombre, nit: clienteFactura?.nit || clienteFactura?.telefono || '0' }
        : { nombre: 'S/N', nit: '0' },
      items: lineas.map((l) => ({ nombre: l.nombre, cantidad: l.cantidad, precio: l.precio, subtotal: l.subtotal })),
      subtotal: impuestos.neto,
      iva: impuestos.iva,
      iva_porcentaje: impuestos.iva_porcentaje,
      metodo_iva: impuestos.metodo,
      it: impuestos.it,
      it_porcentaje: impuestos.it_porcentaje,
      total: impuestos.total,
      normativa_version: fiscal.normativa?.version || null,
      normas_aplicadas: vigentes.filter((r) => ['iva', 'it', 'requisito_factura'].includes(r.tipo)).map((r) => r.id),
      estado: 'vigente',
      pdf_url: null,
    };
  }
  db.pedidos.push(pedido);

  let errorStock = null;
  lineas.forEach((l) => {
    if (errorStock) return;
    try {
      const consumo = kardex.consumir(db, {
        producto_id: l.producto_id, almacen_id: almacen.id,
        almacen_movil_id: almacenMovil?.id || null,
        cantidad: l.cantidad,
        motivo: almacenMovil ? 'Venta directa almacén móvil' : 'Venta',
        referencia: pedido.codigo, usuario_id: req.user.id, fecha: ahora,
        almacen_nombre: almacenMovil?.nombre || almacen.nombre,
      });
      l.lotes = consumo.lotes;
      if (almacenMovil) almacenMovil.updated_at = ahora;
    } catch (error) {
      errorStock = error.message;
      return;
    }
    db.movimientos.unshift({
      id: nextId(db.movimientos),
      producto_id: l.producto_id,
      almacen_id: almacenMovil ? null : almacen.id,
      tipo: 'salida',
      cantidad: l.cantidad,
      motivo: almacenMovil ? 'Venta directa almacén móvil' : 'Venta',
      referencia: pedido.codigo,
      usuario_id: req.user.id,
      fecha: ahora,
    });
  });

  if (errorStock) {
    db.pedidos = db.pedidos.filter((p) => p.id !== pedido.id);
    return res.status(400).json({ error: errorStock });
  }

  if (forma_pago !== 'credito') {
    db.pagos.unshift({
      id: nextId(db.pagos),
      codigo: nextCode(db.pagos, 'codigo', 'REC', 5001),
      pedido_id: pedido.id,
      cliente_id: cliente.id,
      monto: total,
      metodo: forma_pago,
      fecha: ahora,
      usuario_id: req.user.id,
      nota: 'Pago registrado al crear la venta',
    });
    try {
      const caja = cajaModule.asegurarCaja(db, req);
      cajaModule.registrarMovimiento(db, req, {
        caja, tipo: 'ingreso', monto: total, motivo: `Venta ${pedido.codigo} · ${forma_pago}`,
        referencia: pedido.codigo, pedido_id: pedido.id,
      });
    } catch (error) { console.error('[caja] no se pudo registrar la venta:', error.message); }
  }

  if (esCoordenaValida(latitud, longitud)) {
    db.visitas.unshift({
      id: nextId(db.visitas),
      cliente_id: cliente.id,
      tipo: 'venta',
      modulo: 'Ventas',
      latitud: Number(latitud),
      longitud: Number(longitud),
      precision: Number(precision) || null,
      estado: 'completada',
      pedido_id: pedido.id,
      ruta_id: null,
      usuario_id: req.user.id,
      notas: `Visita al registrar la venta ${pedido.codigo}`,
      fecha: ahora,
      created_at: ahora,
    });
  }
  recalcularCliente(db, cliente.id);
  audit(db, req, 'Venta registrada', 'Ventas', `${pedido.codigo} · ${cliente.nombre} · Bs ${total.toFixed(2)}${evaluacion.aplicadas.length ? ` · Promos: ${evaluacion.aplicadas.map((p) => p.codigo).join(', ')}` : ''}`);
  save();
  return res.status(201).json({ pedido: pedidoResumen(db, pedido, true, indices) });
});

router.patch('/:id/estado', allow('ventas', 'preventista', 'distribucion'), async (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const { estado, firma, foto } = req.body || {};
  let firmaUrl = null;
  let fotoUrl = null;
  if (typeof firma === 'string' && firma.startsWith('data:image/')) {
    try { firmaUrl = (await subirFoto(firma, 'firma')).url; }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  if (typeof foto === 'string' && foto.startsWith('data:image/')) {
    try { fotoUrl = (await subirFoto(foto, 'entrega')).url; }
    catch (error) { return res.status(400).json({ error: error.message }); }
  }
  const transiciones = {
    pendiente: ['preparando', 'cancelado'],
    preparando: ['enviado', 'cancelado'],
    enviado: ['entregado', 'cancelado'],
    entregado: [],
    cancelado: [],
  };
  if (!transiciones[pedido.estado]?.includes(estado)) {
    return res.status(400).json({ error: `No se puede pasar de "${pedido.estado}" a "${estado}".` });
  }
  if (estado === 'cancelado') {
    if (!['admin', 'dueno'].includes(req.user.rol) && !(req.user.permisos || []).includes('pedidos_editar')) {
      return res.status(403).json({ error: 'Solo supervisión o administración puede cancelar pedidos.' });
    }
    pedido.items.forEach((l) => {
      const movil = pedido.almacen_movil_id ? db.almacenes_moviles?.find((a) => a.id === pedido.almacen_movil_id) : null;
      const lotesGuardados = Array.isArray(l.lotes) && l.lotes.length ? l.lotes : [null];
      lotesGuardados.forEach((lote) => {
        kardex.registrarEntrada(db, {
          producto_id: l.producto_id, almacen_id: pedido.almacen_id,
          almacen_movil_id: movil?.id || null,
          cantidad: lote ? lote.cantidad : l.cantidad,
          lote: lote?.lote, fecha_vencimiento: lote?.fecha_vencimiento,
          motivo: movil ? 'Anulación venta directa' : 'Anulación de venta',
          referencia: pedido.codigo, usuario_id: req.user.id,
        });
      });
      db.movimientos.unshift({
        id: nextId(db.movimientos),
        producto_id: l.producto_id,
        almacen_id: movil ? null : pedido.almacen_id,
        tipo: 'entrada',
        cantidad: l.cantidad,
        motivo: movil ? 'Anulación venta directa' : 'Anulación de venta',
        referencia: pedido.codigo,
        usuario_id: req.user.id,
        fecha: new Date().toISOString(),
      });
    });
    pedido.saldo = 0;
    pedido.estado_pago = 'anulado';
    const ruta = db.rutas.find((r) => r.id === pedido.ruta_id);
    if (ruta) ruta.paradas = ruta.paradas.filter((p) => p.pedido_id !== pedido.id);
    pedido.ruta_id = null;
  }
  pedido.estado = estado;
  pedido.updated_at = new Date().toISOString();
  if (estado === 'entregado') {
    const ruta = db.rutas.find((r) => r.id === pedido.ruta_id);
    const parada = ruta?.paradas.find((p) => p.pedido_id === pedido.id);
    if (parada) {
      parada.estado = 'entregada';
      parada.hora_entrega = new Date().toISOString();
      if (firmaUrl) parada.firma_url = firmaUrl;
      if (fotoUrl) parada.foto_url = fotoUrl;
    }
    pedido.fecha_entrega = new Date().toISOString();
    pedido.entregado_por = req.user.id;
    if (firmaUrl) pedido.firma_url = firmaUrl;
    if (fotoUrl) pedido.foto_url = fotoUrl;
  }
  recalcularCliente(db, pedido.cliente_id);
  audit(db, req, 'Estado de pedido actualizado', 'Ventas', `${pedido.codigo} → ${estado}`);
  save();
  return res.json({ pedido: pedidoResumen(db, pedido, true) });
});

router.post('/:id/pagos', requirePermiso('cobranzas.registrar', 'ventas.registrar_cobranza'), allow('ventas', 'preventista', 'cobranzas'), (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (pedido.estado === 'cancelado') return res.status(400).json({ error: 'No se puede cobrar un pedido anulado.' });
  const cobroInfo = pedidoResumen(db, pedido);
  if (req.user.rol === 'cobranzas' && !cobroInfo.en_mora) {
    return res.status(403).json({ error: 'Esta cuenta aún no está en mora. El vendedor correspondiente es responsable del cobro.' });
  }
  if (['ventas', 'preventista'].includes(req.user.rol) && (pedido.vendedor_id !== req.user.id || cobroInfo.en_mora)) {
    return res.status(403).json({ error: 'Esta cuenta ya pasó a Cobranzas o no te corresponde. Solo cobras tus créditos al día.' });
  }
  const credito = interesDe(db, pedido);
  if (pedido.saldo <= 0 && credito.pendiente <= 0) return res.status(400).json({ error: 'Este pedido ya está pagado.' });
  const monto = round2(num(req.body?.monto));
  if (monto <= 0) return res.status(400).json({ error: 'Ingresa un monto mayor a cero.' });
  const maximo = round2(pedido.saldo + credito.pendiente);
  if (monto > maximo + 0.01) return res.status(400).json({ error: `El monto supera lo pendiente (Bs ${maximo.toFixed(2)}, incluye Bs ${credito.pendiente.toFixed(2)} de intereses).` });

  const aInteres = round2(Math.min(monto, credito.pendiente));
  const aCapital = round2(Math.max(0, monto - aInteres));
  const restanteInteres = round2(Math.max(0, credito.pendiente - aInteres));
  const metodo = req.body?.metodo || 'efectivo';
  const clienteCobro = db.clientes.find((c) => c.id === pedido.cliente_id);
  const geocercaCobro = validarGeocerca(db, req, clienteCobro, req.body || {}, 'registrar la cobranza');
  if (geocercaCobro.aplica && !geocercaCobro.dentro) {
    return res.status(403).json({ error: geocercaCobro.motivo, geocerca: geocercaCobro });
  }
  const conCuenta = Boolean(clienteCobro?.saldo > 0 || clienteCobro?.bloqueado_por_deuda || clienteCobro?.limite_credito > 0);
  const numeroComprobante = String(req.body?.numero_comprobante || '').trim();
  if ((metodo !== 'efectivo' || conCuenta) && !numeroComprobante) {
    return res.status(400).json({ error: 'Este pago requiere número de comprobante o factura.' });
  }
  const ahora = new Date().toISOString();
  const detalle = aInteres > 0 ? ` · Interés Bs ${aInteres.toFixed(2)} · Capital Bs ${aCapital.toFixed(2)}` : '';
  const pago = {
    id: nextId(db.pagos),
    codigo: nextCode(db.pagos, 'codigo', 'REC', 5001),
    pedido_id: pedido.id,
    cliente_id: pedido.cliente_id,
    monto,
    interes: aInteres,
    capital: aCapital,
    metodo,
    fecha: ahora,
    usuario_id: req.user.id,
    numero_comprobante: numeroComprobante || null,
    tipo_comprobante: ['factura', 'boleta', 'recibo', 'transferencia'].includes(req.body?.tipo_comprobante) ? req.body.tipo_comprobante : 'recibo',
    nota: `${req.body?.nota || 'Cobro registrado'}${detalle}`,
  };
  db.pagos.unshift(pago);
  try {
    const caja = cajaModule.asegurarCaja(db, req);
    cajaModule.registrarMovimiento(db, req, {
      caja, tipo: 'ingreso', monto, motivo: `Cobro ${pedido.codigo} · ${metodo}`,
      referencia: pago.codigo, pedido_id: pedido.id,
    });
  } catch (error) { console.error('[caja] no se pudo registrar el cobro:', error.message); }
  pedido.interes_pagado = round2((pedido.interes_pagado || 0) + aInteres);
  pedido.pagado = round2(pedido.pagado + aCapital);
  pedido.saldo = round2(Math.max(0, pedido.total - pedido.pagado));
  pedido.estado_pago = pedido.saldo <= 0 && restanteInteres <= 0 ? 'pagado' : 'parcial';
  pedido.updated_at = ahora;

  if (esCoordenaValida(req.body?.latitud, req.body?.longitud)) {
    db.visitas.unshift({
      id: nextId(db.visitas),
      cliente_id: pedido.cliente_id,
      tipo: 'cobranza',
      modulo: 'Cobranzas',
      latitud: Number(req.body.latitud),
      longitud: Number(req.body.longitud),
      precision: Number(req.body.precision) || null,
      estado: 'completada',
      pedido_id: pedido.id,
      ruta_id: pedido.ruta_id || null,
      usuario_id: req.user.id,
      notas: `Cobro de Bs ${monto.toFixed(2)} en ${pedido.codigo}`,
      fecha: ahora,
      created_at: ahora,
    });
  }

  recalcularCliente(db, pedido.cliente_id);
  const cliente = db.clientes.find((c) => c.id === pedido.cliente_id);
  audit(db, req, 'Pago registrado', 'Cobranzas', `${pedido.codigo} · Bs ${monto.toFixed(2)} · ${cliente?.nombre || ''}${detalle}`);
  save();
  return res.json({ pedido: pedidoResumen(db, pedido, true), pago });
});

// Permite asignar un distribuidor a ventas de oficina o pedidos cuyo cliente
// no tiene vendedor (y por lo tanto no tenía repartidor derivado).
router.patch('/:id/asignar-distribuidor', allow('admin', 'dueno', 'supervisor', 'ventas', 'distribucion'), (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const repartidor = (db.repartidores || []).find((r) => r.id === Number(req.body?.distribuidor_id) && r.activo !== false);
  if (!repartidor) return res.status(400).json({ error: 'Selecciona un distribuidor activo.' });
  pedido.repartidor_asignado_id = repartidor.id;
  const cliente = db.clientes.find((c) => c.id === pedido.cliente_id);
  if (cliente && !cliente.vendedor_id) cliente.distribuidor_id = repartidor.id;
  audit(db, req, 'Distribuidor asignado', 'Ventas', `${pedido.codigo} · ${repartidor.nombre}`);
  save();
  return res.json({ pedido: pedidoResumen(db, pedido, true) });
});

router.patch('/:id/asignar-ruta', allow('distribucion', 'ventas'), (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  const rutaId = req.body?.ruta_id ? Number(req.body.ruta_id) : null;
  db.rutas.forEach((r) => {
    const tenia = r.paradas.some((p) => p.pedido_id === pedido.id);
    if (r.id !== rutaId && tenia) r.paradas = r.paradas.filter((p) => p.pedido_id !== pedido.id);
  });
  if (rutaId) {
    const ruta = db.rutas.find((r) => r.id === rutaId);
    if (!ruta) return res.status(404).json({ error: 'Ruta no encontrada.' });
    if (!ruta.paradas.some((p) => p.pedido_id === pedido.id)) {
      ruta.paradas.push({ pedido_id: pedido.id, orden: ruta.paradas.length + 1, estado: 'pendiente', hora_estimada: '—', notas: '' });
    }
    if (pedido.estado === 'pendiente') pedido.estado = 'preparando';
  }
  pedido.ruta_id = rutaId;
  pedido.updated_at = new Date().toISOString();
  audit(db, req, 'Pedido asignado a ruta', 'Distribución', `${pedido.codigo} → ${rutaId ? `ruta #${rutaId}` : 'sin ruta'}`);
  save();
  return res.json({ pedido: pedidoResumen(db, pedido, true) });
});

router.put('/:id', requirePermiso('pedidos_editar'), allow('ventas'), (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  if (!['pendiente', 'preparando'].includes(pedido.estado)) return res.status(400).json({ error: 'Solo puedes editar pedidos pendientes o en preparación.' });
  const { notas, entrega_direccion } = req.body || {};
  if (notas !== undefined) pedido.notas = notas;
  if (entrega_direccion !== undefined) pedido.entrega_direccion = entrega_direccion;
  pedido.updated_at = new Date().toISOString();
  audit(db, req, 'Pedido actualizado', 'Ventas', pedido.codigo);
  save();
  return res.json({ pedido: pedidoResumen(db, pedido, true) });
});

module.exports = router;
