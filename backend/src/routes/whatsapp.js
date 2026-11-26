const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, audit, round2 } = require('../utils');
const links = require('../whatsapp-links');

const router = express.Router();
router.use(authRequired);

function soloDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function construirMensaje(db, tipo, pedido, cliente, extra) {
  const nombre = cliente?.nombre || 'cliente';
  const codigo = pedido?.codigo || extra?.referencia || 'DADINI';
  const total = round2(pedido?.total || extra?.monto || 0);
  if (tipo === 'pedido') {
    const detalle = Array.isArray(extra?.items) && extra.items.length
      ? ` Productos: ${extra.items.map((i) => `${i.cantidad} x ${i.nombre}`).join(', ')}.`
      : '';
    const documento = pedido?.documento_entrega === 'factura_siat'
      ? ' Se entregará factura con registro legal en el SIN.'
      : ' Se entregará comprobante de entrega.';
    return `Hola ${nombre}, su pedido ${codigo} por Bs ${total.toFixed(2)} fue confirmado.${detalle}${documento} Entrega programada: ${pedido?.fecha_entrega_programada || 'por definir'}. ¡Gracias por comprar DADINI!`;
  }
  if (tipo === 'entrega') {
    const detalle = extra?.productos_devueltos?.length
      ? ` Se descontaron ${extra.productos_devueltos.map((d) => `${d.cantidad} ${d.nombre}`).join(', ')}.`
      : '';
    const documento = pedido?.documento_entrega === 'factura_siat' ? 'factura con registro en el SIN' : 'comprobante de entrega';
    return `Hola ${nombre}, su pedido ${codigo} fue entregado. ${documento} ${codigo}-ENT por Bs ${total.toFixed(2)}.${detalle} Entrega registrada con geolocalización. DADINI.`;
  }
  if (tipo === 'cobranza') {
    const monto = round2(extra?.monto || 0);
    const saldo = round2(pedido?.saldo || 0);
    const comprobante = extra?.recibo || extra?.numero_comprobante || 'DADINI';
    const tipoComprobante = extra?.tipo_comprobante ? `${extra.tipo_comprobante} ` : '';
    return `Hola ${nombre}, registramos su pago de Bs ${monto.toFixed(2)} para el pedido ${codigo}. Saldo pendiente: Bs ${saldo.toFixed(2)}. ${tipoComprobante}Nro. de comprobante: ${comprobante}. Gracias.`;
  }
  return `Hola ${nombre}, novedades sobre su pedido ${codigo}. DADINI.`;
}

router.get('/', (req, res) => {
  const db = load();
  const { tipo, cliente_id, pedido_id, limit } = req.query;
  let mensajes = require('../alcance').filtrar(req, [...db.mensajes_whatsapp], ['usuario_id', 'vendedor_id', 'repartidor_id']);
  if (tipo && tipo !== 'todos') mensajes = mensajes.filter((m) => m.tipo === tipo);
  if (cliente_id) mensajes = mensajes.filter((m) => m.cliente_id === Number(cliente_id));
  if (pedido_id) mensajes = mensajes.filter((m) => m.pedido_id === Number(pedido_id));
  mensajes.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    mensajes: mensajes.slice(0, Number(limit) || 200).map((m) => {
      const cliente = db.clientes.find((c) => c.id === m.cliente_id);
      const usuario = db.usuarios.find((u) => u.id === m.usuario_id);
      return { ...m, cliente_nombre: cliente?.nombre || '—', usuario_nombre: usuario?.nombre || 'Sistema' };
    }),
    total: mensajes.length,
  });
});

router.post('/', requirePermiso('whatsapp.crear'), allow('ventas', 'preventista', 'vendedor_camion', 'distribucion', 'cobranzas'), (req, res) => {
  const db = load();
  const body = req.body || {};
  const tipo = ['pedido', 'entrega', 'cobranza', 'otro'].includes(body.tipo) ? body.tipo : 'otro';
  const pedido = body.pedido_id ? db.pedidos.find((p) => p.id === Number(body.pedido_id)) : null;
  const cliente = body.cliente_id ? db.clientes.find((c) => c.id === Number(body.cliente_id)) : (pedido ? db.clientes.find((c) => c.id === pedido.cliente_id) : null);
  const telefono = soloDigitos(body.telefono || cliente?.whatsapp || cliente?.telefono || '59100000000');
  const mensaje = body.mensaje || construirMensaje(db, tipo, pedido, cliente, body);
  const ahora = new Date().toISOString();
  const registro = {
    id: nextId(db.mensajes_whatsapp),
    tipo,
    cliente_id: cliente?.id || null,
    pedido_id: pedido?.id || null,
    telefono,
    mensaje,
    referencia: body.referencia || null,
    monto: round2(body.monto || pedido?.total || 0),
    estado: body.estado || 'generado',
    latitud: body.latitud ?? null,
    longitud: body.longitud ?? null,
    usuario_id: req.user.id,
    fecha: ahora,
    created_at: ahora,
  };
  db.mensajes_whatsapp.unshift(registro);
  audit(db, req, 'Mensaje WhatsApp generado', 'Comunicaciones', `${tipo} · ${cliente?.nombre || 'cliente'} · ${pedido?.codigo || ''}`);
  save();
  const url = `https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`;
  return res.status(201).json({ mensaje: { ...registro, cliente_nombre: cliente?.nombre || '—' }, url });
});

router.patch('/:id/estado', (req, res) => {
  const db = load();
  const registro = db.mensajes_whatsapp.find((m) => m.id === Number(req.params.id));
  if (!registro) return res.status(404).json({ error: 'Mensaje no encontrado.' });
  if (['generado', 'enviado', 'fallido'].includes(req.body?.estado)) registro.estado = req.body.estado;
  save();
  return res.json({ mensaje: registro });
});

// Envío a varios empleados: se generan los links wa.me y se deja trazabilidad.
router.post('/masivo', requirePermiso('whatsapp.crear'), allow('ventas', 'preventista', 'distribucion', 'cobranzas'), (req, res) => {
  const db = load();
  const body = req.body || {};
  const ids = Array.isArray(body.usuario_ids) ? body.usuario_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un empleado.' });
  const tipo = ['pedido', 'entrega', 'cobranza', 'otro'].includes(body.tipo) ? body.tipo : 'otro';
  const { envios, omitidos } = links.prepararMasivo(db, {
    usuario_ids: ids, mensaje: body.mensaje, url_adjunto: body.url_adjunto,
    titulo: body.titulo, tipo, pedido_id: body.pedido_id, usuario_id: req.user.id,
  });
  audit(db, req, 'WhatsApp masivo generado', 'Comunicaciones', `${envios.length} empleados · ${body.titulo || tipo}`);
  save();
  return res.status(201).json({ envios, omitidos });
});

module.exports = router;
