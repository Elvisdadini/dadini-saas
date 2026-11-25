const crypto = require('crypto');

// Cifra credenciales SIAT antes de guardarlas en la base (que se replica a
// Supabase). La clave maestra vive solo en Render como SIAT_SECRET_KEY.
function claveMaestra() {
  return process.env.SIAT_SECRET_KEY || '';
}

function cifrar(texto) {
  if (texto === undefined || texto === null || texto === '') return null;
  const clave = claveMaestra();
  if (!clave) throw new Error('Define SIAT_SECRET_KEY en Render para guardar credenciales cifradas.');
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(clave, salt, 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${salt.toString('base64')}:${iv.toString('base64')}:${tag.toString('base64')}:${cifrado.toString('base64')}`;
}

function descifrar(valor) {
  if (!valor || typeof valor !== 'string' || !valor.startsWith('gcm:')) return null;
  const clave = claveMaestra();
  if (!clave) return null;
  try {
    const [, s, i, t, c] = valor.split(':');
    const salt = Buffer.from(s, 'base64');
    const iv = Buffer.from(i, 'base64');
    const tag = Buffer.from(t, 'base64');
    const key = crypto.scryptSync(clave, salt, 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(c, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}

function configuradoParaCifrar() {
  return Boolean(claveMaestra());
}

module.exports = { cifrar, descifrar, configuradoParaCifrar };
