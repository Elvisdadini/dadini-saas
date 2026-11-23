const express = require('express');
const { createClient } = require('@supabase/supabase-js');
const { authRequired, requirePermiso } = require('../auth');
const { audit } = require('../utils');
const config = require('../config');

const router = express.Router();
router.use(authRequired);

const BUCKET = 'catalogos';
let supabase = null;

function cliente() {
  if (!config.supabase.url || !config.supabase.serviceKey) throw new Error('Supabase no está configurado.');
  if (!supabase) {
    supabase = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return supabase;
}

async function asegurarBucket() {
  const storage = cliente().storage;
  const { error } = await storage.getBucket(BUCKET);
  if (!error) return;
  const { error: creacion } = await storage.createBucket(BUCKET, {
    public: true,
    fileSizeLimit: '20MB',
    allowedMimeTypes: ['application/pdf'],
  });
  if (creacion && !/already exists/i.test(creacion.message)) throw new Error(creacion.message);
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
