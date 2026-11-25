const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const kardex = require('../kardex');

const router = express.Router();
router.use(authRequired);

const GESTION = ['admin', 'dueno', 'almacen', 'supervisor'];

function enriquecer(db, fila) {
  const producto = (db.productos || []).find((p) => p.id === Number(fila.producto_id));
  const almacen = (db.almacenes || []).find((a) => a.id === Number(fila.almacen_id));
  const movil = (db.almacenes_moviles || []).find((a) => a.id === Number(fila.almacen_movil_id));
  const usuario = (db.usuarios || []).find((u) => u.id === fila.usuario_id);
  return {
    ...fila,
    producto_nombre: producto?.nombre || 'Producto eliminado',
    producto_sku: producto?.sku || '',
    almacen_nombre: movil?.nombre || almacen?.nombre || '—',
    usuario_nombre: usuario?.nombre || 'Sistema',
  };
}

router.get('/', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const { producto_id, almacen_id, tipo, desde, hasta, limit } = req.query;
  let movimientos = (db.kardex || []).map((m) => enriquecer(db, m));
  if (producto_id) movimientos = movimientos.filter((m) => Number(m.producto_id) === Number(producto_id));
  if (almacen_id) movimientos = movimientos.filter((m) => Number(m.almacen_id) === Number(almacen_id));
  if (tipo && tipo !== 'todos') movimientos = movimientos.filter((m) => m.tipo === tipo);
  if (desde) movimientos = movimientos.filter((m) => String(m.fecha).slice(0, 10) >= desde);
  if (hasta) movimientos = movimientos.filter((m) => String(m.fecha).slice(0, 10) <= hasta);
  movimientos.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id);
  const total = movimientos.length;
  if (limit) movimientos = movimientos.slice(0, Number(limit));
  const vencimientos = kardex.vencimientos(db, 60).map((l) => enriquecer(db, l));
  res.json({
    movimientos,
    total,
    lotes: (db.lotes || []).map((l) => enriquecer(db, l)),
    vencimientos,
    resumen: {
      lotes_activos: (db.lotes || []).filter((l) => Number(l.cantidad) > 0).length,
      vencidos: vencimientos.filter((l) => l.estado === 'vencido').length,
      proximos: vencimientos.filter((l) => l.estado === 'proximo').length,
      entradas: (db.kardex || []).filter((m) => m.tipo.includes('entrada')).reduce((s, m) => s + m.cantidad, 0),
      salidas: (db.kardex || []).filter((m) => m.tipo.includes('salida') || m.tipo === 'salida').reduce((s, m) => s + m.cantidad, 0),
    },
  });
});

router.get('/producto/:id', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const id = Number(req.params.id);
  const lotes = (db.lotes || []).filter((l) => Number(l.producto_id) === id).map((l) => enriquecer(db, l));
  const movimientos = (db.kardex || []).filter((m) => Number(m.producto_id) === id)
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || b.id - a.id)
    .map((m) => enriquecer(db, m));
  res.json({ lotes, movimientos, total: movimientos.length });
});

router.get('/alertas', (req, res) => {
  const db = load();
  kardex.sincronizar(db);
  const dias = Number(req.query.dias) || 60;
  const lista = kardex.vencimientos(db, dias)
    .filter((l) => l.estado !== 'vigente')
    .map((l) => enriquecer(db, l));
  res.json({ alertas: lista, vencidos: lista.filter((l) => l.estado === 'vencido').length, proximos: lista.filter((l) => l.estado === 'proximo').length });
});

router.post('/entrada', allow(...GESTION), (req, res) => {
  const db = load();
  const b = req.body || {};
  if (!b.producto_id || !b.almacen_id) return res.status(400).json({ error: 'Selecciona producto y almacén.' });
  try {
    const resultado = kardex.registrarEntrada(db, {
      producto_id: b.producto_id, almacen_id: b.almacen_id, almacen_movil_id: b.almacen_movil_id,
      cantidad: b.cantidad, lote: b.lote, fecha_vencimiento: b.fecha_vencimiento,
      motivo: b.motivo || 'Entrada de inventario', referencia: b.referencia,
      usuario_id: req.user.id,
    });
    audit(db, req, 'Entrada por lote registrada', 'Inventario', `${b.cantidad} uds. · lote ${resultado.lote.lote}`);
    save();
    return res.status(201).json({ ok: true, ...resultado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/transferencia', allow(...GESTION), (req, res) => {
  const db = load();
  const b = req.body || {};
  if (!b.producto_id || !b.origen_id || !b.destino_id) return res.status(400).json({ error: 'Faltan producto o almacenes.' });
  if (Number(b.origen_id) === Number(b.destino_id)) return res.status(400).json({ error: 'El origen y destino deben ser distintos.' });
  try {
    const resultado = kardex.transferir(db, {
      producto_id: b.producto_id, origen_id: b.origen_id, destino_id: b.destino_id,
      origen_movil_id: b.origen_movil_id, destino_movil_id: b.destino_movil_id,
      cantidad: b.cantidad, motivo: b.motivo, referencia: b.referencia, usuario_id: req.user.id,
    });
    audit(db, req, 'Transferencia FEFO registrada', 'Inventario', `${resultado.consumido} uds.`);
    save();
    return res.json({ ok: true, ...resultado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

module.exports = router;
