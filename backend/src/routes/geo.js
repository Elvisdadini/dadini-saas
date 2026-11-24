const express = require('express');
const { load, save } = require('../db');
const { authRequired } = require('../auth');
const { esCoordenaValida, centroYDistanza, distanciaKm, puntoDentroPoligono, distanciaMetros } = require('../geo');
const { tienePermiso } = require('../permisos');
const { allow } = require('../auth');
const { asignarCliente, distribuidorDeVendedor } = require('../asignacion');
const { audit } = require('../utils');

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

function zonaDeCliente(db, cliente) {
  return (db.zonas || []).find((z) => z.id === cliente?.zona_id || String(z.nombre).toLowerCase() === String(cliente?.zona || '').toLowerCase()) || null;
}

function dentroDeZona(cliente, zona) {
  const punto = { latitud: cliente?.latitud, longitud: cliente?.longitud };
  if (!esCoordenaValida(punto.latitud, punto.longitud)) return { fuera: true, motivo: 'Sin coordenadas' };
  const poligono = zona?.geocerca?.poligono || zona?.poligono;
  if (Array.isArray(poligono) && poligono.length >= 3) {
    return puntoDentroPoligono(punto, poligono) ? { fuera: false } : { fuera: true, motivo: 'Fuera del cuadrante' };
  }
  const geo = zona?.geocerca;
  if (geo && esCoordenaValida(geo.latitud, geo.longitud)) {
    const distancia = distanciaMetros(punto, { latitud: geo.latitud, longitud: geo.longitud });
    const radio = Math.max(1, Number(geo.radio_m) || 50);
    return distancia <= radio ? { fuera: false, distancia_m: distancia } : { fuera: true, motivo: `A ${distancia} m del centro`, distancia_m: distancia };
  }
  return { fuera: false, motivo: 'Zona sin límites definidos' };
}

// Clientes dentro/fuera de los límites de una zona, con vendedores de las
// zonas vecinas para poder reasignarlos desde el mapa.
router.get('/zonas/:id/cobertura', (req, res) => {
  const db = load();
  const zona = (db.zonas || []).find((z) => z.id === Number(req.params.id));
  if (!zona) return res.status(404).json({ error: 'Zona no encontrada.' });
  const clientes = (db.clientes || [])
    .filter((c) => c.activo !== false)
    .map((c) => {
      const zonaActual = zonaDeCliente(db, c);
      const resultado = dentroDeZona(c, zonaActual);
      const vendedor = (db.usuarios || []).find((u) => u.id === c.vendedor_id);
      return {
        id: c.id, codigo: c.codigo, nombre: c.nombre, zona: c.zona, zona_id: c.zona_id || zonaActual?.id || null,
        latitud: c.latitud ?? null, longitud: c.longitud ?? null, direccion: c.direccion || '',
        telefono: c.telefono || '', fuera: resultado.fuera, motivo: resultado.motivo || null,
        distancia_m: resultado.distancia_m ?? null,
        vendedor_id: vendedor?.id || null, vendedor_nombre: vendedor?.nombre || 'Sin asignar',
      };
    });
  const vendedoresPorZona = (db.usuarios || [])
    .filter((u) => u.activo && ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol))
    .map((u) => ({ id: u.id, nombre: u.nombre, zona: u.zona_venta || '', ruta_venta: u.ruta_venta || null }));
  const poligono = zona.geocerca?.poligono || zona.poligono || [];
  res.json({
    zona: { id: zona.id, nombre: zona.nombre, activa: zona.activa !== false, geocerca: zona.geocerca || null, poligono },
    clientes,
    dentro: clientes.filter((c) => !c.fuera).length,
    fuera: clientes.filter((c) => c.fuera).length,
    zonas: (db.zonas || []).filter((z) => z.activa !== false).map((z) => ({ id: z.id, nombre: z.nombre })),
    vendedores: vendedoresPorZona,
  });
});

// Reasigna en lote los clientes marcados en rojo a otra zona/vendedor.
router.post('/zonas/:id/reasignar-fuera', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const zonaOrigen = (db.zonas || []).find((z) => z.id === Number(req.params.id));
  if (!zonaOrigen) return res.status(404).json({ error: 'Zona de origen no encontrada.' });
  const ids = Array.isArray(req.body?.cliente_ids) ? req.body.cliente_ids.map(Number) : [];
  const zonaDestino = (db.zonas || []).find((z) => z.id === Number(req.body?.zona_id));
  if (!zonaDestino) return res.status(400).json({ error: 'Selecciona una zona de destino.' });
  if (zonaDestino.id === zonaOrigen.id) return res.status(400).json({ error: 'La zona de destino debe ser distinta.' });
  let vendedor = req.body?.vendedor_id
    ? (db.usuarios || []).find((u) => u.id === Number(req.body.vendedor_id))
    : (db.usuarios || []).find((u) => u.activo && ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol)
      && u.zona_venta === zonaDestino.nombre);
  if (!vendedor) return res.status(400).json({ error: `No hay vendedor activo asignado a la zona ${zonaDestino.nombre}.` });

  const reasignados = [];
  ids.forEach((id) => {
    const cliente = (db.clientes || []).find((c) => c.id === id);
    if (!cliente) return;
    asignarCliente(db, cliente, vendedor, {
      vendedor_id: vendedor.id,
      zona: zonaDestino.nombre,
      dia_visita: req.body?.dia_visita || (vendedor.dias_visita || [])[0],
    });
    reasignados.push({ id: cliente.id, nombre: cliente.nombre, zona: cliente.zona, vendedor_id: cliente.vendedor_id });
  });
  audit(db, req, 'Clientes reasignados desde mapa de zonas', 'Clientes',
    `${reasignados.length} clientes → ${zonaDestino.nombre} · ${vendedor.nombre}`);
  if (reasignados.length) save();
  res.json({ ok: true, reasignados: reasignados.length, detalles: reasignados, zona_destino: zonaDestino.nombre, vendedor: vendedor.nombre, distribuidor_id: distribuidorDeVendedor(db, vendedor) });
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
