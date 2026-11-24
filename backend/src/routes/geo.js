const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { esCoordenaValida, centroYDistanza, distanciaKm } = require('../geo');
const { tienePermiso } = require('../permisos');

const router = express.Router();
router.use(authRequired);

// Configuración de geocerca que aplica al usuario actual sobre un cliente.
// El frontend la usa para exigir GPS antes de enviar ventas o cobranzas.
router.get('/geocerca', (req, res) => {
  const db = load();
  const cliente = (db.clientes || []).find((c) => c.id === Number(req.query.cliente_id));
  const usuario = (db.usuarios || []).find((u) => u.id === req.user.id) || {};
  const zona = (db.zonas || []).find((z) => z.id === cliente?.zona_id || z.nombre === cliente?.zona);
  const geoUsuario = usuario.geocerca || {};
  const geoZona = zona?.geocerca || {};
  const accion = String(req.query.accion || 'venta');
  const permiso = accion === 'cobranza' ? 'geocerca.excepcion_cobranzas' : 'geocerca.excepcion_ventas';
  const eximido = ['admin', 'dueno'].includes(req.user.rol) || tienePermiso(req.user, permiso);
  const activa = !eximido && (geoUsuario.activa === true || usuario.geocerca_activa === true
    || geoZona.activa === true || zona?.geocerca_activa === true);
  res.json({
    aplica: Boolean(activa),
    eximido,
    radio_m: Math.max(1, Number(geoUsuario.radio_m || usuario.geocerca_radio_m || 50)),
    zona: zona?.nombre || null,
    zona_geocerca: { latitud: geoZona.latitud ?? null, longitud: geoZona.longitud ?? null, radio_m: geoZona.radio_m || 50 },
    cliente_tiene_ubicacion: esCoordenaValida(cliente?.latitud, cliente?.longitud),
  });
});

router.get('/clientes', (req, res) => {
  const db = load();
  const cliente = db.clientes
    .filter((c) => c.activo && esCoordenaValida(c.latitud, c.longitud))
    .map((c) => {
      const ultima = db.visitas
        .filter((v) => v.cliente_id === c.id)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))[0];
      return {
        id: c.id,
        codigo: c.codigo,
        nombre: c.nombre,
        zona: c.zona,
        tipo: c.tipo,
        direccion: c.direccion,
        telefono: c.telefono,
        latitud: Number(c.latitud),
        longitud: Number(c.longitud),
        saldo: c.saldo,
        coordenadas_verificadas: !!c.coordenadas_verificadas,
        ultima_visita: ultima
          ? { fecha: ultima.fecha, tipo: ultima.tipo, estado: ultima.estado, notas: ultima.notas }
          : null,
      };
    });
  return res.json({ clientes: cliente, total: cliente.length, vista: centroYDistanza(cliente) });
});

router.get('/cercanos', (req, res) => {
  const db = load();
  const { latitud, longitud, radio = 3, limite = 10 } = req.query;
  if (!esCoordenaValida(latitud, longitud)) {
    return res.status(400).json({ error: 'Coordenadas de referencia inválidas.' });
  }
  const origen = { latitud: Number(latitud), longitud: Number(longitud) };
  const clientes = db.clientes
    .filter((c) => c.activo && esCoordenaValida(c.latitud, c.longitud))
    .map((c) => ({ ...c, distancia_km: distanciaKm(origen, c) }))
    .filter((c) => c.distancia_km <= Number(radio))
    .sort((a, b) => a.distancia_km - b.distancia_km)
    .slice(0, Number(limite));
  return res.json({ clientes, origen, radio_km: Number(radio) });
});

module.exports = router;
