const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let cliente = null;

function estaConfigurado() {
  return Boolean(config.supabase.url && config.supabase.serviceKey);
}

// Cliente único compartido por sincronización, imágenes y catálogos.
function obtenerCliente() {
  if (!estaConfigurado()) return null;
  if (!cliente) {
    cliente = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

module.exports = { obtenerCliente, estaConfigurado };
