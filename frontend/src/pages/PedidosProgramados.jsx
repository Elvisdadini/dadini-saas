import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import {
  BarChart3, CheckCircle2, ClipboardList, MapPin, PackageCheck, Plus, RefreshCcw, Truck, Undo2, Wallet, XCircle,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import { formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, EmptyState, Estado, Fecha, Modal, Money, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const mañana = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export default function PedidosProgramados() {
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({
    fecha: mañana(),
    ruta_venta: user?.ruta_venta || 'todas',
    forma_pago: 'todos',
    estado: 'todos',
    distribuidor_id: user?.repartidor_id || '',
  });
  const [accion, setAccion] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  const [devoluciones, setDevoluciones] = useState([]);
  const [confirmaciones, setConfirmaciones] = useState([]);
  const [confirmModal, setConfirmModal] = useState(null);
  const [confirmForm, setConfirmForm] = useState({ observaciones: '', novedades: [] });
  const [form, setForm] = useState({ tipo: 'entregado', motivo: '', devueltos: [], latitud: '', longitud: '', precision: null });
  const [ubicando, setUbicando] = useState(false);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams(filtros).toString();
      const cli = params.get('cliente');
      if (cli && String(filtros.cliente_id || '') !== String(cli)) setFiltros((f) => ({ ...f, cliente_id: cli }));
      const [p, v, dev, conf] = await Promise.all([
        api.get(`/pedidos/programados?${qs}`),
        api.get('/visitas?tipo=distribucion&limit=200'),
        api.get('/devoluciones'),
        api.get(`/confirmaciones-carga${user?.repartidor_id ? `?distribuidor_id=${user.repartidor_id}` : ''}`),
      ]);
      setData(p);
      setVisitas(v.visitas || []);
      setDevoluciones(dev.devoluciones || []);
      setConfirmaciones(conf.confirmaciones || []);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const timer = window.setInterval(cargar, 15000);
    return () => window.clearInterval(timer);
  }, [cargar]);

  const abrir = async (pedido, tipo) => {
    let ubicacion = null;
    try { ubicacion = await obtenerUbicacion(); } catch (error) { toast(error.message, 'error'); }
    setAccion(pedido);
    setForm({
      tipo,
      motivo: '',
      devueltos: (pedido.items || []).map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: 0, max: i.cantidad })),
      latitud: ubicacion?.latitud || pedido.cliente_latitud || '',
      longitud: ubicacion?.longitud || pedido.cliente_longitud || '',
      precision: ubicacion?.precision || null,
    });
  };

  const confirmar = async () => {
    if (!accion) return;
    if (!accion.ruta_id) return toast('Este pedido aún no tiene ruta asignada. Prepara la carga primero.', 'error');
    if (form.tipo === 'cerrado' && !form.motivo) return toast('Selecciona el motivo.', 'error');
    setBusy(true);
    try {
      const devueltos = form.tipo === 'parcial' ? form.devueltos.filter((d) => d.cantidad > 0).map((d) => ({ producto_id: d.producto_id, cantidad: d.cantidad })) : [];
      const estado = form.tipo === 'cerrado' ? 'fallida' : 'entregada';
      const resultado = form.tipo === 'cerrado' ? 'cerrado' : form.tipo === 'parcial' ? 'parcial' : 'entregado';
      await api.patch(`/rutas/${accion.ruta_id}/paradas/${accion.id}`, {
        estado,
        resultado_entrega: resultado,
        motivo: form.tipo === 'cerrado' ? form.motivo : null,
        productos_devueltos: devueltos,
        latitud: form.latitud,
        longitud: form.longitud,
        precision: form.precision,
      });
      toast(form.tipo === 'parcial' ? `Entrega parcial registrada · ${devueltos.length} productos descontados` : `Entrega marcada como ${resultado}`);
      setAccion(null);
      await cargar();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const abrirConfirmacion = (conf) => {
    setConfirmForm({ observaciones: '', novedades: [] });
    setConfirmModal(conf);
  };

  const guardarConfirmacionDistribuidor = async () => {
    if (!confirmModal) return;
    try {
      await api.patch(`/confirmaciones-carga/${confirmModal.id}/confirmar-distribuidor`, {
        observaciones_distribuidor: confirmForm.observaciones,
        novedades: confirmForm.novedades.filter((n) => n.tipo && n.cantidad > 0),
      });
      toast('Recepción de carga confirmada y registrada');
      setConfirmModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const pedidos = data?.pedidos || [];
  const puntosMapa = pedidos
    .filter((p) => p.cliente_latitud)
    .map((p) => ({
      id: p.id,
      latitud: p.cliente_latitud,
      longitud: p.cliente_longitud,
      nombre: p.cliente_nombre,
      descripcion: `${p.codigo} · ${p.forma_pago} · ${p.ruta_venta}`,
      tipo: 'cliente',
      estado: p.estado,
      acciones: [
        { label: 'Registrar entrega', tone: 'green', onClick: (punto) => { const ped = pedidos.find((x) => x.id === punto.id); if (ped) abrir(ped, 'entregado'); } },
      ],
    }));
  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader
        eyebrow="Distribución / Preventa"
        title="Pedidos programados"
        subtitle={`Entregas para ${data?.fecha || mañana()} · migradas desde la agenda del preventista · se actualiza cada 15 s`}
        actions={(
          <>
            <button className={`btn ${avanceAbierto ? 'btn-navy' : 'btn-primary'}`} onClick={() => setAvanceAbierto(!avanceAbierto)}>
              <BarChart3 size={14} /> {avanceAbierto ? 'Ocultar avance de ruta' : 'Avance de ruta'}
            </button>
            <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          </>
        )}
      />

      <div className="filters mb-16">
        <input type="date" className="input input-sm" value={filtros.fecha} onChange={(e) => setFiltros({ ...filtros, fecha: e.target.value })} />
        <select className="select" value={filtros.ruta_venta} onChange={(e) => setFiltros({ ...filtros, ruta_venta: e.target.value })}>
          <option value="todas">Todas las rutas</option><option value="R1">R1</option><option value="R2">R2</option>
        </select>
        <select className="select" value={filtros.forma_pago} onChange={(e) => setFiltros({ ...filtros, forma_pago: e.target.value })}>
          <option value="todos">Contado y crédito</option><option value="efectivo">Contado</option><option value="credito">Crédito</option>
        </select>
        <select className="select" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
          <option value="todos">Todos los estados</option><option value="pendiente">Pendiente</option><option value="preparando">Preparando</option><option value="enviado">En camino</option><option value="entregado">Entregado</option>
        </select>
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        <StatCard label="Pedidos programados" value={resumen.pedidos || 0} icon={ClipboardList} tone="blue" hint="Del preventista" />
        <StatCard label="Unidades" value={resumen.unidades || 0} icon={PackageCheck} tone="orange" hint="A cargar en camión" />
        <StatCard label="De contado" value={resumen.contado || 0} icon={Wallet} tone="green" hint="Pago al entregar" />
        <StatCard label="A crédito" value={resumen.credito || 0} icon={Wallet} tone="purple" hint="Cobro posterior" />
        <StatCard label="Monto total" value={<Money value={resumen.monto} />} icon={Truck} tone="navy" hint="Valor de la carga" />
      </div>

      {confirmaciones.filter((c) => c.estado_distribuidor === 'pendiente').length > 0 && (
        <div className="panel mb-16">
          <div className="panel-head"><div><h3>Cargas por confirmar</h3><p>El almacén ya las preparó · confirma que recibiste todo sin faltantes</p></div><span className="badge badge-amber">{confirmaciones.filter((c) => c.estado_distribuidor === 'pendiente').length}</span></div>
          <div className="panel-body">
            {confirmaciones.filter((c) => c.estado_distribuidor === 'pendiente').map((c) => (
              <div className="info-row" key={c.id}>
                <span><Truck size={12} /> {c.carga_codigo} · {c.ruta_codigo} · {c.novedades?.length || 0} novedades</span>
                <button className="btn btn-primary btn-sm" onClick={() => abrirConfirmacion(c)}>Confirmar recepción</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Mapa de entregas asignadas</h3><p>Solo clientes con pedido confirmado del preventista</p></div><span className="badge badge-green">{puntosMapa.length} clientes</span></div>
        <div className="panel-body"><Mapa altura={280} puntos={puntosMapa} /></div>
      </div>

      {avanceAbierto && (
      <div className="panel">
        <div className="panel-head"><div><h3>Detalle de entregas</h3><p>Marca entregado, cerrado o descuenta productos si no alcanza el pago</p></div>
          <Link className="btn btn-soft btn-sm" to="/inventario/preparado"><PackageCheck size={13} /> Preparar carga</Link>
        </div>
        {loading ? <SkeletonRows rows={7} /> : pedidos.length === 0 ? (
          <EmptyState icon={Truck} title="Sin pedidos programados" message="Ajusta los filtros o espera a que el preventista registre pedidos." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Ruta</th><th>Vendedor</th><th>Pago</th><th className="num">Total</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {pedidos.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => setDetalle(p)}>
                    <td className="cell-strong">{p.codigo}<span className="cell-sub"><Fecha value={p.created_at} short /></span></td>
                    <td>{p.cliente_nombre}<span className="cell-sub">{formatoCoords(p.cliente_latitud, p.cliente_longitud)}</span></td>
                    <td><Badge tone="orange">{p.ruta_venta || '—'}</Badge></td>
                    <td>{p.vendedor_nombre}</td>
                    <td><Badge tone={p.forma_pago === 'credito' ? 'purple' : 'green'}>{p.forma_pago}</Badge></td>
                    <td className="num"><Money value={p.total} /></td>
                    <td><Estado valor={p.estado} /></td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); abrir(p, 'entregado'); }}><CheckCircle2 size={12} /> Entregado</button>
                      <button className="btn btn-outline btn-sm" onClick={(e) => { e.stopPropagation(); abrir(p, 'parcial'); }}><Undo2 size={12} /> Parcial</button>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); abrir(p, 'cerrado'); }}><XCircle size={12} /> Cerrado</button>
                      {p.ruta_id && <Link className="link-btn" to={`/distribucion/${p.ruta_id}`}><MapPin size={12} /> Ruta</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {avanceAbierto && (
        <div className="panel section-gap">
          <div className="panel-head"><div><h3>Informe de avance de distribución</h3><p>Entregas, devoluciones y reacomodados en tiempo real</p></div><BarChart3 size={16} /></div>
          <div className="panel-body">
            <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Pedidos programados</span><strong>{resumen.pedidos || 0}</strong></div>
              <div className="mini-stat"><span>Entregados</span><strong className="text-green">{pedidos.filter((p) => p.estado === 'entregado').length}</strong></div>
              <div className="mini-stat"><span>Pendientes</span><strong className="text-orange">{pedidos.filter((p) => p.estado !== 'entregado').length}</strong></div>
              <div className="mini-stat"><span>Entregas parciales</span><strong>{visitas.filter((v) => v.resultado_entrega === 'parcial').length}</strong></div>
              <div className="mini-stat"><span>Cliente cerrado</span><strong className="text-red">{visitas.filter((v) => v.resultado_entrega === 'cerrado').length}</strong></div>
              <div className="mini-stat"><span>Unidades programadas</span><strong>{resumen.unidades || 0}</strong></div>
              <div className="mini-stat"><span>Devoluciones registradas</span><strong>{devoluciones.length}</strong></div>
              <div className="mini-stat"><span>Unidades reacomodadas</span><strong className="text-green">{devoluciones.reduce((s, d) => s + (d.reacomodadas || 0), 0)}</strong></div>
            </div>
            <div className="notice notice-info"><Truck size={15} /> Las entregas parciales y cierres generan devolución automática; el almacén verifica y reingresa el producto en buen estado, y lo reacomodado se contabiliza como venta en reportes.</div>
          </div>
        </div>
      )}

      <Modal open={Boolean(detalle)} onClose={() => setDetalle(null)} title={detalle?.codigo || 'Detalle de entrega'} subtitle={detalle ? `${detalle.cliente_nombre} · ${detalle.forma_pago} · ${detalle.ruta_venta}` : ''} size="md">
        {!detalle ? null : (
          <div className="form-stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Total pedido</span><strong><Money value={detalle.total} /></strong></div>
              <div className="mini-stat"><span>Entrega programada</span><strong style={{ fontSize: 12 }}>{detalle.fecha_entrega_programada || '—'}</strong></div>
            </div>
            <div className="info-row"><span>Ubicación del cliente</span><strong>{formatoCoords(detalle.cliente_latitud, detalle.cliente_longitud)}</strong></div>
            <div className="info-row"><span>Vendedor</span><strong>{detalle.vendedor_nombre}</strong></div>
            <div className="divider" />
            <div className="inline">
              <button className="btn btn-primary" onClick={() => { setDetalle(null); abrir(detalle, 'entregado'); }}><CheckCircle2 size={13} /> Entregar pedido</button>
              <button className="btn btn-outline" onClick={() => { setDetalle(null); abrir(detalle, 'parcial'); }}><Undo2 size={13} /> Entrega parcial</button>
              <button className="btn btn-ghost" onClick={() => { setDetalle(null); abrir(detalle, 'cerrado'); }}><XCircle size={13} /> Cliente cerrado</button>
            </div>
            <BotonWhatsapp tipo="entrega" clienteId={detalle.cliente_id} pedidoId={detalle.id} telefono={detalle.cliente_telefono} latitud={detalle.cliente_latitud} longitud={detalle.cliente_longitud} monto={detalle.total} label="Enviar comprobante" />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(accion)} onClose={() => setAccion(null)} title={`Registrar entrega · ${accion?.codigo || ''}`} subtitle={accion ? `${accion.cliente_nombre} · ${accion.forma_pago}` : ''} size="lg">
        <div className="form-stack">
          <div className="pill-group">
            <button className={`chip ${form.tipo === 'entregado' ? 'active' : ''}`} onClick={() => setForm({ ...form, tipo: 'entregado' })}><CheckCircle2 size={12} /> Entregado completo</button>
            <button className={`chip ${form.tipo === 'parcial' ? 'active' : ''}`} onClick={() => setForm({ ...form, tipo: 'parcial' })}><Undo2 size={12} /> Entrega parcial</button>
            <button className={`chip ${form.tipo === 'cerrado' ? 'active' : ''}`} onClick={() => setForm({ ...form, tipo: 'cerrado' })}><XCircle size={12} /> Cliente cerrado</button>
          </div>
          {form.tipo === 'cerrado' && (
            <div className="field"><label>Motivo</label>
              <select className="select" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                <option value="">Seleccionar…</option>
                <option value="cerrado">Local cerrado</option>
                <option value="ausente">Cliente ausente</option>
                <option value="rechazo">Rechazó el pedido</option>
              </select>
            </div>
          )}
          {form.tipo === 'parcial' && (
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head"><h3>Productos a descontar</h3><span className="panel-sub">Por falta de pago o disponibilidad</span></div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th className="num">Pedido</th><th className="num">Devolver</th></tr></thead>
                  <tbody>
                    {form.devueltos.map((d, i) => (
                      <tr key={d.producto_id}>
                        <td className="cell-strong">{d.nombre}</td>
                        <td className="num">{d.max}</td>
                        <td className="num"><input className="input input-sm" style={{ width: 80 }} type="number" min="0" max={d.max} value={d.cantidad} onChange={(e) => {
                          const next = [...form.devueltos];
                          next[i] = { ...next[i], cantidad: Number(e.target.value) };
                          setForm({ ...form, devueltos: next });
                        }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="geo-editor">
            <div className="geo-editor-head"><div><strong><MapPin size={13} /> Ubicación de la entrega</strong><span className="hint">Se registra en el mapa y en el reporte de campo.</span></div></div>
            <div className="field-row">
              <div className="field"><label>Latitud</label><input className="input" type="number" step="0.000001" value={form.latitud} onChange={(e) => setForm({ ...form, latitud: e.target.value })} /></div>
              <div className="field"><label>Longitud</label><input className="input" type="number" step="0.000001" value={form.longitud} onChange={(e) => setForm({ ...form, longitud: e.target.value })} /></div>
            </div>
          </div>
          <div className="inline mt-8">
            <button className="btn btn-ghost" onClick={() => setAccion(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={confirmar} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar entrega'}</button>
          </div>
          {accion && <BotonWhatsapp tipo="entrega" clienteId={accion.cliente_id} pedidoId={accion.id} telefono={accion.cliente_telefono} latitud={form.latitud} longitud={form.longitud} monto={accion.total} label="Enviar comprobante de entrega" />}
        </div>
      </Modal>

      <Modal open={Boolean(confirmModal)} onClose={() => setConfirmModal(false)} title={`Confirmar recepción · ${confirmModal?.carga_codigo || ''}`} subtitle={confirmModal ? `Novedades del almacén: ${confirmModal.novedades?.length || 0}` : ''} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setConfirmModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarConfirmacionDistribuidor}>Confirmar cargo sin inconvenientes</button></>}>
        <div className="form-stack">
          <p className="small muted">Revisa las novedades registradas por almacén ({confirmModal?.novedades?.map((n) => `${n.tipo} ×${n.cantidad}`).join(', ') || 'ninguna'}) y agrega tus propias observaciones si hay producto dañado o corta fecha.</p>
          <div className="field"><label>Observaciones del distribuidor</label><textarea className="textarea" value={confirmForm.observaciones} onChange={(e) => setConfirmForm({ ...confirmForm, observaciones: e.target.value })} /></div>
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panel-head"><h3>Novedades del distribuidor</h3><button className="btn btn-soft btn-sm" onClick={() => setConfirmForm({ ...confirmForm, novedades: [...confirmForm.novedades, { producto_id: '', tipo: 'danado', cantidad: 1, observacion: '' }] })}><Plus size={12} /> Agregar</button></div>
            {confirmForm.novedades.map((n, i) => (
              <div className="field-row" key={i}>
                <div className="field"><label>Producto</label><input className="input" value={n.producto_id} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], producto_id: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }} placeholder="Nombre del producto" /></div>
                <div className="field"><label>Tipo</label><select className="select" value={n.tipo} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], tipo: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }}><option value="danado">Dañado</option><option value="corta_fecha">Corta fecha</option><option value="faltante">Faltante</option></select></div>
                <div className="field"><label>Cantidad</label><input type="number" min="1" className="input" value={n.cantidad} onChange={(e) => { const x = [...confirmForm.novedades]; x[i] = { ...x[i], cantidad: e.target.value }; setConfirmForm({ ...confirmForm, novedades: x }); }} /></div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
