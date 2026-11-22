const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, num } = require('../utils');

function crud(collection, campos, entidad, nombreCampo = 'nombre') {
  const router = express.Router();
  router.use(authRequired);

  router.get('/', (req, res) => {
    const db = load();
    return res.json({ [collection]: db[collection] });
  });

  router.post('/', allow('distribucion'), (req, res) => {
    const db = load();
    const faltante = nombreCampo && !req.body?.[nombreCampo];
    if (faltante) return res.status(400).json({ error: `El campo ${nombreCampo} es obligatorio.` });
    const item = { id: nextId(db[collection]), activo: true };
    campos.forEach((c) => { if (req.body?.[c] !== undefined) item[c] = req.body[c]; });
    db[collection].push(item);
    audit(db, req, `${entidad} creado`, entidad, item[nombreCampo] || `#${item.id}`);
    save();
    return res.status(201).json({ item });
  });

  router.put('/:id', allow('distribucion'), (req, res) => {
    const db = load();
    const item = db[collection].find((x) => x.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: `${entidad} no encontrado.` });
    campos.forEach((c) => { if (req.body?.[c] !== undefined) item[c] = req.body[c]; });
    audit(db, req, `${entidad} actualizado`, entidad, item[nombreCampo] || `#${item.id}`);
    save();
    return res.json({ item });
  });

  router.delete('/:id', allow(), (req, res) => {
    const db = load();
    const item = db[collection].find((x) => x.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: `${entidad} no encontrado.` });
    const enUso = collection === 'repartidores'
      ? db.rutas.some((r) => r.repartidor_id === item.id && r.estado !== 'completada')
      : db.rutas.some((r) => r.vehiculo_id === item.id && r.estado !== 'completada');
    if (enUso) return res.status(400).json({ error: `El ${entidad.toLowerCase()} tiene rutas activas asignadas.` });
    item.activo = false;
    audit(db, req, `${entidad} desactivado`, entidad, item[nombreCampo] || `#${item.id}`);
    save();
    return res.json({ ok: true });
  });

  return router;
}

module.exports = {
  repartidoresRouter: crud('repartidores', ['nombre', 'telefono', 'licencia', 'zona', 'emoji', 'activo'], 'Repartidor'),
  vehiculosRouter: crud('vehiculos', ['placa', 'marca', 'modelo', 'tipo', 'capacidad', 'estado', 'km', 'activo'], 'Vehículo', 'placa'),
};
