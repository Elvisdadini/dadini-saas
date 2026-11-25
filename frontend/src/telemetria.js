// Captura errores no controlados del frontend y los envía al backend, que los
// reenvía a Sentry solo si SENTRY_DSN está configurado. Nunca expone el DSN.
const BASE = import.meta.env.VITE_API_URL || '/api';
let instalado = false;
let recientes = [];

function enviar(datos) {
  const ahora = Date.now();
  recientes = recientes.filter((t) => ahora - t < 60000);
  if (recientes.length >= 10) return; // anti-ruido
  recientes.push(ahora);
  try {
    fetch(`${BASE}/telemetria/error`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...datos, url: window.location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch { /* sin conexión: no interrumpir la app */ }
}

export function instalarTelemetria() {
  if (instalado || typeof window === 'undefined') return;
  instalado = true;
  window.addEventListener('error', (evento) => {
    enviar({
      mensaje: evento.message || 'Error no controlado',
      tipo: evento.error?.name || 'Error',
      stack: evento.error?.stack || '',
      nivel: 'error',
    });
  });
  window.addEventListener('unhandledrejection', (evento) => {
    const razon = evento.reason;
    enviar({
      mensaje: razon?.message || String(razon || 'Promesa rechazada'),
      tipo: razon?.name || 'PromiseRejection',
      stack: razon?.stack || '',
      nivel: 'error',
    });
  });
}
