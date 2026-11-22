const path = require('path');

function entero(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: entero(process.env.PORT, 5055),
  jwtSecret: process.env.JWT_SECRET || 'dadini-saas-2026-secreto-local',
  jwtExpires: process.env.JWT_EXPIRES || '12h',
  dataDir: process.env.DADINI_DATA_DIR || path.join(__dirname, '..', 'data'),
  uploadDir: process.env.DADINI_UPLOAD_DIR || path.join(__dirname, '..', 'assets'),
  supabase: {
    url: process.env.SUPABASE_URL || '',
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    table: process.env.SUPABASE_SYNC_TABLE || 'saas_snapshots',
    intervalMs: entero(process.env.SUPABASE_SYNC_INTERVAL_MS, 15000),
  },
};

function validarConfiguracion() {
  const advertencias = [];
  if (config.nodeEnv === 'production' && config.jwtSecret === 'dadini-saas-2026-secreto-local') {
    advertencias.push('JWT_SECRET debe configurarse en producción.');
  }
  if (config.supabase.url && !config.supabase.serviceKey) {
    advertencias.push('SUPABASE_URL definida sin SUPABASE_SERVICE_ROLE_KEY.');
  }
  if (!config.supabase.url && config.supabase.serviceKey) {
    advertencias.push('SUPABASE_SERVICE_ROLE_KEY definida sin SUPABASE_URL.');
  }
  return advertencias;
}

module.exports = config;
module.exports.validarConfiguracion = validarConfiguracion;
