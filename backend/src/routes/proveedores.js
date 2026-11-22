const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  let items = [...db.proveedores];
  const { search, activo } = req.query;
  if (activo === 'true') items = items.filter((p) => p.activo);
  if (search) items = items.filter((p) => `${p.codigo} ${p.nombre} ${p.nit} ${p.contacto}`.toLowerCase().includes(String(search).toLowerCase()));
  return res.json({ proveedores: items, total: items.length });
});

function normalizar(body) {
  return {
    nombre: String(body.nombre || '').trim(),
    nit: String(body.nit || '').trim(),
    contacto: String(body.contacto || '').trim(),
    telefono: String(body.telefono || '').trim(),
    email: String(body.email || '').trim(),
    direccion: String(body.direccion || '').trim(),
    ciudad: String(body.ciudad || '').trim(),
    categorias: Array.isArray(body.categorias) ? body.categorias : [],
    dias_entrega: Array.isArray(body.dias_entrega) ? body.dias_entrega.map(Number) : [],
    condiciones_pago: body.condiciones_pago || 'Contado',
    activo: body.activa !== false && body.activo !== false,
  };
}

router.post('/', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const datos = normalizar(req.body || {});
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
  return res.status(201).json({ proveedor });
});

router.put('/:id', allow('admin', 'dueno', 'almacen'), (req, res) => {
  const db = load();
  const proveedor = db.proveedores.find((p) => p.id === Number(req.params.id));
  if (!proveedor) return res.status(404).json({ error: 'Proveedor no encontrado.' });
  Object.assign(proveedor, normalizar(req.body || {}));
  if (req.body?.activo !== undefined) proveedor.activo = Boolean(req.body.activo);
  audit(db, req, 'Proveedor actualizado', 'Compras', proveedor.nombre);
  save();
  return res.json({ proveedor });
});

module.exports = router;
