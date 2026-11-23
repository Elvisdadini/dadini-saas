import { useCallback, useEffect, useState } from 'react';
import { Boxes, Camera, CheckCircle2, ClipboardList, Lock, RefreshCcw, Search, ShieldCheck } from 'lucide-react';
import { api, qs } from '../api';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';
import EscanerCodigos from '../components/EscanerCodigos';

const hoy = () => new Date().toISOString().slice(0, 10);
const VACIO = { tipo: 'semanal', fecha: hoy(), almacen_id: '', responsable_1_id: '', responsable_2_id: '', notas: '' };
const TONE = { correcto: 'green', diferencia: 'red', pendiente: 'amber' };

export default function ConteoInventario() {
  const toast = useToast();
  const [tab, setTab] = useState('conteo');
  const [data, setData] = useState(null);
  const [activo, setActivo] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [iniciarOpen, setIniciarOpen] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [congelamiento, setCongelamiento] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [scanOpen, setScanOpen] = useState(false);
  const [filtro, setFiltro] = useState('todos');
  const [finOpen, setFinOpen] = useState(false);
  const [finForm, setFinForm] = useState({ ajustar_stock: false, forzar: false, notas: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, u, a] = await Promise.all([api.get('/conteos-inventario'), api.get('/usuarios'), api.get('/almacenes')]);
      setData(r);
      setUsuarios((u.usuarios || []).filter((x) => x.activo));
      setAlmacenes(a.almacenes || []);
      setActivo(r.activo ? await api.get(`/conteos-inventario/${r.activo.id}`).then((x) => x.conteo) : null);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const recargarActivo = async () => {
    if (!activo) return;
    const r = await api.get(`/conteos-inventario/${activo.id}`);
    setActivo(r.conteo);
  };

  const iniciar = async () => {
    if (!form.responsable_1_id || !form.responsable_2_id) return toast('Selecciona los dos responsables.', 'error');
    setBusy(true);
    try {
      const r = await api.post('/conteos-inventario', form);
      setActivo(r.conteo);
      setIniciarOpen(false);
      setForm(VACIO);
      setTab('conteo');
      toast(`Conteo ${r.conteo.codigo} iniciado · inventario congelado con ${r.conteo.lineas.length} referencias`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const registrar = async (codigo = busqueda, uds = cantidad) => {
    if (!activo) return toast('Primero inicia un conteo de inventario físico.', 'error');
    if (!String(codigo || '').trim()) return toast('Ingresa el código o nombre del producto.', 'error');
    if (uds === '' || uds === undefined || uds === null) return toast('Ingresa la cantidad contada.', 'error');
    setBusy(true);
    try {
      const r = await api.post(`/conteos-inventario/${activo.id}/contar`, { busqueda: codigo, cantidad: Number(uds) });
      toast(r.mensaje);
      setBusqueda('');
      setCantidad('');
      setActivo(r.conteo);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const alLeerCodigo = (codigo) => {
    setBusqueda(codigo);
    setScanOpen(false);
    toast(`Código leído: ${codigo}. Confirma la cantidad.`, 'info');
  };

  const verCongelamiento = async () => {
    if (!activo) return;
    try {
      const r = await api.get(`/conteos-inventario/${activo.id}/congelamiento`);
      setCongelamiento(r);
      setTab('congelamiento');
    } catch (error) { toast(error.message, 'error'); }
  };

  const finalizar = async () => {
    setBusy(true);
    try {
      const r = await api.patch(`/conteos-inventario/${activo.id}/finalizar`, finForm);
      setActivo(null);
      setFinOpen(false);
      await cargar();
      toast(`Conteo ${r.conteo.codigo} finalizado${finForm.ajustar_stock ? ' y stock ajustado' : ''}`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const cancelar = async () => {
    if (!window.confirm('¿Cancelar el conteo en curso? El congelamiento se liberará.')) return;
    try {
      await api.patch(`/conteos-inventario/${activo.id}/cancelar`, {});
      setActivo(null);
      await cargar();
      toast('Conteo cancelado');
    } catch (error) { toast(error.message, 'error'); }
  };

  const lineas = (activo?.lineas || []).filter((l) => {
    if (filtro === 'pendientes') return l.estado === 'pendiente';
    if (filtro === 'diferencias') return l.estado === 'diferencia';
    return true;
  });
  const stats = activo?.estadisticas || {};

  return (
    <>
      <PageHeader
        eyebrow="Inventario / Control físico"
        title="Conteo de inventario"
        subtitle="Conteo semanal o mensual con dos responsables, captura rápida por código y congelamiento del inventario para comparar sin variantes."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          {activo && <button className="btn btn-outline" onClick={verCongelamiento}><Lock size={14} /> Ver congelamiento</button>}
          {!activo && <button className="btn btn-primary" onClick={() => setIniciarOpen(true)}><ClipboardList size={14} /> Iniciar conteo físico</button>}
        </>}
      />

      <Tabs
        tabs={[
          { value: 'conteo', label: 'Conteo físico' },
          { value: 'congelamiento', label: 'Congelamiento' },
          { value: 'historial', label: 'Historial', count: (data?.conteos || []).length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {loading ? <SkeletonRows rows={6} /> : (
        <>
          {tab === 'conteo' && (
            <>
              {!activo ? (
                <EmptyState icon={ClipboardList} title="No hay conteo en curso" message="Inicia un conteo semanal o mensual para congelar el inventario y comenzar el registro físico." action={<button className="btn btn-primary" onClick={() => setIniciarOpen(true)}>Iniciar conteo físico</button>} />
              ) : (
                <>
                  <div className="notice notice-info mb-16"><ShieldCheck size={15} /> Conteo <strong>{activo.codigo}</strong> · {activo.tipo} · Responsables: {activo.responsables?.map((r) => r.nombre).join(' y ')}. El inventario quedó congelado el <Fecha value={activo.congelado_en} time />; los pedidos siguen registrándose con normalidad y no afectan esta comparativa.</div>
                  <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                    <StatCard label="Progreso" value={`${activo.avance}%`} icon={CheckCircle2} tone="green" hint={`${stats.contadas} de ${stats.referencias}`} />
                    <StatCard label="Pendientes" value={stats.pendientes} icon={Boxes} tone="amber" />
                    <StatCard label="Con diferencia" value={stats.con_diferencia} icon={ClipboardList} tone="red" />
                    <StatCard label="Diferencia neta (uds)" value={stats.diferencia_neta} icon={Search} tone="blue" />
                  </div>

                  <div className="panel mb-16">
                    <div className="panel-head"><div><h3>Captura rápida</h3><p>Escannea el código de barras o escribe el SKU, código o nombre del producto.</p></div></div>
                    <div className="panel-body">
                      <div className="filters">
                        <input className="input" style={{ flex: 2 }} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') registrar(); }} placeholder="Código de barras, SKU o nombre…" autoFocus />
                        <input className="input" type="number" min="0" step="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') registrar(); }} placeholder="Cantidad" style={{ maxWidth: 130 }} />
                        <button className="btn btn-primary" onClick={() => registrar()} disabled={busy}>Registrar conteo</button>
                        <button className="btn btn-green" onClick={() => setScanOpen(true)}><Camera size={14} /> Usar cámara</button>
                      </div>
                    </div>
                  </div>

                  <div className="panel">
                    <div className="panel-head">
                      <div><h3>Productos contados</h3><p>Comparativa contra el inventario congelado</p></div>
                      <select className="select" value={filtro} onChange={(e) => setFiltro(e.target.value)}><option value="todos">Todos</option><option value="pendientes">Pendientes</option><option value="diferencias">Con diferencia</option></select>
                    </div>
                    {lineas.length === 0 ? <div className="table-empty">No hay productos con este filtro.</div> : (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th>Producto</th><th>SKU</th><th>Almacén</th><th className="num">Sistema (congelado)</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Estado</th></tr></thead>
                          <tbody>
                            {lineas.map((l) => (
                              <tr key={l.id}>
                                <td className="cell-strong">{l.producto_emoji} {l.producto_nombre}<span className="cell-sub">{l.producto_categoria}{l.producto_marca ? ` · ${l.producto_marca}` : ''}</span></td>
                                <td>{l.producto_sku}</td>
                                <td>{l.almacen_nombre}</td>
                                <td className="num">{l.cantidad_sistema}</td>
                                <td className="num cell-strong">{l.conteo === null ? '—' : l.conteo}</td>
                                <td className="num">{l.diferencia === null ? '—' : `${l.diferencia > 0 ? '+' : ''}${l.diferencia}`}</td>
                                <td><Badge tone={TONE[l.estado]}>{l.estado}</Badge></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div className="panel-body" style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-primary" onClick={() => { setFinForm({ ajustar_stock: false, forzar: false, notas: '' }); setFinOpen(true); }}>Finalizar conteo</button>
                      <button className="btn btn-ghost" onClick={cancelar}>Cancelar conteo</button>
                    </div>
                  </div>
                </>
              )}
            </>
          )}

          {tab === 'congelamiento' && (
            <div className="panel">
              <div className="panel-head">
                <div><h3>Inventario congelado</h3><p>Instantánea tomada al iniciar el conteo; no cambia aunque se sigan haciendo pedidos.</p></div>
                {congelamiento && <Badge tone="blue">{congelamiento.codigo}</Badge>}
              </div>
              {!congelamiento ? (
                <EmptyState icon={Lock} title="Sin congelamiento activo" message="Inicia un conteo y pulsa «Ver congelamiento» para consultar la instantánea." />
              ) : (
                <>
                  <div className="panel-body">
                    <div className="notice notice-info"><Lock size={15} /> {congelamiento.nota} Congelado el <Fecha value={congelamiento.congelado_en} time /> · Responsables: {congelamiento.responsables?.map((r) => r.nombre).join(' y ')}</div>
                  </div>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Producto</th><th>SKU</th><th>Almacén</th><th className="num">Sistema congelado</th><th className="num">Físico contado</th><th className="num">Diferencia</th><th>Estado</th></tr></thead>
                      <tbody>
                        {congelamiento.lineas.map((l, i) => (
                          <tr key={i}>
                            <td className="cell-strong">{l.producto}</td><td>{l.sku}</td><td>{l.almacen}</td>
                            <td className="num">{l.cantidad_sistema_congelada}</td>
                            <td className="num">{l.cantidad_fisica === null ? '—' : l.cantidad_fisica}</td>
                            <td className="num">{l.diferencia === null ? '—' : l.diferencia}</td>
                            <td><Badge tone={TONE[l.estado]}>{l.estado}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {tab === 'historial' && (
            <div className="panel">
              <div className="panel-head"><div><h3>Historial de conteos</h3><p>Conteos semanales y mensuales registrados</p></div></div>
              {!(data?.conteos || []).length ? <EmptyState icon={ClipboardList} title="Sin conteos" message="Cuando inicies el primer conteo aparecerá aquí." /> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Código</th><th>Tipo</th><th>Fecha</th><th>Responsables</th><th className="num">Referencias</th><th className="num">Diferencias</th><th>Estado</th><th /></tr></thead>
                    <tbody>
                      {data.conteos.map((c) => (
                        <tr key={c.id}>
                          <td className="cell-strong">{c.codigo}</td>
                          <td>{c.tipo}</td>
                          <td><Fecha value={c.fecha} /></td>
                          <td>{c.responsables?.map((r) => r.nombre).join(' y ')}</td>
                          <td className="num">{c.estadisticas.referencias}</td>
                          <td className="num">{c.estadisticas.con_diferencia}</td>
                          <td><Badge tone={c.estado === 'finalizado' ? 'green' : c.estado === 'en_curso' ? 'amber' : 'gray'}>{c.estado.replace('_', ' ')}</Badge></td>
                          <td className="actions"><button className="btn btn-soft btn-sm" onClick={async () => { const r = await api.get(`/conteos-inventario/${c.id}/congelamiento`); setCongelamiento(r); setTab('congelamiento'); }}>Ver detalle</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal open={iniciarOpen} onClose={() => setIniciarOpen(false)} title="Iniciar conteo de inventario físico" subtitle="Se congelará el inventario actual y se registrará entre dos responsables." size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setIniciarOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={iniciar} disabled={busy}>{busy ? 'Iniciando…' : 'Iniciar y congelar inventario'}</button></>}>
        <div className="form-stack">
          <div className="notice notice-warn"><Lock size={15} /> A partir de este momento el sistema mantendrá una copia fija del stock para la comparativa. Los pedidos seguirán funcionando con normalidad.</div>
          <div className="field-row">
            <div className="field"><label>Tipo de conteo</label><select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="semanal">Semanal</option><option value="mensual">Mensual</option></select></div>
            <div className="field"><label>Fecha</label><input type="date" className="input" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
          </div>
          <div className="field"><label>Almacén a contar</label><select className="select" value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: e.target.value })}><option value="">Todos los almacenes</option>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div className="field-row">
            <div className="field"><label>Responsable 1 <span className="req">*</span></label><select className="select" value={form.responsable_1_id} onChange={(e) => setForm({ ...form, responsable_1_id: e.target.value })}><option value="">Seleccionar…</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
            <div className="field"><label>Responsable 2 <span className="req">*</span></label><select className="select" value={form.responsable_2_id} onChange={(e) => setForm({ ...form, responsable_2_id: e.target.value })}><option value="">Seleccionar…</option>{usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
          </div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones del conteo…" /></div>
        </div>
      </Modal>

      <Modal open={finOpen} onClose={() => setFinOpen(false)} title="Finalizar conteo" subtitle="Cierra el conteo y decide si se ajusta el stock a lo contado." size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setFinOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={finalizar} disabled={busy}>{busy ? 'Finalizando…' : 'Finalizar conteo'}</button></>}>
        <div className="form-stack">
          <div className="notice notice-info">{stats.pendientes > 0 ? `Faltan ${stats.pendientes} productos por contar. Puedes forzar el cierre.` : 'Todos los productos fueron contados.'}</div>
          <label className="check"><input type="checkbox" checked={finForm.ajustar_stock} onChange={(e) => setFinForm({ ...finForm, ajustar_stock: e.target.checked })} /> Ajustar el stock real a las cantidades contadas (genera movimientos y auditoría)</label>
          <label className="check"><input type="checkbox" checked={finForm.forzar} onChange={(e) => setFinForm({ ...finForm, forzar: e.target.checked })} /> Forzar cierre aunque falten productos</label>
          <div className="field"><label>Notas finales</label><textarea className="textarea" value={finForm.notas} onChange={(e) => setFinForm({ ...finForm, notas: e.target.value })} /></div>
        </div>
      </Modal>

      <EscanerCodigos open={scanOpen} onClose={() => setScanOpen(false)} onLeer={alLeerCodigo} />
    </>
  );
}
