// Demanda histórica y reposición sugerida. Todo se deriva de pedidos, stock
// y lotes ya persistidos; no requiere migraciones ni llamadas externas.
const { buildIndices } = require('./indexes');
const { stockDe } = require('./services');
const { fechaCorta, rangoFechas } = require('./services');
const kardex = require('./kardex');
const { round2, addDaysISO, hoy } = require('./utils');

function configuracion(db) {
  const c = db.configuracion?.reposicion || {};
  return {
    dias: Number(c.dias_historial) || 30,
    lead_time: Number(c.lead_time_dias) || 7,
    seguridad: Number(c.stock_seguridad_dias) || 3,
  };
}

function seriePorProducto(db, productoId, desde, hasta) {
  const porDia = new Map();
  (db.pedidos || [])
    .filter((p) => p.estado !== 'cancelado')
    .filter((p) => { const f = fechaCorta(p.created_at); return f >= desde && f <= hasta; })
    .forEach((p) => {
      const dia = fechaCorta(p.created_at);
      (p.items || []).forEach((it) => {
        if (Number(it.producto_id) !== Number(productoId) || it.bonificacion) return;
        const fila = porDia.get(dia) || { fecha: dia, cantidad: 0, pedidos: 0, total: 0 };
        fila.cantidad += Number(it.cantidad || 0);
        fila.pedidos += 1;
        fila.total = round2(fila.total + Number(it.subtotal || 0));
        porDia.set(dia, fila);
      });
    });
  return [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

function vencidosDe(db, productoId) {
  const hoyISO = hoy();
  return (db.lotes || [])
    .filter((l) => Number(l.producto_id) === Number(productoId)
      && l.fecha_vencimiento && l.fecha_vencimiento < hoyISO)
    .reduce((s, l) => s + Number(l.cantidad || 0), 0);
}

function proveedorPara(db, producto) {
  const categoria = String(producto.categoria || '').trim().toLowerCase();
  const porCategoria = (db.proveedores || []).find((p) => p.activo !== false
    && (p.categorias || []).some((c) => String(c).trim().toLowerCase() === categoria));
  return porCategoria || (db.proveedores || []).find((p) => p.activo !== false) || null;
}

function analizar(db, producto, cfg, indices, serie) {
  const demandaTotal = serie.reduce((s, d) => s + d.cantidad, 0);
  const demandaDiaria = round2(demandaTotal / cfg.dias);
  const stock = stockDe(db, producto.id, indices);
  const vencido = vencidosDe(db, producto.id);
  const vendible = Math.max(0, round2(stock - vencido));
  const cobertura = demandaDiaria > 0 ? round2(vendible / demandaDiaria) : null;
  const puntoReorden = Math.ceil(demandaDiaria * (cfg.lead_time + cfg.seguridad) + Number(producto.stock_minimo || 0) * 0.5);
  const sugerido = Math.max(0, puntoReorden - vendible);
  const proveedor = proveedorPara(db, producto);
  let urgencia = 'baja';
  if (demandaDiaria > 0 && (vendible <= 0 || cobertura < cfg.lead_time * 0.5)) urgencia = 'critica';
  else if (cobertura !== null && cobertura < cfg.lead_time) urgencia = 'alta';
  else if (cobertura !== null && cobertura <= cfg.lead_time * 1.5) urgencia = 'media';
  return {
    producto_id: producto.id,
    sku: producto.sku,
    nombre: producto.nombre,
    categoria: producto.categoria || '',
    unidad: producto.unidad || 'unidad',
    demanda_total: demandaTotal,
    demanda_diaria: demandaDiaria,
    dias_analizados: cfg.dias,
    stock,
    vencido,
    vendible,
    stock_minimo: producto.stock_minimo || 0,
    dias_cobertura: cobertura,
    quiebre_en: cobertura === null ? null : addDaysISO(hoy(), Math.max(0, Math.floor(cobertura))),
    lead_time_dias: cfg.lead_time,
    punto_reorden: puntoReorden,
    sugerido,
    urgencia,
    precio_estimado: round2(producto.costo || 0),
    proveedor_id: proveedor?.id || null,
    proveedor_nombre: proveedor?.nombre || null,
    serie: serie,
  };
}

function sugerencias(db, filtros = {}) {
  const cfg = configuracion(db);
  const indices = buildIndices(db);
  const [desde, hasta] = rangoFechas(
    filtros.desde || addDaysISO(hoy(), -cfg.dias + 1),
    filtros.hasta || hoy(),
  );
  const productos = (db.productos || []).filter((p) => p.activo !== false)
    .filter((p) => !filtros.categoria || p.categoria === filtros.categoria)
    .filter((p) => filtros.solo_urgentes ? ['critica', 'alta'].includes(
      analizar(db, p, cfg, indices, seriePorProducto(db, p.id, desde, hasta)).urgencia,
    ) : true);
  const filas = productos.map((p) => analizar(db, p, cfg, indices, seriePorProducto(db, p.id, desde, hasta)));
  filas.sort((a, b) => {
    const peso = { critica: 0, alta: 1, media: 2, baja: 3 };
    return peso[a.urgencia] - peso[b.urgencia] || b.sugerido - a.sugerido;
  });
  const resumen = {
    productos: filas.length,
    quiebras: filas.filter((f) => f.urgencia === 'critica').length,
    riesgo_alto: filas.filter((f) => f.urgencia === 'alta').length,
    sugerido_total: filas.reduce((s, f) => s + f.sugerido, 0),
    inversion_estimada: round2(filas.reduce((s, f) => s + f.sugerido * f.precio_estimado, 0)),
    lead_time_dias: cfg.lead_time,
    dias_historial: cfg.dias,
  };
  return { rangos: { desde, hasta }, resumen, sugerencias: filas };
}

function detalle(db, productoId, filtros = {}) {
  const producto = (db.productos || []).find((p) => p.id === Number(productoId));
  if (!producto) return null;
  const cfg = configuracion(db);
  const indices = buildIndices(db);
  const [desde, hasta] = rangoFechas(
    filtros.desde || addDaysISO(hoy(), -cfg.dias + 1),
    filtros.hasta || hoy(),
  );
  const serie = seriePorProducto(db, producto.id, desde, hasta);
  const lotes = (db.lotes || []).filter((l) => Number(l.producto_id) === Number(producto.id))
    .map((l) => ({ ...l, vencido: Boolean(l.fecha_vencimiento && l.fecha_vencimiento < hoy()) }));
  return {
    producto: { id: producto.id, sku: producto.sku, nombre: producto.nombre, categoria: producto.categoria, unidad: producto.unidad },
    analisis: analizar(db, producto, cfg, indices, serie),
    serie,
    lotes,
    stock_por_almacen: (db.almacenes || []).map((a) => ({
      almacen: a.nombre,
      cantidad: (db.stock || []).find((s) => Number(s.producto_id) === Number(producto.id) && Number(s.almacen_id) === Number(a.id))?.cantidad || 0,
    })),
  };
}

module.exports = { sugerencias, detalle, configuracion };
