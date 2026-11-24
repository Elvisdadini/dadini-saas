const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, num } = require('../utils');
const { estadoQr, verificarVencimientos } = require('../qr-alertas');

const router = express.Router();
router.use(authRequired);

function enriquecer(db, qr) {
  return { ...qr, ...estadoQr(qr) };
}

router.get('/', (req, res) => {
  const db = load();
  const alertas = verificarVencimientos(db);
  const qrs = [...(db.qrs_pago || [])].map((qr) => enriquecer(db, qr)).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  res.json({
    qrs,
    alertas,
    activos: qrs.filter((q) => q.activo !== false && !q.vencido),
    resumen: { total: qrs.length, activos: qrs.filter((q) => q.activo !== false && !q.vencido).length, por_vencer: qrs.filter((q) => q.por_vencer).length, vencidos: qrs.filter((q) => q.vencido).length },
  });
});

router.get('/activos', (req, res) => {
  const db = load();
  const alertas = verificarVencimientos(db);
  const activos = (db.qrs_pago || [])
    .filter((q) => q.activo !== false && !estadoQr(q).vencido)
    .map((q) => enriquecer(db, q));
  res.json({ qrs: activos, alertas });
});

router.get('/alertas', (req, res) => {
  const db = load();
  const antes = (db.notificaciones || []).length;
  const alertas = verificarVencimientos(db);
  if ((db.notificaciones || []).length !== antes) save();
  res.json({ alertas });
});

function validar(body, crear) {
  const nombre = String(body?.nombre || '').trim();
  const imagen = String(body?.imagen || '');
  const vencimiento = String(body?.fecha_vencimiento || '').slice(0, 10);
  if (crear && !nombre) return 'El nombre del QR es obligatorio.';
  if (crear && !imagen.startsWith('data:image/')) return 'Sube una imagen del QR.';
  if (!vencimiento || Number.isNaN(new Date(vencimiento).getTime())) return 'Indica una fecha de vencimiento válida.';
  return null;
}

router.post('/', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const error = validar(req.body, true);
  if (error) return res.status(400).json({ error });
  const qr = {
    id: nextId(db.qrs_pago),
    codigo: `QR-${String(nextId(db.qrs_pago)).padStart(3, '0')}`,
    nombre: String(req.body.nombre).trim(),
    imagen: req.body.imagen,
    fecha_vencimiento: String(req.body.fecha_vencimiento).slice(0, 10),
    titular: String(req.body.titular || '').trim(),
    notas: String(req.body.notas || ''),
    activo: req.body.activo !== false,
    created_at: new Date().toISOString(),
  };
  db.qrs_pago.push(qr);
  const alertas = verificarVencimientos(db);
  audit(db, req, 'QR de pago agregado', 'Configuración', `${qr.nombre} · vence ${qr.fecha_vencimiento}`);
  save();
  return res.status(201).json({ qr: enriquecer(db, qr), alertas });
});

router.put('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const qr = (db.qrs_pago || []).find((q) => q.id === Number(req.params.id));
  if (!qr) return res.status(404).json({ error: 'QR no encontrado.' });
  const error = validar(req.body, false);
  if (error) return res.status(400).json({ error });
  ['nombre', 'imagen', 'fecha_vencimiento', 'titular', 'notas'].forEach((c) => {
    if (req.body[c] !== undefined) qr[c] = c === 'fecha_vencimiento' ? String(req.body[c]).slice(0, 10) : req.body[c];
  });
  if (req.body.activo !== undefined) qr.activo = Boolean(req.body.activo);
  const alertas = verificarVencimientos(db);
  audit(db, req, 'QR de pago actualizado', 'Configuración', qr.nombre);
  save();
  return res.json({ qr: enriquecer(db, qr), alertas });
});

router.patch('/:id/estado', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const qr = (db.qrs_pago || []).find((q) => q.id === Number(req.params.id));
  if (!qr) return res.status(404).json({ error: 'QR no encontrado.' });
  qr.activo = req.body?.activo !== false;
  audit(db, req, qr.activo ? 'QR activado' : 'QR desactivado', 'Configuración', qr.nombre);
  save();
  return res.json({ qr: enriquecer(db, qr) });
});

router.delete('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const qr = (db.qrs_pago || []).find((q) => q.id === Number(req.params.id));
  if (!qr) return res.status(404).json({ error: 'QR no encontrado.' });
  db.qrs_pago = db.qrs_pago.filter((q) => q.id !== qr.id);
  audit(db, req, 'QR eliminado', 'Configuración', qr.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
