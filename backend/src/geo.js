const { round2 } = require('./utils');
const { tienePermiso } = require('./permisos');

function esCoordenaValida(lat, lon) {
  // null / '' / false convertidos a 0 eran considerados válidos (0,0) y
  // generaban visitas falsas. Para una geocerca eso equivaldría a "dentro".
  if (lat === null || lat === undefined || lat === '' || lat === false
    || lon === null || lon === undefined || lon === '' || lon === false) return false;
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

// Distancia en metros sin redondear: distanciaKm() redondea a 2 decimales
// (10 m), insuficiente para una geocerca de 50 m.
function distanciaMetros(a, b) {
  if (!a || !b || !esCoordenaValida(a.latitud, a.longitud) || !esCoordenaValida(b.latitud, b.longitud)) return null;
  const R = 6371000;
  const dLat = ((Number(b.latitud) - Number(a.latitud)) * Math.PI) / 180;
  const dLon = ((Number(b.longitud) - Number(a.longitud)) * Math.PI) / 180;
  const la1 = (Number(a.latitud) * Math.PI) / 180;
  const la2 = (Number(b.latitud) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Valida las dos geocercas posibles:
//  - de ZONA: el vendedor debe estar dentro del círculo de la zona.
//  - de USUARIO: el vendedor debe estar a <= radio del cliente (tienda).
function validarGeocerca(db, req, cliente, body = {}, accion = 'registrar') {
  const usuario = (db.usuarios || []).find((u) => u.id === req.user?.id) || {};
  const zona = (db.zonas || []).find((z) => z.id === cliente?.zona_id || z.nombre === cliente?.zona);
  const geoUsuario = usuario.geocerca || {};
  const geoZona = zona?.geocerca || {};
  const activaUsuario = geoUsuario.activa === true || usuario.geocerca_activa === true;
  const activaZona = geoZona.activa === true || zona?.geocerca_activa === true;

  if (!activaUsuario && !activaZona) return { aplica: false, dentro: true };

  const excepcion = accion.includes('cobro') || accion.includes('cobranza')
    ? 'geocerca.excepcion_cobranzas'
    : 'geocerca.excepcion_ventas';
  if (['admin', 'dueno'].includes(req.user?.rol) || tienePermiso(req.user, excepcion)) {
    return { aplica: false, dentro: true, eximido: true };
  }

  const posicion = { latitud: Number(body?.latitud), longitud: Number(body?.longitud) };
  if (!esCoordenaValida(posicion.latitud, posicion.longitud)) {
    return {
      aplica: true, dentro: false, motivo: `La geocerca está activa: se requiere la ubicación del dispositivo para ${accion}.`,
    };
  }

  if (activaZona && esCoordenaValida(geoZona.latitud, geoZona.longitud)) {
    const radio = Math.max(1, Number(geoZona.radio_m) || 50);
    const distanciaZona = distanciaMetros(posicion, { latitud: geoZona.latitud, longitud: geoZona.longitud });
    if (distanciaZona > radio) {
      return {
        aplica: true, dentro: false, distancia_m: distanciaZona, radio_m: radio, tipo: 'zona',
        motivo: `Estás a ${distanciaZona} m del centro de la zona "${zona.nombre}". El límite es ${radio} m.`,
      };
    }
  }

  if (activaUsuario) {
    if (!esCoordenaValida(cliente?.latitud, cliente?.longitud)) {
      return {
        aplica: true, dentro: false, motivo: `El cliente "${cliente?.nombre || ''}" no tiene ubicación registrada; no se puede validar la geocerca.`,
      };
    }
    const radio = Math.max(1, Number(geoUsuario.radio_m) || Number(usuario.geocerca_radio_m) || 50);
    const distancia = distanciaMetros(posicion, { latitud: cliente.latitud, longitud: cliente.longitud });
    if (distancia > radio) {
      return {
        aplica: true, dentro: false, distancia_m: distancia, radio_m: radio, tipo: 'usuario',
        motivo: `Estás a ${distancia} m de "${cliente.nombre}". El límite permitido es ${radio} m.`,
      };
    }
    return { aplica: true, dentro: true, distancia_m: distancia, radio_m: radio, tipo: 'usuario' };
  }

  return { aplica: true, dentro: true };
}

module.exports = {
  esCoordenaValida, distanciaKm, distanciaMetros, distanciaAcumulada, centroYDistanza, validarGeocerca,
};
