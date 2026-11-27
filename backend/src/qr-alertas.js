const { addDaysISO, nextId } = require('./utils');

function estadoQr(qr, hoyISO) {
  const hoy = hoyISO || new Date().toISOString().slice(0, 10);
  const vence = String(qr.fecha_vencimiento || '').slice(0, 10);
  if (!vence) return { dias_restantes: null, estado: 'sin_vencimiento', vencido: false, por_vencer: false };
  const dias = Math.round((new Date(`${vence}T00:00:00`) - new Date(`${hoy}T00:00:00`)) / 86400000);
  return {
    dias_restantes: dias,
    estado: dias < 0 ? 'vencido' : dias <= 14 ? 'por_vencer' : 'vigente',
    vencido: dias < 0,
    por_vencer: dias >= 0 && dias <= 14,
  };
}

// Genera notificaciones (una por día y QR) cuando faltan 2 semanas o ya venció.
function verificarVencimientos(db) {
  const hoy = new Date().toISOString().slice(0, 10);
  const alertas = [];
  (db.qrs_pago || []).forEach((qr) => {
    if (qr.activo === false) return;
    const estado = estadoQr(qr, hoy);
    if (!estado.vencido && !estado.por_vencer) return;
    alertas.push({ id: qr.id, nombre: qr.nombre, fecha_vencimiento: qr.fecha_vencimiento, ...estado });
    const titulo = `QR ${qr.nombre} · ${estado.estado} · ${hoy}`;
    const detalle = estado.vencido
      ? `El QR "${qr.nombre}" venció el ${qr.fecha_vencimiento}. Sube uno nuevo desde Administración.`
      : `El QR "${qr.nombre}" vence en ${estado.dias_restantes} días (${qr.fecha_vencimiento}). Solicita el cambio con 2 semanas de anticipación.`;
    if (!Array.isArray(db.notificaciones)) db.notificaciones = [];
    if (!db.notificaciones.some((n) => n.titulo === titulo)) {
      db.notificaciones.unshift({
        id: nextId(db.notificaciones),
        tipo: 'qr',
        titulo,
        detalle,
        ruta: '/ventas/nueva',
        leida: false,
        fecha: new Date().toISOString(),
      });
    }
  });
  return alertas;
}

module.exports = { estadoQr, verificarVencimientos, addDaysISO };
