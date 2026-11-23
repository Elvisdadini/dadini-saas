const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, nextCode, audit, num, round2 } = require('../utils');

const router = express.Router();
router.use(authRequired, allow('admin', 'dueno', 'almacen', 'supervisor'));

const TIPOS = ['semanal', 'mensual'];
const ESTADOS = ['en_curso', 'finalizado', 'cancelado'];

function enriquecerLinea(db, conteo, linea) {
  const producto = db.productos.find((p) => p.id === linea.producto_id);
  const almacen = db.almacenes.find((a) => a.id === linea.almacen_id);
  const contado = linea.conteo === null || linea.conteo === undefined ? null : Number(linea.conteo);
  return {
    ...linea,
    producto_nombre: producto?.nombre || 'Producto eliminado',
    producto_sku: producto?.sku || '—',
    producto_emoji: producto?.emoji || '📦',
    producto_categoria: producto?.categoria || '',
    producto_marca: producto?.marca || '',
    unidad: producto?.unidad || 'unidad',
    unidades_por_caja: producto?.unidades_por_caja || 1,
    almacen_nombre: almacen?.nombre || 'Almacén eliminado',
    diferencia: contado === null ? null : round2(contado - Number(linea.cantidad_sistema || 0)),
    estado: contado === null ? 'pendiente' : (Number(linea.conteo) === Number(linea.cantidad_sistema) ? 'correcto' : 'diferencia'),
  };
}

function resumen(db, conteo) {
  const lineas = (conteo.lineas || []).map((l) => enriquecerLinea(db, conteo, l));
  const contadas = lineas.filter((l) => l.conteo !== null && l.conteo !== undefined);
  const diferencias = contadas.filter((l) => l.diferencia !== 0);
  const responsables = [conteo.responsable_1_id, conteo.responsable_2_id]
    .map((id) => db.usuarios.find((u) => u.id === id))
    .filter(Boolean)
    .map((u) => ({ id: u.id, nombre: u.nombre, cargo: u.cargo || '' }));
  const almacen = conteo.almacen_id ? db.almacenes.find((a) => a.id === conteo.almacen_id) : null;
  return {
    ...conteo,
    responsables,
    almacen_nombre: almacen?.nombre || 'Todos los almacenes',
    lineas,
    avance: lineas.length ? Math.round((contadas.length / lineas.length) * 100) : 0,
    estadisticas: {
      referencias: lineas.length,
      contadas: contadas.length,
      pendientes: lineas.length - contadas.length,
      con_diferencia: diferencias.length,
      unidades_sistema: round2(lineas.reduce((s, l) => s + Number(l.cantidad_sistema || 0), 0)),
      unidades_contadas: round2(contadas.reduce((s, l) => s + Number(l.conteo || 0), 0)),
      diferencia_neta: round2(contadas.reduce((s, l) => s + Number(l.diferencia || 0), 0)),
    },
  };
}

router.get('/', (req, res) => {
  const db = load();
  const { estado, tipo } = req.query;
  let conteos = [...(db.conteos_inventario || [])];
  if (estado && estado !== 'todos') conteos = conteos.filter((c) => c.estado === estado);
  if (tipo && tipo !== 'todos') conteos = conteos.filter((c) => c.tipo === tipo);
  conteos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return res.json({
    conteos: conteos.map((c) => resumen(db, c)),
    activo: conteos.find((c) => c.estado === 'en_curso') || null,
    resumen: {
      total: (db.conteos_inventario || []).length,
      en_curso: (db.conteos_inventario || []).filter((c) => c.estado === 'en_curso').length,
      finalizados: (db.conteos_inventario || []).filter((c) => c.estado === 'finalizado').length,
    },
  });
});

// Inicia un conteo y CONGELA el inventario: las cantidades quedan fijas en el
// snapshot aunque se sigan registrando pedidos mientras tanto.
router.post('/', (req, res) => {
  const db = load();
  if ((db.conteos_inventario || []).some((c) => c.estado === 'en_curso')) {
    return res.status(400).json({ error: 'Ya existe un conteo en curso. Finalízalo antes de iniciar otro.' });
  }
  const { tipo, fecha, almacen_id, responsable_1_id, responsable_2_id, notas } = req.body || {};
  if (!TIPOS.includes(tipo)) return res.status(400).json({ error: 'Selecciona conteo semanal o mensual.' });
  const r1 = db.usuarios.find((u) => u.id === Number(responsable_1_id) && u.activo);
  const r2 = db.usuarios.find((u) => u.id === Number(responsable_2_id) && u.activo);
  if (!r1 || !r2) return res.status(400).json({ error: 'Selecciona dos responsables activos.' });
  if (r1.id === r2.id) return res.status(400).json({ error: 'Los dos responsables deben ser personas distintas.' });
  const almacenId = almacen_id ? Number(almacen_id) : null;
  if (almacenId && !db.almacenes.some((a) => a.id === almacenId && a.activo)) {
    return res.status(400).json({ error: 'El almacén seleccionado no existe.' });
  }
  const ahora = new Date().toISOString();
  const filas = db.stock.filter((s) => !almacenId || s.almacen_id === almacenId);
  const conteo = {
    id: nextId(db.conteos_inventario),
    codigo: nextCode(db.conteos_inventario, 'codigo', 'CON', 1),
    tipo,
    fecha: fecha || ahora.slice(0, 10),
    almacen_id: almacenId,
    responsable_1_id: r1.id,
    responsable_2_id: r2.id,
    notas: notas || '',
    estado: 'en_curso',
    congelado_en: ahora,
    congelado_por: req.user.id,
    created_at: ahora,
    iniciado_por: req.user.id,
    finalizado_en: null,
    lineas: filas.map((s) => ({
      producto_id: s.producto_id,
      almacen_id: s.almacen_id,
      cantidad_sistema: round2(s.cantidad),
      conteo: null,
      contado_por: null,
      contado_en: null,
    })).map((l, i) => ({ ...l, id: i + 1 })),
  };
  db.conteos_inventario.push(conteo);
  audit(db, req, 'Conteo de inventario iniciado', 'Inventario', `${conteo.codigo} · ${tipo} · ${r1.nombre} y ${r2.nombre}`);
  save();
  return res.status(201).json({ conteo: resumen(db, conteo) });
});

function buscarConteo(db, id) {
  return (db.conteos_inventario || []).find((c) => c.id === Number(id));
}

router.get('/:id', (req, res) => {
  const db = load();
  const conteo = buscarConteo(db, req.params.id);
  if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
  return res.json({ conteo: resumen(db, conteo) });
});

// Vista de congelamiento: instantánea intacta del inventario al iniciar el conteo.
router.get('/:id/congelamiento', (req, res) => {
  const db = load();
  const conteo = buscarConteo(db, req.params.id);
  if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
  const r = resumen(db, conteo);
  return res.json({
    codigo: conteo.codigo,
    tipo: conteo.tipo,
    fecha: conteo.fecha,
    congelado_en: conteo.congelado_en,
    responsables: r.responsables,
    almacen_nombre: r.almacen_nombre,
    lineas: r.lineas.map((l) => ({
      producto_id: l.producto_id,
      sku: l.producto_sku,
      producto: l.producto_nombre,
      almacen: l.almacen_nombre,
      cantidad_sistema_congelada: l.cantidad_sistema,
      cantidad_fisica: l.conteo,
      diferencia: l.diferencia,
      estado: l.estado,
    })),
    estadisticas: r.estadisticas,
    nota: 'Esta instantánea no se modifica aunque se registren nuevos pedidos.',
  });
});

// Registra la cantidad contada. Acepta producto_id, sku/código o nombre.
router.post('/:id/contar', (req, res) => {
  const db = load();
  const conteo = buscarConteo(db, req.params.id);
  if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
  if (conteo.estado !== 'en_curso') return res.status(400).json({ error: 'El conteo ya está cerrado.' });
  const { producto_id, codigo, busqueda, cantidad, almacen_id } = req.body || {};
  const valor = num(cantidad, -1);
  if (valor < 0) return res.status(400).json({ error: 'Ingresa una cantidad válida (0 o mayor).' });
  let producto = producto_id ? db.productos.find((p) => p.id === Number(producto_id)) : null;
  const termino = String(codigo || busqueda || '').trim().toLowerCase();
  if (!producto && termino) {
    producto = db.productos.find((p) =>
      String(p.sku || '').toLowerCase() === termino
      || String(p.codigo || '').toLowerCase() === termino
      || String(p.nombre || '').toLowerCase() === termino);
    if (!producto) producto = db.productos.find((p) => String(p.nombre || '').toLowerCase().includes(termino));
  }
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado por código o nombre.' });
  let linea = conteo.lineas.find((l) => l.producto_id === producto.id && (!almacen_id || l.almacen_id === Number(almacen_id)));
  if (!linea && !almacen_id) linea = conteo.lineas.find((l) => l.producto_id === producto.id);
  if (!linea) return res.status(404).json({ error: 'Ese producto no está en el inventario congelado de este conteo.' });
  linea.conteo = round2(valor);
  linea.contado_por = req.user.id;
  linea.contado_en = new Date().toISOString();
  audit(db, req, 'Producto contado', 'Inventario', `${conteo.codigo} · ${producto.nombre} · ${valor} uds.`);
  save();
  const enriquecida = enriquecerLinea(db, conteo, linea);
  return res.json({
    linea: enriquecida,
    mensaje: `${producto.nombre}: ${valor} uds. · diferencia ${enriquecida.diferencia > 0 ? '+' : ''}${enriquecida.diferencia}`,
    conteo: resumen(db, conteo),
  });
});

router.patch('/:id/finalizar', (req, res) => {
  const db = load();
  const conteo = buscarConteo(db, req.params.id);
  if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
  if (conteo.estado !== 'en_curso') return res.status(400).json({ error: 'El conteo ya está cerrado.' });
  const r = resumen(db, conteo);
  if (r.estadisticas.pendientes > 0 && !req.body?.forzar) {
    return res.status(400).json({ error: `Faltan ${r.estadisticas.pendientes} productos por contar. Marca "forzar" para cerrar igual.` });
  }
  if (req.body?.ajustar_stock) {
    conteo.lineas.filter((l) => l.conteo !== null && l.conteo !== undefined).forEach((l) => {
      const fila = db.stock.find((s) => s.producto_id === l.producto_id && s.almacen_id === l.almacen_id);
      if (!fila) return;
      const anterior = Number(fila.cantidad || 0);
      fila.cantidad = round2(l.conteo);
      db.movimientos.unshift({
        id: nextId(db.movimientos),
        producto_id: l.producto_id,
        almacen_id: l.almacen_id,
        tipo: l.conteo >= anterior ? 'entrada' : 'salida',
        cantidad: round2(Math.abs(l.conteo - anterior)),
        motivo: `Ajuste por conteo ${conteo.codigo}`,
        referencia: conteo.codigo,
        usuario_id: req.user.id,
        fecha: new Date().toISOString(),
      });
    });
    conteo.ajustado_en = new Date().toISOString();
  }
  conteo.estado = 'finalizado';
  conteo.finalizado_en = new Date().toISOString();
  conteo.notas_finales = req.body?.notas || '';
  audit(db, req, 'Conteo finalizado', 'Inventario', `${conteo.codigo} · ${r.estadisticas.con_diferencia} diferencias${req.body?.ajustar_stock ? ' · stock ajustado' : ''}`);
  save();
  return res.json({ conteo: resumen(db, conteo) });
});

router.patch('/:id/cancelar', (req, res) => {
  const db = load();
  const conteo = buscarConteo(db, req.params.id);
  if (!conteo) return res.status(404).json({ error: 'Conteo no encontrado.' });
  if (conteo.estado !== 'en_curso') return res.status(400).json({ error: 'El conteo ya está cerrado.' });
  conteo.estado = 'cancelado';
  audit(db, req, 'Conteo cancelado', 'Inventario', conteo.codigo);
  save();
  return res.json({ conteo: resumen(db, conteo) });
});

module.exports = router;
