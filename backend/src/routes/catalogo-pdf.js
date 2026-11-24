const express = require('express');
const { authRequired, requirePermiso } = require('../auth');
const { audit } = require('../utils');
const { obtenerCliente } = require('../supabase-client');
const { ensureBucket } = require('../supabase-storage');

const router = express.Router();
router.use(authRequired);

const BUCKET = 'catalogos';
function cliente() {
  const supabase = obtenerCliente();
  if (!supabase) throw new Error('Supabase no está configurado.');
  return supabase;
}
function asegurarBucket() {
  return ensureBucket(BUCKET, { fileSizeLimit: '20MB', allowedMimeTypes: ['application/pdf'] });
}

router.post('/guardar', requirePermiso('catalogo.generar_pdf', 'catalogo.crear'), async (req, res) => {
  const body = req.body || {};
  const datos = String(body.pdf || '');
  if (!/^data:application\/pdf[;,]/i.test(datos)) return res.status(400).json({ error: 'El catálogo debe ser un PDF.' });
  const buffer = Buffer.from(datos.slice(datos.indexOf(',') + 1), 'base64');
  if (!buffer.length || buffer.length > 20 * 1024 * 1024) return res.status(400).json({ error: 'PDF inválido o mayor a 20 MB.' });
  try {
    await asegurarBucket();
    const nombre = `${Date.now()}-${String(body.nombre || 'catalogo').toLowerCase().replace(/[^a-z0-9-_]/g, '-')}.pdf`;
    const storage = cliente().storage;
    const { error } = await storage.from(BUCKET).upload(nombre, buffer, { contentType: 'application/pdf', cacheControl: '3600' });
    if (error) return res.status(400).json({ error: error.message });
    const { data } = storage.from(BUCKET).getPublicUrl(nombre);
    audit(req.db, req, 'Catálogo PDF generado', 'Catálogo', `${nombre} · ${Math.round(buffer.length / 1024)} KB`);
    return res.status(201).json({ url: data.publicUrl, nombre, bytes: buffer.length });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

function nombreArchivo(nombre) {
  const limpio = String(nombre || 'catalogo').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-_]+/g, '-').replace(/^-|-$/g, '') || 'catalogo';
  return limpio;
}

router.delete('/:archivo', requirePermiso('catalogo.eliminar', 'catalogo.crear'), async (req, res) => {
  const archivo = String(req.params.archivo || '');
  if (!archivo.endsWith('.pdf')) return res.status(400).json({ error: 'El archivo no es un catálogo PDF.' });
  try {
    await asegurarBucket();
    const storage = cliente().storage;
    const { error } = await storage.from(BUCKET).remove([archivo]);
    if (error) return res.status(400).json({ error: error.message });
    audit(req.db, req, 'Catálogo PDF eliminado', 'Catálogo', archivo);
    return res.json({ ok: true });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.put('/renombrar', requirePermiso('catalogo.editar', 'catalogo.crear'), async (req, res) => {
  const archivo = String(req.body?.archivo || '');
  const nombreNuevo = String(req.body?.nombre || '').trim();
  if (!archivo.endsWith('.pdf')) return res.status(400).json({ error: 'El archivo no es un catálogo PDF.' });
  if (!nombreNuevo) return res.status(400).json({ error: 'Escribe el nuevo nombre del catálogo.' });
  try {
    await asegurarBucket();
    const storage = cliente().storage;
    const { data: contenido, error: lectura } = await storage.from(BUCKET).download(archivo);
    if (lectura) return res.status(400).json({ error: lectura.message });
    const prefijo = archivo.match(/^\d+-/)?.[0] || `${Date.now()}-`;
    const destino = `${prefijo}${nombreArchivo(nombreNuevo)}.pdf`;
    if (destino === archivo) return res.json({ ok: true, archivo });
    const { error: subida } = await storage.from(BUCKET).upload(destino, contenido, { contentType: 'application/pdf', cacheControl: '3600' });
    if (subida) return res.status(400).json({ error: subida.message });
    await storage.from(BUCKET).remove([archivo]);
    audit(req.db, req, 'Catálogo PDF renombrado', 'Catálogo', `${archivo} → ${destino}`);
    return res.json({ ok: true, archivo: destino, url: storage.from(BUCKET).getPublicUrl(destino).data.publicUrl });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.get('/', async (req, res) => {
  try {
    const storage = cliente().storage;
    const { data, error } = await storage.from(BUCKET).list('', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
    if (error) return res.status(400).json({ error: error.message });
    const catalogos = (data || []).map((f) => ({
      nombre: f.name,
      bytes: f.metadata?.size || 0,
      creado: f.created_at,
      url: storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
    }));
    return res.json({ catalogos });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

module.exports = router;
