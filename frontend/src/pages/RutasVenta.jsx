import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CalendarDays, MapPin, Pencil, Plus, RefreshCcw, Route, ShieldCheck, Trash2, Users } from 'lucide-react';
import { api } from '../api';
import { Badge, Confirm, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const DIAS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const VACIA = {
  codigo: '', nombre: '', zona: '', zona_ids: [], dia_visita: 1, dias_visita: [1],
  zonas_por_dia: {}, tipos_cliente_ids: [], vendedor_id: '', distribuidor_id: '', activa: true,
};

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
  const [diaActivo, setDiaActivo] = useState(1);
  const [zonaElegida, setZonaElegida] = useState('');
  const [eliminarItem, setEliminarItem] = useState(null);
  const [busyEliminar, setBusyEliminar] = useState(false);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([api.get('/rutas-venta?todos=true'), api.get('/clientes')]);
      setData({ ...r, clientes: c.clientes || [] });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (ruta = null) => {
    setEditando(ruta);
    const dias = ruta?.dias_visita || [ruta?.dia_visita || 1];
    const porDia = ruta?.zonas_por_dia || (ruta?.zona_id ? { [dias[0]]: [ruta.zona_id] } : {});
    setForm(ruta ? {
      ...VACIA, ...ruta,
      dias_visita: dias.map(Number),
      zonas_por_dia: porDia,
      zona_ids: ruta.zona_ids || (ruta.zona_id ? [ruta.zona_id] : []),
      tipos_cliente_ids: ruta.tipos_cliente_ids || [],
      distribuidor_id: ruta.distribuidor_id || '',
    } : VACIA);
    setDiaActivo(dias[0]);
    setZonaElegida('');
    setModal(true);
  };

  const guardar = async () => {
    if (!form.vendedor_id) return toast('Selecciona un vendedor.', 'error');
    setBusy(true);
    try {
      const dias = (form.dias_visita || []).map(Number).length ? form.dias_visita.map(Number) : [1];
      const zonasUnion = [...new Set(Object.values(form.zonas_por_dia || {}).flat().map(Number))];
      const payload = {
        ...form,
        dias_visita: dias,
        dia_visita: dias[0],
        zonas_por_dia: form.zonas_por_dia || {},
        zona_ids: zonasUnion,
        tipos_cliente_ids: (form.tipos_cliente_ids || []).map(Number),
      };
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

  const zonasDelDiaActivo = (form.zonas_por_dia?.[diaActivo] || []).map(Number);

  const alternarDia = (dia) => {
    const actuales = form.dias_visita || [];
    const nuevas = actuales.includes(dia) ? actuales.filter((d) => d !== dia) : [...actuales, dia];
    setForm({ ...form, dias_visita: nuevas.sort((a, b) => a - b) });
    if (nuevas.length && !nuevas.includes(diaActivo)) setDiaActivo(nuevas[0]);
  };

  const agregarZona = () => {
    if (!zonaElegida) return toast('Selecciona una zona de la lista.', 'error');
    if (zonasDelDiaActivo.length >= 3) return toast('Máximo 3 zonas por día.', 'error');
    const id = Number(zonaElegida);
    if (zonasDelDiaActivo.includes(id)) return toast('Esa zona ya está agregada a este día.', 'error');
    setForm({
      ...form,
      zonas_por_dia: { ...form.zonas_por_dia, [diaActivo]: [...zonasDelDiaActivo, id] },
    });
    setZonaElegida('');
  };

  const quitarZona = (id) => {
    setForm({
      ...form,
      zonas_por_dia: { ...form.zonas_por_dia, [diaActivo]: zonasDelDiaActivo.filter((z) => z !== id) },
    });
  };

  const alternarTipo = (id) => {
    const actuales = form.tipos_cliente_ids || [];
    setForm({
      ...form,
      tipos_cliente_ids: actuales.includes(id) ? actuales.filter((t) => t !== id) : [...actuales, id],
    });
  };

  const confirmarEliminacion = async () => {
    if (!eliminarItem) return;
    setBusyEliminar(true);
    try {
      const path = eliminarItem.tipo === 'zona'
        ? `/rutas-venta/zonas/${eliminarItem.item.id}`
        : `/rutas-venta/tipos/${eliminarItem.item.id}`;
      await api.del(path);
      toast(`${eliminarItem.tipo === 'zona' ? 'Zona' : 'Tipo'} eliminado`);
      setEliminarItem(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusyEliminar(false); }
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
                    <td>{(r.dias_visita || [r.dia_visita]).filter(Boolean).map((d) => DIAS[d]).filter(Boolean).join(', ') || '—'}</td>
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
              {(data?.zonas || []).map((z) => (
                <span key={z.id} className="chip active">
                  {z.nombre}
                  <button className="chip-del" title="Eliminar zona" onClick={() => setEliminarItem({ tipo: 'zona', item: z })}><Trash2 size={11} /></button>
                </span>
              ))}
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
                <span key={t.id} className="chip active">
                  {t.nivel ? '↳ ' : ''}{t.nombre}
                  <button className="chip-del" title="Eliminar tipo" onClick={() => setEliminarItem({ tipo: 'tipo', item: t })}><Trash2 size={11} /></button>
                </span>
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
            <label>Días de visita <span className="hint">selecciona todos los días en que el vendedor atiende esta ruta</span></label>
            <div className="pill-group">
              {DIAS.map((d, i) => d && (
                <button key={i} type="button" className={`chip ${(form.dias_visita || []).includes(i) ? 'active' : ''}`} onClick={() => alternarDia(i)}>
                  {(form.dias_visita || []).includes(i) ? '✓ ' : ''}{d}
                </button>
              ))}
            </div>
          </div>

          {(form.dias_visita || []).length > 0 && (
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head">
                <div><h3>Zonas de {DIAS[diaActivo]}</h3><p>Agrega hasta 3 zonas para este día y cambia de día con los botones.</p></div>
                <Badge tone="orange">{zonasDelDiaActivo.length}/3</Badge>
              </div>
              <div className="panel-body">
                <div className="pill-group mt-8">
                  {(form.dias_visita || []).map((d) => (
                    <button key={d} type="button" className={`chip ${diaActivo === d ? 'active' : ''}`} onClick={() => { setDiaActivo(d); setZonaElegida(''); }}>{DIAS[d]}</button>
                  ))}
                </div>
                <div className="inline mt-12" style={{ gap: 6 }}>
                  <select className="select" value={zonaElegida} onChange={(e) => setZonaElegida(e.target.value)}>
                    <option value="">Seleccionar zona a asignar…</option>
                    {(data?.zonas || []).filter((z) => z.activa !== false && !zonasDelDiaActivo.includes(Number(z.id))).map((z) => (
                      <option key={z.id} value={z.id}>{z.nombre}</option>
                    ))}
                  </select>
                  <button type="button" className="btn btn-outline btn-sm" onClick={agregarZona}><Plus size={13} /> Agregar</button>
                </div>
                <div className="pill-group mt-12">
                  {zonasDelDiaActivo.length === 0 && <span className="small muted">Sin zonas guardadas para este día.</span>}
                  {zonasDelDiaActivo.map((id) => {
                    const zona = (data?.zonas || []).find((z) => Number(z.id) === id);
                    return (
                      <span key={id} className="chip active">
                        ✓ {zona?.nombre || id}
                        <button type="button" className="chip-del" title="Quitar zona" onClick={() => quitarZona(id)}><Trash2 size={11} /></button>
                      </span>
                    );
                  })}
                </div>
                <span className="hint">Las zonas se guardan por día. Máximo 3 zonas por día.</span>
              </div>
            </div>
          )}

          <div className="field">
            <label>Tipos de cliente que atiende esta ruta</label>
            <div className="pill-group">
              {(data?.tipos_cliente || []).map((t) => {
                const seleccionado = (form.tipos_cliente_ids || []).includes(t.id);
                return (
                  <button key={t.id} type="button" className={`chip ${seleccionado ? 'active' : ''}`} onClick={() => alternarTipo(t.id)}>
                    {seleccionado ? '✓ ' : ''}{t.nivel ? '↳ ' : ''}{t.nombre}
                  </button>
                );
              })}
            </div>
            <span className="hint">Ej. Caseta mayorista, Mayorista, Distribuidora. Se usan al registrar clientes en esta ruta.</span>
          </div>
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

      <Confirm
        open={Boolean(eliminarItem)}
        onClose={() => setEliminarItem(null)}
        onConfirm={confirmarEliminacion}
        title={`Eliminar ${eliminarItem?.tipo === 'zona' ? 'zona' : 'tipo de cliente'}`}
        message={`¿Eliminar "${eliminarItem?.item?.nombre || ''}"? Si está en uso por clientes, rutas o vendedores, el sistema lo impedirá.`}
        danger
        loading={busyEliminar}
      />
    </>
  );
}
