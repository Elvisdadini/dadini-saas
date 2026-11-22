const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let cliente = null;
let temporizador = null;

function estaConfigurado() {
  return Boolean(config.supabase.url && config.supabase.serviceKey);
}

function obtenerCliente() {
  if (!estaConfigurado()) return null;
  if (!cliente) {
    cliente = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cliente;
}

async function sincronizar(db, motivo = 'manual') {
  const supabase = obtenerCliente();
  const estado = db.sincronizacion || (db.sincronizacion = {});
  if (!supabase) {
    estado.estado = 'sin_configurar';
    estado.ultimo_error = 'Credenciales Supabase no configuradas.';
    return { ok: false, motivo, error: estado.ultimo_error };
  }
  const empresaId = estado.empresa_id || 'dadini-principal';
  const payload = {
    empresa: db.configuracion?.empresa || {},
    branding: db.configuracion?.branding || {},
    datos: Object.fromEntries(Object.entries(db).filter(([clave]) => clave !== 'sincronizacion')),
  };
  try {
    const { error } = await supabase
      .from(config.supabase.table)
      .upsert({
        empresa_id: empresaId,
        payload,
        version: String(db.version || '1'),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'empresa_id' });
    if (error) throw error;
    estado.estado = 'sincronizado';
    estado.ultimo_envio = new Date().toISOString();
    estado.ultimo_error = null;
    estado.intentos = (estado.intentos || 0) + 1;
    return { ok: true, motivo, empresa_id: empresaId, enviado_en: estado.ultimo_envio };
  } catch (error) {
    estado.estado = 'error';
    estado.ultimo_error = error.message;
    estado.intentos = (estado.intentos || 0) + 1;
    return { ok: false, motivo, error: error.message };
  }
}

function iniciarSincronizacionPeriodica(obtenerDb, guardarDb) {
  if (!estaConfigurado() || temporizador) return;
  temporizador = setInterval(async () => {
    try {
      const db = obtenerDb();
      const antes = db.sincronizacion?.estado;
      await sincronizar(db, 'automatico');
      if (antes !== db.sincronizacion.estado) guardarDb();
    } catch (error) {
      console.error('[supabase-sync]', error.message);
    }
  }, config.supabase.intervalMs);
  temporizador.unref?.();
}

function estado() {
  return {
    configurado: estaConfigurado(),
    tabla: config.supabase.table,
    intervalo_ms: config.supabase.intervalMs,
    sql: `create table if not exists ${config.supabase.table} (
  empresa_id text primary key,
  payload jsonb not null,
  version text,
  updated_at timestamptz not null default now()
);
alter table ${config.supabase.table} enable row level security;`,
  };
}

module.exports = { estaConfigurado, sincronizar, iniciarSincronizacionPeriodica, estado };
