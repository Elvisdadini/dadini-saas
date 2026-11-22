const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  const almacenes = db.almacenes.map((a) => {
    const filas = db.stock.filter((s) => s.almacen_id === a.id);
    const unidades = filas.reduce((s, f) => s + f.cantidad, 0);
    const valor = filas.reduce((s, f) => {
      const p = db.productos.find((x) => x.id === f.producto_id);
      return s + f.cantidad * (p?.costo || 0);
    }, 0);
    return { ...a, unidades, valor: round2(valor), productos: filas.filter((f) => f.cantidad > 0).length };
  });
  return res.json({ almacenes });
});

router.post('/', allow(), (req, res) => {
  const db = load();
  const { nombre, direccion, zona, ciudad, encargado, telefono } = req.body || {};
  if (!nombre || !direccion) return res.status(400).json({ error: 'Nombre y dirección son obligatorios.' });
  const almacen = {
    id: nextId(db.almacenes),
    nombre,
    direccion,
    zona: zona || '',
    ciudad: ciudad || db.configuracion.empresa.ciudad,
    encargado: encargado || '',
    telefono: telefono || '',
    activo: true,
  };
  db.almacenes.push(almacen);
  db.productos.forEach((p) => db.stock.push({ id: nextId(db.stock) + p.id, producto_id: p.id, almacen_id: almacen.id, cantidad: 0 }));
  audit(db, req, 'Almacén creado', 'Almacenes', almacen.nombre);
  save();
  return res.status(201).json({ almacen });
});

router.put('/:id', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  const campos = ['nombre', 'direccion', 'zona', 'ciudad', 'encargado', 'telefono', 'activo'];
  campos.forEach((c) => { if (req.body?.[c] !== undefined) almacen[c] = req.body[c]; });
  audit(db, req, 'Almacén actualizado', 'Almacenes', almacen.nombre);
  save();
  return res.json({ almacen });
});

router.delete('/:id', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  const conStock = db.stock.filter((s) => s.almacen_id === almacen.id && s.cantidad > 0);
  if (conStock.length) return res.status(400).json({ error: 'No se puede eliminar un almacén con stock disponible.' });
  almacen.activo = false;
  audit(db, req, 'Almacén desactivado', 'Almacenes', almacen.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
