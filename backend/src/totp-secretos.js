// Cifrado del secreto TOTP con clave derivada de JWT_SECRET (dominio propio),
// independiente de SIAT_SECRET_KEY. Nunca se devuelve al frontend tras el alta.
const crypto = require('crypto');
const config = require('./config');

function clave() {
  return crypto.createHash('sha256').update(`${config.jwtSecret}:dadini-2fa`).digest();
}

function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  return `gcm:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${cifrado.toString('base64')}`;
}

function descifrar(valor) {
  try {
    const [prefijo, ivB64, tagB64, datosB64] = String(valor || '').split(':');
    if (prefijo !== 'gcm' || !ivB64 || !tagB64 || !datosB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', clave(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(datosB64, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

module.exports = { cifrar, descifrar };
