const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');

const router = express.Router();
router.use(authRequired);

function conUso(db, cat, req) {
  const alcance = req ? require('../alcance') : null;
  const clientes = alcance && req ? alcance.filtrar(req, db.clientes || [], ['vendedor_id', 'usuario_id', 'creado_por', 'distribuidor_id', 'responsable_cobro_id']) : db.clientes;
  const vendedores = alcance && req && !alcance.verTodo(req)
    ? (db.usuarios || []).filter((u) => u.id === Number(req.user.id))
    : db.usuarios;
  const padre = db.cliente_categorias.find((c) => c.id === cat.padre_id);
  return {
    ...cat,
    padre_nombre: padre?.nombre || '',
    clientes: clientes.filter((c) => c.categoria_cliente_id === cat.id).length,
    vendedores: vendedores.filter((u) => u.categoria_cliente_id === cat.id).length,
    promociones: (db.promociones || []).filter((p) => (p.categorias_clientes || []).map(Number).includes(cat.id)).length,
  };
}

router.get('/', (req, res) => {
  const db = load();
  let lista = db.cliente_categorias || [];
  if (!require('../alcance').verTodo(req)) {
    const permitidas = new Set();
    if (req.user.categoria_cliente_id) permitidas.add(Number(req.user.categoria_cliente_id));
    require('../alcance').filtrar(req, db.clientes || [], ['vendedor_id', 'usuario_id', 'creado_por', 'distribuidor_id', 'responsable_cobro_id'])
      .forEach((c) => { if (c.categoria_cliente_id) permitidas.add(Number(c.categoria_cliente_id)); });
    lista = lista.filter((c) => permitidas.has(Number(c.id)));
  }
  const todas = lista.map((c) => conUso(db, c, req));
  const categorias = req.query.todos === 'true' ? todas : todas.filter((c) => c.activa !== false);
  return res.json({ categorias, total: categorias.length });
});

function normalizar(body) {
  return {
    nombre: String(body.nombre || '').trim().toUpperCase(),
    descripcion: body.descripcion || '',
    padre_id: body.padre_id ? Number(body.padre_id) : null,
    descuento_porcentaje: num(body.descuento_porcentaje, 0),
    descuento_fijo: num(body.descuento_fijo, 0),
    precios: Array.isArray(body.precios) ? body.precios.map((p) => ({ producto_id: Number(p.producto_id), precio: num(p.precio) })).filter((p) => p.producto_id) : [],
    activa: body.activa !== false,
  };
}

function validarPadre(db, datos, id) {
  if (!datos.padre_id) return null;
  if (datos.padre_id === id) return 'Una categoría no puede ser su propia subcategoría.';
  if (!db.cliente_categorias.some((c) => c.id === datos.padre_id)) return 'La categoría padre no existe.';
  return null;
}

router.post('/', allow('admin'), (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {});
  if (!datos.nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  const errorPadre = validarPadre(db, datos);
  if (errorPadre) return res.status(400).json({ error: errorPadre });
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
  const datos = normalizar(req.body || {});
  const errorPadre = validarPadre(db, datos, categoria.id);
  if (errorPadre) return res.status(400).json({ error: errorPadre });
  Object.assign(categoria, datos);
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

router.delete('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const categoria = db.cliente_categorias.find((c) => c.id === Number(req.params.id));
  if (!categoria) return res.status(404).json({ error: 'Categoría no encontrada.' });
  const usos = conUso(db, categoria);
  const hijas = db.cliente_categorias.filter((c) => c.padre_id === categoria.id).length;
  const bloqueos = [];
  if (usos.clientes) bloqueos.push(`${usos.clientes} clientes`);
  if (usos.vendedores) bloqueos.push(`${usos.vendedores} vendedores`);
  if (usos.promociones) bloqueos.push(`${usos.promociones} promociones`);
  if (hijas) bloqueos.push(`${hijas} subcategorías`);
  if (bloqueos.length) {
    return res.status(400).json({ error: `No se puede eliminar: la categoría está en uso por ${bloqueos.join(', ')}.` });
  }
  db.cliente_categorias = db.cliente_categorias.filter((c) => c.id !== categoria.id);
  audit(db, req, 'Categoría de cliente eliminada', 'Clientes', categoria.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
