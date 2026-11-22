import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Bike, CalendarDays, CheckCircle2, ClipboardList, MapPin, PackageCheck,
  Pencil, Plus, Route as RouteIcon, Search, Truck, UserRound, Users, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import {
  Badge, EmptyState, Estado, Fecha, Modal, Money, PageHeader, SkeletonRows, StatCard, Tabs, useToast,
} from '../ui';

const RUTA_VACIA = { fecha: new Date().toISOString().slice(0, 10), repartidor_id: '', vehiculo_id: '', notas: '', pedidos_ids: [] };
const REP_VACIO = { nombre: '', telefono: '', licencia: '', zona: '', emoji: '🛵', activo: true };
const VEH_VACIO = { placa: '', marca: '', modelo: '', tipo: 'Camión ligero', capacidad: '', estado: 'operativo', km: 0, activo: true };

export default function Distribucion() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tab, setTab] = useState('rutas');
  const [rutas, setRutas] = useState([]);
  const [resumen, setResumen] = useState({});
  const [repartidores, setRepartidores] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [disponibles, setDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [routeModal, setRouteModal] = useState(false);
  const [form, setForm] = useState(RUTA_VACIA);
  const [repModal, setRepModal] = useState(false);
  const [repEdit, setRepEdit] = useState(null);
  const [repForm, setRepForm] = useState(REP_VACIO);
  const [vehModal, setVehModal] = useState(false);
  const [vehEdit, setVehEdit] = useState(null);
  const [vehForm, setVehForm] = useState(VEH_VACIO);
  const [busy, setBusy] = useState(false);
  const [clientesGeo, setClientesGeo] = useState([]);

  const puedeEditar = ['admin', 'distribucion'].includes(user?.rol);

  const cargar = async () => {
    setLoading(true);
    try {
      const [r, rep, veh, geo] = await Promise.all([api.get('/rutas'), api.get('/repartidores'), api.get('/vehiculos'), api.get('/geo/clientes')]);
      setClientesGeo(geo.clientes || []);
      setRutas(r.rutas);
      setResumen(r.resumen);
      setRepartidores(rep.repartidores);
      setVehiculos(veh.vehiculos);
      if (puedeEditar) {
        const d = await api.get('/rutas/disponibles?solo_reparto=true');
        setDisponibles(d.pedidos);
      }
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const rutasFiltradas = useMemo(() => rutas.filter((r) => !search || `${r.codigo} ${r.repartidor_nombre} ${r.fecha}`.toLowerCase().includes(search.toLowerCase())), [rutas, search]);

  const abrirRuta = () => {
    setForm({ ...RUTA_VACIA, repartidor_id: repartidores.find((r) => r.activo)?.id || '', vehiculo_id: vehiculos.find((v) => v.activo)?.id || '' });
    setRouteModal(true);
  };

  const crearRuta = async () => {
    if (!form.fecha) return toast('Selecciona una fecha.', 'error');
    if (!form.repartidor_id || !form.vehiculo_id) return toast('Selecciona repartidor y vehículo.', 'error');
    setBusy(true);
    try {
      await api.post('/rutas', { ...form, pedidos_ids: form.pedidos_ids });
      toast('Ruta creada correctamente');
      setRouteModal(false);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirRep = (r = null) => {
    setRepEdit(r);
    setRepForm(r ? { nombre: r.nombre, telefono: r.telefono, licencia: r.licencia, zona: r.zona, emoji: r.emoji || '🛵', activo: r.activo } : REP_VACIO);
    setRepModal(true);
  };
  const guardarRep = async () => {
    setBusy(true);
    try {
      if (repEdit) await api.put(`/repartidores/${repEdit.id}`, repForm);
      else await api.post('/repartidores', repForm);
      toast(repEdit ? 'Repartidor actualizado' : 'Repartidor creado');
      setRepModal(false); cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirVeh = (v = null) => {
    setVehEdit(v);
    setVehForm(v ? { placa: v.placa, marca: v.marca, modelo: v.modelo, tipo: v.tipo, capacidad: v.capacidad, estado: v.estado, km: v.km, activo: v.activo } : VEH_VACIO);
    setVehModal(true);
  };
  const guardarVeh = async () => {
    setBusy(true);
    try {
      if (vehEdit) await api.put(`/vehiculos/${vehEdit.id}`, vehForm);
      else await api.post('/vehiculos', vehForm);
      toast(vehEdit ? 'Vehículo actualizado' : 'Vehículo creado');
      setVehModal(false); cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const togglePedido = (id) => {
    setForm((f) => ({ ...f, pedidos_ids: f.pedidos_ids.includes(id) ? f.pedidos_ids.filter((x) => x !== id) : [...f.pedidos_ids, id] }));
  };

  const rutasHoy = rutas.filter((r) => r.fecha === new Date().toISOString().slice(0, 10));
  const entregasHoy = rutasHoy.reduce((s, r) => s + r.entregadas, 0);
  const paradasHoy = rutasHoy.reduce((s, r) => s + r.total_paradas, 0);

  return (
    <>
      <PageHeader
        eyebrow="Logística y reparto"
        title="Distribución"
        subtitle="Planifica rutas, asigna pedidos y sigue cada entrega hasta su confirmación."
        actions={(
          <>
            <button className="btn btn-navy" onClick={() => navigate(`/distribucion/${(rutasHoy.find((r) => r.estado === 'en_camino') || rutasHoy[0] || rutas[0])?.id || 'programados'}`)}><MapPin size={14} /> Iniciar ruta</button>
            {puedeEditar && <button className="btn btn-primary" onClick={abrirRuta}><Plus size={15} /> Nueva ruta</button>}
          </>
        )}
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Rutas hoy" value={rutasHoy.length} icon={RouteIcon} tone="purple" hint={`${resumen.en_camino || 0} en camino`} />
        <StatCard label="Entregas completadas" value={`${entregasHoy}/${paradasHoy}`} icon={PackageCheck} tone="green" hint="Paradas de hoy" />
        <StatCard label="Repartidores activos" value={repartidores.filter((r) => r.activo).length} icon={Bike} tone="blue" hint={`${vehiculos.filter((v) => v.estado === 'operativo').length} vehículos operativos`} />
        <StatCard label="Monto en reparto" value={<Money value={rutasHoy.filter((r) => r.estado !== 'completada').reduce((s, r) => s + r.monto_total, 0)} />} icon={Wallet} tone="orange" hint="Pedidos en calle" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Mapa de cobertura</h3><p>Clientes geolocalizados disponibles para planificar rutas y visitas</p></div>
          <span className="badge badge-orange">{clientesGeo.length} clientes con coordenadas</span>
        </div>
        <div className="panel-body">
          <Mapa altura={280} puntos={clientesGeo.map((c) => ({ id: c.id, latitud: c.latitud, longitud: c.longitud, nombre: c.nombre, descripcion: `${c.zona} · ${c.direccion}`, tipo: 'cliente' }))} />
        </div>
      </div>

      <div className="panel">
        <Tabs
          tabs={[
            { value: 'rutas', label: 'Rutas', count: rutas.length },
            { value: 'repartidores', label: 'Repartidores', count: repartidores.length },
            { value: 'vehiculos', label: 'Vehículos', count: vehiculos.length },
          ]}
          active={tab}
          onChange={setTab}
        />

        {tab === 'rutas' && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar por código, fecha o repartidor…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{rutasFiltradas.length} rutas registradas</span>
              </div>
            </div>
            {loading ? <SkeletonRows rows={6} /> : rutasFiltradas.length === 0 ? <EmptyState icon={Truck} title="Sin rutas" message="Crea la primera ruta del día y asigna los pedidos de reparto." /> : (
              <div className="panel-body" style={{ paddingTop: 4 }}>
                <div className="grid grid-2">
                  {rutasFiltradas.map((r) => (
                    <div className="card card-pad" key={r.id} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div className="split">
                        <div className="inline">
                          <span className="stat-icon stat-purple">{r.estado === 'completada' ? <CheckCircle2 size={17} /> : <Truck size={17} />}</span>
                          <div><strong style={{ display: 'block', fontSize: 13 }}>{r.codigo}</strong><span className="small muted"><Fecha value={r.fecha} /></span></div>
                        </div>
                        <Estado valor={r.estado} />
                      </div>
                      <div className="small muted">{r.repartidor_emoji} {r.repartidor_nombre} · {r.vehiculo_placa} {r.vehiculo_modelo}</div>
                      <div className="split" style={{ fontSize: 11, color: 'var(--muted)' }}>
                        <span>{r.entregadas}/{r.total_paradas} entregadas {r.fallidas ? `· ${r.fallidas} fallidas` : ''}</span>
                        <strong><Money value={r.monto_total} /></strong>
                      </div>
                      <div className="progress"><span className={`progress-fill ${r.progreso === 100 ? 'progress-green' : ''}`} style={{ width: `${r.progreso}%` }} /></div>
                      <div className="inline" style={{ justifyContent: 'space-between', marginTop: 2 }}>
                        <span className="small muted">{r.notas || 'Sin observaciones'}</span>
                        <button className="btn btn-outline btn-sm" onClick={() => navigate(`/distribucion/${r.id}`)}>Abrir ruta <ArrowRight size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'repartidores' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Repartidor</th><th>Teléfono</th><th>Licencia</th><th>Zona asignada</th><th>Rutas</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {repartidores.map((r) => (
                  <tr key={r.id}>
                    <td><div className="inline" style={{ gap: 8 }}><span className="avatar avatar-purple" style={{ width: 31, height: 31, fontSize: 14 }}>{r.emoji || '🛵'}</span><span className="cell-strong">{r.nombre}</span></div></td>
                    <td>{r.telefono}</td>
                    <td>{r.licencia}</td>
                    <td>{r.zona}</td>
                    <td>{rutas.filter((x) => x.repartidor_id === r.id).length}</td>
                    <td><Badge tone={r.activo ? 'green' : 'gray'}>{r.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="actions">{puedeEditar && <button className="icon-btn" onClick={() => abrirRep(r)}><Pencil size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {puedeEditar && <div className="panel-foot"><span className="small muted">Gestiona el equipo de reparto y sus zonas.</span><button className="btn btn-soft btn-sm" onClick={() => abrirRep()}><Plus size={13} /> Nuevo repartidor</button></div>}
          </div>
        )}

        {tab === 'vehiculos' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Vehículo</th><th>Placa</th><th>Tipo</th><th>Capacidad</th><th>Kilometraje</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {vehiculos.map((v) => (
                  <tr key={v.id}>
                    <td className="cell-strong">{v.marca} {v.modelo}</td>
                    <td><Badge tone="navy">{v.placa}</Badge></td>
                    <td>{v.tipo}</td>
                    <td>{v.capacidad}</td>
                    <td>{Number(v.km).toLocaleString('es-BO')} km</td>
                    <td><Estado valor={v.estado} /></td>
                    <td className="actions">{puedeEditar && <button className="icon-btn" onClick={() => abrirVeh(v)}><Pencil size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {puedeEditar && <div className="panel-foot"><span className="small muted">Flota registrada para distribución.</span><button className="btn btn-soft btn-sm" onClick={() => abrirVeh()}><Plus size={13} /> Nuevo vehículo</button></div>}
          </div>
        )}
      </div>

      <Modal open={routeModal} onClose={() => setRouteModal(false)} title="Nueva ruta de distribución" subtitle="Asigna repartidor, vehículo y pedidos a entregar." size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setRouteModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={crearRuta} disabled={busy}>{busy ? 'Creando…' : `Crear ruta${form.pedidos_ids.length ? ` · ${form.pedidos_ids.length} paradas` : ''}`}</button></>}
      >
        <div className="form-stack">
          <div className="field-row-3">
            <div className="field"><label>Fecha <span className="req">*</span></label><input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div className="field"><label>Repartidor</label><select className="select" value={form.repartidor_id} onChange={(e) => setForm({ ...form, repartidor_id: Number(e.target.value) })}><option value="">Seleccionar…</option>{repartidores.filter((r) => r.activo).map((r) => <option key={r.id} value={r.id}>{r.nombre} · {r.zona}</option>)}</select></div>
            <div className="field"><label>Vehículo</label><select className="select" value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: Number(e.target.value) })}><option value="">Seleccionar…</option>{vehiculos.filter((v) => v.activo).map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}</select></div>
          </div>
          <div className="field"><label>Pedidos para reparto ({form.pedidos_ids.length} seleccionados)</label>
            <div style={{ border: '1px solid var(--line)', borderRadius: 10, maxHeight: 260, overflowY: 'auto' }}>
              {disponibles.length === 0 && <p className="small muted" style={{ padding: 14 }}>No hay pedidos de reparto sin ruta asignada.</p>}
              {disponibles.map((p) => (
                <label key={p.id} className="check" style={{ padding: '9px 12px', borderBottom: '1px solid #eef2f7', display: 'flex', cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.pedidos_ids.includes(p.id)} onChange={() => togglePedido(p.id)} style={{ marginRight: 4 }} />
                  <span style={{ flex: 1 }}><strong style={{ fontSize: 11.5 }}>{p.codigo} · {p.cliente_nombre}</strong><span className="small muted" style={{ display: 'block' }}>{p.cliente_zona} · {p.items_count} u. · <Money value={p.total} /></span></span>
                  <Estado valor={p.canal} />
                </label>
              ))}
            </div>
          </div>
          <div className="field"><label>Notas de la ruta</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Horario, zona, indicaciones especiales…" /></div>
        </div>
      </Modal>

      <Modal open={repModal} onClose={() => setRepModal(false)} title={repEdit ? 'Editar repartidor' : 'Nuevo repartidor'} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setRepModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarRep} disabled={busy}>Guardar</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Nombre completo <span className="req">*</span></label><input className="input" value={repForm.nombre} onChange={(e) => setRepForm({ ...repForm, nombre: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Teléfono</label><input className="input" value={repForm.telefono} onChange={(e) => setRepForm({ ...repForm, telefono: e.target.value })} /></div>
            <div className="field"><label>Licencia</label><input className="input" value={repForm.licencia} onChange={(e) => setRepForm({ ...repForm, licencia: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Zona asignada</label><input className="input" value={repForm.zona} onChange={(e) => setRepForm({ ...repForm, zona: e.target.value })} /></div>
            <div className="field"><label>Emoji</label><input className="input" value={repForm.emoji} onChange={(e) => setRepForm({ ...repForm, emoji: e.target.value })} maxLength={4} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={repForm.activo} onChange={(e) => setRepForm({ ...repForm, activo: e.target.checked })} /> Repartidor activo</label>
        </div>
      </Modal>

      <Modal open={vehModal} onClose={() => setVehModal(false)} title={vehEdit ? 'Editar vehículo' : 'Nuevo vehículo'} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setVehModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarVeh} disabled={busy}>Guardar</button></>}
      >
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Placa <span className="req">*</span></label><input className="input" value={vehForm.placa} onChange={(e) => setVehForm({ ...vehForm, placa: e.target.value })} placeholder="3812-KTB" /></div>
            <div className="field"><label>Tipo</label><select className="select" value={vehForm.tipo} onChange={(e) => setVehForm({ ...vehForm, tipo: e.target.value })}><option>Camión ligero</option><option>Camioneta</option><option>Van</option><option>Motocicleta</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Marca</label><input className="input" value={vehForm.marca} onChange={(e) => setVehForm({ ...vehForm, marca: e.target.value })} /></div>
            <div className="field"><label>Modelo</label><input className="input" value={vehForm.modelo} onChange={(e) => setVehForm({ ...vehForm, modelo: e.target.value })} /></div>
          </div>
          <div className="field-row-3">
            <div className="field"><label>Capacidad</label><input className="input" value={vehForm.capacidad} onChange={(e) => setVehForm({ ...vehForm, capacidad: e.target.value })} placeholder="800 kg" /></div>
            <div className="field"><label>Kilometraje</label><input className="input" type="number" value={vehForm.km} onChange={(e) => setVehForm({ ...vehForm, km: e.target.value })} /></div>
            <div className="field"><label>Estado</label><select className="select" value={vehForm.estado} onChange={(e) => setVehForm({ ...vehForm, estado: e.target.value })}><option value="operativo">Operativo</option><option value="mantenimiento">Mantenimiento</option></select></div>
          </div>
        </div>
      </Modal>
    </>
  );
}
