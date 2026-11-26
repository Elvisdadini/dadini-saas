// Memoria del asistente: documentos indexados sobre productos, políticas y
// normativa. Búsqueda por Bolsa de Palabras con similitud coseno, sin embeddings.
const { normalize, nextId, round2 } = require('./utils');
const { config: configCredito } = require('./credito');
const { normativaVigente, REGISTRO } = require('./fiscal-normativa');

function tokenizar(texto) {
  return normalize(String(texto || ''))
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

function asegurar(db) {
  if (!Array.isArray(db.documentos_rag)) db.documentos_rag = [];
  return db.documentos_rag;
}

function productoDocumento(p) {
  const partes = [
    `Producto ${p.sku} ${p.nombre}. Categoría ${p.categoria || 'sin categoría'}. Marca ${p.marca || 'sin marca'}.`,
    `Precio de venta Bs ${round2(p.precio || 0)}. Costo Bs ${round2(p.costo || 0)}. Unidad ${p.unidad || 'unidad'}. Presentación ${p.presentacion || 'sin presentación'}.`,
    `Stock total ${p.stock_total ?? 0}, mínimo ${p.stock_minimo ?? 0}. Vender por: ${(p.vender_por || []).join(', ') || 'mostrador'}.`,
    `Categorías de cliente permitidas: ${(p.categorias_clientes || []).join(', ') || 'todas'}.`,
  ];
  return { titulo: `${p.sku} · ${p.nombre}`, contenido: partes.join(' '), fuente: `productos#${p.id}`, tags: ['producto', String(p.categoria || '').toLowerCase()] };
}

function documentosGenerados(db) {
  const salida = [];
  (db.productos || []).filter((p) => p.activo !== false).forEach((p) => salida.push({ tipo: 'producto', ...productoDocumento(p) }));

  const credito = configCredito(db);
  const empresa = db.configuracion?.empresa || {};
  salida.push({
    tipo: 'politica_credito',
    titulo: 'Política de crédito y cobranzas',
    contenido: `Días de crédito por defecto: ${empresa.dias_credito || 15}. Interés mensual ${credito.tasa_interes_mensual}% (tasa diaria ${round2(credito.tasa_interes_mensual / 30)}%). Aplicar intereses: ${credito.aplicar_interes ? 'sí' : 'no'}. Días de gracia: ${credito.dias_gracia}. Sanción fija Bs ${credito.sancion_fija} y porcentual ${credito.porcentaje_sancion}%. El límite por cliente es cliente.limite_credito y no se puede superar con saldo pendiente. Un cliente con mora puede ser bloqueado automáticamente.`,
    fuente: 'configuracion.credito + credito.js',
    tags: ['credito', 'interes', 'mora', 'limite'],
  });
  salida.push({
    tipo: 'politica_cobranza',
    titulo: 'Política de cobranza',
    contenido: `Cobrador por defecto: ${db.configuracion?.cobranza?.cobrador_id || 'sin asignar'}. Solo vencidas para el cobrador: ${db.configuracion?.cobranza?.solo_vencidas_para_cobrador ? 'sí' : 'no'}. Los vendedores cobran al día: ${db.configuracion?.cobranza?.vendedores_cobran_al_dia ? 'sí' : 'no'}.`,
    fuente: 'configuracion.cobranza',
    tags: ['cobranza', 'vencidas'],
  });
  const reglas = db.configuracion?.fiscal?.normativa?.reglas
    ? normativaVigente(db.configuracion.fiscal.normativa.reglas)
    : normativaVigente(REGISTRO);
  reglas.forEach((r) => salida.push({
    tipo: 'normativa_siat',
    titulo: r.norma,
    contenido: `${r.descripcion || ''} Tipo ${r.tipo}. Valor ${r.valor ?? '—'}. Vigencia ${r.fecha_desde || 'inicio'} a ${r.fecha_hasta || 'indefinida'}. Fuente ${r.fuente || 'registro interno'}.`,
    fuente: `fiscal-normativa#${r.id}`,
    tags: ['siat', 'iva', 'it', String(r.tipo || '')],
  }));
  return salida;
}

function documentos(db) {
  const propios = asegurar(db)
    .filter((d) => d.activo !== false)
    .map((d) => ({
      id: d.id,
      tipo: d.tipo || 'nota',
      titulo: d.titulo,
      contenido: d.contenido,
      fuente: d.fuente || 'memoria manual',
      tags: d.tags || [],
    }));
  return [...documentosGenerados(db), ...propios];
}

function buscar(db, consulta, opciones = {}) {
  const tokens = [...new Set(tokenizar(consulta))];
  if (!tokens.length) return [];
  const limite = Number(opciones.limite) || 4;
  return documentos(db)
    .filter((d) => !opciones.tipo || d.tipo === opciones.tipo)
    .map((d) => {
      const cuerpo = new Set([...tokenizar(d.titulo), ...tokenizar(d.contenido), ...(d.tags || []).flatMap(tokenizar)]);
      const inter = tokens.filter((t) => cuerpo.has(t)).length;
      const texto = normalize(`${d.titulo} ${d.contenido}`);
      const exacto = texto.includes(normalize(consulta)) ? 0.35 : 0;
      return { ...d, score: round2(inter / Math.sqrt(tokens.length * Math.max(1, cuerpo.size)) + exacto) };
    })
    .filter((d) => d.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);
}

function contexto(db, mensaje, limite = 4) {
  const encontrados = buscar(db, mensaje, { limite });
  if (!encontrados.length) return '';
  return encontrados.map((d) => `[${d.tipo}] ${d.titulo} (${d.fuente}): ${String(d.contenido).slice(0, 700)}`).join('\n');
}

function agregar(db, datos) {
  const titulo = String(datos?.titulo || '').trim();
  const contenido = String(datos?.contenido || '').trim();
  if (!titulo || !contenido) throw new Error('Título y contenido son obligatorios.');
  const lista = asegurar(db);
  const doc = {
    id: nextId(lista),
    tipo: ['faq', 'nota', 'politica'].includes(datos.tipo) ? datos.tipo : 'nota',
    titulo, contenido,
    fuente: String(datos.fuente || 'memoria manual'),
    tags: Array.isArray(datos.tags) ? datos.tags.map(String) : [],
    activo: true,
    created_at: new Date().toISOString(),
  };
  lista.push(doc);
  return doc;
}

module.exports = { asegurar, documentos, buscar, contexto, agregar, tokenizar };
