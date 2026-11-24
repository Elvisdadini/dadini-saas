const { obtenerCliente } = require('./supabase-client');

const verificados = new Set();

// Crea el bucket si no existe y lo cachinga en memoria (evita un HTTP por archivo).
async function ensureBucket(nombre, opciones = {}) {
  if (verificados.has(nombre)) return;
  const supabase = obtenerCliente();
  const storage = supabase.storage;
  const { error } = await storage.getBucket(nombre);
  if (error) {
    const { error: creacion } = await storage.createBucket(nombre, {
      public: true,
      fileSizeLimit: '2MB',
      allowedMimeTypes: ['image/webp', 'image/jpeg', 'image/png'],
      ...opciones,
    });
    if (creacion && !/already exists/i.test(creacion.message)) throw new Error(creacion.message);
  }
  verificados.add(nombre);
}

module.exports = { ensureBucket };
