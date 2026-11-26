const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const crm = require('../crm');

const router = express.Router();
router.use(authRequired);

const EDITAR = ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'cobranzas'];

router.get('/segmentos', (req, res) => {
  const db = load();
  const { resumen } = crm.listar(db, { activo: 'todos' });
  return res.json({
    segmentos: crm.SEGMENTOS.map((nombre) => ({
      nombre, total: resumen.por_segmento[nombre] || 0,
      accion: crm.ACCIONES[nombre],
    })),
  });
});

router.get('/clientes', (req, res) => {
  const db = load();
  return res.json(crm.listar(db, req.query));
});

router.get('/clientes/:id', (req, res) => {
  const db = load();
  const detalle = crm.detalle(db, req.params.id);
  if (!detalle) return res.status(404).json({ error: 'Cliente no encontrado.' });
  return res.json(detalle);
});

router.post('/clientes/:id/notas', allow(...EDITAR), (req, res) => {
  const db = load();
  const cliente = (db.clientes || []).find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (!['admin', 'dueno', 'supervisor', 'cobranzas'].includes(req.user.rol)
    && Number(cliente.vendedor_id) !== Number(req.user.id)) {
    return res.status(403).json({ error: 'Solo puedes gestionar los clientes que se te asignaron.' });
  }
  try {
    const nota = crm.agregarNota(db, req.params.id, req.body, req.user.id);
    audit(db, req, 'Nota CRM agregada', 'Clientes', `Cliente ${nota.cliente_id} · ${nota.tipo}`);
    save();
    return res.status(201).json({ ok: true, nota });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.delete('/notas/:id', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const nota = (db.crm_notas || []).find((n) => n.id === Number(req.params.id));
  if (!nota) return res.status(404).json({ error: 'Nota no encontrada.' });
  db.crm_notas = db.crm_notas.filter((n) => n.id !== nota.id);
  audit(db, req, 'Nota CRM eliminada', 'Clientes', `Cliente ${nota.cliente_id}`);
  save();
  return res.json({ ok: true });
});

module.exports = router;
