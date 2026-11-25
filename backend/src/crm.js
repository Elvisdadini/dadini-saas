// CRM 360 + scoring RFM (Recencia, Frecuencia, Monetario).
// Todo se deriva en memoria de los datos ya persistidos: no requiere migración.
const { buildIndices } = require('./indexes');
const { round2, daysBetween, addDaysISO, nextId, matches } = require('./utils');
const { pedidoResumen } = require('./services');
const { vencimientoDe } = require('./credito');

const SEGMENTOS = [
  'Campeones', 'Leales', 'Potencial leal', 'Nuevos', 'Prometedores',
  'Necesitan atención', 'Hibernando', 'En riesgo', 'Perdidos', 'Sin actividad',
];

const ACCIONES = {
  Campeones: 'Agradecer, pedir referidos y ofrecer preventa de nuevos productos.',
  Leales: 'Mantener la frecuencia con visitas programadas y combos por volumen.',
  'Potencial leal': 'Aumentar el ticket con venta cruzada y bonificaciones por cantidad.',
  Nuevos: 'Confirmar la experiencia y agendar la segunda visita en 15 días.',
  Prometedores: 'Dar seguimiento cercano para convertirlos en clientes frecuentes.',
  'Necesitan atención': 'Contactar esta semana: hubo una caída en la recencia.',
  Hibernando: 'Reactivar con visita comercial y promoción de recompra.',
  'En riesgo': 'Priorizar cobranza y visita de rescate antes de perder al cliente.',
  Perdidos: 'Último intento de reactivación; evaluar baja comercial.',
  'Sin actividad': 'Sin compras registradas: asignar primera visita de apertura.',
};

const PRIORIDAD = {
  Campeones: 1, Leales: 2, 'Potencial leal': 2, Nuevos: 3, Prometedores: 3,
  'Necesitan atención': 4, Hibernando: 4, 'En riesgo': 5, Perdidos: 4, 'Sin actividad': 3,
};

function notas(db) {
  if (!Array.isArray(db.crm_notas)) db.crm_notas = [];
  return db.crm_notas;
}

// Índices por cliente, construidos una sola vez por llamada.
function indiceColecciones(db) {
  const pedidos = new Map();
  const visitas = new Map();
  const pagos = new Map();
  (db.pedidos || []).forEach((p) => {
    const clave = Number(p.cliente_id);
    if (!pedidos.has(clave)) pedidos.set(clave, []);
    pedidos.get(clave).push(p);
  });
  (db.visitas || []).forEach((v) => {
    const clave = Number(v.cliente_id);
    if (!visitas.has(clave)) visitas.set(clave, []);
    visitas.get(clave).push(v);
  });
  (db.pagos || []).forEach((p) => {
    const clave = Number(p.cliente_id);
    if (!pagos.has(clave)) pagos.set(clave, []);
    pagos.get(clave).push(p);
  });
  return { pedidos, visitas, pagos };
}

function scoreRecencia(dias) {
  if (dias === null) return 0;
  if (dias <= 15) return 5;
  if (dias <= 30) return 4;
  if (dias <= 60) return 3;
  if (dias <= 90) return 2;
  return 1;
}

function scoreFrecuencia(cantidad) {
  if (!cantidad) return 0;
  if (cantidad >= 12) return 5;
  if (cantidad >= 8) return 4;
  if (cantidad >= 5) return 3;
  if (cantidad >= 3) return 2;
  return 1;
}

// Quintiles relativos: el monto se compara contra la cartera completa.
function scoreMonetario(valor, valores) {
  if (!(valor > 0) || !valores.length) return 0;
  const menores = valores.filter((v) => v < valor).length;
  const iguales = valores.filter((v) => v === valor).length;
  const pct = (menores + (iguales - 1) / 2) / Math.max(1, valores.length - 1);
  return Math.min(5, Math.max(1, Math.ceil(pct * 5)));
}

function segmentar(r, f, m, frecuencia) {
  if (!frecuencia) return 'Sin actividad';
  if (r >= 4 && f >= 4) return 'Campeones';
  if (f >= 4 && r >= 3) return 'Leales';
  if (r >= 4 && f >= 3) return 'Potencial leal';
  if (r >= 5 && f <= 2) return 'Nuevos';
  if (r >= 4 && f <= 2) return 'Prometedores';
  if (r === 3 && f >= 2) return 'Necesitan atención';
  if (r <= 2 && f >= 3) return 'Hibernando';
  // Un cliente de alto valor que dejó de comprar también está en riesgo,
  // aunque su frecuencia histórica sea baja.
  if (r <= 2 && (f === 2 || m >= 4)) return 'En riesgo';
  if (r <= 2 && f <= 1) return 'Perdidos';
  return 'Necesitan atención';
}

function calcular(db, cliente, idx, montos, limite12m) {
  const pedidos = (idx.pedidos.get(Number(cliente.id)) || []).filter((p) => p.estado !== 'cancelado');
  const visitas = idx.visitas.get(Number(cliente.id)) || [];
  const pagos = idx.pagos.get(Number(cliente.id)) || [];
  const fechas = pedidos.map((p) => p.created_at).filter(Boolean).sort();
  const ultima = fechas[fechas.length - 1] || null;
  const recencia = ultima ? daysBetween(ultima) : null;
  const frecuencia12m = pedidos.filter((p) => p.created_at >= limite12m).length;
  const monetario12m = round2(pedidos.filter((p) => p.created_at >= limite12m).reduce((s, p) => s + Number(p.total || 0), 0));
  const total = round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0));
  const diasGracia = Number(db.configuracion?.credito?.dias_gracia || 0);
  const morosos = pedidos.filter((p) => {
    if (!(p.saldo > 0)) return false;
    return daysBetween(vencimientoDe(db, p)) > diasGracia;
  });
  const vencido = round2(morosos.reduce((s, p) => s + Number(p.total_a_cobrar || p.saldo || 0), 0));
  const ciclo = fechas.length >= 2
    ? Math.round((Date.parse(fechas[fechas.length - 1]) - Date.parse(fechas[0])) / 86400000 / (fechas.length - 1))
    : 30;

  const r = scoreRecencia(recencia);
  const f = scoreFrecuencia(frecuencia12m);
  const m = scoreMonetario(monetario12m, montos);
  const segmento = segmentar(r, f, m, pedidos.length);
  let prioridad = PRIORIDAD[segmento] || 3;
  if (morosos.length) prioridad = 5;

  return {
    cliente_id: cliente.id,
    recencia_dias: recencia,
    ultima_compra: ultima,
    frecuencia: pedidos.length,
    frecuencia_12m: frecuencia12m,
    monetario: total,
    monetario_12m: monetario12m,
    ticket_promedio: pedidos.length ? round2(total / pedidos.length) : 0,
    ciclo_dias: ciclo,
    proxima_compra_sugerida: ultima ? addDaysISO(String(ultima).slice(0, 10), ciclo || 30) : null,
    visitas: visitas.length,
    ultima_visita: visitas.map((v) => v.fecha).filter(Boolean).sort().pop() || null,
    pagos: pagos.length,
    saldo: round2(cliente.saldo || 0),
    vencido,
    en_mora: morosos.length > 0,
    facturas_vencidas: morosos.length,
    score_r: r, score_f: f, score_m: m,
    score: Math.round(((r + f + m) / 15) * 100),
    segmento,
    prioridad,
    accion: ACCIONES[segmento],
  };
}

function listar(db, filtros = {}) {
  const idx = indiceColecciones(db);
  const limite12m = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  // Montos de la cartera para los quintiles del componente monetario.
  const montos = (db.clientes || []).map((c) => round2(
    (idx.pedidos.get(Number(c.id)) || [])
      .filter((p) => p.estado !== 'cancelado' && p.created_at >= limite12m)
      .reduce((s, p) => s + Number(p.total || 0), 0),
  )).filter((v) => v > 0).sort((a, b) => a - b);

  let filas = (db.clientes || []).map((c) => {
    const rfm = calcular(db, c, idx, montos, limite12m);
    return {
      ...rfm,
      id: c.id,
      codigo: c.codigo || `CLI-${c.id}`,
      nombre: c.nombre,
      tipo: c.tipo || 'minorista',
      zona: c.zona || '',
      vendedor_id: c.vendedor_id || null,
      ruta_venta: c.ruta_venta || '',
      dia_visita: c.dia_visita || null,
      telefono: c.telefono || '',
      whatsapp: c.whatsapp || c.telefono || '',
      activo: c.activo !== false,
      limite_credito: round2(c.limite_credito || 0),
    };
  });

  if (filtros.activo !== 'todos') filas = filas.filter((c) => c.activo);
  if (filtros.segmento && filtros.segmento !== 'todos') filas = filas.filter((c) => c.segmento === filtros.segmento);
  if (filtros.zona) filas = filas.filter((c) => c.zona === filtros.zona);
  if (filtros.tipo && filtros.tipo !== 'todos') filas = filas.filter((c) => c.tipo === filtros.tipo);
  if (filtros.vendedor_id) filas = filas.filter((c) => Number(c.vendedor_id) === Number(filtros.vendedor_id));
  if (filtros.riesgo === 'mora') filas = filas.filter((c) => c.en_mora);
  if (filtros.riesgo === 'sin_actividad') filas = filas.filter((c) => c.segmento === 'Sin actividad');
  if (filtros.search) filas = filas.filter((c) => matches(`${c.nombre} ${c.codigo} ${c.zona} ${c.telefono}`, filtros.search));

  const orden = filtros.sort || 'score';
  const cmp = {
    score: (a, b) => b.score - a.score || b.monetario - a.monetario,
    recencia: (a, b) => (a.recencia_dias ?? 9999) - (b.recencia_dias ?? 9999),
    monetario: (a, b) => b.monetario_12m - a.monetario_12m,
    frecuencia: (a, b) => b.frecuencia_12m - a.frecuencia_12m,
    saldo: (a, b) => b.saldo - a.saldo,
  }[orden] || (() => 0);
  filas.sort(cmp);

  const todas = (db.clientes || []).map((c) => calcular(db, c, idx, montos, limite12m));
  const porSegmento = Object.fromEntries(SEGMENTOS.map((s) => [s, todas.filter((c) => c.segmento === s).length]));
  const resumen = {
    total: (db.clientes || []).filter((c) => c.activo !== false).length,
    por_segmento: porSegmento,
    campeones: porSegmento.Campeones,
    en_riesgo: porSegmento['En riesgo'] + porSegmento.Perdidos,
    en_mora: todas.filter((c) => c.en_mora).length,
    sin_actividad: porSegmento['Sin actividad'],
    cartera: round2(todas.reduce((s, c) => s + c.saldo, 0)),
    vencido: round2(todas.reduce((s, c) => s + c.vencido, 0)),
    compras_12m: round2(todas.reduce((s, c) => s + c.monetario_12m, 0)),
    score_promedio: todas.length ? Math.round(todas.reduce((s, c) => s + c.score, 0) / todas.length) : 0,
  };
  return { clientes: filas, total: filas.length, resumen, segmentos: SEGMENTOS };
}

function detalle(db, clienteId, indicesBD) {
  const cliente = (db.clientes || []).find((c) => c.id === Number(clienteId));
  if (!cliente) return null;
  const idx = indicesBD || buildIndices(db);
  const colecciones = indiceColecciones(db);
  const limite12m = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const montos = (db.clientes || []).map((c) => round2(
    (colecciones.pedidos.get(Number(c.id)) || [])
      .filter((p) => p.estado !== 'cancelado' && p.created_at >= limite12m)
      .reduce((s, p) => s + Number(p.total || 0), 0),
  )).filter((v) => v > 0).sort((a, b) => a - b);
  const rfm = calcular(db, cliente, colecciones, montos, limite12m);

  const pedidos = (colecciones.pedidos.get(Number(cliente.id)) || [])
    .slice().sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .map((p) => pedidoResumen(db, p, false, idx));
  const visitas = (colecciones.visitas.get(Number(cliente.id)) || [])
    .slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .map((v) => ({
      ...v,
      cliente_nombre: cliente.nombre,
      usuario_nombre: idx.usuarios.get(Number(v.usuario_id))?.nombre || 'Sistema',
    }));
  const pedidosPorId = new Map((db.pedidos || []).map((p) => [Number(p.id), p]));
  const pagos = (colecciones.pagos.get(Number(cliente.id)) || [])
    .slice().sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
    .map((p) => ({
      ...p,
      pedido_codigo: pedidosPorId.get(Number(p.pedido_id))?.codigo || null,
      usuario_nombre: idx.usuarios.get(Number(p.usuario_id))?.nombre || 'Sistema',
    }));
  const notasCliente = notas(db).filter((n) => Number(n.cliente_id) === Number(cliente.id))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)))
    .map((n) => ({ ...n, usuario_nombre: idx.usuarios.get(Number(n.usuario_id))?.nombre || 'Sistema' }));

  const productos = new Map();
  pedidos.forEach((p) => (p.items || []).forEach((it) => {
    const clave = Number(it.producto_id);
    const prev = productos.get(clave) || { producto_id: clave, nombre: it.nombre || 'Producto', cantidad: 0, total: 0 };
    prev.cantidad += Number(it.cantidad || 0);
    prev.total = round2(prev.total + Number(it.subtotal || 0));
    productos.set(clave, prev);
  }));

  const timeline = [
    ...pedidos.map((p) => ({ id: `p${p.id}`, tipo: 'pedido', fecha: p.created_at, titulo: `Pedido ${p.codigo}`, detalle: `Bs ${Number(p.total || 0).toFixed(2)} · ${p.estado}`, estado: p.estado })),
    ...visitas.map((v) => ({ id: `v${v.id}`, tipo: 'visita', fecha: v.fecha, titulo: `Visita ${v.tipo}`, detalle: [v.resultado, v.motivo, v.notas].filter(Boolean).join(' · ') || 'Sin detalle', estado: v.estado })),
    ...pagos.map((p) => ({ id: `pg${p.id}`, tipo: 'pago', fecha: p.fecha, titulo: `Pago Bs ${Number(p.monto || 0).toFixed(2)}`, detalle: [p.metodo, p.pedido_codigo].filter(Boolean).join(' · '), estado: 'pagado' })),
    ...notasCliente.map((n) => ({ id: `n${n.id}`, tipo: 'nota', fecha: n.fecha, titulo: 'Nota CRM', detalle: n.texto, estado: n.tipo || 'seguimiento' })),
  ].filter((e) => e.fecha).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 60);

  return {
    cliente,
    rfm,
    pedidos,
    visitas,
    pagos,
    notas: notasCliente,
    timeline,
    productos_favoritos: [...productos.values()].sort((a, b) => b.cantidad - a.cantidad).slice(0, 10),
    resumen: {
      total_comprado: rfm.monetario,
      compras_12m: rfm.monetario_12m,
      saldo: rfm.saldo,
      vencido: rfm.vencido,
      pedidos: rfm.frecuencia,
      visitas: rfm.visitas,
      ultima_compra: rfm.ultima_compra,
      ticket_promedio: rfm.ticket_promedio,
    },
  };
}

function agregarNota(db, clienteId, datos, usuarioId) {
  const cliente = (db.clientes || []).find((c) => c.id === Number(clienteId));
  if (!cliente) throw new Error('Cliente no encontrado.');
  const texto = String(datos?.texto || '').trim();
  if (!texto) throw new Error('Escribe el contenido de la nota.');
  const nota = {
    id: nextId(notas(db)),
    cliente_id: Number(clienteId),
    texto,
    tipo: String(datos?.tipo || 'seguimiento'),
    usuario_id: usuarioId || null,
    fecha: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };
  notas(db).push(nota);
  return nota;
}

module.exports = { listar, detalle, agregarNota, SEGMENTOS, ACCIONES };
