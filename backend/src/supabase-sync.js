const config = require('./config');
const { obtenerCliente, estaConfigurado } = require('./supabase-client');

let temporizador = null;
let enCurso = false;
let mantenimiento = false;

function estaEnMantenimiento() { return mantenimiento; }

async function sincronizar(db, motivo = 'manual') {
  // Evita solapes y, sobre todo, impedir que una base local vacía sobrescriba
  // una buena instantánea si Supabase falló al restaurar durante el arranque.
  if (mantenimiento || enCurso) return { ok: false, motivo, omitido: true };
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
  enCurso = true;
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
  } finally {
    enCurso = false;
  }
}

// Recupera la última instantánea guardada en Supabase. Por defecto solo
// restaura cuando la base local está vacía (caso típico de un redeploy de
// Render, que recrea el contenedor desde el JSON versionado).
async function restaurar(db, opciones = {}) {
  const supabase = obtenerCliente();
  if (!supabase) return { ok: false, error: 'Supabase no está configurado.' };
  const empresaId = db.sincronizacion?.empresa_id || 'dadini-principal';
  const { data, error } = await supabase
    .from(config.supabase.table)
    .select('payload,version,updated_at')
    .eq('empresa_id', empresaId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.payload?.datos) return { ok: false, sin_datos: true, error: 'No hay instantánea guardada.' };

  const entidades = data.payload.datos;
  const operativas = ['pedidos', 'clientes', 'pagos', 'rutas', 'visitas'];
  const hayRemoto = operativas.some((clave) => Array.isArray(entidades[clave]) && entidades[clave].length);
  const hayLocal = operativas.some((clave) => Array.isArray(db[clave]) && db[clave].length);
  const marcaLocal = Date.parse(db.sincronizacion?.ultimo_envio || db.generado_en || 0) || 0;
  const marcaRemota = Date.parse(data.updated_at || 0) || 0;
  if (!opciones.forzar && hayLocal) {
    return { ok: true, restaurado: false, motivo: 'La base local ya tiene datos; se conserva.' };
  }
  if (!opciones.forzar && marcaRemota && marcaRemota <= marcaLocal) {
    return { ok: true, restaurado: false, motivo: 'La instantánea remota no es más reciente que la local.' };
  }
  if (!hayRemoto && !opciones.forzar) {
    return { ok: true, restaurado: false, motivo: 'La instantánea remota está vacía.' };
  }

  mantenimiento = true;
  try {
    Object.assign(db, entidades);
    db.sincronizacion = {
      ...(db.sincronizacion || {}),
      empresa_id: empresaId,
      estado: 'sincronizado',
      ultimo_envio: data.updated_at || null,
      ultimo_error: null,
    };
    return {
      ok: true,
      restaurado: true,
      actualizado_en: data.updated_at,
      entidades: Object.keys(entidades).length,
    };
  } finally {
    mantenimiento = false;
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

module.exports = { estaConfigurado, estaEnMantenimiento, sincronizar, restaurar, iniciarSincronizacionPeriodica, estado };
