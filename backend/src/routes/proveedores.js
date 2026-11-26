const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit } = require('../utils');

const router = express.Router();
router.use(authRequired);

// El catálogo de categorías de productos es la fuente de verdad: las que se
// crean aparecen aquí y las que se eliminan dejan de ofrecerse y de mostrarse.
function categoriasActivas(db) {
  return (db.producto_categorias || [])
    .filter((c) => c.activa !== false)
    .map((c) => String(c.nombre).trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function filtrarCategorias(categorias, activas) {
  const validas = new Set(activas.map((c) => c.toLowerCase()));
  return [...new Set((categorias || []).map((c) => String(c).trim()).filter((c) => validas.has(c.toLowerCase())))];
}

function publico(db, proveedor, activas) {
  return { ...proveedor, categorias: filtrarCategorias(proveedor.categorias, activas) };
}

router.get('/', (req, res) => {
  const db = load();
  const activas = categoriasActivas(db);
  let items = [...db.proveedores].map((p) => publico(db, p, activas));
  const { search, activo } = req.query;
  if (activo === 'true') items = items.filter((p) => p.activo);
  if (search) items = items.filter((p) => `${p.codigo} ${p.nombre} ${p.nit} ${p.contacto}`.toLowerCase().includes(String(search).toLowerCase()));
  return res.json({ proveedores: items, total: items.length, categorias: activas });
});

function normalizar(body, db) {
  return {
    nombre: String(body.nombre || '').trim(),
    nit: String(body.nit || '').trim(),
    contacto: String(body.contacto || '').trim(),
    telefono: String(body.telefono || '').trim(),
    email: String(body.email || '').trim(),
    direccion: String(body.direccion || '').trim(),
    ciudad: String(body.ciudad || '').trim(),
    categorias: filtrarCategorias(body.categorias, categoriasActivas(db)),
    dias_entrega: Array.isArray(body.dias_entrega) ? body.dias_entrega.map(Number) : [],
    condiciones_pago: body.condiciones_pago || 'Contado',
    activo: body.activa !== false && body.activo !== false,
  };
}

router.post('/', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {}, db);
  if (!datos.nombre) return res.status(400).json({ error: 'El nombre del proveedor es obligatorio.' });
  const proveedor = {
    id: nextId(db.proveedores),
    codigo: nextCode(db.proveedores, 'codigo', 'PRO', 1),
    ...datos,
    created_at: new Date().toISOString(),
  };
  db.proveedores.push(proveedor);
  audit(db, req, 'Proveedor creado', 'Compras', proveedor.nombre);
  save();
  return res.status(201).json({ proveedor: publico(db, proveedor, categoriasActivas(db)) });
});

router.put('/:id', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const proveedor = db.proveedores.find((p) => p.id === Number(req.params.id));
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  Object.assign(proveedor, normalizar(req.body || {}, db));
  if (req.body?.activo !== undefined) proveedor.activo = Boolean(req.body.activo);
  audit(db, req, 'Proveedor actualizado', 'Compras', proveedor.nombre);
  save();
  return res.json({ proveedor: publico(db, proveedor, categoriasActivas(db)) });
});

router.delete('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const proveedor = db.proveedores.find((p) => p.id === Number(req.params.id));
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  const solicitudes = (db.solicitudes_compra || []).filter((s) => Number(s.proveedor_id) === Number(proveedor.id)).length;
  const ordenes = (db.ordenes_compra || []).filter((o) => Number(o.proveedor_id) === Number(proveedor.id)).length;
  if (solicitudes || ordenes) {
    return res.status(400).json({ error: `No se puede eliminar: ${solicitudes} solicitud(es) y ${ordenes} orden(es) de compra lo referencian.` });
  }
  db.proveedores = db.proveedores.filter((p) => p.id !== proveedor.id);
  audit(db, req, 'Proveedor eliminado', 'Compras', `${proveedor.codigo} · ${proveedor.nombre}`);
  save();
  return res.json({ ok: true });
});

module.exports = router;
