const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit } = require('../utils');

const router = express.Router();
router.use(authRequired);

const GESTION = ['admin', 'dueno', 'almacen', 'supervisor'];

function listar(db, clave, prefijo) {
  return [...(db[clave] || [])]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((item) => ({
      ...item,
      padre_nombre: (db[clave] || []).find((x) => x.id === item.padre_id)?.nombre || '',
      productos: (db.productos || []).filter((p) => p[clave === 'producto_categorias' ? 'categoria_id' : 'marca_id'] === item.id).length,
    }));
}

function crear(db, req, res, clave, prefijo) {
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  if ((db[clave] || []).some((x) => String(x.nombre).toLowerCase() === nombre.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe un registro con ese nombre.' });
  }
  const padreId = req.body?.padre_id ? Number(req.body.padre_id) : null;
  if (padreId && !(db[clave] || []).some((x) => x.id === padreId)) return res.status(400).json({ error: 'La categoría/marca padre no existe.' });
  const id = nextId(db[clave]);
  const item = {
    id,
    codigo: `${prefijo}${String(id).padStart(4, '0')}`,
    nombre,
    descripcion: String(req.body?.descripcion || ''),
    padre_id: padreId,
    activa: req.body?.activa !== false,
    created_at: new Date().toISOString(),
  };
  db[clave].push(item);
  audit(db, req, clave === 'producto_categorias' ? 'Categoría de producto creada' : 'Marca creada', 'Inventario', nombre);
  save();
  return res.status(201).json({ [clave === 'producto_categorias' ? 'categoria' : 'marca']: item });
}

function actualizar(db, req, res, clave) {
  const item = (db[clave] || []).find((x) => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Registro no encontrado.' });
  if (req.body?.nombre !== undefined) item.nombre = String(req.body.nombre).trim() || item.nombre;
  if (req.body?.descripcion !== undefined) item.descripcion = req.body.descripcion;
  if (req.body?.padre_id !== undefined) {
    const padreId = req.body.padre_id ? Number(req.body.padre_id) : null;
    if (padreId === item.id) return res.status(400).json({ error: 'No puede ser su propia subcategoría.' });
    if (padreId && !(db[clave] || []).some((x) => x.id === padreId)) return res.status(400).json({ error: 'La categoría/marca padre no existe.' });
    item.padre_id = padreId;
  }
  if (req.body?.activa !== undefined) item.activa = Boolean(req.body.activa);
  audit(db, req, 'Catálogo de productos actualizado', 'Inventario', item.nombre);
  save();
  return res.json({ [clave === 'producto_categorias' ? 'categoria' : 'marca']: item });
}

function eliminar(db, req, res, clave) {
  const item = (db[clave] || []).find((x) => x.id === Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Registro no encontrado.' });
  const campo = clave === 'producto_categorias' ? 'categoria_id' : 'marca_id';
  const enUso = (db.productos || []).filter((p) => p[campo] === item.id).length;
  if (enUso) return res.status(400).json({ error: `No se puede eliminar: ${enUso} productos lo usan.` });
  db[clave] = db[clave].filter((x) => x.id !== item.id);
  audit(db, req, 'Registro de catálogo eliminado', 'Inventario', item.nombre);
  save();
  return res.json({ ok: true });
}

router.get('/', (req, res) => {
  const db = load();
  const todos = req.query.todos === 'true';
  const activas = (lista) => todos ? lista : lista.filter((x) => x.activa !== false);
  return res.json({
    categorias: activas(listar(db, 'producto_categorias')),
    marcas: activas(listar(db, 'producto_marcas')),
  });
});

router.post('/categorias', allow(...GESTION), (req, res) => crear(load(), req, res, 'producto_categorias', 'PCAT-'));
router.put('/categorias/:id', allow(...GESTION), (req, res) => actualizar(load(), req, res, 'producto_categorias'));
router.delete('/categorias/:id', allow('admin', 'dueno'), (req, res) => eliminar(load(), req, res, 'producto_categorias'));

router.post('/marcas', allow(...GESTION), (req, res) => crear(load(), req, res, 'producto_marcas', 'PMAR-'));
router.put('/marcas/:id', allow(...GESTION), (req, res) => actualizar(load(), req, res, 'producto_marcas'));
router.delete('/marcas/:id', allow('admin', 'dueno'), (req, res) => eliminar(load(), req, res, 'producto_marcas'));

module.exports = router;
