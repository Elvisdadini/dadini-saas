const { round2 } = require('./utils');

function esCoordenaValida(lat, lon) {
  const a = Number(lat);
  const b = Number(lon);
  return Number.isFinite(a) && Number.isFinite(b) && a >= -90 && a <= 90 && b >= -180 && b <= 180;
}

function distanciaKm(a, b) {
  if (!a || !b || !esCoordenaValida(a.latitud, a.longitud) || !esCoordenaValida(b.latitud, b.longitud)) return 0;
  const R = 6371;
  const dLat = ((b.latitud - a.latitud) * Math.PI) / 180;
  const dLon = ((b.longitud - a.longitud) * Math.PI) / 180;
  const la1 = (a.latitud * Math.PI) / 180;
  const la2 = (b.latitud * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return round2(2 * R * Math.asin(Math.sqrt(h)));
}

function distanciaAcumulada(puntos) {
  let total = 0;
  for (let i = 1; i < puntos.length; i += 1) total += distanciaKm(puntos[i - 1], puntos[i]);
  return round2(total);
}

function centroYDistanza(puntos) {
  const validos = puntos.filter((p) => esCoordenaValida(p?.latitud, p?.longitud));
  if (!validos.length) return { centro: { latitud: -17.3938, longitud: -66.1571 }, radio_km: 5 };
  const lat = validos.reduce((s, p) => s + Number(p.latitud), 0) / validos.length;
  const lon = validos.reduce((s, p) => s + Number(p.longitud), 0) / validos.length;
  const radio = Math.max(1, ...validos.map((p) => distanciaKm({ latitud: lat, longitud: lon }, p))) + 0.5;
  return { centro: { latitud: round2(lat * 10000) / 10000, longitud: round2(lon * 10000) / 10000 }, radio_km: round2(radio) };
}

module.exports = { esCoordenaValida, distanciaKm, distanciaAcumulada, centroYDistanza };
