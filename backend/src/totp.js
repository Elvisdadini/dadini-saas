// TOTP (RFC 6238) y códigos de recuperación usando solo Node crypto.
// Sin dependencias externas: funciona en Render con la instalación mínima.
const crypto = require('crypto');

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  buffer.forEach((byte) => { bits += byte.toString(2).padStart(8, '0'); });
  let salida = '';
  for (let i = 0; i < bits.length; i += 5) {
    salida += ALFABETO[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  }
  return salida;
}

function base32Decode(texto) {
  const limpio = String(texto || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of limpio) {
    const idx = ALFABETO.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function generarSecreto(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

function codigoPara(secreto, contador) {
  const clave = base32Decode(secreto);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(contador / 0x100000000), 0);
  buf.writeUInt32BE(contador >>> 0, 4);
  const hash = crypto.createHmac('sha1', clave).update(buf).digest();
  const offset = hash[hash.length - 1] & 0x0f;
  const binario = ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(binario % 1000000).padStart(6, '0');
}

function codigoTOTP(secreto, ahora = Date.now(), periodo = 30) {
  return codigoPara(secreto, Math.floor(ahora / 1000 / periodo));
}

function iguales(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Acepta desfase de ±1 periodo (reloj del celular).
function verificar(secreto, codigo, opciones = {}) {
  const texto = String(codigo || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(texto)) return false;
  const periodo = opciones.periodo || 30;
  const contador = Math.floor((opciones.ahora || Date.now()) / 1000 / periodo);
  for (let delta = -(opciones.ventana ?? 1); delta <= (opciones.ventana ?? 1); delta += 1) {
    if (iguales(codigoPara(secreto, contador + delta), texto)) return true;
  }
  return false;
}

function uriTOTP(secreto, cuenta, emisor = 'DADINI SaaS') {
  const etiqueta = `${encodeURIComponent(emisor)}:${encodeURIComponent(cuenta)}`;
  return `otpauth://totp/${etiqueta}?secret=${encodeURIComponent(secreto)}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30`;
}

function hashRecuperacion(codigo) {
  return crypto.createHash('sha256').update(String(codigo).replace(/-/g, '').toUpperCase()).digest('hex');
}

function codigosRecuperacion(cantidad = 8) {
  const codigos = [];
  for (let i = 0; i < cantidad; i += 1) {
    const valor = crypto.randomBytes(5).toString('hex').toUpperCase().slice(0, 10);
    codigos.push(`${valor.slice(0, 5)}-${valor.slice(5)}`);
  }
  return codigos;
}

module.exports = {
  base32Encode, base32Decode, generarSecreto, codigoTOTP, verificar,
  uriTOTP, hashRecuperacion, codigosRecuperacion,
};
