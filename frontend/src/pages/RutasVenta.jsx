import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Pencil, Plus, RefreshCcw, Route, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const VACIA = { codigo: '', nombre: '', zona: '', zona_ids: [], dia_visita: 1, vendedor_id: '', distribuidor_id: '', activa: true };

export default function RutasVenta() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [zonaNueva, setZonaNueva] = useState('');
  const [tipoNuevo, setTipoNuevo] = useState('');
  const [tipoPadre, setTipoPadre] = useState('');
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([api.get('/rutas-venta'), api.get('/clientes')]);
      setData({ ...r, clientes: c.clientes || [] });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (ruta = null) => {
    setEditando(ruta);
    setForm(ruta ? {
      ...VACIA, ...ruta,
      zona_ids: ruta.zona_ids || (ruta.zona_id ? [ruta.zona_id] : []),
      distribuidor_id: ruta.distribuidor_id || '',
    } : VACIA);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.vendedor_id) return toast('Selecciona un vendedor.', 'error');
    setBusy(true);
    try {
      const payload = { ...form, zona_ids: (form.zona_ids || []).map(Number), dia_visita: Number(form.dia_visita) || 1 };
      if (editando) await api.put(`/rutas-venta/${editando.id}`, payload);
      else await api.post('/rutas-venta', payload);
      toast(editando ? 'Ruta actualizada' : 'Ruta creada con zona y distribuidor automáticos');
      setModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const toggle = async (ruta) => {
    try {
      await api.patch(`/rutas-venta/${ruta.id}/estado`, { activa: !ruta.activa });
      toast(ruta.activa ? 'Ruta desactivada' : 'Ruta activada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const eliminar = async (ruta) => {
    if (!window.confirm(`¿Eliminar la ruta ${ruta.codigo}? Los clientes conservarán su asignación.`)) return;
    try {
      await api.del(`/rutas-venta/${ruta.id}`);
      toast('Ruta eliminada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const sincronizar = async () => {
    setBusy(true);
    try {
      const r = await api.post('/rutas-venta/sincronizar', {});
      toast(`Asignaciones sincronizadas: ${r.actualizados} registros`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const crearZona = async () => {
    if (!zonaNueva.trim()) return;
    try {
      await api.post('/rutas-venta/zonas', { nombre: zonaNueva });
      toast(`Zona ${zonaNueva} creada`);
      setZonaNueva('');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const crearTipo = async () => {
    if (!tipoNuevo.trim()) return;
    try {
      await api.post('/rutas-venta/tipos', { nombre: tipoNuevo, padre_id: tipoPadre || null });
      toast(`Tipo ${tipoNuevo} creado${tipoPadre ? ' como subtipo' : ''}`);
      setTipoNuevo('');
      setTipoPadre('');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const nombreDistribuidor = (id) => (data?.distribuidores || []).find((d) => d.id === id)?.nombre || 'Sin asignar';
  const nombreVendedor = (id) => (data?.vendedores || []).find((v) => v.id === id)?.nombre || 'Sin asignar';
  const clientesDe = (codigo) => (data?.clientes || []).filter((c) => c.ruta_venta === codigo).length;

  const distribuidorCalculado = (data?.vendedores || []).find((v) => v.id === Number(form.vendedor_id))?.repartidor_id;

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Configuración"
        title="Rutas y zonas de venta"
        subtitle="Define la ruta, la zona, el día de visita y el vendedor. El distribuidor asignado a ese usuario se hereda automáticamente."
        actions={<>
          <Link className="btn btn-ghost" to="/clientes"><ArrowLeft size={14} /> Clientes</Link>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-soft" onClick={sincronizar} disabled={busy}><ShieldCheck size={14} /> Sincronizar asignaciones</button>
          <button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Nueva ruta</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Rutas activas" value={(data?.rutas || []).filter((r) => r.activa).length} icon={Route} tone="orange" hint="Rutas de preventa" />
        <StatCard label="Zonas registradas" value={(data?.zonas || []).length} icon={MapPin} tone="blue" hint="Disponibles para clientes" />
        <StatCard label="Vendedores" value={(data?.vendedores || []).length} icon={Users} tone="green" hint="Con ruta asignada" />
        <StatCard label="Clientes en rutas" value={(data?.clientes || []).filter((c) => c.ruta_venta).length} icon={CalendarDays} tone="purple" hint="Asignados automáticamente" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Rutas de venta</h3><p>Cada cliente nuevo toma la ruta, zona, día y distribuidor del vendedor asignado.</p></div></div>
        {loading ? <SkeletonRows rows={5} /> : !(data?.rutas || []).length ? (
          <EmptyState icon={Route} title="Sin rutas de venta" message="Crea la primera ruta para organizar las visitas." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Ruta</th><th>Zona</th><th>Día de visita</th><th>Vendedor</th><th>Distribuidor automático</th><th className="num">Clientes</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.rutas.map((r) => (
                  <tr key={r.id}>
                    <td className="cell-strong">{r.codigo}</td>
                    <td>{r.nombre}</td>
                    <td>
                      {(r.zonas || (r.zona ? [r.zona] : [])).map((z) => <span key={z} className="badge badge-gray" style={{ marginRight: 4 }}>{z}</span>)}
                    </td>
                    <td>{DIAS[r.dia_visita] || '—'}</td>
                    <td>{nombreVendedor(r.vendedor_id)}</td>
                    <td><Badge tone="purple">{nombreDistribuidor(r.distribuidor_id)}</Badge></td>
                    <td className="num">{clientesDe(r.codigo)}</td>
                    <td><Badge tone={r.activa ? 'green' : 'gray'}>{r.activa ? 'Activa' : 'Inactiva'}</Badge></td>
                    <td className="actions">
                      <button className="icon-btn" title="Editar" onClick={() => abrir(r)}><Pencil size={14} /></button>
                      <button className="icon-btn" title={r.activa ? 'Desactivar' : 'Activar'} onClick={() => toggle(r)}><ShieldCheck size={14} /></button>
                      <button className="icon-btn" title="Eliminar" onClick={() => eliminar(r)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-2" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Zonas</h3><p>Si falta una zona al crear un cliente, se crea sola.</p></div></div>
          <div className="panel-body">
            <div className="filters">
              <input className="input" value={zonaNueva} onChange={(e) => setZonaNueva(e.target.value)} placeholder="Nueva zona, ej. Temporal" />
              <button className="btn btn-primary btn-sm" onClick={crearZona}><Plus size={13} /> Agregar</button>
            </div>
            <div className="pill-group mt-12">
              {(data?.zonas || []).map((z) => <span key={z.id} className="chip active">{z.nombre}</span>)}
            </div>
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Tipos de cliente</h3><p>Crea tipos y subtipos según el negocio (ej. Tienda de barrio → Tipo A / Supermercado).</p></div></div>
          <div className="panel-body">
            <div className="filters">
              <input className="input" value={tipoNuevo} onChange={(e) => setTipoNuevo(e.target.value)} placeholder="Nuevo tipo, ej. Tipo A" />
              <select className="select" value={tipoPadre} onChange={(e) => setTipoPadre(e.target.value)}>
                <option value="">Tipo principal</option>
                {(data?.tipos_cliente || []).filter((t) => !t.padre_id).map((t) => <option key={t.id} value={t.id}>Dentro de {t.nombre}</option>)}
              </select>
              <button className="btn btn-primary btn-sm" onClick={crearTipo}><Plus size={13} /> Agregar</button>
            </div>
            <div className="pill-group mt-12">
              {(data?.tipos_cliente_ordenados || data?.tipos_cliente || []).map((t) => (
                <span key={t.id} className={`chip ${t.activo === false ? '' : 'active'}`}>{t.nivel ? '↳ ' : ''}{t.nombre}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar ruta de venta' : 'Nueva ruta de venta'} subtitle="El distribuidor se toma del vendedor seleccionado." size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar ruta'}</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Código</label><input className="input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ej. R3 (se genera solo si se deja vacío)" disabled={Boolean(editando)} /></div>
            <div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Ruta R3 · Sacaba" /></div>
          </div>
          <div className="field">
            <label>Zonas a visitar <span className="hint">puedes seleccionar varias; el mismo vendedor las atiende en ese día</span></label>
            <div className="pill-group">
              {(data?.zonas || []).filter((z) => z.activa !== false).map((z) => {
                const seleccionada = (form.zona_ids || []).map(Number).includes(Number(z.id));
                return (
                  <button key={z.id} type="button" className={`chip ${seleccionada ? 'active' : ''}`} onClick={() => {
                    const actuales = (form.zona_ids || []).map(Number);
                    const nuevas = seleccionada ? actuales.filter((id) => id !== z.id) : [...actuales, z.id];
                    setForm({ ...form, zona_ids: nuevas, zona: nuevas.length ? (data.zonas.find((x) => x.id === nuevas[0])?.nombre || '') : '' });
                  }}>
                    {seleccionada ? '✓ ' : ''}{z.nombre}
                  </button>
                );
              })}
            </div>
            <span className="hint">{(form.zona_ids || []).length} zonas seleccionadas. Si no seleccionas ninguna, se usa la zona del vendedor.</span>
          </div>
          <div className="field"><label>Día de visita</label><select className="select" value={form.dia_visita} onChange={(e) => setForm({ ...form, dia_visita: e.target.value })}>{DIAS.map((d, i) => d && <option key={i} value={i}>{d}</option>)}</select></div>
          <div className="field"><label>Vendedor asignado</label><select className="select" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })}><option value="">Seleccionar…</option>{(data?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nombre} · {v.ruta_venta || 'sin ruta'}</option>)}</select></div>
          <div className="field"><label>Distribuidor</label>
            <select className="select" value={form.distribuidor_id || distribuidorCalculado || ''} onChange={(e) => setForm({ ...form, distribuidor_id: e.target.value })}>
              <option value="">Sin asignar</option>
              {(data?.distribuidores || []).map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.nombre}</option>)}
            </select>
            <span className="hint">Automáticamente se usa el repartidor asignado al vendedor al crear su usuario.</span>
          </div>
          <label className="check"><input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Ruta activa</label>
        </div>
      </Modal>
    </>
  );
}
