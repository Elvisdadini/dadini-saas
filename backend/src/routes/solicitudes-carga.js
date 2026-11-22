const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num } = require('../utils');
const { stockEn } = require('../services');

const router = express.Router();
router.use(authRequired);

function resumen(db, s) {
  const vendedor = db.usuarios.find((u) => u.id === s.vendedor_id);
  return {
    ...s,
    vendedor_nombre: vendedor?.nombre || '—',
    total_unidades: (s.lineas || []).reduce((sum, l) => sum + l.cantidad, 0),
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, vendedor_id } = req.query;
  let items = db.solicitudes_carga.map((s) => resumen(db, s));
  if (estado && estado !== 'todos') items = items.filter((s) => s.estado === estado);
  if (vendedor_id) items = items.filter((s) => s.vendedor_id === Number(vendedor_id));
  items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return res.json({
    solicitudes: items,
    resumen: {
      pendientes: items.filter((s) => s.estado === 'pendiente').length,
      aprobadas: items.filter((s) => s.estado === 'aprobada').length,
    },
  });
});

router.post('/', allow('ventas', 'preventista', 'vendedor_camion'), (req, res) => {
  const db = load();
  const { lineas, almacen_origen_id, notas } = req.body || {};
  const items = (lineas || []).map((l) => ({ producto_id: Number(l.producto_id), cantidad: Math.max(0, Math.round(num(l.cantidad))) })).filter((l) => l.producto_id && l.cantidad > 0);
  if (!items.length) return res.status(400).json({ error: 'Agrega productos a la solicitud.' });
  const solicitud = {
    id: nextId(db.solicitudes_carga),
    codigo: nextCode(db.solicitudes_carga, 'codigo', 'SOL-CARGA', 1),
    vendedor_id: req.user.id,
    almacen_origen_id: Number(almacen_origen_id) || 1,
    lineas: items,
    notas: notas || '',
    estado: 'pendiente',
    fecha: new Date().toISOString(),
    aprobada_por: null,
    fecha_aprobacion: null,
  };
  db.solicitudes_carga.push(solicitud);
  audit(db, req, 'Solicitud de carga creada', 'Inventario', `${solicitud.codigo} · ${items.length} productos`);
  save();
  return res.status(201).json({ solicitud: resumen(db, solicitud) });
});

router.patch('/:id/aprobar', allow('almacen', 'admin', 'dueno'), (req, res) => {
  const db = load();
  const solicitud = db.solicitudes_carga.find((s) => s.id === Number(req.params.id));
  if (!solicitud) return res.status(404).json({ error: 'Solicitud no encontrada.' });
  if (solicitud.estado === 'aprobada') return res.status(400).json({ error: 'La solicitud ya fue aprobada.' });

  const vendedor = db.usuarios.find((u) => u.id === solicitud.vendedor_id);
  let movil = db.almacenes_moviles.find((a) => a.id === vendedor?.almacen_movil_id)
    || db.almacenes_moviles.find((a) => a.vendedor_id === solicitud.vendedor_id && a.estado === 'activo');
  if (!movil) {
    movil = {
      id: nextId(db.almacenes_moviles),
      codigo: nextCode(db.almacenes_moviles, 'codigo', 'AMOV', 1),
      nombre: `Camión venta directa · ${vendedor?.nombre || 'Vendedor'}`,
      vendedor_id: solicitud.vendedor_id,
      vehiculo_id: vendedor?.vehiculo_id || null,
      ruta_venta: vendedor?.ruta_venta || null,
      zona: vendedor?.zona_venta || null,
      estado: 'activo',
      lineas: [],
      notas: `Creada desde ${solicitud.codigo}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    db.almacenes_moviles.push(movil);
    vendedor.almacen_movil_id = movil.id;
    vendedor.es_venta_directa = true;
  }

  const cargados = [];
  solicitud.lineas.forEach((linea) => {
    const disponible = stockEn(db, linea.producto_id, solicitud.almacen_origen_id);
    const cantidad = Math.min(disponible, linea.cantidad);
    if (cantidad <= 0) {
      cargados.push({ producto_id: linea.producto_id, solicitado: linea.cantidad, cargado: 0 });
      return;
    }
    const fila = db.stock.find((s) => s.producto_id === linea.producto_id && s.almacen_id === Number(solicitud.almacen_origen_id));
    fila.cantidad -= cantidad;
    const actual = movil.lineas.find((l) => l.producto_id === linea.producto_id);
    if (actual) actual.cantidad += cantidad;
    else movil.lineas.push({ producto_id: linea.producto_id, cantidad });
    db.movimientos.unshift({
      id: nextId(db.movimientos), producto_id: linea.producto_id, almacen_id: Number(solicitud.almacen_origen_id),
      tipo: 'salida', cantidad, motivo: `Solicitud ${solicitud.codigo}`,
      referencia: movil.codigo, usuario_id: req.user.id, fecha: new Date().toISOString(),
    });
    cargados.push({ producto_id: linea.producto_id, solicitado: linea.cantidad, cargado: cantidad });
  });

  solicitud.estado = 'aprobada';
  solicitud.aprobada_por = req.user.id;
  solicitud.fecha_aprobacion = new Date().toISOString();
  movil.updated_at = new Date().toISOString();
  audit(db, req, 'Solicitud de carga aprobada', 'Inventario', `${solicitud.codigo} → ${movil.codigo}`);
  save();
  return res.json({ solicitud: resumen(db, solicitud), almacen_movil_codigo: movil.codigo, cargados });
});

module.exports = router;
