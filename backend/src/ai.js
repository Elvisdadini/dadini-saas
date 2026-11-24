// Agente AI de DADINI SaaS. La llave de OpenAI vive SOLO en el backend.
// Las acciones que escriben se proponen y se ejecutan únicamente después de
// una confirmación explícita del usuario con permisos suficientes.
const config = require('./config');
const { load, save } = require('./db');
const { audit, round2, num } = require('./utils');
const { dashboard } = require('./services');
const { tienePermiso } = require('./permisos');
const { asignarCliente } = require('./asignacion');

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const BASE_URL = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
const API_KEY = process.env.OPENAI_API_KEY || '';
const MAX_TURNOS = 3;

function estaConfigurado() {
  return Boolean(API_KEY);
}

const HERRAMIENTAS = [
  {
    name: 'resumen_ventas',
    description: 'Ventas del período: total, pedidos, ticket promedio, margen y variación. periodo puede ser 7d, 30d o 90d.',
    parameters: {
      type: 'object',
      properties: { periodo: { type: 'string', enum: ['7d', '30d', '90d'], description: 'Período a consultar' } },
      required: [],
    },
    permiso: null,
    escritura: false,
  },
  {
    name: 'cobranzas_vencidas',
    description: 'Cuentas vencidas: cantidad, monto total y los clientes con mayor saldo.',
    parameters: { type: 'object', properties: { limite: { type: 'number' } }, required: [] },
    permiso: null,
    escritura: false,
  },
  {
    name: 'stock_bajo',
    description: 'Productos activos con stock por debajo del mínimo.',
    parameters: { type: 'object', properties: { limite: { type: 'number' } }, required: [] },
    permiso: null,
    escritura: false,
  },
  {
    name: 'clientes_por_zona_dia',
    description: 'Clientes activos por zona y día de visita. Útil para la agenda de preventa.',
    parameters: {
      type: 'object',
      properties: {
        dia: { type: 'number', description: '1=lunes … 7=domingo' },
        zona: { type: 'string' },
        vendedor_id: { type: 'number' },
      },
      required: [],
    },
    permiso: null,
    escritura: false,
  },
  {
    name: 'top_productos',
    description: 'Productos más vendidos del período con unidades y total.',
    parameters: { type: 'object', properties: { periodo: { type: 'string', enum: ['7d', '30d', '90d'] } }, required: [] },
    permiso: null,
    escritura: false,
  },
  {
    name: 'crear_cliente',
    description: 'Registra un cliente nuevo con nombre, tipo, zona y vendedor opcional.',
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' }, tipo: { type: 'string' }, zona: { type: 'string' },
        telefono: { type: 'string' }, vendedor_id: { type: 'number' }, dia_visita: { type: 'number' },
      },
      required: ['nombre'],
    },
    permiso: 'clientes.crear',
    escritura: true,
  },
  {
    name: 'actualizar_precio',
    description: 'Cambia el precio de venta de un producto existente por su SKU.',
    parameters: {
      type: 'object',
      properties: { sku: { type: 'string' }, precio: { type: 'number' }, costo: { type: 'number' } },
      required: ['sku', 'precio'],
    },
    permiso: 'inventario.editar',
    escritura: true,
  },
  {
    name: 'registrar_visita',
    description: 'Registra una visita de preventa para un cliente con resultado y notas.',
    parameters: {
      type: 'object',
      properties: {
        cliente_id: { type: 'number' },
        resultado: { type: 'string', enum: ['pedido', 'no_pedido', 'contacto'] },
        notas: { type: 'string' },
      },
      required: ['cliente_id', 'resultado'],
    },
    permiso: 'visitas.crear',
    escritura: true,
  },
];

function herramientaPorNombre(nombre) {
  return HERRAMIENTAS.find((h) => h.name === nombre);
}

function puedeUsar(user, herramienta) {
  if (!herramienta.permiso) return true;
  if (['admin', 'dueno'].includes(user?.rol)) return true;
  return tienePermiso(user, herramienta.permiso);
}

function resumenVentas(db, args = {}) {
  const data = dashboard(db, args.periodo || '30d');
  return {
    periodo: args.periodo || '30d',
    ventas: data.kpis.ventas_periodo,
    pedidos: data.kpis.pedidos_hoy,
    ticket_promedio: data.kpis.ticket_promedio,
    margen: data.kpis.margen_periodo,
    variacion_porcentaje: data.kpis.variacion_periodo,
    por_cobrar: data.kpis.por_cobrar,
  };
}

function cobranzasVencidas(db, args = {}) {
  const hoy = new Date().toISOString().slice(0, 10);
  const vencidas = db.pedidos
    .filter((p) => p.saldo > 0 && p.estado !== 'cancelado' && String(p.fecha_vencimiento || '').slice(0, 10) < hoy)
    .sort((a, b) => b.saldo - a.saldo);
  const clientes = new Map((db.clientes || []).map((c) => [c.id, c.nombre]));
  const limite = Math.max(1, Number(args.limite) || 5);
  return {
    cantidad: vencidas.length,
    monto_total: round2(vencidas.reduce((s, p) => s + p.saldo, 0)),
    detalle: vencidas.slice(0, limite).map((p) => ({
      cliente: clientes.get(p.cliente_id) || '—', saldo: p.saldo, vencimiento: p.fecha_vencimiento,
    })),
  };
}

function stockBajo(db, args = {}) {
  const { buildIndices } = require('./indexes');
  const indices = buildIndices(db);
  const limite = Math.max(1, Number(args.limite) || 10);
  const filas = db.productos
    .filter((p) => p.activo !== false && stockDe(db, p.id, indices) <= (p.stock_minimo || 0))
    .map((p) => ({ sku: p.sku, nombre: p.nombre, stock: stockDe(db, p.id, indices), minimo: p.stock_minimo }));
  function stockDe(db2, id, ind) { return ind.stockPorProducto.get(Number(id)) || 0; }
  return { cantidad: filas.length, productos: filas.slice(0, limite) };
}

function clientesPorZonaDia(db, args = {}) {
  const dia = Number(args.dia) || null;
  const zona = String(args.zona || '').trim().toLowerCase();
  const vendedorId = Number(args.vendedor_id) || null;
  const clientes = (db.clientes || []).filter((c) => c.activo !== false
    && (!dia || Number(c.dia_visita) === dia)
    && (!zona || String(c.zona || '').toLowerCase() === zona)
    && (!vendedorId || Number(c.vendedor_id) === vendedorId));
  return {
    cantidad: clientes.length,
    clientes: clientes.slice(0, 20).map((c) => ({ nombre: c.nombre, zona: c.zona, dia: c.dia_visita, telefono: c.telefono })),
  };
}

function topProductos(db, args = {}) {
  const data = dashboard(db, args.periodo || '30d');
  return { productos: data.top_productos };
}

// Ejecuta una herramienta. Si es de escritura y no viene confirmada, solo
// devuelve la propuesta para que el frontend pida aprobación.
function ejecutarHerramienta(db, herramienta, args, req, confirmada = false) {
  if (!herramienta) return { error: 'Herramienta no reconocida.' };
  if (!puedeUsar(req.user, herramienta)) return { error: 'Tu usuario no tiene permiso para esta acción.' };
  if (herramienta.escritura && !confirmada) {
    return { requiere_confirmacion: true, herramienta: herramienta.name, args, resumen: resumenAccion(herramienta.name, args) };
  }

  switch (herramienta.name) {
    case 'resumen_ventas': return resumenVentas(db, args);
    case 'cobranzas_vencidas': return cobranzasVencidas(db, args);
    case 'stock_bajo': return stockBajo(db, args);
    case 'clientes_por_zona_dia': return clientesPorZonaDia(db, args);
    case 'top_productos': return topProductos(db, args);

    case 'crear_cliente': {
      const nombre = String(args.nombre || '').trim();
      if (!nombre) return { error: 'El nombre del cliente es obligatorio.' };
      const cliente = {
        id: require('./utils').nextId(db.clientes),
        codigo: `CLI-${String(require('./utils').nextId(db.clientes)).padStart(3, '0')}`,
        nombre,
        tipo: 'minorista',
        zona: String(args.zona || 'Centro'),
        direccion: '', telefono: String(args.telefono || ''),
        whatsapp: String(args.telefono || ''), email: '', limite_credito: 0,
        saldo: 0, contacto: '', notas: 'Creado por asistente AI', activo: true,
        created_at: new Date().toISOString(),
      };
      const vendedor = args.vendedor_id
        ? (db.usuarios || []).find((u) => u.id === Number(args.vendedor_id))
        : (db.usuarios || []).find((u) => u.id === req.user.id);
      asignarCliente(db, cliente, vendedor, { ...args, zona: cliente.zona });
      db.clientes.push(cliente);
      audit(db, req, 'Cliente creado por asistente AI', 'Clientes', cliente.nombre);
      save();
      return { ok: true, cliente: { id: cliente.id, nombre: cliente.nombre, zona: cliente.zona, ruta: cliente.ruta_venta, dia: cliente.dia_visita } };
    }

    case 'actualizar_precio': {
      const sku = String(args.sku || '').trim().toUpperCase();
      const producto = (db.productos || []).find((p) => String(p.sku || '').trim().toUpperCase() === sku);
      if (!producto) return { error: `No existe un producto con SKU ${sku}.` };
      const precio = num(args.precio);
      if (!(precio > 0)) return { error: 'El precio debe ser mayor a cero.' };
      const anterior = producto.precio;
      producto.precio = round2(precio);
      if (args.costo !== undefined && num(args.costo) >= 0) producto.costo = round2(num(args.costo));
      producto.updated_at = new Date().toISOString();
      audit(db, req, 'Precio actualizado por asistente AI', 'Inventario', `${sku}: ${anterior} → ${producto.precio}`);
      save();
      return { ok: true, sku, precio_anterior: anterior, precio_nuevo: producto.precio };
    }

    case 'registrar_visita': {
      const cliente = (db.clientes || []).find((c) => c.id === Number(args.cliente_id));
      if (!cliente) return { error: 'Cliente no encontrado.' };
      const visita = {
        id: require('./utils').nextId(db.visitas),
        cliente_id: cliente.id, tipo: 'preventa', modulo: 'Ventas', estado: 'completada',
        resultado: String(args.resultado || 'contacto'), notas: String(args.notas || ''),
        usuario_id: req.user.id, ruta_venta: req.user.ruta_venta || cliente.ruta_venta || null,
        fecha: new Date().toISOString(), created_at: new Date().toISOString(),
      };
      db.visitas.unshift(visita);
      audit(db, req, 'Visita registrada por asistente AI', 'Ventas', cliente.nombre);
      save();
      return { ok: true, visita: { id: visita.id, cliente: cliente.nombre, resultado: visita.resultado } };
    }

    default: return { error: 'Herramienta no implementada.' };
  }
}

function resumenAccion(nombre, args) {
  if (nombre === 'crear_cliente') return `Crear cliente "${args.nombre}"${args.zona ? ` en zona ${args.zona}` : ''}.`;
  if (nombre === 'actualizar_precio') return `Cambiar el precio de ${args.sku} a Bs ${args.precio}.`;
  if (nombre === 'registrar_visita') return `Registrar visita al cliente #${args.cliente_id} con resultado "${args.resultado}".`;
  return 'Ejecutar acción.';
}

function systemPrompt(req, pagina) {
  const db = load();
  const rol = req.user?.rol || 'usuario';
  const permisos = (req.user?.permisos || []).slice(0, 25).join(', ') || 'según su rol';
  return `Eres DADINI Assistant, el agente AI interno del SaaS DADINI (ventas, distribución, inventario y cobranzas en Bolivia).
Responde SIEMPRE en español, de forma breve, concreta y accionable. Usa Bs para montos.
El usuario tiene rol ${rol} y permisos: ${permisos}. Está en la página ${pagina || 'Dashboard'}.
Fecha actual: ${new Date().toISOString().slice(0, 10)}. Empresa: ${db.configuracion?.empresa?.nombre || 'DADINI'}.
Reglas:
- Usa las herramientas disponibles para obtener datos reales; NUNCA inventes cifras.
- Para acciones que escriben, primero propón la acción y espera confirmación del usuario.
- Si una herramienta devuelve un error, explícalo con claridad y sugiere el siguiente paso.
- Da recomendaciones prácticas (cobrar a tal cliente, reponer tal producto, visitar tal zona).`;
}

async function llamarOpenAI(mensajes) {
  if (!estaConfigurado()) throw new Error('OPENAI_API_KEY no está configurada en el servidor.');
  const respuesta = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: mensajes,
      tools: HERRAMIENTAS.map((h) => ({
        type: 'function',
        function: { name: h.name, description: h.description, parameters: h.parameters },
      })),
      tool_choice: 'auto',
      temperature: 0.2,
      max_tokens: 700,
    }),
  });
  const texto = await respuesta.text();
  let data;
  try { data = JSON.parse(texto); }
  catch { throw new Error(`OpenAI devolvió una respuesta inválida (${respuesta.status}): ${texto.slice(0, 200)}`); }
  if (!respuesta.ok) {
    throw new Error(data.error?.message || `OpenAI respondió ${respuesta.status}.`);
  }
  return data.choices?.[0]?.message || null;
}

async function chatear({ mensaje, pagina, historial = [] }, req) {
  if (!estaConfigurado()) {
    return { ok: false, error: 'El asistente AI aún no está configurado. Define OPENAI_API_KEY en Render.' };
  }
  const db = load();
  const mensajes = [
    { role: 'system', content: systemPrompt(req, pagina) },
    ...historial.slice(-8).map((m) => ({ role: m.rol === 'ia' ? 'assistant' : 'user', content: String(m.texto || '').slice(0, 2000) })),
    { role: 'user', content: String(mensaje || '').slice(0, 4000) },
  ];
  const propuestas = [];
  let respuestaFinal = '';

  for (let turno = 0; turno < MAX_TURNOS; turno += 1) {
    const mensajeIA = await llamarOpenAI(mensajes);
    if (!mensajeIA) break;
    mensajes.push(mensajeIA);
    if (!mensajeIA.tool_calls?.length) {
      respuestaFinal = mensajeIA.content || '';
      break;
    }
    for (const toolCall of mensajeIA.tool_calls) {
      let args = {};
      try { args = JSON.parse(toolCall.function.arguments || '{}'); }
      catch { args = {}; }
      const herramienta = herramientaPorNombre(toolCall.function.name);
      const resultado = ejecutarHerramienta(db, herramienta, args, req, false);
      if (resultado.requiere_confirmacion) propuestas.push(resultado);
      mensajes.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(resultado).slice(0, 4000),
      });
    }
  }

  if (!respuestaFinal && propuestas.length) {
    respuestaFinal = 'He preparado las siguientes acciones. Confirma las que desees ejecutar.';
  }
  return {
    ok: true,
    respuesta: respuestaFinal || 'No pude generar una respuesta. Intenta de nuevo.',
    propuestas,
    modelo: MODEL,
  };
}

function ejecutarAccion({ herramienta, args }, req) {
  const definicion = herramientaPorNombre(herramienta);
  if (!definicion?.escritura) return { ok: false, error: 'Esa acción no se puede ejecutar desde aquí.' };
  if (!puedeUsar(req.user, definicion)) return { ok: false, error: 'Tu usuario no tiene permiso para esta acción.' };
  const db = load();
  const resultado = ejecutarHerramienta(db, definicion, args || {}, req, true);
  audit(db, req, 'Acción AI ejecutada', 'Sistema', definicion.name);
  return { ok: !resultado.error, ...resultado };
}

// Alertas proactivas calculadas en el servidor, sin llamar a la IA (gratis y
// siempre disponibles, incluso si no hay API key).
function alertas() {
  const db = load();
  const hoy = new Date().toISOString().slice(0, 10);
  const resultado = [];

  const morosos = db.pedidos.filter((p) => p.saldo > 0 && p.estado !== 'cancelado' && String(p.fecha_vencimiento || '').slice(0, 10) < hoy);
  if (morosos.length) {
    resultado.push({
      tipo: 'cobranza', severidad: 'alta',
      titulo: `${morosos.length} cuentas vencidas`,
      detalle: `Total Bs ${round2(morosos.reduce((s, p) => s + p.saldo, 0)).toFixed(2)}. Sugiero contactar a los clientes con mayor saldo.`,
      accion: 'cobranzas_vencidas',
    });
  }

  const { buildIndices } = require('./indexes');
  const indices = buildIndices(db);
  const stockBajo = (db.productos || []).filter((p) => p.activo !== false
    && (indices.stockPorProducto.get(p.id) || 0) <= (p.stock_minimo || 0));
  if (stockBajo.length) {
    resultado.push({
      tipo: 'inventario', severidad: 'media',
      titulo: `${stockBajo.length} productos con stock bajo`,
      detalle: `Reponer primero: ${stockBajo.slice(0, 3).map((p) => p.nombre).join(', ')}.`,
      accion: 'stock_bajo',
    });
  }

  const hoyDia = new Date().getDay() || 7;
  const dia = hoyDia > 5 ? 1 : hoyDia;
  const clientesDia = (db.clientes || []).filter((c) => c.activo !== false && Number(c.dia_visita) === dia);
  const visitadas = new Set((db.visitas || []).filter((v) => String(v.fecha).slice(0, 10) === hoy).map((v) => v.cliente_id));
  const pendientes = clientesDia.filter((c) => !visitadas.has(c.id));
  if (pendientes.length) {
    resultado.push({
      tipo: 'preventa', severidad: 'media',
      titulo: `${pendientes.length} visitas pendientes hoy`,
      detalle: `Zonas: ${[...new Set(pendientes.map((c) => c.zona))].slice(0, 4).join(', ')}.`,
      accion: 'clientes_por_zona_dia',
    });
  }

  const data = dashboard(db, '7d');
  if (data.kpis.variacion_periodo < -10) {
    resultado.push({
      tipo: 'ventas', severidad: 'alta',
      titulo: `Ventas ${Math.abs(data.kpis.variacion_periodo)}% por debajo del período anterior`,
      detalle: 'Revisa preventa, catálogo y clientes en mora.',
      accion: 'resumen_ventas',
    });
  }

  return { alertas: resultado, generado_en: new Date().toISOString() };
}

module.exports = {
  estaConfigurado, chatear, ejecutarAccion, alertas,
  resumenVentas, cobranzasVencidas, stockBajo, clientesPorZonaDia, topProductos,
  HERRAMIENTAS: HERRAMIENTAS.map(({ name, description }) => ({ name, description, escritura: herramientaPorNombre(name).escritura })),
  modelo: MODEL,
};
