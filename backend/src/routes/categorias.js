const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');

const router = express.Router();
router.use(authRequired);

function conUso(db, cat) {
  return {
    ...cat,
    clientes: db.clientes.filter((c) => c.categoria_cliente_id === cat.id).length,
    vendedores: db.usuarios.filter((u) => u.categoria_cliente_id === cat.id).length,
    promociones: db.promociones.filter((p) => (p.categorias_clientes || []).map(Number).includes(cat.id)).length,
  };
}

router.get('/', (req, res) => {
  const db = load();
  const categorias = db.cliente_categorias.map((c) => conUso(db, c));
  return res.json({ categorias, total: categorias.length });
});

function normalizar(body) {
  return {
    nombre: String(body.nombre || '').trim().toUpperCase(),
    descripcion: body.descripcion || '',
    descuento_porcentaje: num(body.descuento_porcentaje, 0),
    descuento_fijo: num(body.descuento_fijo, 0),
    precios: Array.isArray(body.precios) ? body.precios.map((p) => ({ producto_id: Number(p.producto_id), precio: num(p.precio) })).filter((p) => p.producto_id) : [],
    activa: body.activa !== false,
  };
}

router.post('/', allow('admin'), (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {});
  if (!datos.nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const categoria = {
    id: nextId(db.cliente_categorias),
    codigo: nextCode(db.cliente_categorias, 'codigo', 'CAT', 1),
    ...datos,
    created_at: new Date().toISOString(),
  };
  db.cliente_categorias.push(categoria);
  audit(db, req, 'Categoría de cliente creada', 'Clientes', categoria.nombre);
  save();
  return res.status(201).json({ categoria: conUso(db, categoria) });
});

router.put('/:id', allow('admin'), (req, res) => {
  const db = load();
  const categoria = db.cliente_categorias.find((c) => c.id === Number(req.params.id));
  if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });
  Object.assign(categoria, normalizar(req.body || {}));
  audit(db, req, 'Categoría de cliente actualizada', 'Clientes', categoria.nombre);
  save();
  return res.json({ categoria: conUso(db, categoria) });
});

router.patch('/:id/estado', allow('admin'), (req, res) => {
  const db = load();
  const categoria = db.cliente_categorias.find((c) => c.id === Number(req.params.id));
  if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });
  categoria.activa = Boolean(req.body?.activa);
  save();
  return res.json({ categoria: conUso(db, categoria) });
});

module.exports = router;
