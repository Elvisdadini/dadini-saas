const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const rag = require('../rag');

const router = express.Router();
router.use(authRequired);

router.get('/documentos', (req, res) => {
  const db = load();
  return res.json({
    documentos: rag.asegurar(db),
    total: rag.documentos(db).length,
  });
});

router.post('/documentos', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  try {
    const doc = rag.agregar(db, req.body || {});
    audit(db, req, 'Memoria AI ampliada', 'Sistema', doc.titulo);
    save();
    return res.status(201).json({ ok: true, documento: doc });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.delete('/documentos/:id', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const lista = rag.asegurar(db);
  const doc = lista.find((d) => d.id === Number(req.params.id));
  if (!doc) return res.status(404).json({ error: 'Documento no encontrado.' });
  db.documentos_rag = lista.filter((d) => d.id !== doc.id);
  audit(db, req, 'Memoria AI reducida', 'Sistema', doc.titulo);
  save();
  return res.json({ ok: true });
});

router.post('/buscar', (req, res) => {
  const db = load();
  return res.json({ resultados: rag.buscar(db, req.body?.consulta || '', { limite: Number(req.body?.limite) || 5 }) });
});

module.exports = router;
