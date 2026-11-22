const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');
const { stockEn } = require('../services');

const router = express.Router();
router.use(authRequired);

function resumen(db, almacen) {
  const vendedor = db.usuarios.find((u) => u.id === almacen.vendedor_id);
  const vehiculo = db.vehiculos.find((v) => v.id === almacen.vehiculo_id);
  const lineas = (almacen.lineas || []).map((l) => {
    const producto = db.productos.find((p) => p.id === l.producto_id);
    return { ...l, nombre: producto?.nombre || 'Producto', emoji: producto?.emoji || '📦', sku: producto?.sku || '' };
  });
  return {
    ...almacen,
    vendedor_nombre: vendedor?.nombre || 'Sin asignar',
    vehiculo_placa: vehiculo?.placa || 'Sin vehículo',
    lineas,
    total_unidades: lineas.reduce((s, l) => s + l.cantidad, 0),
    total_productos: lineas.filter((l) => l.cantidad > 0).length,
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { vendedor_id, estado } = req.query;
  let items = db.almacenes_moviles.map((a) => resumen(db, a));
  if (vendedor_id) items = items.filter((a) => a.vendedor_id === Number(vendedor_id));
  if (estado && estado !== 'todos') items = items.filter((a) => a.estado === estado);
  return res.json({
    almacenes: items,
    resumen: {
      total: items.length,
      activos: items.filter((a) => a.estado === 'activo').length,
      unidades: items.reduce((s, a) => s + a.total_unidades, 0),
    },
  });
});

router.get('/mio', (req, res) => {
  const db = load();
  const usuario = db.usuarios.find((u) => u.id === req.user.id);
  const almacen = db.almacenes_moviles.find((a) => a.id === usuario?.almacen_movil_id)
    || db.almacenes_moviles.find((a) => a.vendedor_id === req.user.id && a.estado === 'activo');
  if (!almacen) return res.json({ almacen: null });
  return res.json({ almacen: resumen(db, almacen) });
});

function cargarLineas(db, almacen, lineas, almacenOrigenId, req) {
  const movimientos = [];
  for (const fila of lineas) {
    const productoId = Number(fila.producto_id);
    const cantidad = Math.round(num(fila.cantidad));
    const producto = db.productos.find((p) => p.id === productoId);
    if (!producto || cantidad <= 0) continue;
    const disponible = stockEn(db, productoId, almacenOrigenId);
    const aCargar = Math.min(disponible, cantidad);
    if (aCargar <= 0) {
      movimientos.push({ producto_id: productoId, nombre: producto.nombre, solicitado: cantidad, cargado: 0, error: 'Sin stock en almacén origen' });
      continue;
    }
    const row = db.stock.find((s) => s.producto_id === productoId && s.almacen_id === Number(almacenOrigenId));
    row.cantidad -= aCargar;
    const linea = almacen.lineas.find((l) => l.producto_id === productoId);
    if (linea) linea.cantidad += aCargar;
    else almacen.lineas.push({ producto_id: productoId, cantidad: aCargar });
    db.movimientos.unshift({
      id: nextId(db.movimientos), producto_id: productoId, almacen_id: Number(almacenOrigenId),
      tipo: 'salida', cantidad: aCargar, motivo: 'Carga a almacén móvil',
      referencia: almacen.codigo, usuario_id: req.user.id, fecha: new Date().toISOString(),
    });
    movimientos.push({ producto_id: productoId, nombre: producto.nombre, solicitado: cantidad, cargado: aCargar });
  }
  almacen.updated_at = new Date().toISOString();
  return movimientos;
}

router.post('/', allow('admin', 'almacen', 'ventas'), (req, res) => {
  const db = load();
  const { vendedor_id, vehiculo_id, nombre, lineas, almacen_origen_id, notas } = req.body || {};
  const vendedor = db.usuarios.find((u) => u.id === Number(vendedor_id) && ['ventas', 'preventista'].includes(u.rol));
  if (!vendedor) return res.status(400).json({ error: 'Selecciona un vendedor válido.' });
  const almacen = {
    id: nextId(db.almacenes_moviles),
    codigo: nextCode(db.almacenes_moviles, 'codigo', 'AMOV', 1),
    nombre: nombre || `Camión venta directa · ${vendedor.nombre}`,
    vendedor_id: vendedor.id,
    vehiculo_id: Number(vehiculo_id) || vendedor.vehiculo_id || null,
    ruta_venta: vendedor.ruta_venta || null,
    zona: vendedor.zona_venta || null,
    estado: 'activo',
    lineas: [],
    notas: notas || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.almacenes_moviles.push(almacen);
  const movimientos = cargarLineas(db, almacen, lineas || [], Number(almacen_origen_id) || 1, req);
  vendedor.almacen_movil_id = almacen.id;
  vendedor.es_venta_directa = true;
  audit(db, req, 'Almacén móvil creado', 'Inventario', `${almacen.codigo} · ${vendedor.nombre} · ${almacen.total_unidades || (almacen.lineas || []).reduce((s, l) => s + l.cantidad, 0)} uds.`);
  save();
  return res.status(201).json({ almacen: resumen(db, almacen), movimientos });
});

router.post('/:id/cargar', allow('admin', 'almacen', 'ventas'), (req, res) => {
  const db = load();
  const almacen = db.almacenes_moviles.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén móvil no encontrado.' });
  const movimientos = cargarLineas(db, almacen, req.body?.lineas || [], Number(req.body?.almacen_origen_id) || 1, req);
  audit(db, req, 'Almacén móvil recargado', 'Inventario', almacen.codigo);
  save();
  return res.json({ almacen: resumen(db, almacen), movimientos });
});

router.patch('/:id/estado', allow('admin', 'almacen', 'ventas'), (req, res) => {
  const db = load();
  const almacen = db.almacenes_moviles.find((a) => a.id === Number(req.params.id));
  if (!almacen) return res.status(404).json({ error: 'Almacén móvil no encontrado.' });
  if (['activo', 'cerrado'].includes(req.body?.estado)) almacen.estado = req.body.estado;
  almacen.updated_at = new Date().toISOString();
  save();
  return res.json({ almacen: resumen(db, almacen) });
});

module.exports = router;
