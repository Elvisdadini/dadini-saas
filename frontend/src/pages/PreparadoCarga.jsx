import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, Boxes, CalendarDays, CheckCircle2, ClipboardList, Package, PackageCheck,
  Play, Plus, Printer, RefreshCcw, Truck,
} from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, Fecha, Modal, Money, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';

const hoy = () => new Date().toISOString().slice(0, 10);

const ESTADO_TONE = { preparando: 'amber', preparada: 'blue', en_ruta: 'purple', descargada: 'green', cancelada: 'red' };

export default function PreparadoCarga() {
  const toast = useToast();
  const { user } = useAuth();
  const [estadoVentas, setEstadoVentas] = useState(null);
  const [data, setData] = useState(null);
  const [preview, setPreview] = useState(null);
  const [detail, setDetail] = useState(null);
  const [confirmaciones, setConfirmaciones] = useState([]);
  const [confirmModal, setConfirmModal] = useState(false);
  const [confirmForm, setConfirmForm] = useState({ observaciones: '', novedades: [] });
  const [loading, setLoading] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [filtros, setFiltros] = useState({ fecha: hoy(), vendedor_id: '', almacen_id: '' });
  const [form, setForm] = useState({ vendedor_id: '', repartidor_id: '', vehiculo_id: '', notas: '' });
  const [tab, setTab] = useState('preparar');
  const [manifiesto, setManifiesto] = useState(null);
  const [mfFiltros, setMfFiltros] = useState({ fecha: hoy(), distribuidor_id: '', estado: 'todos' });
  const [mfCargando, setMfCargando] = useState(false);
  const [preparados, setPreparados] = useState([]);
  const [impresion, setImpresion] = useState('todo');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [r, conf] = await Promise.all([api.get('/cargas'), api.get('/confirmaciones-carga')]);
      setData(r);
      setConfirmaciones(conf.confirmaciones || []);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    cargar();
    calcular();
    api.get('/configuracion/estado-ventas').then(setEstadoVentas).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar]);

  const cambiarDia = async (accion) => {
    try {
      const r = await api.post(`/configuracion/${accion}-dia`, {});
      if (!r.ok) throw new Error(r.error);
      setEstadoVentas(r.estado);
      toast(accion === 'cerrar' ? 'Día cerrado: los vendedores ya no pueden modificar pedidos.' : 'Día reabierto para ventas.');
    } catch (error) { toast(error.message, 'error'); }
  };

  const puedeCerrarDia = ['admin', 'dueno', 'supervisor', 'almacen'].includes(user?.rol);

  const calcular = async () => {
    setCalculando(true);
    try {
      const p = await api.get(`/cargas/preparar?fecha=${filtros.fecha}&vendedor_id=${filtros.vendedor_id}&almacen_id=${filtros.almacen_id}`);
      setPreview(p);
      setForm((f) => ({
        ...f,
        vendedor_id: p.sugerencia.vendedor_id || p.vendedores[0]?.id || '',
        repartidor_id: p.sugerencia.repartidor_id || '',
        vehiculo_id: p.sugerencia.vehiculo_id || '',
        notas: '',
      }));
      if (!p.pedidos.length) toast('No hay pedidos pendientes para esos filtros.', 'info');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setCalculando(false);
    }
  };

  const generarManifiesto = async () => {
    setMfCargando(true);
    try {
      const r = await api.get(`/cargas/manifiesto${qs(mfFiltros)}`);
      setManifiesto(r);
      setPreparados([]);
      if (!r.pedidos.length) toast('No hay pedidos confirmados para esos filtros.', 'info');
    } catch (error) { toast(error.message, 'error'); } finally { setMfCargando(false); }
  };

  useEffect(() => { if (tab === 'manifiesto' && !manifiesto) generarManifiesto(); /* eslint-disable-next-line */ }, [tab]);

  const alternarPreparado = (id) => setPreparados((lista) => lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id]);

  const imprimir = (modo) => {
    setImpresion(modo);
    window.setTimeout(() => window.print(), 120);
  };

  const asignarDistribuidor = async (pedido, distribuidorId) => {
    if (!distribuidorId) return;
    try {
      await api.patch(`/pedidos/${pedido.id}/asignar-distribuidor`, { distribuidor_id: Number(distribuidorId) });
      toast(`Distribuidor asignado al pedido ${pedido.codigo}`);
      await generarManifiesto();
    } catch (error) { toast(error.message, 'error'); }
  };

  const confirmar = async () => {
    if (!form.vendedor_id) return toast('Selecciona un vendedor.', 'error');
    if (!form.repartidor_id || !form.vehiculo_id) return toast('Selecciona repartidor y vehículo.', 'error');
    if (!preview?.pedidos?.length) return toast('No hay pedidos para cargar.', 'error');
    setGuardando(true);
    try {
      const r = await api.post('/cargas', {
        fecha: filtros.fecha,
        vendedor_id: Number(form.vendedor_id),
        almacen_id: filtros.almacen_id ? Number(filtros.almacen_id) : null,
        repartidor_id: Number(form.repartidor_id),
        vehiculo_id: Number(form.vehiculo_id),
        pedidos_ids: preview.pedidos.map((p) => p.id),
        notas: form.notas,
      });
      toast(`Carga ${r.carga.codigo} preparada · ${r.carga.totales.cajas} cajas · ruta ${r.carga.ruta_codigo}`);
      setPreview(null);
      await cargar();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (carga, estado) => {
    try {
      const r = await api.patch(`/cargas/${carga.id}/estado`, { estado });
      setDetail(r.carga);
      toast(`Carga ${r.carga.codigo} → ${estado.replace('_', ' ')}`);
      await cargar();
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const verDetalle = async (carga) => {
    try {
      const r = await api.get(`/cargas/${carga.id}`);
      setDetail(r.carga);
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const confirmacionDe = (cargaId) => confirmaciones.find((c) => c.carga_id === cargaId);

  const abrirConfirmacion = (carga) => {
    setConfirmForm({ observaciones: '', novedades: [] });
    setConfirmModal(carga);
  };

  const guardarConfirmacion = async () => {
    if (!confirmModal) return;
    try {
      await api.post('/confirmaciones-carga', {
        carga_id: confirmModal.id,
        observaciones_almacen: confirmForm.observaciones,
        novedades: confirmForm.novedades.filter((n) => n.tipo && n.cantidad > 0),
      });
      toast('Carga confirmada. Notificación enviada al distribuidor.');
      setConfirmModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Cierre del día"
        title="Preparado de carga"
        subtitle="Agrupa las unidades de todos los pedidos, conviértelas en cajas y carga el camión como almacén móvil."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          {puedeCerrarDia && (estadoVentas?.cerrado
            ? <button className="btn btn-soft" onClick={() => cambiarDia('abrir')}><Play size={14} /> Reabrir día</button>
            : <button className="btn btn-danger-soft" onClick={() => cambiarDia('cerrar')}><CheckCircle2 size={14} /> Cerrar día</button>)}
          {tab === 'manifiesto' && <>
            <button className="btn btn-outline" onClick={() => imprimir('productos')}><Printer size={14} /> Imprimir productos</button>
            <button className="btn btn-primary" onClick={() => imprimir('clientes')}><Printer size={14} /> Imprimir clientes</button>
          </>}
        </>}
      />

      <div className="no-print">
        <Tabs
          tabs={[{ value: 'preparar', label: 'Preparar y cargar' }, { value: 'manifiesto', label: 'Manifiesto para imprimir' }]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'preparar' && (
        <>
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Pedidos a preparar" value={preview?.totales?.pedidos ?? '—'} icon={ClipboardList} tone="blue" hint="Del cierre seleccionado" />
        <StatCard label="Unidades totales" value={preview?.totales?.unidades ?? '—'} icon={Package} tone="orange" hint="Suma de todos los pedidos" />
        <StatCard label="Cajas a preparar" value={preview?.totales?.cajas ?? 0} icon={Boxes} tone="purple" hint="Incluye cajas parciales" />
        <StatCard label="Almacenes móviles" value={(data?.almacenes_moviles || []).length} icon={Truck} tone="green" hint={`${resumen.unidades_moviles || 0} unidades en camión`} />
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Vista previa del cierre</h3><p>Selecciona fecha, vendedor y almacén para agrupar los pedidos pendientes</p></div>
          <button className="btn btn-primary" onClick={calcular} disabled={calculando}>
            <PackageCheck size={14} /> {calculando ? 'Calculando…' : 'Preparar vista previa'}
          </button>
        </div>
        <div className="panel-body">
          <div className="filters">
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><label style={{ fontSize: 11 }}><CalendarDays size={12} /> Fecha</label><input type="date" className="input input-sm" value={filtros.fecha} onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })} /></div>
            <select className="select" value={filtros.vendedor_id} onChange={(e) => setFiltros({ ...filtros, vendedor_id: e.target.value })}>
              <option value="">Todos los vendedores</option>
              {(preview?.vendedores_disponibles || []).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <select className="select" value={filtros.almacen_id} onChange={(e) => setFiltros({ ...filtros, almacen_id: e.target.value })}>
              <option value="">Todos los almacenes</option>
              {(preview?.almacenes || []).map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
          </div>

          {!preview ? (
            <EmptyState icon={PackageCheck} title="Sin vista previa" message="Pulsa «Preparar vista previa» para calcular cajas y asignaciones." />
          ) : (
            <div className="grid" style={{ gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 14 }}>
              <div>
                <div className="panel-head" style={{ paddingLeft: 0 }}><div><h3>Productos agrupados</h3><p>{preview.lineas.length} referencias · {preview.totales.cajas} cajas</p></div></div>
                {preview.lineas.length === 0 ? <div className="table-empty">No hay productos para preparar.</div> : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Uds./caja</th><th className="num">Cajas</th><th className="num">Sueltas</th><th className="num">A preparar</th></tr></thead>
                      <tbody>
                        {preview.lineas.map((l) => (
                          <tr key={l.producto_id}>
                            <td className="cell-strong">{l.emoji} {l.nombre}<span className="cell-sub">{l.sku} · {l.pedidos} pedidos</span></td>
                            <td className="num">{l.cantidad_unidades}</td>
                            <td className="num muted">{l.unidades_por_caja}</td>
                            <td className="num">{l.cajas_completas}</td>
                            <td className="num">{l.unidades_sueltas || '—'}</td>
                            <td className="num cell-strong">{l.cajas_a_preparar}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="form-stack">
                <h3>Asignación de la carga</h3>
                <div className="field"><label>Vendedor responsable</label>
                  <select className="select" value={form.vendedor_id} onChange={(e) => {
                    const u = preview.vendedores_disponibles.find((x) => x.id === Number(e.target.value));
                    setForm({ ...form, vendedor_id: e.target.value, repartidor_id: u?.repartidor_id || form.repartidor_id, vehiculo_id: u?.vehiculo_id || form.vehiculo_id });
                  }}>
                    {(preview.vendedores_disponibles || []).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
                </div>
                <div className="field"><label>Repartidor (cambio de producto al camión)</label>
                  <select className="select" value={form.repartidor_id} onChange={(e) => setForm({ ...form, repartidor_id: e.target.value })}>
                    <option value="">Seleccionar repartidor…</option>
                    {(preview.repartidores || []).map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.nombre} · {r.zona}</option>)}
                  </select>
                  <span className="hint">Sugerido automáticamente según el vendedor asignado.</span>
                </div>
                <div className="field"><label>Vehículo / almacén móvil</label>
                  <select className="select" value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}>
                    <option value="">Seleccionar vehículo…</option>
                    {(preview.vehiculos || []).map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.marca} {v.modelo}</option>)}
                  </select>
                </div>
                <div className="field"><label>Notas de preparación</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej. Priorizar entregas de Sacaba…" /></div>
                <div className="summary-box">
                  <div className="split"><span className="small muted">Pedidos incluidos</span><strong>{preview.totales.pedidos}</strong></div>
                  <div className="split mt-8"><span className="small muted">Unidades</span><strong>{preview.totales.unidades}</strong></div>
                  <div className="split mt-8"><span className="small muted">Cajas a preparar</span><strong>{preview.totales.cajas}</strong></div>
                  <div className="split mt-8"><span className="small muted">Monto en carga</span><strong><Money value={preview.totales.monto} /></strong></div>
                </div>
                <button className="btn btn-primary btn-block" onClick={confirmar} disabled={guardando || !preview.pedidos.length}>
                  {guardando ? 'Cargando camión…' : 'Confirmar carga y generar ruta'} <ArrowRight size={14} />
                </button>
                <div className="notice notice-info"><Truck size={14} /> El camión se registra como <strong>almacén móvil</strong>: sus unidades no se suman al stock del almacén y los nuevos pedidos siguen descontando solo del almacén físico.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Cargas preparadas</h3><p>Historial de preparados y rutas generadas</p></div></div>
        {loading ? <SkeletonRows rows={5} /> : !(data?.cargas || []).length ? (
          <EmptyState icon={Boxes} title="Sin cargas preparadas" message="Cuando prepares el cierre del día, la carga aparecerá aquí." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Carga</th><th>Fecha</th><th>Vendedor</th><th>Repartidor / camión</th><th className="num">Pedidos</th><th className="num">Cajas</th><th>Estado</th><th>Ruta</th><th /></tr></thead>
              <tbody>
                {data.cargas.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.codigo}</td>
                    <td><Fecha value={c.fecha} short /></td>
                    <td>{c.vendedor_nombre}</td>
                    <td>{c.repartidor_emoji} {c.repartidor_nombre}<span className="cell-sub">{c.vehiculo_placa}</span></td>
                    <td className="num">{c.totales.pedidos}</td>
                    <td className="num cell-strong">{c.totales.cajas}</td>
                    <td><Badge tone={ESTADO_TONE[c.estado] || 'gray'}>{c.estado.replace('_', ' ')}</Badge></td>
                    <td>{c.ruta_codigo ? <Link className="link-btn" to={`/distribucion/${c.ruta_id}`}>{c.ruta_codigo} <ArrowRight size={11} /></Link> : '—'}</td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" onClick={() => verDetalle(c)}>Ver detalle</button>
                      {c.estado === 'preparando' && <button className="btn btn-primary btn-sm" onClick={() => cambiarEstado(c, 'preparada')}><CheckCircle2 size={12} /> Preparada</button>}
                      {c.estado === 'preparada' && <button className="btn btn-navy btn-sm" onClick={() => cambiarEstado(c, 'en_ruta')}><Play size={12} /> Salir a ruta</button>}
                      {c.estado === 'en_ruta' && <button className="btn btn-outline btn-sm" onClick={() => cambiarEstado(c, 'descargada')}>Descargar</button>}
                      {!confirmacionDe(c.id) && <button className="btn btn-soft btn-sm" onClick={() => abrirConfirmacion(c)}><CheckCircle2 size={12} /> Confirmar carga</button>}
                      {confirmacionDe(c.id) && <Badge tone={confirmacionDe(c.id).estado_distribuidor === 'confirmada' ? 'green' : 'amber'}>{confirmacionDe(c.id).estado_distribuidor === 'confirmada' ? 'Confirmada por distribuidor' : 'Esperando distribuidor'}</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(data?.almacenes_moviles || []).length > 0 && (
        <div className="panel">
          <div className="panel-head"><div><h3>Almacenes móviles activos</h3><p>Stock en camión, aislado del inventario del almacén</p></div></div>
          <div className="grid grid-4 mb-16" style={{ gap: 10, padding: 14 }}>
            {data.almacenes_moviles.map((a) => (
              <div className="card card-pad" key={a.id} style={{ padding: 14 }}>
                <span className="small muted">{a.codigo} · {a.estado.replace('_', ' ')}</span>
                <strong style={{ display: 'block', fontSize: 13, marginTop: 4 }}><Truck size={13} /> {a.nombre}</strong>
                <span className="small muted">{a.repartidor} · {a.pedidos} pedidos</span>
                <div className="inline mt-8"><Badge tone="orange">{a.unidades} u.</Badge><Badge tone="purple">{a.cajas} cajas</Badge></div>
              </div>
            ))}
          </div>
        </div>
      )}

        </>
      )}

      {tab === 'manifiesto' && (
        <div className={`manifiesto ${impresion !== 'todo' ? `solo-${impresion}` : ''}`}>
          <div className="panel mb-16 no-print">
            <div className="panel-head">
              <div><h3>Generar manifiesto de carga</h3><p>Consolida los pedidos confirmados por distribuidor, vendedor, cliente y producto.</p></div>
              <button className="btn btn-primary" onClick={generarManifiesto} disabled={mfCargando}><ClipboardList size={14} /> {mfCargando ? 'Generando…' : 'Generar manifiesto'}</button>
            </div>
            <div className="panel-body">
              <div className="filters">
                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><label><CalendarDays size={12} /> Fecha</label><input type="date" className="input input-sm" value={mfFiltros.fecha} onChange={(e) => setMfFiltros({ ...mfFiltros, fecha: e.target.value })} /></div>
                <select className="select" value={mfFiltros.distribuidor_id} onChange={(e) => setMfFiltros({ ...mfFiltros, distribuidor_id: e.target.value })}>
                  <option value="">Todos los distribuidores</option>
                  {(manifiesto?.catalogo_distribuidores || []).map((d) => <option key={d.id} value={d.id}>{d.emoji} {d.nombre}</option>)}
                </select>
                <select className="select" value={mfFiltros.estado} onChange={(e) => setMfFiltros({ ...mfFiltros, estado: e.target.value })}>
                  <option value="todos">Todos los estados</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="preparando">Preparando</option>
                  <option value="enviado">Enviados</option>
                  <option value="entregado">Entregados</option>
                </select>
              </div>
            </div>
          </div>

          {!manifiesto ? (
            <EmptyState icon={ClipboardList} title="Sin manifiesto" message="Pulsa «Generar manifiesto» para consolidar la carga." />
          ) : (
            <>
              <div className="panel manifiesto-block print-only">
                <div className="panel-body">
                  <h2 style={{ margin: 0 }}>DADINI · Manifiesto de preparación y carga</h2>
                  <p className="small muted">Fecha {manifiesto.fecha} · Distribuidor: {manifiesto.filtros.distribuidor_id ? (manifiesto.distribuidores[0]?.nombre || '—') : 'Todos'} · Estado: {manifiesto.filtros.estado}</p>
                </div>
              </div>

              <div className="stat-grid mb-16 no-print" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
                <StatCard label="Pedidos" value={manifiesto.totales.pedidos} icon={ClipboardList} tone="blue" />
                <StatCard label="Unidades" value={manifiesto.totales.unidades} icon={Package} tone="orange" />
                <StatCard label="Cajas" value={manifiesto.totales.cajas} icon={Boxes} tone="purple" />
                <StatCard label="Monto total de la carga" value={<Money value={manifiesto.totales.monto} />} icon={Truck} tone="green" />
              </div>

              <div className="panel manifiesto-block mb-16 productos-section">
                <div className="panel-head"><div><h3>1. Lista de productos a preparar</h3><p>Marca la casilla a medida que se prepara cada referencia.</p></div><Badge tone="orange">{manifiesto.productos.length} referencias</Badge></div>
                {manifiesto.productos.length === 0 ? <div className="table-empty">No hay productos en la carga.</div> : (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>✓</th><th>Producto</th><th className="num">Unidades</th><th className="num">Uds./caja</th><th className="num">Cajas</th><th className="num">Sueltas</th><th className="num">Peso ud. (kg)</th><th className="num">Peso total (kg)</th><th className="num">Pedidos</th></tr></thead>
                      <tbody>
                        {manifiesto.productos.map((l) => (
                          <tr key={l.producto_id}>
                            <td><input type="checkbox" checked={preparados.includes(l.producto_id)} onChange={() => alternarPreparado(l.producto_id)} /></td>
                            <td className="cell-strong">{l.emoji} {l.nombre}<span className="cell-sub">{l.sku} · {l.distribuidores.join(', ')}</span></td>
                            <td className="num">{l.cantidad_unidades}</td>
                            <td className="num muted">{l.unidades_por_caja}</td>
                            <td className="num">{l.cajas_a_preparar}</td>
                            <td className="num">{l.unidades_sueltas || '—'}</td>
                            <td className="num">{Number(l.peso_unitario_kg || 0).toFixed(3)}</td>
                            <td className="num cell-strong">{Number(l.peso_total_kg || 0).toFixed(2)}</td>
                            <td className="num">{l.pedidos}</td>
                          </tr>
                        ))}
                        <tr>
                          <td colSpan={2} className="cell-strong">TOTAL DE LA CARGA</td>
                          <td className="num cell-strong">{manifiesto.totales.unidades}</td>
                          <td className="num">—</td>
                          <td className="num cell-strong">{manifiesto.totales.cajas}</td>
                          <td className="num">—</td>
                          <td className="num">—</td>
                          <td className="num cell-strong">{Number(manifiesto.totales.peso_kg || 0).toFixed(2)}</td>
                          <td className="num">{manifiesto.totales.pedidos}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {manifiesto.distribuidores.map((d, index) => (
                <div className="panel manifiesto-block mb-16 distribuidores-section" key={d.id || `sin-${index}`}>
                  <div className="panel-head">
                    <div><h3>2.{index + 1} {d.emoji} {d.nombre}</h3><p>{d.zona || 'Sin zona'} · Código {d.codigo || '—'} · Vendedores asignados: {d.vendedores_nombres || '—'}</p></div>
                    <Badge tone="blue">{d.totales.pedidos} pedidos</Badge>
                  </div>
                  <div className="panel-body">
                    <div className="grid grid-4" style={{ gap: 8, marginBottom: 12 }}>
                      <div className="mini-stat"><span>Vendedores</span><strong>{d.vendedores.length}</strong></div>
                      <div className="mini-stat"><span>Clientes</span><strong>{d.totales.clientes}</strong></div>
                      <div className="mini-stat"><span>Unidades / cajas</span><strong>{d.totales.unidades} / {d.totales.cajas}</strong></div>
                      <div className="mini-stat"><span>Total Bs</span><strong>{d.totales.monto.toFixed(2)}</strong></div>
                    </div>
                    <h4 className="small">Vendedores de esta carga</h4>
                    <div className="table-wrap" style={{ marginBottom: 12 }}>
                      <table className="data-table">
                        <thead><tr><th>Vendedor</th><th>Rol</th><th className="num">Pedidos</th><th className="num">Unidades</th><th className="num">Cajas</th><th className="num">Total Bs</th></tr></thead>
                        <tbody>{d.vendedores.map((v) => <tr key={`${d.id}-${v.id}`}><td className="cell-strong">{v.nombre}</td><td>{v.rol || '—'}</td><td className="num">{v.pedidos}</td><td className="num">{v.unidades}</td><td className="num">{v.cajas}</td><td className="num">{Number(v.monto || 0).toFixed(2)}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <h4 className="small">Productos a cargar para este distribuidor</h4>
                    <div className="table-wrap" style={{ marginBottom: 12 }}>
                      <table className="data-table">
                        <thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Cajas</th><th className="num">Sueltas</th></tr></thead>
                        <tbody>{d.productos.map((p) => <tr key={`${d.id}-p-${p.producto_id}`}><td className="cell-strong">{p.emoji} {p.nombre}</td><td className="num">{p.cantidad_unidades}</td><td className="num">{p.cajas_a_preparar}</td><td className="num">{p.unidades_sueltas}</td></tr>)}</tbody>
                      </table>
                    </div>
                    <h4 className="small">Pedidos y clientes confirmados</h4>
                    {!d.id && <div className="notice notice-warn" style={{ marginBottom: 8 }}>Venta de oficina o cliente sin vendedor: asigna un distribuidor para incluir estos pedidos en la carga.</div>}
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Cliente</th><th>Zona</th><th>Pedido</th><th>Fecha</th><th>Vendedor</th><th className="num">Cantidad</th><th className="num">Unidades</th><th className="num">Cajas</th><th className="num">Total Bs</th><th>Distribuidor</th></tr></thead>
                        <tbody>
                          {d.clientes.flatMap((c) => c.pedidos.map((p) => (
                            <tr key={`${d.id}-${p.id}`}>
                              <td className="cell-strong">{c.nombre}<span className="cell-sub">{c.telefono || ''}</span></td>
                              <td>{c.zona || '—'}</td>
                              <td>{p.codigo}</td>
                              <td>{p.fecha}</td>
                              <td>{p.vendedor}</td>
                              <td className="num">{p.items}</td>
                              <td className="num">{p.unidades}</td>
                              <td className="num">{p.cajas}</td>
                              <td className="num">{Number(p.total || 0).toFixed(2)}</td>
                              <td>
                                {d.id ? (d.nombre || '—') : (
                                  <select className="select input-sm" value="" onChange={(e) => asignarDistribuidor({ id: p.id, codigo: p.codigo }, e.target.value)}>
                                    <option value="">Asignar distribuidor…</option>
                                    {(manifiesto.catalogo_distribuidores || []).map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.nombre}</option>)}
                                  </select>
                                )}
                              </td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              ))}

              <div className="panel manifiesto-block mb-16 clientes-section">
                <div className="panel-head"><div><h3>3. Clientes con pedido confirmado</h3><p>Detalle de quién realizó cada pedido y el total por cliente.</p></div></div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Cliente</th><th>Zona</th><th>Vendedores</th><th className="num">Pedidos</th><th className="num">Unidades</th><th className="num">Cajas</th><th className="num">Total Bs</th></tr></thead>
                    <tbody>{manifiesto.clientes.map((c) => <tr key={c.id}><td className="cell-strong">{c.nombre}</td><td>{c.zona || '—'}</td><td>{c.vendedores.join(', ')}</td><td className="num">{c.pedidos.length}</td><td className="num">{c.unidades}</td><td className="num">{c.cajas}</td><td className="num">{c.monto.toFixed(2)}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>

              <div className="panel manifiesto-block summary-box resumen-section">
                <div className="split"><span className="small muted">Pedidos confirmados</span><strong>{manifiesto.totales.pedidos}</strong></div>
                <div className="split mt-8"><span className="small muted">Clientes</span><strong>{manifiesto.totales.clientes}</strong></div>
                <div className="split mt-8"><span className="small muted">Distribuidores / vendedores</span><strong>{manifiesto.totales.distribuidores} / {manifiesto.totales.vendedores}</strong></div>
                <div className="split mt-8"><span className="small muted">Unidades · cajas · peso (kg)</span><strong>{manifiesto.totales.unidades} · {manifiesto.totales.cajas} · {manifiesto.totales.peso_kg}</strong></div>
                <div className="split mt-8"><span className="small muted">TOTAL DE LA CARGA</span><strong><Money value={manifiesto.totales.monto} /></strong></div>
              </div>
            </>
          )}
        </div>
      )}

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail?.codigo || 'Detalle de carga'} subtitle={detail ? `${detail.fecha} · ${detail.vendedor_nombre} · ${detail.vehiculo_placa}` : ''} size="xl">
        {!detail ? <SkeletonRows rows={6} /> : (
          <div className="grid" style={{ gap: 14 }}>
            <div className="grid grid-4" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Pedidos</span><strong>{detail.totales.pedidos}</strong></div>
              <div className="mini-stat"><span>Unidades cargadas</span><strong>{detail.totales.unidades}</strong></div>
              <div className="mini-stat"><span>Cajas</span><strong>{detail.totales.cajas}</strong></div>
              <div className="mini-stat"><span>Monto</span><strong><Money value={detail.totales.monto} /></strong></div>
            </div>
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head"><h3>Detalle de productos y stock móvil</h3><Badge tone={ESTADO_TONE[detail.estado] || 'gray'}>{detail.estado.replace('_', ' ')}</Badge></div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th className="num">Cargado</th><th className="num">Cajas</th><th className="num">Entregado</th><th className="num">Queda en camión</th><th className="num">Cajas restantes</th></tr></thead>
                  <tbody>
                    {detail.lineas.map((l) => (
                      <tr key={l.producto_id}>
                        <td className="cell-strong">{l.emoji} {l.nombre}<span className="cell-sub">{l.unidades_por_caja} uds./caja</span></td>
                        <td className="num">{l.cantidad_unidades}</td>
                        <td className="num">{l.cajas_a_preparar}</td>
                        <td className="num">{l.entregado_unidades}</td>
                        <td className="num cell-strong">{l.restante_unidades}</td>
                        <td className="num">{l.cajas_a_preparar}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {detail.ruta_codigo && (
              <Link className="btn btn-outline btn-block" to={`/distribucion/${detail.ruta_id}`}><Truck size={14} /> Abrir ruta generada {detail.ruta_codigo}</Link>
            )}
          </div>
        )}
      </Modal>

      <Modal open={Boolean(confirmModal)} onClose={() => setConfirmModal(false)} title={`Confirmar carga · ${confirmModal?.codigo || ''}`} subtitle="Registra novedades de producto dañado o corta fecha para que el distribuidor también confirme" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setConfirmModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarConfirmacion}>Confirmar y notificar</button></>}>
        <div className="form-stack">
          <div className="field"><label>Observaciones generales</label><textarea className="textarea" value={confirmForm.observaciones} onChange={(e) => setConfirmForm({ ...confirmForm, observaciones: e.target.value })} placeholder="Estado del traslado, sellos, temperatura…" /></div>
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panel-head"><h3>Novedades de producto</h3><button className="btn btn-soft btn-sm" onClick={() => setConfirmForm({ ...confirmForm, novedades: [...confirmForm.novedades, { producto_id: '', tipo: 'danado', cantidad: 1, observacion: '' }] })}><Plus size={12} /> Agregar novedad</button></div>
            {confirmForm.novedades.map((n, i) => (
              <div className="field-row" key={i}>
                <div className="field"><label>Producto</label><select className="select" value={n.producto_id} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], producto_id: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }}><option value="">Seleccionar…</option>{(detail?.lineas || []).map((l) => <option key={l.producto_id} value={l.producto_id}>{l.nombre}</option>)}</select></div>
                <div className="field"><label>Tipo</label><select className="select" value={n.tipo} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], tipo: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }}><option value="danado">Dañado</option><option value="corta_fecha">Corta fecha</option><option value="faltante">Faltante</option></select></div>
                <div className="field"><label>Cantidad</label><input type="number" min="1" className="input" value={n.cantidad} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], cantidad: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }} /></div>
                <div className="field"><label>Observación</label><input className="input" value={n.observacion} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], observacion: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }} /></div>
              </div>
            ))}
            {confirmForm.novedades.length === 0 && <p className="small muted">Sin novedades: el producto sale en buen estado y con fecha vigente.</p>}
          </div>
        </div>
      </Modal>
    </>
  );
}
