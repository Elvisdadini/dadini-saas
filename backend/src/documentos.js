const { randomUUID } = require('crypto');
const { obtenerCliente } = require('./supabase-client');
const { ensureBucket } = require('./supabase-storage');

function guardarDocumento(dataUrl, bucket, prefijo) {
  return (async () => {
    const valor = String(dataUrl || '');
    if (!/^data:application\/pdf[;,]/i.test(valor)) throw new Error('El documento debe ser un PDF.');
    const buffer = Buffer.from(valor.slice(valor.indexOf(',') + 1), 'base64');
    if (!buffer.length || buffer.length > 20 * 1024 * 1024) throw new Error('PDF inválido o mayor a 20 MB.');
    const supabase = obtenerCliente();
    if (!supabase) throw new Error('Supabase no está configurado para guardar documentos.');
    await ensureBucket(bucket, { fileSizeLimit: '20MB', allowedMimeTypes: ['application/pdf'] });
    const archivo = `${prefijo}-${Date.now()}-${randomUUID().slice(0, 6)}.pdf`;
    const { error } = await supabase.storage.from(bucket).upload(archivo, buffer, {
      contentType: 'application/pdf', cacheControl: '3600', upsert: false,
    });
    if (error) throw error.message || new Error('No se pudo guardar el documento.');
    const { data } = supabase.storage.from(bucket).getPublicUrl(archivo);
    return { url: data.publicUrl, archivo, bytes: buffer.length };
  })();
}

module.exports = { guardarDocumento };
