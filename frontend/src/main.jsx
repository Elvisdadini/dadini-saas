import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import { ToastProvider } from './ui';
import { instalarTelemetria } from './telemetria';
import './styles.css';

instalarTelemetria();

// Tema persistido antes del primer render para evitar parpadeo.
// Se aceptan ambos valores por compatibilidad con versiones anteriores.
const temaGuardado = localStorage.getItem('dadini_tema') || 'claro';
document.documentElement.dataset.theme = temaGuardado === 'dark' ? 'oscuro' : temaGuardado;
if (temaGuardado === 'dark') localStorage.setItem('dadini_tema', 'oscuro');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// PWA: el service worker cachea la interfaz para que el sistema abra sin red.
// Solo en producción (en dev el archivo no existe en el servidor de Vite).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
