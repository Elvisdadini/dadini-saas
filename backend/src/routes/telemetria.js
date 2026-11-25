const express = require('express');
const crypto = require('crypto');

const router = express.Router();

// El frontend informa errores no capturados; si hay SENTRY_DSN se reenvían
// como evento de Sentry. Sin DSN se descartan silenciosamente (modolocal).
function destinoSentry(dsn) {
  try {
    const url = new URL(String(dsn));
    const proyecto = url.pathname.replace(/^\//, '').replace(/\/$/, '');
    if (!url.username || !proyecto) return null;
    return `https://${url.host}/api/${proyecto}/envelope/`;
  } catch { return null; }
}

router.get('/estado', (req, res) => {
  res.json({ habilitado: Boolean(process.env.SENTRY_DSN && destinoSentry(process.env.SENTRY_DSN)) });
});

router.post('/error', async (req, res) => {
  const b = req.body || {};
  const mensaje = String(b.mensaje || 'Error frontend').slice(0, 500);
  const pila = String(b.stack || '').slice(0, 4000);
  const url = String(b.url || '').slice(0, 500);
  const dsn = process.env.SENTRY_DSN;
  const endpoint = dsn ? destinoSentry(dsn) : null;
  if (!endpoint) return res.json({ ok: true, reenviado: false });

  const eventId = crypto.randomUUID().replace(/-/g, '');
  const evento = {
    event_id: eventId,
    timestamp: new Date().toISOString(),
    level: ['fatal', 'error', 'warning'].includes(b.nivel) ? b.nivel : 'error',
    platform: 'javascript',
    message: mensaje,
    logger: 'frontend',
    tags: { app: 'dadini-saas', entorno: process.env.NODE_ENV || 'development' },
    request: { url },
    exception: { values: [{ type: String(b.tipo || 'Error').slice(0, 200), value: mensaje, stacktrace: { frames: [] } }] },
    extra: { stack: pila, contexto: b.contexto && typeof b.contexto === 'object' ? b.contexto : {} },
  };
  const envelope = [
    JSON.stringify({ event_id: eventId, sent_at: new Date().toISOString() }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(evento),
  ].join('\n');
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope' },
      body: envelope,
      signal: AbortSignal.timeout(5000),
    });
    return res.json({ ok: true, reenviado: true });
  } catch {
    // Nunca devolvemos el DSN ni el detalle interno al navegador.
    return res.json({ ok: true, reenviado: false });
  }
});

module.exports = router;
