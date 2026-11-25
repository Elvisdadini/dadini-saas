import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, Clock3, Crosshair, Flag, MapPin, Minus, Navigation, Package,
  Phone, Plus, Printer, Receipt, Route as RouteIcon, Trash2, Truck, Undo2, X, XCircle,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import FirmaCanvas from '../components/FirmaCanvas';
import { formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, Confirm, EmptyState, Estado, Fecha, Modal, Money, PageHeader, ProgressBar, SkeletonRows, useToast } from '../ui';

export default function RutaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [ruta, setRuta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [disponibles, setDisponibles] = useState([]);
  const [nuevo, setNuevo] = useState('');
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [visitas, setVisitas] = useState([]);
  const [entrega, setEntrega] = useState(null);
  const [entregaDetallada, setEntregaDetallada] = useState(null);
  const [entregaItems, setEntregaItems] = useState([]);
  const [rechazoForm, setRechazoForm] = useState({ motivo: 'cerrado', detalle: '' });
  const [comprobante, setComprobante] = useState(null);
  const [productosCamion, setProductosCamion] = useState([]);
  const [agregarModal, setAgregarModal] = useState(false);
  const [agregarForm, setAgregarForm] = useState({ producto_id: '', cantidad: 1 });
  const [devueltos, setDevueltos] = useState([]);
  const [firma, setFirma] = useState(null);

  const puedeEditar = ['admin', 'distribucion'].includes(user?.rol);

  const cargar = useCallback(async () => {
    try {
      const data = await api.get(`/rutas/${id}`);
      setRuta(data.ruta);
    } catch (error) {
      toast(error.message, 'error');
      navigate('/distribucion');
    } finally { setLoading(false); }
  }, [id, navigate, toast]);

  const cargarVisitas = async () => {
    try {
      const r = await api.get(`/visitas?ruta_id=${id}&limit=20`);
      setVisitas(r.visitas || []);
    } catch (error) { /* no bloquea la ruta */ }
  };

  useEffect(() => {
    cargar();
    cargarVisitas();
    const timer = window.setInterval(() => { cargarVisitas(); cargar(); }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const cambiarEstadoRuta = async (estado) => {
    setBusy(true);
    try {
      await api.patch(`/rutas/${id}/estado`, { estado });
      await cargar();
      toast(`Ruta marcada como ${estado.replace('_', ' ')}`);
      setConfirm(null);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const cambiarParada = async (pedidoId, estado) => {
    setBusy(true);
    try {
      const data = await api.patch(`/rutas/${id}/paradas/${pedidoId}`, {
        estado,
        latitud: ubicacion?.latitud,
        longitud: ubicacion?.longitud,
        precision: ubicacion?.precision,
      });
      setRuta((r) => ({ ...r, ...data.ruta }));
      cargarVisitas();
      toast(estado === 'entregada' ? 'Entrega confirmada y geolocalizada' : estado === 'fallida' ? 'Entrega marcada como fallida' : 'Parada actualizada');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirEntrega = (parada, tipo) => {
    setFirma(null);
    if (!ubicacion) {
      toast('Primero captura tu ubicación con el botón «Mi ubicación».', 'error');
      return;
    }
    setEntrega({ parada, tipo });
    setDevueltos((parada.pedido?.items || []).map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, cantidad: 0, max: i.cantidad })));
  };

  const confirmarEntrega = async () => {
    if (!entrega) return;
    setBusy(true);
    try {
      const resultado = entrega.tipo === 'parcial' ? 'parcial' : entrega.tipo === 'cerrado' ? 'cerrado' : 'entregado';
      const data = await api.patch(`/rutas/${id}/paradas/${entrega.parada.pedido_id}`, {
        estado: resultado === 'cerrado' ? 'fallida' : 'entregada',
        resultado_entrega: resultado,
        motivo: resultado === 'cerrado' ? 'cerrado' : null,
        firma,
        productos_devueltos: resultado === 'parcial' ? devueltos.filter((d) => d.cantidad > 0).map((d) => ({ producto_id: d.producto_id, cantidad: d.cantidad })) : [],
        latitud: ubicacion?.latitud,
        longitud: ubicacion?.longitud,
        precision: ubicacion?.precision,
      });
      setRuta((r) => ({ ...r, ...data.ruta }));
      await cargarVisitas();
      setEntrega(null);
      toast(resultado === 'cerrado' ? 'Cliente marcado como cerrado' : resultado === 'parcial' ? 'Entrega parcial registrada' : 'Entrega confirmada');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirEntregaDetallada = async (pedidoId) => {
    setFirma(null);
    const parada = ruta.paradas.find((p) => p.pedido_id === pedidoId);
    if (!parada) return;
    let punto = ubicacion;
    if (!punto) { try { punto = await obtenerUbicacion(); } catch (error) { toast(error.message, 'error'); } }
    try {
      const disp = await api.get(`/devoluciones/disponible?ruta_id=${id}`);
      setProductosCamion(disp.productos || []);
    } catch (error) { setProductosCamion([]); }
    setEntregaItems((parada.pedido?.items || []).map((i) => ({ producto_id: i.producto_id, nombre: i.nombre, emoji: i.emoji, precio: i.precio, cantidad: i.cantidad })));
    setEntregaDetallada({ parada, ubicacion: punto });
  };

  const disponibleDe = (productoId) => Number(productosCamion.find((p) => p.producto_id === productoId)?.disponible || 0);
  const maxCantidad = (item) => Math.max(0, Number(item.cantidad || 0) + disponibleDe(item.producto_id));

  const agregarAlPedido = () => {
    const producto = productosCamion.find((p) => p.producto_id === Number(agregarForm.producto_id));
    if (!producto) return toast('Selecciona un producto del camión.', 'error');
    const cantidad = Math.max(1, Math.min(Number(agregarForm.cantidad) || 1, producto.disponible));
    const existente = entregaItems.find((i) => i.producto_id === producto.producto_id);
    if (existente) {
      if (existente.cantidad + cantidad > existente.cantidad + producto.disponible) return toast('No hay suficiente producto disponible en el camión.', 'error');
      setEntregaItems(entregaItems.map((i) => i.producto_id === producto.producto_id ? { ...i, cantidad: i.cantidad + cantidad } : i));
    } else {
      setEntregaItems([...entregaItems, {
        producto_id: producto.producto_id, nombre: producto.nombre, emoji: producto.emoji,
        precio: producto.precio, cantidad, agregado_en_entrega: true,
      }]);
    }
    setAgregarModal(false);
    setAgregarForm({ producto_id: '', cantidad: 1 });
    toast(`${cantidad} ${producto.nombre} agregados al pedido`);
  };

  const procesarEntrega = async (decision) => {
    if (!entregaDetallada) return;
    setBusy(true);
    try {
      const r = await api.patch(`/rutas/${id}/paradas/${entregaDetallada.parada.pedido_id}/entrega`, {
        decision,
        items: entregaItems.map((i) => ({ producto_id: i.producto_id, cantidad: Number(i.cantidad) || 0 })),
        motivo: rechazoForm.motivo,
        detalle_otros: rechazoForm.detalle,
        firma,
        latitud: entregaDetallada.ubicacion?.latitud,
        longitud: entregaDetallada.ubicacion?.longitud,
        precision: entregaDetallada.ubicacion?.precision,
      });
      await cargar();
      await cargarVisitas();
      setEntregaDetallada(null);
      if (decision === 'confirmada') {
        setComprobante(r.pedido);
        toast('Entrega confirmada. Genera y comparte el comprobante.');
      } else {
        toast('Entrega rechazada y registrada con el motivo.');
      }
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const quitarParada = async (pedidoId) => {
    setBusy(true);
    try {
      await api.del(`/rutas/${id}/paradas/${pedidoId}`);
      await cargar();
      toast('Parada retirada de la ruta');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const mover = async (index, dir) => {
    const paradas = [...ruta.paradas];
    const target = index + dir;
    if (target < 0 || target >= paradas.length) return;
    [paradas[index], paradas[target]] = [paradas[target], paradas[index]];
    const orden = paradas.map((p) => p.pedido_id);
    setRuta((r) => ({ ...r, paradas: paradas.map((p, i) => ({ ...p, orden: i + 1 })) }));
    try {
      await api.post(`/rutas/${id}/reordenar`, { orden });
    } catch (error) {
      toast(error.message, 'error');
      cargar();
    }
  };

  const abrirAgregar = async () => {
    setAddOpen(true);
    try {
      const data = await api.get('/rutas/disponibles?solo_reparto=true');
      setDisponibles(data.pedidos);
    } catch (error) { toast(error.message, 'error'); }
  };

  const agregarParada = async () => {
    if (!nuevo) return toast('Selecciona un pedido.', 'error');
    setBusy(true);
    try {
      await api.post(`/rutas/${id}/paradas`, { pedido_id: Number(nuevo) });
      setAddOpen(false);
      setNuevo('');
      await cargar();
      toast('Pedido agregado a la ruta');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const capturarUbicacion = async () => {
    setUbicando(true);
    try {
      setUbicacion(await obtenerUbicacion());
      toast('Ubicación actual capturada');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUbicando(false);
    }
  };

  const registrarVisita = async (parada) => {
    if (!ubicacion) return toast('Primero captura tu ubicación actual.', 'error');
    setBusy(true);
    try {
      const pedido = parada?.pedido;
      await api.post('/visitas', {
        cliente_id: pedido?.cliente_id || null,
        pedido_id: parada.pedido_id,
        ruta_id: Number(id),
        tipo: 'distribucion',
        modulo: 'Distribución',
        estado: 'en_curso',
        notas: `Visita en ruta ${ruta.codigo} · ${pedido?.codigo || parada.pedido_id}`,
        ...ubicacion,
      });
      await cargarVisitas();
      toast('Visita geolocalizada registrada');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  if (loading) return <><PageHeader title="Detalle de ruta" subtitle="Cargando…" /><div className="panel"><SkeletonRows rows={8} /></div></>;
  if (!ruta) return null;

  return (
    <>
      <PageHeader
        eyebrow="Distribución / Ruta"
        title={ruta.codigo}
        subtitle={<span><Fecha value={ruta.fecha} /> · {ruta.total_paradas} paradas · {ruta.repartidor_nombre}</span>}
        actions={(
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/distribucion')}><ArrowLeft size={15} /> Volver</button>
            <button className="btn btn-outline" onClick={() => window.print()}><Printer size={14} /> Hoja de ruta</button>
            {puedeEditar && ruta.estado === 'programada' && <button className="btn btn-primary" onClick={() => setConfirm('en_camino')}><Truck size={14} /> Iniciar ruta</button>}
            {puedeEditar && ruta.estado === 'en_camino' && <button className="btn btn-navy" onClick={() => setConfirm('completada')}><Flag size={14} /> Cerrar ruta</button>}
          </>
        )}
      />

      <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
        <div className="card card-pad" style={{ padding: 14 }}><span className="small muted">Repartidor</span><strong style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{ruta.repartidor_emoji} {ruta.repartidor_nombre}</strong><span className="small muted">{ruta.repartidor_telefono}</span></div>
        <div className="card card-pad" style={{ padding: 14 }}><span className="small muted">Vehículo</span><strong style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{ruta.vehiculo_placa}</strong><span className="small muted">{ruta.vehiculo_modelo}</span></div>
        <div className="card card-pad" style={{ padding: 14 }}><span className="small muted">Avance</span><strong style={{ display: 'block', fontSize: 13, marginTop: 3 }}>{ruta.entregadas}/{ruta.total_paradas} entregas</strong><ProgressBar value={ruta.progreso} tone={ruta.progreso === 100 ? 'green' : 'orange'} /></div>
        <div className="card card-pad" style={{ padding: 14 }}><span className="small muted">Monto en ruta</span><strong style={{ display: 'block', fontSize: 15, marginTop: 3 }}><Money value={ruta.monto_total} /></strong><Estado valor={ruta.estado} /></div>
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Mapa de la ruta y visitas en tiempo real</h3><p>Paradas con coordenadas de clientes y check-ins del repartidor · se actualiza cada 15 s</p></div>
          <div className="inline">
            <span className="badge badge-navy">{ruta.geo?.distancia_total_km || 0} km planeados</span>
            <button className="btn btn-soft btn-sm" onClick={capturarUbicacion} disabled={ubicando}>
              <Crosshair size={13} /> {ubicando ? 'Ubicando…' : ubicacion ? 'Actualizar ubicación' : 'Mi ubicación'}
            </button>
          </div>
        </div>
        <div className="panel-body">
          {ubicacion && <p className="small text-green mb-8">Ubicación actual: {formatoCoords(ubicacion.latitud, ubicacion.longitud)} (±{ubicacion.precision} m)</p>}
          <Mapa
            altura={300}
            linea
            puntos={[
              ...(ruta.geo?.puntos || []).map((punto) => ({
                ...punto,
                nombre: punto.cliente_nombre,
                descripcion: `${punto.pedido_codigo} · ${punto.direccion}`,
                tipo: 'cliente',
                acciones: [{ label: 'Realizar entrega', tone: 'green', onClick: (p) => abrirEntregaDetallada(p.pedido_id) }],
              })),
              ...visitas.map((v) => ({
                id: `visita-${v.id}`,
                latitud: v.latitud,
                longitud: v.longitud,
                nombre: `${v.cliente_nombre} · ${v.tipo}`,
                descripcion: v.notas,
                tipo: 'distribucion',
              })),
              ...(ubicacion ? [{ id: 'yo', latitud: ubicacion.latitud, longitud: ubicacion.longitud, nombre: 'Tu ubicación', tipo: 'visita' }] : []),
            ]}
          />
        </div>
      </div>

      <div className="detail-grid">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Paradas de la ruta</h3><p>Orden sugerido de entrega · {ruta.pendientes} pendientes</p></div>
            {puedeEditar && <button className="btn btn-soft btn-sm" onClick={abrirAgregar}><Plus size={13} /> Agregar pedido</button>}
          </div>
          {ruta.paradas.length === 0 ? <EmptyState icon={RouteIcon} title="Ruta sin paradas" message="Agrega pedidos de reparto para comenzar." /> : (
            <div className="route-stops">
              {ruta.paradas.map((parada, index) => {
                const p = parada.pedido;
                const done = parada.estado === 'entregada';
                const failed = parada.estado === 'fallida';
                return (
                  <div className={`route-stop ${done ? 'done' : ''} ${failed ? 'failed' : ''}`} key={parada.pedido_id}>
                    <span className="stop-index">{done ? <Check size={14} /> : failed ? <X size={14} /> : parada.orden}</span>
                    <div className="stop-body">
                      <div className="stop-top">
                        <strong>{p?.cliente_nombre || `Pedido #${parada.pedido_id}`}</strong>
                        <Badge tone="gray">{p?.codigo}</Badge>
                        <Estado valor={parada.estado} />
                        {p?.estado_pago === 'pendiente' && <Badge tone="amber">Cobrar al entregar</Badge>}
                      </div>
                      <div className="stop-meta">
                        <span><MapPin size={11} style={{ verticalAlign: -1 }} /> {p?.entrega_direccion || p?.cliente_zona}{p?.cliente_latitud ? ` · ${formatoCoords(p.cliente_latitud, p.cliente_longitud)}` : ''}</span>
                        <span><Phone size={11} style={{ verticalAlign: -1 }} /> {p?.cliente_telefono}</span>
                        <span><Package size={11} style={{ verticalAlign: -1 }} /> {p?.items_count} unidades</span>
                        <span><Clock3 size={11} style={{ verticalAlign: -1 }} /> {parada.hora_estimada}</span>
                        <span><Money value={p?.total} /></span>
                      </div>
                      {parada.notas && <div className="stop-note">{parada.notas}</div>}
                    </div>
                    {puedeEditar && ruta.estado !== 'completada' && ruta.estado !== 'cancelada' && (
                      <div className="stop-actions">
                        <button className="icon-btn" title="Subir" onClick={() => mover(index, -1)} disabled={index === 0 || busy}><ArrowUp size={13} /></button>
                        <button className="icon-btn" title="Bajar" onClick={() => mover(index, 1)} disabled={index === ruta.paradas.length - 1 || busy}><ArrowDown size={13} /></button>
                        {!done && !failed && (
                          <>
                            {parada.estado !== 'en_camino' && <button className="btn btn-outline btn-sm" onClick={() => cambiarParada(parada.pedido_id, 'en_camino')}>Iniciar</button>}
                            <button className="btn btn-soft btn-sm" onClick={() => abrirEntregaDetallada(parada.pedido_id)}><CheckCircle2 size={12} /> Entregar</button>
                             <button className="icon-btn" title="Registrar visita geolocalizada" onClick={() => registrarVisita(parada)} disabled={!ubicacion || busy}><Navigation size={13} /></button>
                             <button className="icon-btn" title="Entrega parcial (descontar productos)" onClick={() => abrirEntrega(parada, 'parcial')} disabled={!ubicacion || busy}><Undo2 size={13} /></button>
                             <button className="icon-btn" title="Cliente cerrado" onClick={() => abrirEntrega(parada, 'cerrado')} disabled={!ubicacion || busy}><XCircle size={13} color="var(--red)" /></button>
                            <button className="icon-btn" title="Marcar fallida" onClick={() => cambiarParada(parada.pedido_id, 'fallida')}><XCircle size={14} color="var(--red)" /></button>
                          </>
                        )}
                        <button className="icon-btn" title="Quitar de la ruta" onClick={() => quitarParada(parada.pedido_id)}><Trash2 size={13} /></button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head"><h3>Resumen de la ruta</h3></div>
            <div className="panel-body">
              <div className="info-grid">
                <div className="info-row"><span>Estado</span><strong><Estado valor={ruta.estado} /></strong></div>
                <div className="info-row"><span>Fecha</span><strong><Fecha value={ruta.fecha} /></strong></div>
                <div className="info-row"><span>Total paradas</span><strong>{ruta.total_paradas}</strong></div>
                <div className="info-row"><span>Entregadas</span><strong className="text-green">{ruta.entregadas}</strong></div>
                <div className="info-row"><span>Fallidas</span><strong className={ruta.fallidas ? 'text-red' : ''}>{ruta.fallidas}</strong></div>
                <div className="info-row"><span>Pendientes</span><strong>{ruta.pendientes}</strong></div>
              </div>
              <div className="divider" />
              <div className="split"><span className="small muted">Monto total de la ruta</span><strong style={{ fontSize: 16 }}><Money value={ruta.monto_total} /></strong></div>
              <div className="notice notice-info mt-12"><RouteIcon size={15} /> Al confirmar una entrega, el pedido cambia a "entregado" y el saldo queda disponible en cobranzas.</div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Observaciones</h3></div>
            <div className="panel-body">
              <p className="small muted" style={{ lineHeight: 1.6 }}>{ruta.notas || 'Esta ruta no tiene observaciones registradas.'}</p>
            </div>
          </div>

          {puedeEditar && ruta.estado !== 'completada' && ruta.estado !== 'cancelada' && (
            <div className="panel">
              <div className="panel-head"><h3>Acciones</h3></div>
              <div className="panel-body">
                <button className="btn btn-outline btn-block" onClick={abrirAgregar}><Plus size={14} /> Agregar parada</button>
                {ruta.estado === 'programada' && <button className="btn btn-primary btn-block mt-8" onClick={() => setConfirm('en_camino')}><Truck size={14} /> Iniciar ruta</button>}
                {ruta.estado === 'en_camino' && <button className="btn btn-navy btn-block mt-8" onClick={() => setConfirm('completada')}><Flag size={14} /> Cerrar ruta</button>}
                <button className="btn btn-danger-soft btn-block mt-8" onClick={() => setConfirm('cancelada')}>Cancelar ruta</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Agregar pedido a la ruta" subtitle="Solo se muestran pedidos de reparto sin ruta asignada."
        footer={<><button className="btn btn-ghost" onClick={() => setAddOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={agregarParada} disabled={busy || !nuevo}>Agregar parada</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Pedido disponible</label>
            <select className="select" value={nuevo} onChange={(e) => setNuevo(e.target.value)}>
              <option value="">Seleccionar pedido…</option>
              {disponibles.map((p) => <option key={p.id} value={p.id}>{p.codigo} · {p.cliente_nombre} · {p.cliente_zona} · Bs {p.total.toFixed(2)}</option>)}
            </select>
          </div>
          {disponibles.length === 0 && <div className="notice notice-warn">No hay pedidos de reparto disponibles para asignar.</div>}
        </div>
      </Modal>

      <Modal
        open={Boolean(entrega)}
        onClose={() => setEntrega(null)}
        title={entrega?.tipo === 'cerrado' ? 'Cliente cerrado' : 'Entrega parcial'}
        subtitle={entrega ? `${entrega.parada.pedido?.codigo || ''} · ${entrega.parada.pedido?.cliente_nombre || ''}` : ''}
        footer={<><button className="btn btn-ghost" onClick={() => setEntrega(null)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarEntrega} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button></>}
      >
        <div className="form-stack">
          {entrega?.tipo === 'parcial' ? (
            <>
              <p className="small muted">Indica cuántas unidades se descuentan del pedido porque el cliente no cubrió el pago o no recibió el producto.</p>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th className="num">Pedido</th><th className="num">Descontar</th></tr></thead>
                  <tbody>
                    {devueltos.map((d, i) => (
                      <tr key={d.producto_id}>
                        <td className="cell-strong">{d.nombre}</td>
                        <td className="num">{d.max}</td>
                        <td className="num"><input className="input input-sm" style={{ width: 80 }} type="number" min="0" max={d.max} value={d.cantidad} onChange={(e) => {
                          const next = [...devueltos];
                          next[i] = { ...next[i], cantidad: Number(e.target.value) };
                          setDevueltos(next);
                        }} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="notice notice-warn">La parada se marcará como fallida y el pedido volverá a preparación para reprogramarse.</div>
          )}
          <FirmaCanvas value={firma} onChange={setFirma} label="Firma de quien recibe" />
          <div className="notice notice-info"><MapPin size={14} /> Ubicación: {formatoCoords(ubicacion?.latitud, ubicacion?.longitud)}</div>
        </div>
      </Modal>

      <Modal open={Boolean(entregaDetallada)} onClose={() => setEntregaDetallada(null)} title={`Realizar entrega · ${entregaDetallada?.parada?.pedido?.codigo || ''}`} subtitle={entregaDetallada ? `${entregaDetallada.parada.pedido?.cliente_nombre || ''} · ${formatoCoords(entregaDetallada.ubicacion?.latitud, entregaDetallada.ubicacion?.longitud)}` : ''} size="xl">
        {!entregaDetallada ? null : (
          <div className="form-stack">
            <div className="inline mb-8">
              <div className="notice notice-info" style={{ flex: 1 }}><Package size={14} /> Productos disponibles en el camión (de clientes que rechazaron): {productosCamion.reduce((s, p) => s + p.disponible, 0)} uds. Solo puedes aumentar hasta ese stock.</div>
              <button className="btn btn-primary btn-sm" onClick={() => setAgregarModal(true)}><Plus size={13} /> Agregar producto</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr>
                  <th>Producto</th><th className="num">Precio</th><th className="num">Cantidad a entregar</th><th className="num">Disponible en camión</th><th className="num">Subtotal</th><th />
                </tr></thead>
                <tbody>
                  {entregaItems.map((i, idx) => (
                    <tr key={i.producto_id}>
                      <td className="cell-strong">{i.emoji} {i.nombre}</td>
                      <td className="num"><Money value={i.precio} /></td>
                      <td className="num">
                        <div className="inline">
                          <button className="icon-btn" title="Disminuir" onClick={() => { const x = [...entregaItems]; x[idx] = { ...x[idx], cantidad: Math.max(0, x[idx].cantidad - 1) }; setEntregaItems(x); }}><Minus size={13} /></button>
                          <input className="input input-sm" style={{ width: 60 }} type="number" min="0" max={maxCantidad(i)} value={i.cantidad} onChange={(e) => {
                            const max = maxCantidad(i);
                            const valor = Math.min(max, Math.max(0, Number(e.target.value) || 0));
                            const x = [...entregaItems]; x[idx] = { ...x[idx], cantidad: valor }; setEntregaItems(x);
                          }} />
                          <button className="icon-btn" title={i.cantidad >= maxCantidad(i) ? 'No hay más producto en el camión' : 'Aumentar'} disabled={i.cantidad >= maxCantidad(i)} onClick={() => {
                            const max = maxCantidad(i);
                            const x = [...entregaItems]; x[idx] = { ...x[idx], cantidad: Math.min(max, x[idx].cantidad + 1) }; setEntregaItems(x);
                          }}><Plus size={13} /></button>
                        </div>
                      </td>
                      <td className="num"><Badge tone={disponibleDe(i.producto_id) > 0 ? 'green' : 'gray'}>{disponibleDe(i.producto_id)} uds.</Badge></td>
                      <td className="num"><Money value={i.cantidad * i.precio} /></td>
                      <td className="actions"><button className="icon-btn" title="Eliminar producto" onClick={() => setEntregaItems(entregaItems.filter((_, j) => j !== idx))}><Trash2 size={13} color="var(--red)" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="totals"><div className="t-total"><span>Total a entregar</span><Money value={entregaItems.reduce((s, i) => s + i.cantidad * i.precio, 0)} /></div></div>
            <div className="divider" />
            <div className="field"><label>Rechazo de entrega · motivo</label>
              <select className="select" value={rechazoForm.motivo} onChange={(e) => setRechazoForm({ ...rechazoForm, motivo: e.target.value })}>
                <option value="cerrado">Cerrado</option>
                <option value="sin_dinero">No tiene dinero</option>
                <option value="no_hizo_pedido">No hizo pedido</option>
                <option value="no_encargado">No se encuentra el encargado</option>
                <option value="otro">Otros</option>
              </select>
            </div>
            {rechazoForm.motivo === 'otro' && <div className="field"><label>Detalle de otros</label><textarea className="textarea" value={rechazoForm.detalle} onChange={(e) => setRechazoForm({ ...rechazoForm, detalle: e.target.value })} /></div>}
            <FirmaCanvas value={firma} onChange={setFirma} label="Firma de quien recibe" />
            <div className="grid grid-2" style={{ gap: 10 }}>
              <button className="btn btn-primary btn-block" disabled={busy} onClick={() => procesarEntrega('confirmada')}><CheckCircle2 size={14} /> Confirmar entrega</button>
              <button className="btn btn-danger-soft btn-block" disabled={busy} onClick={() => procesarEntrega('rechazada')}><XCircle size={14} /> Rechazar entrega</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={agregarModal} onClose={() => setAgregarModal(false)} title="Agregar producto del camión" subtitle="Productos de clientes que rechazaron su pedido y que puedes reacomodar" size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setAgregarModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={agregarAlPedido}>Agregar al pedido</button></>}>
        <div className="form-stack">
          {productosCamion.length === 0 ? (
            <div className="notice notice-warn">No hay producto disponible en el camión para reacomodar.</div>
          ) : (
            <>
              <div className="field"><label>Producto disponible</label>
                <select className="select" value={agregarForm.producto_id} onChange={(e) => setAgregarForm({ ...agregarForm, producto_id: e.target.value })}>
                  <option value="">Seleccionar…</option>
                  {productosCamion.map((p) => <option key={p.producto_id} value={p.producto_id}>{p.emoji} {p.nombre} · {p.disponible} uds.</option>)}
                </select>
              </div>
              <div className="field"><label>Cantidad a agregar</label><input className="input" type="number" min="1" max={productosCamion.find((p) => p.producto_id === Number(agregarForm.producto_id))?.disponible || 1} value={agregarForm.cantidad} onChange={(e) => setAgregarForm({ ...agregarForm, cantidad: e.target.value })} /></div>
              {agregarForm.producto_id && <div className="notice notice-info">Origen: {productosCamion.find((p) => p.producto_id === Number(agregarForm.producto_id))?.origen.join(' · ')}</div>}
            </>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(comprobante)} onClose={() => setComprobante(null)} title="Comprobante de entrega" subtitle={comprobante ? `${comprobante.codigo} · ${comprobante.cliente_nombre}` : ''} size="md">
        {!comprobante ? null : (
          <div className="form-stack">
            <div className="summary-box">
              <div className="split"><span className="small muted">Pedido</span><strong>{comprobante.codigo}</strong></div>
              <div className="split mt-8"><span className="small muted">Total entregado</span><strong><Money value={comprobante.total} /></strong></div>
              <div className="split mt-8"><span className="small muted">Estado</span><strong>{comprobante.estado}</strong></div>
              <div className="split mt-8"><span className="small muted">Entregado</span><strong>{comprobante.fecha_entrega ? new Date(comprobante.fecha_entrega).toLocaleString('es-BO') : '—'}</strong></div>
            </div>
            {comprobante.firma_url && (
              <div className="field"><label>Firma del receptor</label><img src={comprobante.firma_url} alt="Firma" style={{ maxWidth: '100%', height: 110, border: '1px solid var(--line)', borderRadius: 8 }} /></div>
            )}
            <div className="notice notice-info"><Receipt size={14} /> Elige el tipo de comprobante, compártelo por WhatsApp o imprímelo para el cliente.</div>
            <div className="inline">
              <BotonWhatsapp tipo="entrega" clienteId={comprobante.cliente_id} pedidoId={comprobante.id} telefono={comprobante.cliente_telefono} latitud={comprobante.cliente_latitud} longitud={comprobante.cliente_longitud} monto={comprobante.total} label="Compartir por WhatsApp" />
              <button className="btn btn-outline" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
              <button className="btn btn-soft" onClick={() => setComprobante(null)}>Cerrar</button>
            </div>
          </div>
        )}
      </Modal>

      <Confirm
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        onConfirm={() => cambiarEstadoRuta(confirm)}
        title={confirm === 'en_camino' ? 'Iniciar ruta' : confirm === 'completada' ? 'Cerrar ruta' : 'Cancelar ruta'}
        message={confirm === 'en_camino' ? 'Los pedidos asignados pasarán a estado "enviado".' : confirm === 'completada' ? 'Se marcarán como entregados los pedidos confirmados. Las paradas pendientes quedarán abiertas.' : 'Los pedidos volverán a estar disponibles para asignar a otra ruta.'}
        danger={confirm === 'cancelada'}
        loading={busy}
      />
    </>
  );
}
