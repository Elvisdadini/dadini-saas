const { randomUUID } = require('crypto');
const { obtenerCliente } = require('./supabase-client');
const { ensureBucket } = require('./supabase-storage');

const BUCKET = 'comprobantes';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB por foto

function decodificar(dataUrl) {
  const valor = String(dataUrl || '');
  const coincidencia = valor.match(/^data:image\/(webp|jpeg|png);base64,/i);
  if (!coincidencia) return null;
  const buffer = Buffer.from(valor.slice(valor.indexOf(',') + 1), 'base64');
  if (!buffer.length || buffer.length > MAX_BYTES) return null;
  const tipo = coincidencia[1].toLowerCase();
  return { buffer, mime: `image/${tipo}`, extension: tipo === 'jpeg' ? 'jpg' : tipo };
}

// Sube una foto (dataURL) y devuelve su URL pública. Se usa para comprobantes
// de devoluciones, cambios de preventa, promociones, etc.
async function subirFoto(dataUrl, prefijo = 'foto') {
  const imagen = decodificar(dataUrl);
  if (!imagen) throw new Error('Imagen inválida o mayor a 2 MB.');
  const supabase = obtenerCliente();
  if (!supabase) throw new Error('Supabase no está configurado para guardar fotos.');
  await ensureBucket(BUCKET, {
    fileSizeLimit: '2MB',
    allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
  });
  const archivo = `${prefijo}-${randomUUID()}.${imagen.extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(archivo, imagen.buffer, {
    contentType: imagen.mime,
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error.message || new Error('No se pudo subir la foto.');
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(archivo);
  return { url: data.publicUrl, archivo, bytes: imagen.buffer.length };
}

async function eliminarFoto(url) {
  if (!url) return { ok: true };
  const supabase = obtenerCliente();
  if (!supabase) return { ok: false, error: 'Supabase no está configurado.' };
  const archivo = String(url).split(`/${BUCKET}/`).pop()?.split('?')[0];
  if (!archivo) return { ok: false, error: 'No se pudo identificar la foto.' };
  const { error } = await supabase.storage.from(BUCKET).remove([archivo]);
  return error ? { ok: false, error: error.message } : { ok: true };
}

module.exports = { subirFoto, eliminarFoto, BUCKET, MAX_BYTES };
