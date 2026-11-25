const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'dadini_token';
const COLA_KEY = 'dadini_cola_offline';

// Rutas que nunca se encolan: credenciales, archivos grandes y Firmas/APK.
const NO_ENCOLAR = [
  '/auth/login', '/auth/pin', '/auth/perfil', '/auth/password', '/auth/2fa', '/telemetria',
  '/configuracion/apk', '/catalogo-pdf/guardar', '/productos-imagenes',
];

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function qs(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '' && value !== 'todos') search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

function leerCola() {
  try { return JSON.parse(localStorage.getItem(COLA_KEY) || '[]'); }
  catch { return []; }
}

function guardarCola(items) {
  localStorage.setItem(COLA_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('dadini:cola', { detail: { count: items.length } }));
}

export function contarCola() {
  return leerCola().length;
}

function sinConexion() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

function puedeEncolar(path, method) {
  if (method === 'GET') return false;
  return !NO_ENCOLAR.some((ruta) => path.startsWith(ruta));
}

function encolar(path, options) {
  const items = leerCola();
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    method: options.method,
    path,
    body: options.body,
    token: getToken(),
    createdAt: new Date().toISOString(),
    intentos: 0,
  });
  guardarCola(items);
}

let reenviando = false;

export async function reenviarCola() {
  if (reenviando || sinConexion()) return { enviadas: 0, pendientes: contarCola() };
  reenviando = true;
  const items = leerCola();
  let enviadas = 0;
  const errores = [];
  try {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      window.dispatchEvent(new CustomEvent('dadini:sincronizando', { detail: { actual: i + 1, total: items.length } }));
      const headers = {};
      if (item.token) headers.Authorization = `Bearer ${item.token}`;
      if (item.body !== undefined) headers['Content-Type'] = 'application/json';
      try {
        const respuesta = await fetch(`${BASE}${item.path}`, {
          method: item.method,
          headers,
          body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
        });
        if (respuesta.ok || respuesta.status === 204) {
          item._ok = true;
          enviadas += 1;
          continue;
        }
        if (respuesta.status === 401) {
          setToken(null);
          item._descartar = true;
          window.dispatchEvent(new CustomEvent('dadini:unauthorized'));
          continue;
        }
        item.intentos = (item.intentos || 0) + 1;
        if (respuesta.status >= 400 && respuesta.status < 500) {
          item._descartar = true;
          errores.push({ path: item.path, error: `HTTP ${respuesta.status}` });
          continue;
        }
        if (respuesta.status >= 500) {
          errores.push({ path: item.path, error: `HTTP ${respuesta.status}` });
          window.dispatchEvent(new CustomEvent('dadini:sincronizando', { detail: { actual: i + 1, total: items.length, error: true } }));
          break;
        }
      } catch {
        item.intentos = (item.intentos || 0) + 1;
        errores.push({ path: item.path, error: 'Sin conexión' });
        break;
      }
    }
    // _ok: enviado correctamente · _descartar: error del cliente (4xx).
    // Los errores de red/5xx se conservan con su contador de intentos.
    const restantes = items.filter((x) => !x._ok && !x._descartar);
    guardarCola(restantes);
    window.dispatchEvent(new CustomEvent('dadini:sincronizado', { detail: { enviadas, pendientes: restantes.length, errores } }));
    return { enviadas, pendientes: restantes.length, errores };
  } finally {
    reenviando = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { reenviarCola(); });
  window.addEventListener('offline', () => {
    window.dispatchEvent(new CustomEvent('dadini:cola', { detail: { count: contarCola() } }));
  });
  window.setTimeout(() => {
    if (contarCola()) reenviarCola();
  }, 1500);
}

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (puedeEncolar(path, method) && sinConexion()) {
    encolar(path, { method, body });
    throw new Error('Sin conexión: el cambio quedó guardado y se enviará automáticamente al volver la red.');
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    if (puedeEncolar(path, method)) {
      encolar(path, { method, body });
      throw new Error('Sin conexión: el cambio quedó guardado y se enviará automáticamente al volver la red.');
    }
    throw new Error('No se pudo conectar con el servidor. Verifica que la API esté encendida.');
  }
  if (response.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent('dadini:unauthorized'));
  }
  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (error) {
      message = response.statusText || message;
    }
    throw new Error(message);
  }
  if (raw) return response;
  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};

export async function downloadCSV(path, filename) {
  const token = getToken();
  const response = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) throw new Error('No se pudo generar el archivo.');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
