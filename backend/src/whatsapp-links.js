// Construcción de enlaces wa.me y trazabilidad, compartida por el envío
// masivo manual y los reportes automáticos. No existe WhatsApp Business API:
// el usuario confirma cada mensaje al abrir el chat.
const { nextId } = require('./utils');

function soloDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function urlDe(telefono, mensaje) {
  return `https://wa.me/${soloDigitos(telefono)}?text=${encodeURIComponent(String(mensaje || ''))}`;
}

function prepararMasivo(db, opciones = {}) {
  const ids = Array.isArray(opciones.usuario_ids) ? opciones.usuario_ids.map(Number) : [];
  const tipo = ['pedido', 'entrega', 'cobranza', 'otro'].includes(opciones.tipo) ? opciones.tipo : 'otro';
  const mensajeBase = String(opciones.mensaje || '').trim();
  const ahora = new Date().toISOString();
  const envios = [];
  const omitidos = [];
  ids.forEach((id) => {
    const usuario = (db.usuarios || []).find((u) => u.id === id);
    const telefono = soloDigitos(usuario?.whatsapp || usuario?.telefono || '');
    if (!usuario || !telefono) { omitidos.push(usuario?.nombre || `ID ${id}`); return; }
    const mensaje = mensajeBase
      || `Hola ${usuario.nombre}, tienes un nuevo documento de DADINI.${opciones.url_adjunto ? ` ${opciones.url_adjunto}` : ''}`;
    const registro = {
      id: nextId(db.mensajes_whatsapp),
      tipo,
      cliente_id: null,
      pedido_id: opciones.pedido_id ? Number(opciones.pedido_id) : null,
      telefono,
      mensaje,
      referencia: opciones.titulo || null,
      monto: 0,
      estado: 'generado',
      latitud: null,
      longitud: null,
      usuario_id: opciones.usuario_id || null,
      fecha: ahora,
      created_at: ahora,
      destinatario_usuario_id: usuario.id,
    };
    db.mensajes_whatsapp.unshift(registro);
    envios.push({ nombre: usuario.nombre, telefono, url: urlDe(telefono, mensaje), id: registro.id });
  });
  return { envios, omitidos };
}

module.exports = { soloDigitos, urlDe, prepararMasivo };
