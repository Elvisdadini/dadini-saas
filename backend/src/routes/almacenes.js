const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, round2 } = require('../utils');
const { buildIndices } = require('../indexes');

const router = express.Router();
router.use(authRequired);

// El almacén central es la referencia histórica (id 1). Se añade el flag
// es_central para no depender de un número mágico en el futuro.
function centralDe(db) {
  return db.almacenes.find((a) => a.es_central)
    || db.almacenes.find((a) => a.id === 1)
    || db.almacenes.find((a) => a.activo);
}

function productosActivos(db) {
  return new Set(db.productos.filter((p) => p.activo !== false).map((p) => p.id));
}

router.get('/', (req, res) => {
  const db = load();
  const indices = buildIndices(db);
  const activos = productosActivos(db);
  const central = centralDe(db);
  const almacenes = db.almacenes.map((a) => {
    const filas = db.stock.filter((s) => s.almacen_id === a.id && activos.has(Number(s.producto_id)) && s.cantidad > 0);
    const unidades = filas.reduce((s, f) => s + f.cantidad, 0);
    const valor = filas.reduce((s, f) => s + f.cantidad * (indices.productos.get(Number(f.producto_id))?.costo || 0), 0);
    return {
      ...a,
      es_central: a.id === central?.id,
      unidades,
      valor: round2(valor),
      productos: filas.length,
    };
  });
  return res.json({ almacenes, central_id: central?.id || null });
});

// Cierra un almacén moviendo TODO su stock al central. Devuelve un resumen
// con las unidades y los movimientos generados para que la UI lo informe.
function cerrarAlmacen(db, almacen, req) {
  if (!almacen.activo) {
    const error = new Error('El almacén ya está cerrado.');
    error.status = 400;
    throw error;
  }
  const central = centralDe(db);
  if (!central) {
    const error = new Error('No hay un almacén central definido.');
    error.status = 400;
    throw error;
  }
  if (central.id === almacen.id) {
    const error = new Error('No se puede cerrar el almacén central.');
    error.status = 400;
    throw error;
  }

  const ahora = new Date().toISOString();
  const stockCentral = new Map(
    db.stock.filter((s) => s.almacen_id === central.id)
      .map((s) => [Number(s.producto_id), Math.max(0, Number(s.cantidad || 0))]),
  );
  const filas = db.stock.filter((s) => s.almacen_id === almacen.id && s.cantidad > 0);
  let unidades = 0;
  let productos = 0;
  filas.forEach((fila) => {
    const cantidad = Math.round(fila.cantidad);
    if (!(cantidad > 0)) return;
    unidades += cantidad;
    productos += 1;
    const productoId = Number(fila.producto_id);
    const origen = stockCentral.get(productoId) || 0;
    stockCentral.set(productoId, origen + cantidad);
    const destino = db.stock.find((s) => s.producto_id === productoId && s.almacen_id === central.id);
    if (destino) destino.cantidad = origen + cantidad;
    else db.stock.push({ id: nextId(db.stock), producto_id: productoId, almacen_id: central.id, cantidad: origen + cantidad });
    fila.cantidad = 0;

    const idSalida = nextId(db.movimientos);
    db.movimientos.unshift(
      {
        id: idSalida, producto_id: fila.producto_id, almacen_id: almacen.id,
        tipo: 'transferencia_salida', cantidad, motivo: `Cierre de almacén ${almacen.nombre}`,
        referencia: `ALM-${central.id}`, usuario_id: req?.user?.id || null, fecha: ahora,
      },
      {
        id: idSalida + 1, producto_id: fila.producto_id, almacen_id: central.id,
        tipo: 'transferencia_entrada', cantidad, motivo: `Cierre de almacén ${almacen.nombre}`,
        referencia: `ALM-${almacen.id}`, usuario_id: req?.user?.id || null, fecha: ahora,
      },
    );
  });

  almacen.activo = false;
  almacen.cerrado_en = ahora;
  almacen.cerrado_por = req?.user?.id || null;
  almacen.stock_transferido = unidades;
  return {
    ok: true,
    almacen,
    transferidos: unidades,
    productos,
    movimientos: productos * 2,
    central: { id: central.id, nombre: central.nombre },
  };
}

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
    es_central: false,
  };
  db.almacenes.push(almacen);
  db.productos.forEach((p) => db.stock.push({ id: nextId(db.stock), producto_id: p.id, almacen_id: almacen.id, cantidad: 0 }));
  audit(db, req, 'Almacén creado', 'Almacenes', almacen.nombre);
  save();
  return res.status(201).json({ almacen });
});

router.put('/:id', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  const campos = ['nombre', 'direccion', 'zona', 'ciudad', 'encargado', 'telefono'];
  campos.forEach((c) => { if (req.body?.[c] !== undefined) almacen[c] = req.body[c]; });

  let cierre = null;
  if (req.body?.activo === false && almacen.activo) {
    try { cierre = cerrarAlmacen(db, almacen, req); }
    catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  } else if (req.body?.activo === true && !almacen.activo) {
    almacen.activo = true;
    almacen.reabierto_en = new Date().toISOString();
  }

  audit(db, req, cierre ? 'Almacén cerrado' : 'Almacén actualizado', 'Almacenes', almacen.nombre);
  save();
  return res.json({ almacen, ...(cierre ? { cierre } : {}) });
});

router.post('/:id/cerrar', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  let resultado;
  try { resultado = cerrarAlmacen(db, almacen, req); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  audit(db, req, 'Almacén cerrado con transferencia', 'Almacenes',
    `${almacen.nombre} · ${resultado.transferidos} unidades → ${resultado.central.nombre}`);
  save();
  return res.json(resultado);
});

router.post('/:id/abrir', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  if (almacen.activo) return res.status(400).json({ error: 'El almacén ya está activo.' });
  almacen.activo = true;
  almacen.reabierto_en = new Date().toISOString();
  delete almacen.cerrado_en;
  audit(db, req, 'Almacén reactivado', 'Almacenes', almacen.nombre);
  save();
  return res.json({ ok: true, almacen });
});

router.delete('/:id', allow(), (req, res) => {
  const db = load();
  const almacen = db.almacenes.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén no encontrado.' });
  let resultado;
  try { resultado = cerrarAlmacen(db, almacen, req); }
  catch (error) { return res.status(error.status || 400).json({ error: error.message }); }
  audit(db, req, 'Almacén desactivado', 'Almacenes', almacen.nombre);
  save();
  return res.json(resultado);
});

module.exports = router;
