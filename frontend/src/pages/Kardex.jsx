import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, CalendarClock, CheckCircle2, ClipboardList, Download, Plus, RefreshCcw, ShieldCheck, XCircle } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import { Num } from '../ui';

const estadoTone = { vencido: 'red', proximo: 'amber', vigente: 'green' };
const estadoLabel = { vencido: 'Vencido', proximo: 'Próximo a vencer', vigente: 'Vigente' };

export default function Kardex() {
  const toast = useToast();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [catalogo, setCatalogo] = useState({ productos: [], almacenes: [], vendedores: [] });
  const [filtros, setFiltros] = useState({ producto_id: params.get('producto') || '', almacen_id: '', tipo: 'todos', desde: '', hasta: '' });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [solicitar, setSolicitar] = useState(null);
  const [resolver, setResolver] = useState(null);
  const [solicitudForm, setSolicitudForm] = useState({ fecha_solicitada: '', motivo: '', supervisor_id: '', nota: '' });
  const [supervisores, setSupervisores] = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [k, p, a, sol,usu] = await Promise.all([
        api.get(`/kardex?producto_id=${filtros.producto_id}&almacen_id=${filtros.almacen_id}&tipo=${filtros.tipo}&desde=${filtros.desde}&hasta=${filtros.hasta}`),
        api.get('/productos?todos=true'),
        api.get('/almacenes'),
        api.get('/kardex/solicitudes-vencimiento'),
        api.get('/usuarios'),
      ]);
      setDatos({ ...k, solicitudes: sol.solicitudes || [] });
      setSupervisores((usu.usuarios || []).filter((u) => ['supervisor', 'admin', 'dueno'].includes(u.rol)));
      setCatalogo({ productos: p.productos || [], almacenes: a.almacenes || [] });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirModal = (tipo) => {
    setModal(tipo);
    const producto = filtros.producto_id || catalogo.productos[0]?.id || '';
    if (tipo === 'entrada') {
      setForm({ producto_id: producto, almacen_id: filtros.almacen_id || catalogo.almacenes[0]?.id || '', cantidad: 1, lote: '', fecha_vencimiento: '', motivo: 'Entrada de inventario' });
    } else {
      setForm({ producto_id: producto, origen_id: filtros.almacen_id || catalogo.almacenes[0]?.id || '', destino_id: catalogo.almacenes[1]?.id || '', cantidad: 1, motivo: 'Transferencia entre almacenes' });
    }
  };

  const guardar = async () => {
    setBusy(true);
    try {
      if (modal === 'entrada') {
        await api.post('/kardex/entrada', form);
        toast('Entrada con lote registrada');
      } else {
        await api.post('/kardex/transferencia', form);
        toast('Transferencia FEFO registrada');
      }
      setModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const movimientos = datos?.movimientos || [];
  const lotes = datos?.lotes || [];
  const alertas = datos?.vencimientos || [];
  const resumen = datos?.resumen || {};

  const enviarSolicitud = async () => {
    try {
      const r = await api.post('/kardex/solicitudes-vencimiento', {
        lote_id: solicitar.id, fecha_solicitada: solicitudForm.fecha_solicitada, motivo: solicitudForm.motivo,
      });
      if (!r.ok) throw new Error(r.error);
      toast('Solicitud enviada al administrador');
      setSolicitar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const aprobarSolicitud = async () => {
    try {
      const r = await api.post(`/kardex/solicitudes-vencimiento/${resolver.id}/aprobar`, { supervisor_id: Number(solicitudForm.supervisor_id) });
      if (!r.ok) throw new Error(r.error);
      toast('Fecha corregida y supervisor asignado para la verificación');
      setResolver(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const rechazarSolicitud = async (s) => {
    try {
      await api.post(`/kardex/solicitudes-vencimiento/${s.id}/rechazar`, { nota: 'Solicitud rechazada por administración' });
      toast('Solicitud rechazada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catálogo / Inventario"
        title="Kardex y lotes"
        subtitle="Control por lote con salida FEFO: primero lo que vence antes."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-soft" onClick={() => abrirModal('transferencia')}><ArrowLeftRight size={14} /> Transferir</button>
          <button className="btn btn-primary" onClick={() => abrirModal('entrada')}><Plus size={14} /> Registrar entrada</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Lotes activos" value={resumen.lotes_activos || 0} icon={ClipboardList} tone="blue" />
        <StatCard label="Vencidos" value={resumen.vencidos || 0} icon={AlertTriangle} tone="red" />
        <StatCard label="Por vencer (60 d)" value={resumen.proximos || 0} icon={CalendarClock} tone="amber" />
        <StatCard label="Entradas registradas" value={<Num value={resumen.entradas || 0} />} icon={Download} tone="green" />
      </div>

      {alertas.length > 0 && (
        <div className={`notice ${alertas.some((a) => a.estado === 'vencido') ? 'notice-danger' : 'notice-warn'} mb-16`}>
          <AlertTriangle size={15} />
          <div><strong>{alertas.length} lote(s) requieren atención.</strong> {' '}
            Revisa la tabla de lotes: los vencidos no se pueden vender con FEFO y los próximos a vencer deben rotarse primero.</div>
        </div>
      )}

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Filtros</h3><p>Producto, almacén, tipo y rango de fechas</p></div></div>
        <div className="panel-body">
          <div className="filters">
            <select className="select" value={filtros.producto_id} onChange={(e) => setFiltros({ ...filtros, producto_id: e.target.value })}>
              <option value="">Todos los productos</option>
              {catalogo.productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}
            </select>
            <select className="select" value={filtros.almacen_id} onChange={(e) => setFiltros({ ...filtros, almacen_id: e.target.value })}>
              <option value="">Todos los almacenes</option>
              {catalogo.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <select className="select" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}>
              <option value="todos">Todos los tipos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
              <option value="transferencia_entrada">Transferencias entrada</option>
              <option value="transferencia_salida">Transferencias salida</option>
            </select>
            <input className="input" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
            <input className="input" type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Lotes</h3><p>Ordenados por vencimiento (FEFO)</p></div><Badge tone="blue">{lotes.length}</Badge></div>
        {loading ? <div className="panel-body"><SkeletonRows rows={4} /></div> : !lotes.length ? <div className="table-empty">Sin lotes registrados.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th>Lote</th><th>Vencimiento</th><th>Almacén</th><th className="num">Cantidad</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {lotes.map((l, i) => {
                  const estado = l.estado || (l.fecha_vencimiento < new Date().toISOString().slice(0, 10) ? 'vencido' : 'vigente');
                  return (
                    <tr key={l.id || `l${i}`}>
                      <td className="cell-strong">{l.producto_nombre}<span className="cell-sub">{l.producto_sku}</span></td>
                      <td>{l.lote}</td>
                      <td>{l.fecha_vencimiento || <span className="muted">Sin vencimiento</span>}</td>
                      <td>{l.almacen_nombre}</td>
                      <td className="num">{l.cantidad}</td>
                      <td><Badge tone={estadoTone[estado] || 'gray'}>{estadoLabel[estado] || estado}</Badge></td>
                      <td className="actions"><button className="btn btn-ghost btn-sm" title="Solicitar corrección de fecha" onClick={() => { setSolicitar(l); setSolicitudForm({ fecha_solicitada: '', motivo: '' }); }}><CalendarClock size={12} /> Solicitar cambio</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Solicitudes de cambio de vencimiento</h3><p>Requieren aprobación de administración y supervisor asignado</p></div><Badge tone="amber">{(datos?.solicitudes || []).filter((s) => s.estado === 'pendiente').length} pendientes</Badge></div>
        {!(datos?.solicitudes || []).length ? <div className="table-empty">Sin solicitudes registradas.</div> : (
          <div className="table-wrap"><table className="data-table"><thead><tr><th>Lote</th><th>Fecha actual</th><th>Fecha solicitada</th><th>Motivo</th><th>Solicitado por</th><th>Estado</th><th /></tr></thead><tbody>
            {datos.solicitudes.map((s) => (
              <tr key={s.id}>
                <td className="cell-strong">{s.lote}</td>
                <td>{s.fecha_actual || '—'}</td><td>{s.fecha_solicitada}</td><td>{s.motivo}</td><td>{s.solicitado_por_nombre}</td>
                <td><Badge tone={s.estado === 'aprobada' ? 'green' : s.estado === 'rechazada' ? 'red' : 'amber'}>{s.estado}</Badge></td>
                <td className="actions">
                  {s.estado === 'pendiente' && ['admin', 'dueno'].includes(user?.rol) && <>
                    <button className="btn btn-soft btn-sm" onClick={() => { setResolver(s); setSolicitudForm({ supervisor_id: '', nota: '' }); }}><CheckCircle2 size={12} /> Aprobar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => rechazarSolicitud(s)}><XCircle size={12} /> Rechazar</button>
                  </>}
                </td>
              </tr>
            ))}
          </tbody></table></div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Movimientos del kardex</h3><p>{datos?.total || 0} registros</p></div></div>
        {loading ? <div className="panel-body"><SkeletonRows rows={6} /></div> : !movimientos.length ? <EmptyState icon={ClipboardList} title="Sin movimientos" message="Registra una entrada o una venta para ver el kardex." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Lote</th><th>Tipo</th><th>Almacén</th><th>Motivo</th><th>Usuario</th><th className="num">Cantidad</th><th className="num">Saldo</th></tr></thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={m.id || `m${i}`}>
                    <td className="nowrap"><Fecha value={m.fecha} time /></td>
                    <td className="cell-strong">{m.producto_nombre}</td>
                    <td>{m.lote || '—'}</td>
                    <td><Badge tone={String(m.tipo).includes('entrada') ? 'green' : 'amber'}>{String(m.tipo).replaceAll('_', ' ')}</Badge></td>
                    <td>{m.almacen_nombre}</td>
                    <td>{m.motivo || '—'}<span className="cell-sub">{m.referencia || ''}</span></td>
                    <td>{m.usuario_nombre}</td>
                    <td className="num">{m.tipo.includes('entrada') ? '+' : '-'}{m.cantidad}</td>
                    <td className="num">{m.saldo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'entrada' ? 'Registrar entrada con lote' : 'Transferencia FEFO'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Producto</label>
            <select className="select" value={form.producto_id || ''} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}>
              <option value="">Seleccionar…</option>
              {catalogo.productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}
            </select>
          </div>
          {modal === 'entrada' ? (
            <>
              <div className="field-row">
                <div className="field"><label>Almacén</label><select className="select" value={form.almacen_id || ''} onChange={(e) => setForm({ ...form, almacen_id: e.target.value })}><option value="">Seleccionar…</option>{catalogo.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
                <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" value={form.cantidad || 1} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Lote</label><input className="input" value={form.lote || ''} onChange={(e) => setForm({ ...form, lote: e.target.value })} placeholder="Ej. LOTE-2401" /></div>
                <div className="field"><label>Fecha de vencimiento</label><input className="input" type="date" value={form.fecha_vencimiento || ''} onChange={(e) => setForm({ ...form, fecha_vencimiento: e.target.value })} /></div>
              </div>
              <div className="field"><label>Motivo</label><input className="input" value={form.motivo || ''} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>
            </>
          ) : (
            <>
              <div className="field-row">
                <div className="field"><label>Almacén origen</label><select className="select" value={form.origen_id || ''} onChange={(e) => setForm({ ...form, origen_id: e.target.value })}>{catalogo.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
                <div className="field"><label>Almacén destino</label><select className="select" value={form.destino_id || ''} onChange={(e) => setForm({ ...form, destino_id: e.target.value })}>{catalogo.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
              </div>
              <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" value={form.cantidad || 1} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></div>
              <div className="notice notice-info"><ShieldCheck size={14} /> Se consumirán primero los lotes con vencimiento más cercano y se conservará su identidad en el destino.</div>
            </>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(solicitar)} onClose={() => setSolicitar(null)} title={`Corregir vencimiento · ${solicitar?.lote || ''}`} subtitle={`Fecha actual: ${solicitar?.fecha_vencimiento || 'sin fecha'}`}
        footer={<><button className="btn btn-ghost" onClick={() => setSolicitar(null)}>Cancelar</button><button className="btn btn-primary" onClick={enviarSolicitud}>Enviar solicitud</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-warn"><AlertTriangle size={15} /> Un administrador debe aprobar el cambio y asignar un supervisor para verificarlo. El lote seguirá saliendo por FEFO con la fecha corregida.</div>
          <div className="field"><label>Nueva fecha de vencimiento</label><input className="input" type="date" value={solicitudForm.fecha_solicitada} onChange={(e) => setSolicitudForm({ ...solicitudForm, fecha_solicitada: e.target.value })} /></div>
          <div className="field"><label>Motivo del error</label><textarea className="textarea" value={solicitudForm.motivo} onChange={(e) => setSolicitudForm({ ...solicitudForm, motivo: e.target.value })} placeholder="Ej. Se registró 18/12/2026 pero el lote vence 18/12/2027" /></div>
        </div>
      </Modal>

      <Modal open={Boolean(resolver)} onClose={() => setResolver(null)} title={`Aprobar cambio · ${resolver?.lote || ''}`} subtitle={`${resolver?.fecha_actual || '—'} → ${resolver?.fecha_solicitada || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setResolver(null)}>Cancelar</button><button className="btn btn-primary" onClick={aprobarSolicitud}>Aprobar y asignar supervisor</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Supervisor que verificará el cambio</label><select className="select" value={solicitudForm.supervisor_id} onChange={(e) => setSolicitudForm({ ...solicitudForm, supervisor_id: e.target.value })}><option value="">Seleccionar…</option>{supervisores.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.rol}</option>)}</select></div>
          <div className="field"><label>Nota (opcional)</label><textarea className="textarea" value={solicitudForm.nota} onChange={(e) => setSolicitudForm({ ...solicitudForm, nota: e.target.value })} /></div>
        </div>
      </Modal>
    </>
  );
}
