const BASE = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'dadini_token';

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

async function request(path, { method = 'GET', body, raw = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
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
