import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { esCoordenaValida, formatoCoords } from '../geo';
import CapaMapa from './CapaMapa';

const COLORES = {
  cliente: '#ff6500',
  visita: '#2563eb',
  cobranza: '#16a34a',
  distribucion: '#7c3aed',
  venta: '#ff6500',
  alta_cliente: '#0ea5e9',
};

const COLORES_ESTADO = {
  pendiente: '#f59e0b',
  visitado: '#16a34a',
  pedido: '#16a34a',
  entregado: '#16a34a',
  pagado: '#16a34a',
  completada: '#16a34a',
  sin_pedido: '#dc2626',
  no_pedido: '#dc2626',
  cerrado: '#dc2626',
  vencido: '#dc2626',
  cancelada: '#dc2626',
  fallida: '#dc2626',
  parcial: '#f59e0b',
  en_camino: '#f59e0b',
  preparando: '#f59e0b',
  enviado: '#2563eb',
  credito: '#7c3aed',
  sin_compra_mes: '#6b7280',
};

function icono(punto) {
  const tipo = punto?.tipo || 'cliente';
  const clave = punto?.estado || punto?.resultado || punto?.estado_pago || tipo;
  const color = COLORES_ESTADO[clave] || COLORES[tipo] || COLORES.cliente;
  return L.divIcon({
    className: 'map-marker-wrap',
    html: `<span class="map-marker" style="--marker:${color}"></span>${punto?.acciones?.length ? '<span class="map-pin-boton">＋</span>' : ''}`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function AjustarVista({ puntos }) {
  const mapa = useMap();
  useEffect(() => {
    const validos = puntos.filter((p) => esCoordenaValida(p.latitud, p.longitud)).map((p) => ({ latitud: Number(p.latitud), longitud: Number(p.longitud) }));
    if (!validos.length) return;
    if (validos.length === 1) {
      mapa.setView([validos[0].latitud, validos[0].longitud], 15);
      return;
    }
    mapa.fitBounds(validos.map((p) => [p.latitud, p.longitud]), { padding: [38, 38], maxZoom: 16 });
  }, [mapa, puntos]);
  return null;
}

export default function Mapa({ puntos = [], linea = false, altura = 320, centro, zoom = 13, onSelect, titulo }) {
  const validos = useMemo(
    () => puntos
      .filter((p) => esCoordenaValida(p?.latitud, p?.longitud))
      .map((p) => ({ ...p, latitud: Number(p.latitud), longitud: Number(p.longitud) })),
    [puntos],
  );
  const posicionCentro = centro && esCoordenaValida(centro.latitud, centro.longitud)
    ? [Number(centro.latitud), Number(centro.longitud)]
    : validos.length ? [validos[0].latitud, validos[0].longitud] : [-17.3938, -66.1571];

  return (
    <div className="mapa-box" style={{ height: altura }}>
      {titulo && <div className="mapa-titulo">{titulo}</div>}
      {!validos.length ? (
        <div className="mapa-vacio">Sin coordenadas para mostrar en el mapa.</div>
      ) : (
        <MapContainer center={posicionCentro} zoom={zoom} scrollWheelZoom={false} style={{ height: '100%', width: '100%' }}>
          <CapaMapa />
          {linea && validos.length > 1 && (
            <Polyline positions={validos.map((p) => [p.latitud, p.longitud])} pathOptions={{ color: '#ff6500', weight: 3, dashArray: '8 8' }} />
          )}
          {validos.map((p, i) => (
            <Marker
              key={p.id || `${p.latitud}-${p.longitud}-${i}`}
              position={[p.latitud, p.longitud]}
              icon={icono(p)}
              eventHandlers={onSelect ? { click: () => onSelect(p) } : undefined}
            >
              <Popup>
                <strong>{p.nombre || p.cliente_nombre || 'Punto'}</strong>
                <br />
                <span>{p.descripcion || p.direccion || ''}</span>
                <br />
                {(p.estado || p.resultado || p.estado_pago) && <><strong>{String(p.estado || p.resultado || p.estado_pago).replaceAll('_', ' ')}</strong><br /></>}
                <small>{formatoCoords(p.latitud, p.longitud)}</small>
                {p.acciones?.length > 0 && (
                  <div className="map-popup-actions">
                    {p.acciones.map((accion, i) => (
                      <button
                        key={`${accion.label}-${i}`}
                        className={`map-popup-action ${accion.tone || ''}`}
                        onClick={() => accion.onClick(p)}
                      >
                        {accion.label}
                      </button>
                    ))}
                  </div>
                )}
              </Popup>
            </Marker>
          ))}
          <AjustarVista puntos={validos} />
        </MapContainer>
      )}
    </div>
  );
}
