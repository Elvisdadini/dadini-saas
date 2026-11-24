import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, Crosshair, MapPin, Pencil, RefreshCcw, Save, Trash2, Users, X,
} from 'lucide-react';
import { MapContainer, Marker, Polygon, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../api';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import { esCoordenaValida, formatoCoords } from '../geo';

function CapturadorClics({ activo, onPunto }) {
  useMapEvents({
    click(evento) {
      if (!activo) return;
      onPunto({ latitud: Number(evento.latlng.lat.toFixed(6)), longitud: Number(evento.latlng.lng.toFixed(6)) });
    },
  });
  return null;
}

function AjustarVista({ puntos }) {
  const mapa = useMap();
  useEffect(() => {
    const validos = puntos.filter((p) => esCoordenaValida(p.latitud, p.longitud)).map((p) => [Number(p.latitud), Number(p.longitud)]);
    if (!validos.length) return;
    if (validos.length === 1) { mapa.setView(validos[0], 15); return; }
    mapa.fitBounds(validos, { padding: [40, 40], maxZoom: 16 });
  }, [mapa, puntos]);
  return null;
}

function iconoCliente(fuera) {
  return L.divIcon({
    className: 'map-marker-wrap',
    html: `<span class="map-marker" style="--marker:${fuera ? '#dc2626' : '#16a34a'}"></span>`,
    iconSize: [22, 22], iconAnchor: [11, 11], popupAnchor: [0, -12],
  });
}

const iconoVertice = L.divIcon({
  className: 'map-marker-wrap',
  html: '<span class="map-marker" style="--marker:#2563eb;width:12px;height:12px"></span>',
  iconSize: [14, 14], iconAnchor: [7, 7],
});

export default function MapaZonas() {
  const toast = useToast();
  const [catalogo, setCatalogo] = useState(null);
  const [zonaId, setZonaId] = useState('');
  const [cobertura, setCobertura] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [vertices, setVertices] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);
  const [modalReasignar, setModalReasignar] = useState(false);
  const [destinoId, setDestinoId] = useState('');
  const [vendedorId, setVendedorId] = useState('');

  const cargarCatalogo = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/rutas-venta?todos=true');
      setCatalogo(r);
      if (!zonaId && r.zonas?.length) setZonaId(String(r.zonas[0].id));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast, zonaId]);

  const cargarCobertura = useCallback(async () => {
    if (!zonaId) return;
    try { setCobertura(await api.get(`/geo/zonas/${zonaId}/cobertura`)); }
    catch (error) { toast(error.message, 'error'); }
  }, [zonaId, toast]);

  useEffect(() => { cargarCatalogo(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { cargarCobertura(); setSeleccionados([]); }, [cargarCobertura]);

  const zona = catalogo?.zonas?.find((z) => z.id === Number(zonaId));
  const poligonoGuardado = cobertura?.zona?.poligono || [];
  const poligono = editando ? vertices : poligonoGuardado;
  const clientes = cobertura?.clientes || [];
  const fuera = clientes.filter((c) => c.fuera);
  const dentro = clientes.filter((c) => !c.fuera);

  const puntosMapa = useMemo(() => clientes.filter((c) => esCoordenaValida(c.latitud, c.longitud)), [clientes]);
  const vistas = useMemo(() => [...puntosMapa, ...poligono.map((p, i) => ({ ...p, id: `v${i}` }))], [puntosMapa, poligono]);

  const empezarDibujo = () => {
    setVertices(poligonoGuardado.length ? [...poligonoGuardado] : []);
    setEditando(true);
  };

  const guardarCuadrante = async () => {
    if (vertices.length < 3) return toast('Marca al menos 3 puntos en el mapa.', 'error');
    setGuardando(true);
    try {
      await api.put(`/rutas-venta/zonas/${zonaId}/poligono`, {
        poligono: vertices, geocerca_activa: true,
      });
      toast('Cuadrante guardado. La geocerca de la zona quedó activa.');
      setEditando(false);
      await cargarCobertura();
      await cargarCatalogo();
    } catch (error) { toast(error.message, 'error'); } finally { setGuardando(false); }
  };

  const abrirReasignar = () => {
    if (!seleccionados.length) return toast('Selecciona al menos un cliente en rojo.', 'error');
    setModalReasignar(true);
    setDestinoId('');
    setVendedorId('');
  };

  const vendedoresDestino = (catalogo?.vendedores || []).filter((v) => {
    const z = catalogo?.zonas?.find((x) => x.id === Number(destinoId));
    return z && v.zona_venta === z.nombre;
  });

  const confirmarReasignacion = async () => {
    if (!destinoId) return toast('Selecciona la zona de destino.', 'error');
    if (!vendedorId) return toast('Selecciona el vendedor de la zona de destino.', 'error');
    setGuardando(true);
    try {
      const r = await api.post(`/geo/zonas/${zonaId}/reasignar-fuera`, {
        cliente_ids: seleccionados, zona_id: Number(destinoId), vendedor_id: Number(vendedorId),
      });
      toast(`${r.reasignados} clientes reasignados a ${r.zona_destino} · ${r.vendedor}`);
      setModalReasignar(false);
      setSeleccionados([]);
      await cargarCobertura();
    } catch (error) { toast(error.message, 'error'); } finally { setGuardando(false); }
  };

  if (loading && !catalogo) return <><PageHeader eyebrow="Ventas / Mapa" title="Mapa de zonas" subtitle="Cargando mapa…" /><div className="panel"><SkeletonRows rows={6} /></div></>;

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Mapa"
        title="Mapa de zonas y rutas"
        subtitle="Dibuja el cuadrante de cada zona. Los clientes fuera del límite se marcan en rojo para reasignarlos."
        actions={<>
          <button className="btn btn-outline" onClick={() => { cargarCobertura(); cargarCatalogo(); }}><RefreshCcw size={14} /> Actualizar</button>
          {!editando
            ? <button className="btn btn-primary" onClick={empezarDibujo}><Pencil size={14} /> Dibujar cuadrante</button>
            : <button className="btn btn-ghost" onClick={() => setEditando(false)}><X size={14} /> Cancelar</button>}
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Clientes en la zona" value={clientes.length} icon={Users} tone="blue" />
        <StatCard label="Dentro del cuadrante" value={dentro.length} icon={Check} tone="green" />
        <StatCard label="Fuera del cuadrante" value={fuera.length} icon={AlertTriangle} tone="red" />
        <StatCard label="Zonas registradas" value={catalogo?.zonas?.length || 0} icon={MapPin} tone="purple" />
      </div>

      {fuera.length > 0 && (
        <div className="notice notice-danger mb-16">
          <AlertTriangle size={16} />
          <div><strong>{fuera.length} cliente(s) fuera del cuadrante de {zona?.nombre || 'la zona'}.</strong> Reasigna los seleccionados a la zona vecina para que otro vendedor los atienda.</div>
        </div>
      )}

      <div className="grid grid-2" style={{ gap: 16, gridTemplateColumns: 'minmax(0,1.6fr) minmax(300px,1fr)' }}>
        <div className="panel">
          <div className="panel-head">
            <div><h3>Mapa de {zona?.nombre || 'la zona'}</h3><p>Haz clic para marcar los vértices del cuadrante</p></div>
            {zona && <Badge tone={zona.geocerca?.activa ? 'green' : 'gray'}>{zona.geocerca?.activa ? 'Geocerca activa' : 'Sin geocerca'}</Badge>}
          </div>
          <div className="panel-body">
            <div className="field"><label>Zona</label>
              <select className="select" value={zonaId} onChange={(e) => { setZonaId(e.target.value); setEditando(false); }}>
                <option value="">Seleccionar zona…</option>
                {(catalogo?.zonas || []).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
              </select>
            </div>
            {editando && (
              <div className="notice notice-info mt-12">
                <Crosshair size={14} />
                <div>
                  Marca los vértices haciendo clic en el mapa (mínimo 3, máximo 12).
                  <div className="inline mt-8" style={{ gap: 6 }}>
                    <span className="chip active">{vertices.length} vértices</span>
                    <button className="btn btn-soft btn-sm" onClick={() => setVertices((v) => v.slice(0, -1))} disabled={!vertices.length}>Deshacer</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setVertices([])} disabled={!vertices.length}>Limpiar</button>
                    <button className="btn btn-primary btn-sm" onClick={guardarCuadrante} disabled={guardando || vertices.length < 3}><Save size={13} /> {guardando ? 'Guardando…' : 'Guardar cuadrante'}</button>
                  </div>
                </div>
              </div>
            )}
            <div className="mapa-box mt-12" style={{ height: 480 }}>
              {!zonaId ? <div className="mapa-vacio">Selecciona una zona.</div> : (
                <MapContainer center={[-17.3938, -66.1571]} zoom={13} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                  <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <CapturadorClics activo={editando} onPunto={(p) => setVertices((v) => (v.length >= 12 ? v : [...v, p]))} />
                  {poligono.length >= 3 && (
                    <Polygon
                      positions={poligono.map((p) => [Number(p.latitud), Number(p.longitud)])}
                      pathOptions={{ color: editando ? '#2563eb' : '#ff6500', weight: 3, fillColor: editando ? '#2563eb' : '#ff6500', fillOpacity: 0.12, dashArray: editando ? '6 6' : undefined }}
                    />
                  )}
                  {editando && vertices.map((v, i) => (
                    <Marker key={`v${i}`} position={[v.latitud, v.longitud]} icon={iconoVertice} />
                  ))}
                  {!editando && puntosMapa.map((c) => (
                    <Marker key={c.id} position={[Number(c.latitud), Number(c.longitud)]} icon={iconoCliente(c.fuera)}>
                      <Popup>
                        <strong>{c.nombre}</strong><br />
                        <span>{c.zona} · {c.direccion}</span><br />
                        <Badge tone={c.fuera ? 'red' : 'green'}>{c.fuera ? c.motivo : 'Dentro del cuadrante'}</Badge><br />
                        <small>{formatoCoords(c.latitud, c.longitud)}</small><br />
                        <small>Vendedor: {c.vendedor_nombre}</small>
                      </Popup>
                    </Marker>
                  ))}
                  <AjustarVista puntos={vistas} />
                </MapContainer>
              )}
            </div>
            <div className="inline mt-8" style={{ gap: 14 }}>
              <span className="small muted"><span style={{ color: '#16a34a' }}>●</span> Dentro</span>
              <span className="small muted"><span style={{ color: '#dc2626' }}>●</span> Fuera del cuadrante</span>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div><h3>Clientes fuera del cuadrante</h3><p>Selecciona y reasigna a la zona vecina</p></div>
            {fuera.length > 0 && <Badge tone="red">{fuera.length}</Badge>}
          </div>
          <div className="panel-body">
            {!fuera.length ? <EmptyState icon={Check} title="Todo dentro del límite" message="No hay clientes fuera del cuadrante de esta zona." /> : (
              <>
                <div className="table-wrap" style={{ maxHeight: 430, overflowY: 'auto' }}>
                  <table className="data-table">
                    <thead><tr><th /><th>Cliente</th><th>Ubicación</th><th>Vendedor actual</th></tr></thead>
                    <tbody>
                      {fuera.map((c) => (
                        <tr key={c.id}>
                          <td><input type="checkbox" checked={seleccionados.includes(c.id)} onChange={(e) => setSeleccionados((s) => e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id))} /></td>
                          <td className="cell-strong">{c.nombre}<span className="cell-sub">{c.codigo} · {c.motivo}</span></td>
                          <td className="small">{formatoCoords(c.latitud, c.longitud)}</td>
                          <td className="small">{c.vendedor_nombre}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn btn-primary btn-block mt-12" onClick={abrirReasignar} disabled={!seleccionados.length}>
                  <Users size={14} /> Reasignar {seleccionados.length || ''} seleccionados
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      <Modal open={modalReasignar} onClose={() => setModalReasignar(false)} title="Reasignar clientes" subtitle={`${seleccionados.length} cliente(s) fuera de ${zona?.nombre || 'la zona'}`}
        footer={<><button className="btn btn-ghost" onClick={() => setModalReasignar(false)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarReasignacion} disabled={guardando}>{guardando ? 'Reasignando…' : 'Confirmar reasignación'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Zona de destino</label>
            <select className="select" value={destinoId} onChange={(e) => { setDestinoId(e.target.value); setVendedorId(''); }}>
              <option value="">Seleccionar zona…</option>
              {(catalogo?.zonas || []).filter((z) => z.id !== Number(zonaId)).map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
            </select>
          </div>
          <div className="field"><label>Vendedor de la zona</label>
            <select className="select" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
              <option value="">Seleccionar vendedor…</option>
              {vendedoresDestino.map((v) => <option key={v.id} value={v.id}>{v.nombre} · {v.ruta_venta || 'sin ruta'}</option>)}
            </select>
            <span className="hint">Los clientes tomarán la zona, ruta y distribuidor de este vendedor.</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
