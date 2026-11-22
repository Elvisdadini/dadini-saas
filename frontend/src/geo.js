export function esCoordenaValida(lat, lon) {
  const a = Number(lat);
  const b = Number(lon);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

export function obtenerUbicacion(opciones = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Tu dispositivo no permite geolocalización. Ingresa las coordenadas manualmente.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (posicion) => resolve({
        latitud: Math.round(posicion.coords.latitude * 1e6) / 1e6,
        longitud: Math.round(posicion.coords.longitude * 1e6) / 1e6,
        precision: Math.round(posicion.coords.accuracy || 0),
      }),
      (error) => {
        const mensaje = error.code === 1
          ? 'Permiso de ubicación denegado. Puedes escribir las coordenadas manualmente.'
          : 'No se pudo obtener tu ubicación. Verifica el GPS o ingresa las coordenadas manualmente.';
        reject(new Error(mensaje));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0, ...opciones },
    );
  });
}

export function abrirEnMapas(latitud, longitud) {
  if (!esCoordenaValida(latitud, longitud)) return;
  window.open(`https://www.google.com/maps?q=${latitud},${longitud}`, '_blank', 'noopener,noreferrer');
}

export function distanciaKm(a, b) {
  if (!a || !b || !esCoordenaValida(a.latitud, a.longitud) || !esCoordenaValida(b.latitud, b.longitud)) return 0;
  const R = 6371;
  const dLat = ((b.latitud - a.latitud) * Math.PI) / 180;
  const dLon = ((b.longitud - a.longitud) * Math.PI) / 180;
  const la1 = (a.latitud * Math.PI) / 180;
  const la2 = (b.latitud * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 100) / 100;
}

export function formatoCoords(latitud, longitud) {
  if (!esCoordenaValida(latitud, longitud)) return 'Sin coordenadas';
  return `${Number(latitud).toFixed(5)}, ${Number(longitud).toFixed(5)}`;
}
