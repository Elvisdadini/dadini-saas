const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { load } = require('../db');
const { apiKeyRequired, requireScopes, hashKey } = require('../api-auth');
const { productoResumen, pedidoResumen, buscarPedidos, dashboard, reporte } = require('../services');
const ai = require('../ai');

const router = express.Router();
router.use(apiKeyRequired);
router.use(rateLimit({
  windowMs: 60_000,
  max: Number(process.env.API_PUBLIC_RATE_LIMIT) || 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => hashKey(req.headers['x-api-key'] || 'anon'),
  message: { error: 'Límite de API pública excedido.' },
}));

const responder = (res, data) => res.json({ ok: true, fecha: new Date().toISOString(), data });

router.get('/health', (req, res) => responder(res, { sucursal_id: req.apiToken.sucursal_id, scopes: req.apiToken.scopes }));

router.get('/productos', requireScopes('catalogo:read'), (req, res) => {
  const db = load();
  let productos = (db.productos || []).filter((p) => p.activo !== false);
  if (req.query.search) {
    const q = String(req.query.search).toLowerCase();
    productos = productos.filter((p) => `${p.nombre} ${p.sku} ${p.categoria || ''}`.toLowerCase().includes(q));
  }
  responder(res, productos.slice(0, Number(req.query.limit) || 200).map((p) => productoResumen(db, p)));
});

router.get('/clientes', requireScopes('clientes:read'), (req, res) => {
  const db = load();
  let clientes = (db.clientes || []).filter((c) => c.activo !== false);
  if (req.query.search) {
    const q = String(req.query.search).toLowerCase();
    clientes = clientes.filter((c) => `${c.nombre} ${c.codigo || ''} ${c.zona || ''} ${c.nit || ''}`.toLowerCase().includes(q));
  }
  responder(res, clientes.slice(0, Number(req.query.limit) || 200).map((c) => ({
    id: c.id, codigo: c.codigo, nombre: c.nombre, nit: c.nit, zona: c.zona,
    telefono: c.telefono, whatsapp: c.whatsapp, saldo: c.saldo, limite_credito: c.limite_credito,
  })));
});

router.get('/pedidos', requireScopes('ventas:read'), (req, res) => {
  const db = load();
  const filtros = { estado: req.query.estado, cliente_id: req.query.cliente_id, vendedor_id: req.query.vendedor_id, desde: req.query.desde, hasta: req.query.hasta, search: req.query.search };
  const pedidos = buscarPedidos(db, filtros);
  responder(res, pedidos.slice(0, Number(req.query.limit) || 100).map((p) => pedidoResumen(db, p)));
});

router.get('/pedidos/:id', requireScopes('ventas:read'), (req, res) => {
  const db = load();
  const pedido = db.pedidos.find((p) => p.id === Number(req.params.id));
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado.' });
  responder(res, pedidoResumen(db, pedido, true));
});

router.post('/pedidos', requireScopes('ventas:write'), (req, res) => {
  const resultado = ai.crearPedido({
    ...(req.body || {}),
  }, { user: { id: null, rol: 'admin', nombre: 'API Pública', permisos: [] }, ip: req.ip });
  if (!resultado.ok) return res.status(400).json({ ok: false, error: resultado.error });
  return res.status(201).json({ ok: true, data: resultado.pedido });
});

router.get('/facturas', requireScopes('facturas:read'), (req, res) => {
  const db = load();
  const facturas = (db.pedidos || []).filter((p) => p.factura).map((p) => ({
    ...p.factura, pedido_id: p.id, pedido_codigo: p.codigo,
    cliente_nombre: (db.clientes || []).find((c) => c.id === p.cliente_id)?.nombre || '—',
    total: p.total,
  }));
  responder(res, facturas.slice(0, Number(req.query.limit) || 100));
});

router.get('/dashboard', requireScopes('reportes:read'), (req, res) => {
  responder(res, dashboard(load(), String(req.query.periodo || '30d')));
});

router.get('/reportes', requireScopes('reportes:read'), (req, res) => {
  responder(res, reporte(load(), req.query.desde, req.query.hasta));
});

router.post('/webhooks/entrantes/:proveedor', requireScopes('integraciones:write'), (req, res) => {
  // Los sistemas externos pueden avisar de cobros/eventos; se registra como
  // mensaje de auditoría para que el equipo lo procese en el flujo habitual.
  const db = load();
  const registro = {
    id: (db.webhook_entregas || []).length + 1,
    entrega_id: crypto.randomUUID(),
    evento: `entrante.${req.params.proveedor}`,
    url: 'interno',
    payload: req.body || {},
    estado: 'recibido',
    intento: 0,
    proximo_intento: new Date().toISOString(),
    creado_en: new Date().toISOString(),
    historial: [],
  };
  if (!Array.isArray(db.webhook_entregas)) db.webhook_entregas = [];
  db.webhook_entregas.push(registro);
  require('../db').save();
  return res.status(201).json({ ok: true, entrega_id: registro.entrega_id });
});

module.exports = router;
