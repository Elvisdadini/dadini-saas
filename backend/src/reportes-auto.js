// Reportes automáticos: arman el mensaje diario y preparan los chats wa.me.
// No hay WhatsApp Business API: el envío real lo confirma una persona al abrir
// cada chat. El job solo genera links y deja trazabilidad.
const { dashboard, reporte } = require('./services');
const kardex = require('./kardex');
const links = require('./whatsapp-links');

const INCLUIDOS = { ventas: true, cobranzas: true, stock: true, vencimientos: true, visitas: false };
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

function asegurar(db) {
  if (!db.configuracion) db.configuracion = {};
  if (!db.configuracion.reportes_auto) {
    db.configuracion.reportes_auto = {
      habilitado: false, hora: '08:00', frecuencia: 'diario',
      destinatarios: [], incluir: { ...INCLUIDOS },
      ultimo_envio: null, ultimo: null,
    };
  }
  const cfg = db.configuracion.reportes_auto;
  cfg.incluir = { ...INCLUIDOS, ...(cfg.incluir || {}) };
  if (!Array.isArray(cfg.destinatarios)) cfg.destinatarios = [];
  return cfg;
}

function publica(cfg) {
  return {
    habilitado: cfg.habilitado === true,
    hora: cfg.hora || '08:00',
    frecuencia: cfg.frecuencia || 'diario',
    destinatarios: cfg.destinatarios || [],
    incluir: cfg.incluir || { ...INCLUIDOS },
    ultimo_envio: cfg.ultimo_envio || null,
  };
}

function hoyLocal() {
  return new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function money(valor) {
  return Number(valor || 0).toFixed(2);
}

// Reutiliza dashboard (KPIs, stock bajo, cobranzas) y reporte (ventas del día).
function generarMensaje(db, cfg, fecha = null) {
  const dia = fecha || hoyLocal();
  const incluir = { ...INCLUIDOS, ...(cfg?.incluir || {}) };
  const k = dashboard(db, '30d').kpis || {};
  const r = reporte(db, dia, dia).resumen || {};
  const lineas = [`📊 *Reporte DADINI* · ${dia}`];
  if (incluir.ventas) {
    lineas.push(
      `Ventas: Bs ${money(r.total)} · Pedidos: ${r.pedidos || 0} · Unidades: ${r.unidades || 0}`,
      `Utilidad: Bs ${money(r.margen)} · Ticket: Bs ${money(r.ticket_promedio)}`,
    );
  }
  if (incluir.cobranzas) {
    lineas.push(`Por cobrar: Bs ${money(k.por_cobrar)} · Vencido: Bs ${money(k.monto_vencido)} (${k.cobranzas_vencidas || 0} facturas)`);
  }
  if (incluir.stock) {
    lineas.push(`Productos con stock bajo: ${k.stock_bajo || 0}`);
  }
  if (incluir.vencimientos) {
    const venc = kardex.vencimientos(db, 30).filter((l) => l.estado !== 'vigente');
    if (venc.length) {
      lineas.push(`⚠️ ${venc.length} lote(s) por vencer/vencidos: ${venc.slice(0, 3).map((l) => l.lote).join(', ')}${venc.length > 3 ? '…' : ''}`);
    }
  }
  if (incluir.visitas) {
    const visitas = (db.visitas || []).filter((v) => String(v.fecha || v.created_at || '').slice(0, 10) === dia);
    lineas.push(`Visitas registradas hoy: ${visitas.length}`);
  }
  lineas.push('_Generado automáticamente por DADINI SaaS_');
  return lineas.join('\n');
}

// Genera y persiste los links para los destinatarios configurados.
function preparar(db, cfg, mensaje, usuarioId = null) {
  const titulo = `Reporte automático · ${hoyLocal()}`;
  const resultado = links.prepararMasivo(db, {
    usuario_ids: cfg.destinatarios || [],
    mensaje, titulo, tipo: 'otro', usuario_id: usuarioId,
  });
  cfg.ultimo_envio = new Date().toISOString();
  cfg.ultimo = {
    fecha: cfg.ultimo_envio,
    mensaje,
    envios: resultado.envios,
    omitidos: resultado.omitidos,
  };
  return resultado;
}

// Devuelve true cuando corresponde ejecutar el reporte de hoy.
function debeEjecutar(cfg, ahora = new Date()) {
  if (cfg.habilitado !== true) return false;
  if (!Array.isArray(cfg.destinatarios) || !cfg.destinatarios.length) return false;
  const local = new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000);
  if (cfg.frecuencia === 'lun_vie' && (local.getDay() === 0 || local.getDay() === 6)) return false;
  const hora = `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
  if (cfg.hora !== hora) return false;
  const dia = local.toISOString().slice(0, 10);
  if (cfg.ultimo_envio && String(cfg.ultimo_envio).slice(0, 10) === dia) return false;
  return true;
}

module.exports = { asegurar, publica, hoyLocal, generarMensaje, preparar, debeEjecutar, INCLUIDOS, HORA };
