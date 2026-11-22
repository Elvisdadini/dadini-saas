const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { esCoordenaValida, centroYDistanza, distanciaKm } = require('../geo');

const router = express.Router();
router.use(authRequired);

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
