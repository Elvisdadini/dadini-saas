import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, CheckCircle2, CircleDollarSign, Clock3, CreditCard, Crosshair,
  MapPin, Navigation, Package, PackageCheck, Phone, Printer, Receipt, Truck, UserRound, Wallet, X,
} from 'lucide-react';
import { api } from '../api';
import { puede, useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import FirmaCanvas from '../components/FirmaCanvas';
import { distanciaMetros, esCoordenaValida, formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, Confirm, Estado, Fecha, Modal, Money, PageHeader, SkeletonRows, useToast } from '../ui';

function horarioLocal(valor) {
  return new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(valor));
}

const PASOS = ['pendiente', 'preparando', 'enviado', 'entregado'];
const PASO_LABEL = { pendiente: 'Pedido registrado', preparando: 'En preparación', enviado: 'En camino', entregado: 'Entregado' };

export default function PedidoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { user } = useAuth();
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [routeOpen, setRouteOpen] = useState(false);
  const [rutas, setRutas] = useState([]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [pay, setPay] = useState({ monto: '', metodo: 'efectivo', nota: '', numero_comprobante: '', tipo_comprobante: 'recibo' });
  const [ultimoPago, setUltimoPago] = useState(null);
  const [busy, setBusy] = useState(false);
  const [selectedRuta, setSelectedRuta] = useState('');
  const [visitas, setVisitas] = useState([]);
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [geocerca, setGeocerca] = useState({ aplica: false });
  const [firmaModal, setFirmaModal] = useState(false);
  const [firma, setFirma] = useState(null);
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajuste, setAjuste] = useState({ accion: 'agregar', producto_id: '', cantidad: 1 });
  const [productos, setProductos] = useState([]);
  const [estadoVentas, setEstadoVentas] = useState(null);

  const cargar = useCallback(async () => {
    try {
      const data = await api.get(`/pedidos/${id}`);
      setPedido(data.pedido);
      setPay((p) => ({ ...p, monto: (data.pedido.total_a_cobrar || data.pedido.saldo).toFixed(2) }));
    } catch (error) {
      toast(error.message, 'error');
      navigate('/ventas');
    } finally {
      setLoading(false);
    }
  }, [id, navigate, toast]);

  const cargarVisitas = async () => {
    try {
      const r = await api.get(`/visitas?pedido_id=${id}&limit=10`);
      setVisitas(r.visitas || []);
    } catch (error) { /* no bloquea el detalle */ }
  };

  useEffect(() => { cargar(); cargarVisitas(); }, [cargar]);

  useEffect(() => {
    api.get('/configuracion/estado-ventas').then(setEstadoVentas).catch(() => {});
    api.get('/productos?todos=true').then((r) => setProductos(r.productos || [])).catch(() => {});
  }, []);

  const DOC_LABEL = { factura_siat: 'Factura SIN', comprobante_entrega: 'Comprobante de entrega' };
  const esMio = Number(pedido?.vendedor_id || pedido?.usuario_id) === Number(user?.id);
  const esVendedor = ['ventas', 'preventista', 'vendedor_camion'].includes(user?.rol);
  const puedeAjustar = Boolean(pedido && esVendedor && esMio && estadoVentas?.permitido
    && ['pendiente', 'preparando'].includes(pedido.estado)
    && horarioLocal(pedido.created_at) === horarioLocal(new Date().toISOString()));

  const registrarVisita = async () => {
    setUbicando(true);
    try {
      const punto = await obtenerUbicacion();
      await api.post('/visitas', {
        cliente_id: pedido.cliente_id,
        pedido_id: pedido.id,
        tipo: 'venta',
        modulo: 'Ventas',
        estado: 'completada',
        notas: `Visita comercial al pedido ${pedido.codigo}`,
        ...punto,
      });
      setUbicacion(punto);
      await cargarVisitas();
      toast('Visita geolocalizada registrada');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUbicando(false);
    }
  };

  const pasoActual = pedido ? PASOS.indexOf(pedido.estado) : -1;
  const siguiente = pedido && PASOS[pasoActual + 1];

  const abrirRutas = async () => {
    setRouteOpen(true);
    try {
      const data = await api.get('/rutas');
      setRutas(data.rutas.filter((r) => r.estado !== 'completada' && r.estado !== 'cancelada'));
      setSelectedRuta(pedido?.ruta_id ? String(pedido.ruta_id) : '');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const avanzar = async (estado, firmaCliente = null) => {
    setBusy(true);
    try {
      const data = await api.patch(`/pedidos/${id}/estado`, { estado, firma: firmaCliente });
      setPedido(data.pedido);
      toast(`Pedido actualizado a "${estado}".`);
      setConfirmCancel(false);
      setFirmaModal(false);
      setFirma(null);
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  const guardarAjuste = async () => {
    setBusy(true);
    try {
      const campo = ajuste.accion === 'agregar' ? 'agregar' : 'disminuir';
      const data = await api.patch(`/pedidos/${id}/items`, {
        [campo]: [{ producto_id: Number(ajuste.producto_id), cantidad: Number(ajuste.cantidad) }],
      });
      setPedido(data.pedido);
      setPay((p) => ({ ...p, monto: (data.pedido.total_a_cobrar || data.pedido.saldo).toFixed(2) }));
      setAjusteOpen(false);
      toast('Pedido ajustado y stock actualizado');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  useEffect(() => {
    if (!pedido?.cliente_id) { setGeocerca({ aplica: false }); return; }
    api.get(`/geo/geocerca?cliente_id=${pedido.cliente_id}&accion=cobranza`)
      .then(setGeocerca)
      .catch(() => setGeocerca({ aplica: false }));
  }, [pedido?.cliente_id]);

  const distanciaCliente = ubicacion && pedido
    ? distanciaMetros(ubicacion, { latitud: pedido.cliente_latitud, longitud: pedido.cliente_longitud })
    : null;

  const capturarUbicacion = async () => {
    setUbicando(true);
    try { setUbicacion(await obtenerUbicacion()); toast('Ubicación capturada'); }
    catch (error) { toast(error.message, 'error'); }
    finally { setUbicando(false); }
  };

  const abrirPago = () => {
    setUltimoPago(null);
    setPay({ monto: (pedido?.total_a_cobrar || pedido?.saldo || 0).toFixed(2), metodo: 'efectivo', nota: '', numero_comprobante: '', tipo_comprobante: 'recibo' });
    setPayOpen(true);
  };

  const registrarPago = async () => {
    let ubicacionFinal = ubicacion;
    if (geocerca.aplica) {
      if (!ubicacionFinal) {
        try { ubicacionFinal = await obtenerUbicacion(); setUbicacion(ubicacionFinal); }
        catch (error) { return toast(`Geocerca activa: ${error.message}`, 'error'); }
      }
      const distancia = distanciaMetros(ubicacionFinal, { latitud: pedido?.cliente_latitud, longitud: pedido?.cliente_longitud });
      if (distancia === null) return toast('El cliente no tiene ubicación registrada; no se puede validar la geocerca.', 'error');
      if (distancia > geocerca.radio_m) {
        return toast(`Estás a ${distancia} m del cliente. Límite ${geocerca.radio_m} m; no se puede registrar el cobro.`, 'error');
      }
    }
    setBusy(true);
    try {
      const data = await api.post(`/pedidos/${id}/pagos`, {
        monto: Number(pay.monto), metodo: pay.metodo, nota: pay.nota,
        numero_comprobante: pay.numero_comprobante, tipo_comprobante: pay.tipo_comprobante,
        latitud: ubicacionFinal?.latitud, longitud: ubicacionFinal?.longitud, precision: ubicacionFinal?.precision,
      });
      setPedido(data.pedido);
      setUltimoPago(data.pago);
      toast('Pago registrado. Envía el comprobante al WhatsApp del cliente.');
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  const asignarRuta = async () => {
    setBusy(true);
    try {
      const data = await api.patch(`/pedidos/${id}/asignar-ruta`, { ruta_id: selectedRuta ? Number(selectedRuta) : null });
      setPedido(data.pedido);
      setRouteOpen(false);
      toast(selectedRuta ? 'Pedido asignado a la ruta' : 'Pedido removido de la ruta');
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  const puedeCobrar = useMemo(() => puede(user, 'cobranzas'), [user]);
  const puedeRuta = useMemo(() => puede(user, 'distribucion'), [user]);
  const puedeVender = useMemo(() => puede(user, 'ventas'), [user]);

  if (loading) return <><PageHeader title="Detalle del pedido" subtitle="Cargando…" /><div className="panel"><SkeletonRows rows={9} /></div></>;
  if (!pedido) return null;

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Detalle"
        title={pedido.codigo}
        subtitle={<span>Registrado el <Fecha value={pedido.created_at} time /> por {pedido.vendedor_nombre}</span>}
        actions={(
          <>
            <button className="btn btn-ghost" onClick={() => navigate('/ventas')}><ArrowLeft size={15} /> Volver</button>
            <button className="btn btn-outline" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
            <Link className="btn btn-soft" to={`/crm?cliente=${pedido.cliente_id}`} title="Abrir ficha 360° del cliente (RFM, historial y notas)"><UserRound size={14} /> Ver cliente 360°</Link>
            {puedeAjustar && <button className="btn btn-outline" onClick={() => setAjusteOpen(true)}><Package size={14} /> Ajustar pedido</button>}
            <BotonWhatsapp tipo="pedido" clienteId={pedido.cliente_id} pedidoId={pedido.id} telefono={pedido.cliente_telefono} latitud={pedido.cliente_latitud} longitud={pedido.cliente_longitud} monto={pedido.total} label="Enviar pedido" />
            {pedido.saldo > 0 && pedido.estado !== 'cancelado' && puedeCobrar && <button className="btn btn-primary" onClick={abrirPago}><Wallet size={14} /> Registrar cobro</button>}
            {siguiente && puedeVender && <button className="btn btn-navy" onClick={() => {
              if (siguiente === 'entregado') { setFirma(null); setFirmaModal(true); }
              else avanzar(siguiente);
            }} disabled={busy}>Pasar a {siguiente} <ArrowRight size={14} /></button>}
          </>
        )}
      />

      <div className="inline mb-16">
        <Estado valor={pedido.estado} />
        <Estado valor={pedido.estado_pago} />
        <Badge tone="gray"><Receipt size={11} /> {pedido.forma_pago}</Badge>
        <Badge tone="gray"><Package size={11} /> {pedido.canal}</Badge>
        {pedido.documento_entrega && <Badge tone="blue"><Receipt size={11} /> {DOC_LABEL[pedido.documento_entrega] || pedido.documento_entrega}</Badge>}
        {pedido.ruta_codigo && <Badge tone="purple"><Truck size={11} /> {pedido.ruta_codigo}</Badge>}
        {pedido.carga_codigo && <Badge tone="orange"><PackageCheck size={11} /> {pedido.carga_codigo}</Badge>}
        {pedido.vencido && <Badge tone="red">Vencido hace {pedido.dias_vencido} días</Badge>}
      </div>

      {pedido.forma_pago === 'credito' && (
        <div className="inline mb-16">
          <Badge tone="blue">Plazo {pedido.dias_credito || '—'} días</Badge>
          <Badge tone="gray">Vence <Fecha value={pedido.vencimiento} short /></Badge>
          {pedido.interes_pendiente > 0 && <Badge tone="red">Interés Bs {Number(pedido.interes_pendiente).toFixed(2)}</Badge>}
          {pedido.total_a_cobrar > pedido.saldo && <Badge tone="orange">A cobrar Bs {Number(pedido.total_a_cobrar).toFixed(2)}</Badge>}
        </div>
      )}

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Seguimiento geolocalizado de la visita</h3><p>Coordenadas del cliente y check-ins del equipo</p></div>
          {puedeVender && <button className="btn btn-soft btn-sm" onClick={registrarVisita} disabled={ubicando || !pedido.cliente_latitud}>
            <Crosshair size={13} /> {ubicando ? 'Ubicando…' : 'Registrar visita aquí'}
          </button>}
        </div>
        <div className="panel-body">
          <p className="small muted mb-8">
            <MapPin size={12} /> {pedido.cliente_nombre} · {formatoCoords(pedido.cliente_latitud, pedido.cliente_longitud)}
            {ubicacion && <> · Tu última ubicación: {formatoCoords(ubicacion.latitud, ubicacion.longitud)}</>}
          </p>
          <Mapa altura={240} linea puntos={[
            ...(pedido.cliente_latitud ? [{ id: 'cliente', latitud: pedido.cliente_latitud, longitud: pedido.cliente_longitud, nombre: pedido.cliente_nombre, descripcion: pedido.entrega_direccion, tipo: 'cliente' }] : []),
            ...visitas.map((v) => ({ id: v.id, latitud: v.latitud, longitud: v.longitud, nombre: `${v.tipo} · ${v.usuario_nombre}`, descripcion: v.notas, tipo: v.tipo })),
          ]} />
          {visitas.length > 0 && (
            <div className="geo-lista mt-8">
              {visitas.slice(0, 4).map((v) => (
                <div className="geo-lista-item" key={v.id}>
                  <Navigation size={13} />
                  <div><strong>{v.tipo}</strong><span>{v.notas || 'Visita registrada'}</span></div>
                  <small><Fecha value={v.fecha} short /></small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="detail-grid">
        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head"><div><h3>Productos del pedido</h3><p>{pedido.items_count} unidades · {pedido.almacen_nombre}</p></div><span className="badge badge-navy">{pedido.items.length} líneas</span></div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Producto</th><th className="num">Precio</th><th className="num">Cantidad</th><th className="num">Subtotal</th></tr></thead>
                <tbody>
                  {pedido.items.map((it) => (
                    <tr key={it.producto_id}>
                      <td><span style={{ fontSize: 16, marginRight: 7 }}>{it.emoji || '📦'}</span><span className="cell-strong">{it.nombre}</span></td>
                      <td className="num"><Money value={it.precio} /></td>
                      <td className="num">{it.cantidad}</td>
                      <td className="num cell-strong"><Money value={it.subtotal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="panel-foot" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5 }}>
              <div className="split" style={{ fontSize: 11.5 }}><span className="muted">Subtotal</span><strong><Money value={pedido.subtotal} /></strong></div>
              <div className="split" style={{ fontSize: 11.5 }}><span className="muted">Descuento</span><strong>- <Money value={pedido.descuento} /></strong></div>
              <div className="split" style={{ fontSize: 11.5 }}><span className="muted">Envío</span><strong><Money value={pedido.envio} /></strong></div>
              <div className="split" style={{ fontSize: 15, paddingTop: 6, borderTop: '1px solid var(--line)' }}><strong>Total</strong><strong><Money value={pedido.total} /></strong></div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Línea de tiempo</h3><span className="panel-sub">Estado actual: {pedido.estado}</span></div>
            <div className="panel-body">
              <div className="timeline">
                {PASOS.map((paso, i) => {
                  const done = i < pasoActual || pedido.estado === 'entregado';
                  const current = i === pasoActual && pedido.estado !== 'entregado';
                  return (
                    <div className="timeline-item" key={paso}>
                      <span className={`timeline-dot ${done ? 'done' : current ? 'current' : ''}`}>{done ? <Check size={12} /> : current ? <Clock3 size={12} /> : <span style={{ fontSize: 9 }}>{i + 1}</span>}</span>
                      <div className="timeline-copy">
                        <strong>{PASO_LABEL[paso]}</strong>
                        <span>{i === 0 ? <Fecha value={pedido.created_at} time /> : done ? 'Completado' : current ? 'En curso' : 'Pendiente'}</span>
                      </div>
                    </div>
                  );
                })}
                {pedido.estado === 'cancelado' && (
                  <div className="timeline-item">
                    <span className="timeline-dot" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}><X size={12} /></span>
                    <div className="timeline-copy"><strong>Pedido cancelado</strong><span>El stock fue devuelto al almacén.</span></div>
                  </div>
                )}
              </div>
              {['pendiente', 'preparando', 'enviado'].includes(pedido.estado) && puedeVender && (
                <button className="btn btn-danger-soft btn-sm mt-16" onClick={() => setConfirmCancel(true)}>Cancelar pedido y devolver stock</button>
              )}
            </div>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head"><h3>Cliente</h3><Badge tone={pedido.cliente_tipo === 'mayorista' ? 'purple' : 'blue'}>{pedido.cliente_tipo}</Badge></div>
            <div className="panel-body">
              <div className="inline mb-12">
                <span className="avatar avatar-navy" style={{ width: 38, height: 38 }}><UserRound size={18} /></span>
                <div><strong style={{ display: 'block', fontSize: 13 }}>{pedido.cliente_nombre}</strong><span className="small muted">{pedido.cliente_zona}</span></div>
              </div>
              <div className="info-grid">
                <div className="info-row"><span>Teléfono</span><strong>{pedido.cliente_telefono || '—'}</strong></div>
                <div className="info-row"><span>Saldo cliente</span><strong className={pedido.cliente?.saldo > 0 ? 'text-red' : ''}><Money value={pedido.cliente?.saldo} /></strong></div>
                <div className="info-row"><span>Límite de crédito</span><strong><Money value={pedido.cliente?.limite_credito} /></strong></div>
                <div className="info-row"><span>Condición</span><strong>{pedido.forma_pago === 'credito' ? `Crédito ${pedido.cliente?.limite_credito ? '' : 'no habilitado'}` : 'Contado'}</strong></div>
              </div>
              <div className="divider" />
              <div className="info-row"><span>Dirección de entrega</span><strong style={{ display: 'flex', gap: 5 }}><MapPin size={13} style={{ marginTop: 2, color: 'var(--muted)' }} />{pedido.entrega_direccion || 'Sin dirección'}</strong></div>
              {pedido.notas && <div className="notice notice-info mt-12">{pedido.notas}</div>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Cobros</h3><span className="panel-sub">{pedido.pagos.length} movimientos</span></div>
            <div className="panel-body">
              <div className="summary-box mb-12">
                <div className="split"><span className="small muted">Total pedido</span><strong><Money value={pedido.total} /></strong></div>
                <div className="split" style={{ marginTop: 5 }}><span className="small muted">Pagado</span><strong className="text-green"><Money value={pedido.pagado} /></strong></div>
                <div className="split" style={{ marginTop: 5 }}><span className="small muted">Saldo</span><strong className={pedido.saldo > 0 ? 'text-orange' : 'text-green'}><Money value={pedido.saldo} /></strong></div>
                {pedido.interes_pendiente > 0 && <div className="split" style={{ marginTop: 5 }}><span className="small muted">Interés por mora</span><strong className="text-red"><Money value={pedido.interes_pendiente} /></strong></div>}
              </div>
              {pedido.pagos.length === 0 && <p className="small muted">Aún no hay pagos registrados.</p>}
              {pedido.pagos.map((p) => (
                <div className="pay-row" key={p.id}>
                  <div><strong style={{ display: 'block', fontSize: 11.5 }}>{p.codigo} · {p.metodo}</strong><span className="small muted"><Fecha value={p.fecha} short /></span></div>
                  <Money value={p.monto} />
                </div>
              ))}
              {pedido.saldo > 0 && puedeCobrar && <button className="btn btn-soft btn-sm btn-block mt-12" onClick={abrirPago}><CircleDollarSign size={14} /> Registrar pago</button>}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Entrega y ruta</h3></div>
            <div className="panel-body">
              <div className="info-row"><span>Reparto</span><strong>{pedido.canal === 'delivery' ? 'Delivery a domicilio' : pedido.canal === 'ruta' ? 'Reparto en ruta' : 'Entrega en mostrador'}</strong></div>
              <div className="info-row mt-8"><span>Ruta asignada</span><strong>{pedido.ruta_codigo || 'Sin ruta asignada'}</strong></div>
              <div className="info-row mt-8"><span>Documento a entregar</span><strong>{DOC_LABEL[pedido.documento_entrega] || 'Comprobante de entrega'}</strong></div>
              <div className="info-row mt-8"><span>Vencimiento de cobro</span><strong>{pedido.saldo > 0 ? <Fecha value={pedido.vencimiento} /> : 'Pagado'}</strong></div>
              {pedido.fecha_entrega && <div className="info-row mt-8"><span>Fecha de entrega</span><strong>{new Date(pedido.fecha_entrega).toLocaleString('es-BO')}</strong></div>}
              {pedido.firma_url && (
                <div className="mt-12"><span className="small muted">Firma de recepción</span><img src={pedido.firma_url} alt="Firma del cliente" style={{ display: 'block', maxWidth: '100%', height: 100, border: '1px solid var(--line)', borderRadius: 8, marginTop: 6 }} /></div>
              )}
              {puedeRuta && (
                <button className="btn btn-outline btn-sm btn-block mt-12" onClick={abrirRutas}><Truck size={14} /> {pedido.ruta_id ? 'Cambiar de ruta' : 'Asignar a una ruta'}</button>
              )}
              {pedido.estado === 'entregado' && pedido.saldo > 0 && (
                <div className="notice notice-warn mt-12"><CreditCard size={14} /> Pedido entregado con saldo pendiente. Gestiona el cobro en el módulo de cobranzas.</div>
              )}
            </div>
          </div>

          <div className="panel print-only">
            <div className="panel-body">
              <h3>DADINI · {DOC_LABEL[pedido.documento_entrega] || 'Comprobante de entrega'}</h3>
              <p className="small">Pedido {pedido.codigo} · {pedido.cliente_nombre} · {new Date(pedido.created_at).toLocaleString('es-BO')}</p>
              <table className="data-table mt-8"><thead><tr><th>Producto</th><th>Cantidad</th><th>P. unit.</th><th>Subtotal</th></tr></thead><tbody>
                {(pedido.items || []).map((l, i) => <tr key={i}><td>{l.nombre}</td><td>{l.cantidad}</td><td>Bs {Number(l.precio || 0).toFixed(2)}</td><td>Bs {Number(l.subtotal || 0).toFixed(2)}</td></tr>)}
              </tbody></table>
              <p className="small mt-8"><strong>Total Bs {Number(pedido.total || 0).toFixed(2)}</strong> · Saldo Bs {Number(pedido.saldo || 0).toFixed(2)}</p>
              {pedido.documento_entrega === 'factura_siat' && pedido.factura && <p className="small">Factura N° {pedido.factura.numero} · NIT {pedido.factura.nit} · IVA Bs {Number(pedido.factura.iva || 0).toFixed(2)} · IT Bs {Number(pedido.factura.it || 0).toFixed(2)}</p>}
              <p className="small muted">Documento a imprimir por almacén o distribuidor, o enviado por WhatsApp por el distribuidor.</p>
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Registrar cobro"
        subtitle={`${pedido.codigo} · Saldo pendiente Bs ${pedido.saldo.toFixed(2)}`}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setPayOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={registrarPago} disabled={busy}>{busy ? 'Registrando…' : 'Confirmar cobro'}</button>
          </>
        )}
      >
        <div className="form-stack">
          {geocerca.aplica && (
            <div className={`notice ${distanciaCliente !== null && distanciaCliente > geocerca.radio_m ? 'notice-danger' : 'notice-warn'}`}>
              <AlertTriangle size={14} />
              Geocerca activa · límite {geocerca.radio_m} m
              {distanciaCliente !== null ? ` · distancia ${distanciaCliente} m` : ' · captura tu ubicación'}
              <button type="button" className="btn btn-soft btn-sm" onClick={capturarUbicacion} disabled={ubicando}>
                <Crosshair size={13} /> {ubicando ? 'Ubicando…' : ubicacion ? 'Actualizar' : 'Capturar ubicación'}
              </button>
            </div>
          )}
          <div className="field"><label>Monto a cobrar (Bs) <span className="req">*</span></label><input type="number" min="0.01" step="0.01" max={pedido.total_a_cobrar || pedido.saldo} className="input" value={pay.monto} onChange={(e) => setPay({ ...pay, monto: e.target.value })} /><span className="hint">Máximo: Bs {(pedido.total_a_cobrar || pedido.saldo).toFixed(2)} (incluye intereses)</span></div>
          <div className="field"><label>Método de pago</label>
            <select className="select" value={pay.metodo} onChange={(e) => setPay({ ...pay, metodo: e.target.value })}>
              <option value="efectivo">Efectivo</option><option value="qr">QR simple</option><option value="transferencia">Transferencia</option>
            </select>
          </div>
          <div className="field"><label>Nota</label><input className="input" placeholder="Referencia del pago…" value={pay.nota} onChange={(e) => setPay({ ...pay, nota: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Tipo de comprobante</label><select className="select" value={pay.tipo_comprobante} onChange={(e) => setPay({ ...pay, tipo_comprobante: e.target.value })}><option value="recibo">Recibo</option><option value="factura">Factura</option><option value="boleta">Boleta</option><option value="transferencia">Transferencia</option></select></div>
            <div className="field"><label>Nro. de comprobante / factura</label><input className="input" value={pay.numero_comprobante} onChange={(e) => setPay({ ...pay, numero_comprobante: e.target.value })} placeholder="Ej. REC-0042" /></div>
          </div>
          {ultimoPago && (
            <div className="notice notice-info">
              Comprobante <strong>{ultimoPago.numero_comprobante || ultimoPago.codigo}</strong> registrado.
              <div style={{ marginTop: 8 }}>
                <BotonWhatsapp tipo="cobranza" clienteId={pedido.cliente_id} pedidoId={pedido.id} telefono={pedido.cliente_whatsapp} monto={ultimoPago.monto} numeroComprobante={ultimoPago.numero_comprobante} tipoComprobante={ultimoPago.tipo_comprobante} label="Enviar comprobante al WhatsApp" />
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        title="Asignar pedido a ruta"
        subtitle="Selecciona una ruta activa para incluir esta entrega."
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setRouteOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={asignarRuta} disabled={busy}>{busy ? 'Guardando…' : 'Guardar asignación'}</button>
          </>
        )}
      >
        <div className="form-stack">
          <div className="field"><label>Ruta</label>
            <select className="select" value={selectedRuta} onChange={(e) => setSelectedRuta(e.target.value)}>
              <option value="">Sin ruta asignada</option>
              {rutas.map((r) => <option key={r.id} value={r.id}>{r.codigo} · {r.fecha} · {r.repartidor_nombre} ({r.total_paradas} paradas)</option>)}
            </select>
          </div>
          {rutas.length === 0 && <div className="notice notice-warn"><Truck size={15} /> No hay rutas activas. Crea una ruta desde el módulo de distribución.</div>}
        </div>
      </Modal>

      <Modal open={firmaModal} onClose={() => setFirmaModal(false)} title="Confirmar entrega con firma"
        subtitle={`${pedido?.codigo || ''} · ${pedido?.cliente_nombre || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setFirmaModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={() => avanzar('entregado', firma)} disabled={busy || !firma}>{busy ? 'Guardando…' : 'Confirmar entrega'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><CheckCircle2 size={14} /> Pide al cliente o receptor que firme antes de marcar el pedido como entregado.</div>
          <FirmaCanvas value={firma} onChange={setFirma} label="Firma de quien recibe" />
        </div>
      </Modal>

      <Modal open={ajusteOpen} onClose={() => setAjusteOpen(false)} title={`Ajustar ${pedido?.codigo || ''}`} subtitle="Solo disponible hoy, antes del cierre del día"
        footer={<><button className="btn btn-ghost" onClick={() => setAjusteOpen(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAjuste} disabled={busy || !ajuste.producto_id}><Package size={14} /> {busy ? 'Guardando…' : 'Aplicar ajuste'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><Clock3 size={14} /> Puedes agregar o quitar unidades de tus pedidos de hoy hasta las {estadoVentas?.hora_limite || '17:00'} o hasta que almacén cierre el día. El stock se ajusta automáticamente por FEFO.</div>
          <div className="field"><label>Acción</label><select className="select" value={ajuste.accion} onChange={(e) => setAjuste({ ...ajuste, accion: e.target.value })}><option value="agregar">Agregar productos al pedido</option><option value="disminuir">Quitar productos del pedido</option></select></div>
          <div className="field-row">
            <div className="field"><label>Producto</label><select className="select" value={ajuste.producto_id} onChange={(e) => setAjuste({ ...ajuste, producto_id: e.target.value })}><option value="">Seleccionar…</option>{productos.filter((p) => p.activo !== false).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
            <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" step="1" value={ajuste.cantidad} onChange={(e) => setAjuste({ ...ajuste, cantidad: e.target.value })} /></div>
          </div>
        </div>
      </Modal>

      <Confirm
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => avanzar('cancelado')}
        title="Cancelar pedido"
        message="El pedido se marcará como cancelado y las unidades volverán al inventario. Esta acción no se puede deshacer."
        danger
        loading={busy}
      />
    </>
  );
}
