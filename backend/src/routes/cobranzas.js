const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { pedidoResumen, rangoFechas, sincronizarCobros } = require('../services');
const { save } = require('../db');
const { round2, daysBetween } = require('../utils');

const router = express.Router();
router.use(authRequired);

// Un GET ya no muta: el job periódico mantiene los responsables y bloqueos.
router.post('/sincronizar', (req, res) => {
  const db = load();
  const resultado = sincronizarCobros(db);
  return res.json({ ok: true, ...resultado });
});

router.get('/', (req, res) => {
  const db = load();
  const { cliente_id, search, vencidas } = req.query;
  const rol = req.user.rol;
  let pedidos = db.pedidos
    .filter((p) => p.saldo > 0 && p.estado !== 'cancelado')
    .map((p) => pedidoResumen(db, p));

  if (rol === 'cobranzas') {
    pedidos = pedidos.filter((p) => p.en_mora);
  } else if (rol === 'ventas' || rol === 'preventista') {
    pedidos = pedidos.filter((p) => p.responsable_cobro_id === req.user.id && !p.en_mora);
  }
  pedidos = require('../alcance').filtrar(req, pedidos, ['responsable_cobro_id', 'vendedor_id', 'usuario_id']);
  if (cliente_id) pedidos = pedidos.filter((p) => p.cliente_id === Number(cliente_id));
  if (vencidas === 'true') pedidos = pedidos.filter((p) => p.vencido);
  if (search) pedidos = pedidos.filter((p) => `${p.codigo} ${p.cliente_nombre}`.toLowerCase().includes(String(search).toLowerCase()));
  pedidos.sort((a, b) => b.dias_vencido - a.dias_vencido);

  const buckets = [
    { clave: 'corriente', label: 'Corriente', min: -9999, max: 0 },
    { clave: '1_15', label: '1 a 15 días', min: 1, max: 15 },
    { clave: '16_30', label: '16 a 30 días', min: 16, max: 30 },
    { clave: 'mas_30', label: 'Más de 30 días', min: 31, max: 99999 },
  ].map((b) => {
    const items = pedidos.filter((p) => p.dias_vencido >= b.min && p.dias_vencido <= b.max);
    return { ...b, cantidad: items.length, monto: round2(items.reduce((s, p) => s + (p.total_a_cobrar || p.saldo), 0)) };
  });

  const clientes = db.clientes
    .filter((c) => c.saldo > 0)
    .map((c) => {
      const pedidosCliente = pedidos.filter((p) => p.cliente_id === c.id);
      const maxDias = pedidosCliente.reduce((m, p) => Math.max(m, p.dias_vencido), 0);
      return { ...c, facturas: pedidosCliente.length, monto_vencido: round2(pedidosCliente.filter((p) => p.vencido).reduce((s, p) => s + (p.total_a_cobrar || p.saldo), 0)), max_dias: maxDias };
    })
    .sort((a, b) => b.saldo - a.saldo);

  const pagos = require('../alcance').filtrar(req, db.pagos, ['usuario_id', 'responsable_cobro_id', 'vendedor_id'])
    .slice()
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 25)
    .map((p) => {
      const cliente = db.clientes.find((c) => c.id === p.cliente_id);
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      const usuario = db.usuarios.find((u) => u.id === p.usuario_id);
      return { ...p, cliente_nombre: cliente?.nombre || '—', pedido_codigo: pedido?.codigo || '—', usuario_nombre: usuario?.nombre || 'Sistema' };
    });

  return res.json({
    pedidos,
    buckets,
    clientes,
    pagos,
    resumen: {
      total: round2(pedidos.reduce((s, p) => s + (p.total_a_cobrar || p.saldo), 0)),
      capital: round2(pedidos.reduce((s, p) => s + p.saldo, 0)),
      interes: round2(pedidos.reduce((s, p) => s + (p.interes_pendiente || 0), 0)),
      facturas: pedidos.length,
      vencido: round2(pedidos.filter((p) => p.vencido).reduce((s, p) => s + (p.total_a_cobrar || p.saldo), 0)),
      vencidas: pedidos.filter((p) => p.vencido).length,
      clientes: clientes.length,
      en_mora: pedidos.filter((p) => p.en_mora).length,
      al_dia: pedidos.filter((p) => !p.en_mora).length,
      responsable: rol === 'cobranzas' ? 'cobrador' : ['ventas', 'preventista'].includes(rol) ? 'vendedor' : 'todos',
    },
  });
});

router.get('/historial', (req, res) => {
  const db = load();
  const [desde, hasta] = rangoFechas(req.query.desde, req.query.hasta);
  const pagos = db.pagos
    .filter((p) => p.fecha.slice(0, 10) >= desde && p.fecha.slice(0, 10) <= hasta)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map((p) => {
      const cliente = db.clientes.find((c) => c.id === p.cliente_id);
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      return { ...p, cliente_nombre: cliente?.nombre || '—', pedido_codigo: pedido?.codigo || '—' };
    });
  return res.json({ pagos, total: round2(pagos.reduce((s, p) => s + p.monto, 0)), rango: { desde, hasta } });
});

// Lista de cobranzas realizadas por el usuario en sesión, con el comprobante
// enviado al cliente (el nombre del cliente abre dicho comprobante).
router.get('/mis-cobros', (req, res) => {
  const db = load();
  const pagos = db.pagos
    .filter((p) => p.usuario_id === req.user.id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .map((p) => {
      const cliente = db.clientes.find((c) => c.id === p.cliente_id);
      const pedido = db.pedidos.find((x) => x.id === p.pedido_id);
      const mensaje = [...(db.mensajes_whatsapp || [])]
        .filter((m) => m.tipo === 'cobranza' && m.pedido_id === p.pedido_id && m.usuario_id === req.user.id)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
      return {
        ...p,
        cliente_nombre: cliente?.nombre || '—',
        cliente_zona: cliente?.zona || '',
        cliente_whatsapp: cliente?.whatsapp || cliente?.telefono || '',
        pedido_codigo: pedido?.codigo || '—',
        comprobante: p.numero_comprobante || p.codigo,
        mensaje_enviado: mensaje?.mensaje || null,
        url_comprobante: mensaje?.url || null,
      };
    });
  return res.json({ pagos, resumen: { cobros: pagos.length, monto: round2(pagos.reduce((s, p) => s + p.monto, 0)) } });
});

module.exports = router;
