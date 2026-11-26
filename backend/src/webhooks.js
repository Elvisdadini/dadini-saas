// Webhooks salientes con firma HMAC y reintentos. Sin dependencias nuevas.
const crypto = require('crypto');
const { load, save } = require('./db');
const { nextId } = require('./utils');
const { cifrar, descifrar } = require('./cripto');

const EVENTOS = ['pedido.creado', 'factura.emitida', 'cobro.registrado', 'cliente.creado', 'inventario.ajustado'];
const MAX_INTENTOS = 5;
const TIMEOUT_MS = 8000;

function asegurar(db) {
  ['webhooks', 'webhook_entregas'].forEach((clave) => { if (!Array.isArray(db[clave])) db[clave] = []; });
  return db;
}

function firmar(cuerpo, secreto) {
  return `sha256=${crypto.createHmac('sha256', String(secreto || '')).update(cuerpo).digest('hex')}`;
}

function verificar(cuerpo, firma, secreto) {
  const esperada = firmar(cuerpo, secreto);
  const a = Buffer.from(String(firma || ''));
  const b = Buffer.from(esperada);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function publico(db, webhook) {
  return {
    id: webhook.id, nombre: webhook.nombre, url: webhook.url, eventos: webhook.eventos || [],
    activo: webhook.activo !== false, creado_en: webhook.creado_en,
    ultimo_envio: webhook.ultimo_envio || null, fallos_consecutivos: webhook.fallos_consecutivos || 0,
    cifrado: Boolean(webhook.secreto_cifrado),
  };
}

function crear(db, datos) {
  asegurar(db);
  const url = String(datos?.url || '').trim();
  if (!/^https:\/\//i.test(url)) throw new Error('La URL del webhook debe usar HTTPS.');
  const secreto = String(datos?.secreto || '').trim() || crypto.randomBytes(24).toString('base64url');
  const item = {
    id: nextId(db.webhooks),
    nombre: String(datos?.nombre || 'Webhook').trim(),
    url,
    eventos: Array.isArray(datos?.eventos) ? datos.eventos.filter((e) => EVENTOS.includes(e)) : [],
    secreto_cifrado: cifrar(secreto),
    activo: datos?.activo !== false,
    creado_en: new Date().toISOString(),
    fallos_consecutivos: 0,
  };
  db.webhooks.push(item);
  return { webhook: publico(db, item), secreto };
}

function emitir(evento, payload) {
  const db = load();
  asegurar(db);
  const ahora = new Date().toISOString();
  let nuevos = 0;
  (db.webhooks || []).filter((w) => w.activo !== false && (w.eventos || []).includes(evento)).forEach((w) => {
    db.webhook_entregas.push({
      id: nextId(db.webhook_entregas),
      entrega_id: crypto.randomUUID(),
      webhook_id: w.id,
      evento,
      url: w.url,
      payload,
      estado: 'pendiente',
      intento: 0,
      proximo_intento: ahora,
      creado_en: ahora,
      historial: [],
    });
    nuevos += 1;
  });
  if (nuevos) save();
  return nuevos;
}

async function procesarPendientes() {
  const db = load();
  asegurar(db);
  const ahora = Date.now();
  const pendientes = (db.webhook_entregas || []).filter((e) => e.estado === 'pendiente'
    && Date.parse(e.proximo_intento || 0) <= ahora);
  let enviados = 0;
  let fallidos = 0;
  for (const entrega of pendientes) {
    const webhook = (db.webhooks || []).find((w) => w.id === entrega.webhook_id);
    if (!webhook || webhook.activo === false) { entrega.estado = 'cancelada'; continue; }
    const secreto = descifrar(webhook.secreto_cifrado) || '';
    const cuerpo = JSON.stringify({
      evento: entrega.evento,
      entrega_id: entrega.entrega_id,
      fecha: new Date().toISOString(),
      datos: entrega.payload,
    });
    const cabeceras = {
      'Content-Type': 'application/json',
      'X-DADINI-Evento': entrega.evento,
      'X-DADINI-Entrega': entrega.entrega_id,
      'X-DADINI-Timestamp': String(Date.now()),
      'X-DADINI-Signature': firmar(cuerpo, secreto),
    };
    try {
      const respuesta = await fetch(entrega.url, { method: 'POST', headers: cabeceras, body: cuerpo, signal: AbortSignal.timeout(TIMEOUT_MS) });
      entrega.historial.push({ fecha: new Date().toISOString(), status: respuesta.status, ok: respuesta.ok });
      if (respuesta.ok) {
        entrega.estado = 'entregado';
        entrega.entregado_en = new Date().toISOString();
        webhook.ultimo_envio = entrega.entregado_en;
        webhook.fallos_consecutivos = 0;
        enviados += 1;
      } else {
        throw new Error(`HTTP ${respuesta.status}`);
      }
    } catch (error) {
      entrega.intento += 1;
      webhook.fallos_consecutivos = (webhook.fallos_consecutivos || 0) + 1;
      entrega.historial.push({ fecha: new Date().toISOString(), error: error.message.slice(0, 200) });
      if (entrega.intento >= MAX_INTENTOS) { entrega.estado = 'fallido'; fallidos += 1; }
      else {
        const espera = Math.min(3600000, 30000 * (2 ** (entrega.intento - 1)));
        entrega.proximo_intento = new Date(Date.now() + espera).toISOString();
      }
    }
  }
  if (pendientes.length) save();
  return { procesados: pendientes.length, enviados, fallidos };
}

module.exports = { EVENTOS, asegurar, firmar, verificar, crear, publico, emitir, procesarPendientes };
