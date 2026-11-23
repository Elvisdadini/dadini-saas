import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, BarChart3, CalendarClock, CircleDollarSign, Crosshair, CreditCard, HandCoins, MapPin, Navigation, Receipt, Search, UserX, Users, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import { formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, EmptyState, Estado, Fecha, Modal, Money, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';

export default function Cobranzas() {
  const { user } = useAuth();
  const toast = useToast();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('facturas');
  const [search, setSearch] = useState('');
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [pay, setPay] = useState({ monto: '', metodo: 'efectivo', nota: '', numero_comprobante: '', tipo_comprobante: 'recibo' });
  const [ultimoComprobante, setUltimoComprobante] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [visitas, setVisitas] = useState([]);
  const [detalle, setDetalle] = useState(null);
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  const [cobranzaMapa, setCobranzaMapa] = useState(null);
  const [cobranzaMapaForm, setCobranzaMapaForm] = useState({ motivo: 'sin_dinero', notas: '', latitud: '', longitud: '' });

  const cargar = async () => {
    setLoading(true);
    try {
      setData(await api.get(`/cobranzas?solo=1`));
    } catch (error) {
      toast(error.message, 'error');
    } finally { setLoading(false); }
  };

  const cargarVisitas = async () => {
    try {
      const r = await api.get('/visitas?tipo=cobranza&limit=12');
      setVisitas(r.visitas || []);
    } catch (error) { /* no bloquea la pantalla */ }
  };

  useEffect(() => {
    cargar();
    cargarVisitas();
    const timer = window.setInterval(cargarVisitas, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const clienteId = Number(params.get('cliente'));
    if (!clienteId || !data?.pedidos) return;
    const factura = data.pedidos.find((p) => p.cliente_id === clienteId);
    if (factura) {
      setSelected(factura);
      setPay({ monto: (factura.total_a_cobrar || factura.saldo).toFixed(2), metodo: 'efectivo', nota: '' });
      setPayOpen(true);
    }
  }, [params, data]);

  const pedidos = useMemo(() => {
    let items = data?.pedidos || [];
    if (soloVencidas) items = items.filter((p) => p.vencido);
    if (search) items = items.filter((p) => `${p.codigo} ${p.cliente_nombre} ${p.cliente_zona}`.toLowerCase().includes(search.toLowerCase()));
    return items;
  }, [data, soloVencidas, search]);

  const abrirCobro = (p) => {
    setSelected(p);
    setUbicacion(null);
    setPay({ monto: (p.total_a_cobrar || p.saldo).toFixed(2), metodo: 'efectivo', nota: '', numero_comprobante: '', tipo_comprobante: 'recibo' });
    setUltimoComprobante(null);
    setPayOpen(true);
  };

  const abrirCobranzaMapa = async (factura) => {
    let ubicacion = null;
    try { ubicacion = await obtenerUbicacion(); } catch (error) { toast(error.message, 'error'); }
    setCobranzaMapaForm({
      motivo: 'sin_dinero', notas: '',
      latitud: ubicacion?.latitud ?? factura.cliente_latitud ?? '',
      longitud: ubicacion?.longitud ?? factura.cliente_longitud ?? '',
    });
    setCobranzaMapa(factura);
  };

  const guardarNoPago = async () => {
    if (!cobranzaMapa) return;
    try {
      await api.post('/visitas', {
        cliente_id: cobranzaMapa.cliente_id,
        pedido_id: cobranzaMapa.id,
        tipo: 'cobranza',
        modulo: 'Cobranzas',
        estado: 'completada',
        resultado: 'no_pago',
        motivo: cobranzaMapaForm.motivo,
        notas: cobranzaMapaForm.notas || `Sin pago: ${cobranzaMapaForm.motivo}`,
        latitud: cobranzaMapaForm.latitud,
        longitud: cobranzaMapaForm.longitud,
      });
      toast('Visita de cobranza sin pago registrada');
      setCobranzaMapa(null);
      await cargar();
      await cargarVisitas();
    } catch (error) { toast(error.message, 'error'); }
  };

  const capturarUbicacion = async () => {
    setUbicando(true);
    try {
      setUbicacion(await obtenerUbicacion());
      toast('Ubicación de la visita capturada');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUbicando(false);
    }
  };

  const cobrar = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const respuesta = await api.post(`/pedidos/${selected.id}/pagos`, {
        monto: Number(pay.monto),
        metodo: pay.metodo,
        nota: pay.nota,
        numero_comprobante: pay.numero_comprobante,
        tipo_comprobante: pay.tipo_comprobante,
        latitud: ubicacion?.latitud,
        longitud: ubicacion?.longitud,
        precision: ubicacion?.precision,
      });
      setUltimoComprobante({ pago: respuesta.pago, pedido: respuesta.pedido || selected });
      toast(`Cobro registrado para ${selected.codigo}. Envía el comprobante al WhatsApp del cliente.`);
      cargar();
      cargarVisitas();
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  const resumen = data?.resumen || {};
  const buckets = data?.buckets || [];

  return (
    <>
      <PageHeader
        eyebrow="Cuentas por cobrar"
        title="Cobranzas"
        subtitle={['ventas', 'preventista'].includes(user?.rol)
          ? 'Cobra tus ventas a crédito mientras estén al día. Al vencerse, la cuenta pasa automáticamente a Cobranzas.'
          : 'Solo cuentas vencidas. Las ventas a crédito al día son cobradas por su vendedor.'}
        actions={(
          <>
            <button className={`btn ${avanceAbierto ? 'btn-navy' : 'btn-primary'}`} onClick={() => setAvanceAbierto(!avanceAbierto)}>
              <BarChart3 size={14} /> {avanceAbierto ? 'Ocultar avance de ruta' : 'Avance de ruta'}
            </button>
            <button className="btn btn-outline" onClick={cargar}><Receipt size={14} /> Actualizar cartera</button>
          </>
        )}
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Total por cobrar" value={<Money value={resumen.total} />} icon={Wallet} tone="orange" hint={`${resumen.facturas || 0} facturas · ${resumen.responsable === 'cobrador' ? 'solo mora' : resumen.responsable === 'vendedor' ? 'tus créditos al día' : 'cartera total'} · interés Bs ${(resumen.interes || 0).toFixed(2)}`} />
        <StatCard label="Monto vencido" value={<Money value={resumen.vencido} />} icon={AlertTriangle} tone="red" hint={`${resumen.vencidas || 0} facturas vencidas`} />
        <StatCard label="Clientes con deuda" value={resumen.clientes || 0} icon={Users} tone="purple" hint="En seguimiento" />
        <StatCard label="Cobrado recientemente" value={<Money value={(data?.pagos || []).slice(0, 10).reduce((s, p) => s + p.monto, 0)} />} icon={HandCoins} tone="green" hint="Últimos movimientos" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Visitas de cobranza en tiempo real</h3><p>Ubicaciones registradas por el equipo · se actualiza cada 15 s</p></div>
          <span className="badge badge-green">{visitas.filter((v) => v.estado === 'en_curso').length} en curso</span>
        </div>
        <div className="panel-body">
          <div className="grid" style={{ gridTemplateColumns: '1.1fr 1fr', gap: 14 }}>
            <Mapa altura={240} puntos={visitas.map((v) => ({ id: v.id, latitud: v.latitud, longitud: v.longitud, nombre: v.cliente_nombre, descripcion: v.notas, tipo: 'cobranza' }))} />
            <div className="geo-lista">
              {visitas.length === 0 && <p className="small muted">Todavía no hay visitas de cobranza geolocalizadas.</p>}
              {visitas.slice(0, 6).map((v) => (
                <div className="geo-lista-item" key={v.id}>
                  <MapPin size={13} />
                  <div><strong>{v.cliente_nombre}</strong><span>{v.notas || 'Visita registrada'} · {formatoCoords(v.latitud, v.longitud)}</span></div>
                  <small>{v.estado === 'en_curso' ? 'En curso' : 'Completada'}</small>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Mapa de facturas por estado</h3><p>Verde al día, naranja por cobrar, rojo vencido · clic en una tarjeta de la tabla para gestionar</p></div>
          <span className="badge badge-orange">{pedidos.length} facturas</span>
        </div>
        <div className="panel-body">
          <Mapa altura={260} puntos={pedidos.filter((p) => p.cliente_latitud).map((p) => ({
            id: `fac-${p.id}`,
            latitud: p.cliente_latitud,
            longitud: p.cliente_longitud,
            nombre: `${p.cliente_nombre} · ${p.codigo}`,
            descripcion: `Vence ${p.vencimiento} · saldo Bs ${Number(p.saldo || 0).toFixed(2)}`,
            tipo: 'cobranza',
            estado: p.estado_pago === 'pagado' ? 'pagado' : p.vencido ? 'vencido' : 'pendiente',
            acciones: [
              { label: 'Registrar cobranza', tone: 'green', onClick: (punto) => { const factura = pedidos.find((x) => x.id === Number(String(punto.id).replace('fac-', ''))); if (factura) abrirCobranzaMapa(factura); } },
            ],
          }))} />
        </div>
      </div>

      <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
        {buckets.map((b) => (
          <div className="card card-pad" key={b.clave} style={{ padding: 14 }}>
            <div className="split"><span className="small muted">{b.label}</span><Badge tone={b.clave === 'corriente' ? 'green' : b.clave === '1_15' ? 'amber' : 'red'}>{b.cantidad}</Badge></div>
            <strong style={{ display: 'block', fontSize: 17, marginTop: 5 }}><Money value={b.monto} /></strong>
            <div className="progress mt-8"><span className={`progress-fill ${b.clave === 'corriente' ? 'progress-green' : b.clave === '1_15' ? 'progress-amber' : ''}`} style={{ width: `${resumen.total ? Math.min(100, (b.monto / resumen.total) * 100) : 0}%` }} /></div>
          </div>
        ))}
      </div>

      <div className="panel">
        <Tabs tabs={[{ value: 'facturas', label: 'Facturas', count: data?.pedidos?.length }, { value: 'clientes', label: 'Por cliente', count: data?.clientes?.length }, { value: 'pagos', label: 'Pagos recientes' }]} active={tab} onChange={setTab} />
        {tab === 'facturas' && avanceAbierto && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar factura o cliente…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <label className="check"><input type="checkbox" checked={soloVencidas} onChange={(e) => setSoloVencidas(e.target.checked)} /> Solo vencidas</label>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{pedidos.length} facturas · saldo <strong><Money value={pedidos.reduce((s, p) => s + p.saldo, 0)} /></strong>{resumen.interes > 0 && <> · interés <strong className="text-red"><Money value={resumen.interes} /></strong></>}</span>
              </div>
            </div>
            {loading ? <SkeletonRows rows={7} /> : pedidos.length === 0 ? <EmptyState icon={CircleDollarSign} title="No hay facturas por cobrar" message="La cartera está al día con los filtros seleccionados." /> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Factura</th><th>Cliente</th><th>Vence</th><th>Antigüedad</th><th className="num">Interés</th><th className="num">Saldo</th><th className="num">A cobrar</th><th /></tr></thead>
                  <tbody>
                    {pedidos.map((p) => (
                      <tr key={p.id} className="clickable" onClick={() => setDetalle(p)}>
                        <td className="cell-strong">{p.codigo}<span className="cell-sub">{p.forma_pago} · {p.vendedor_nombre.split(' ')[0]}</span>{p.en_mora ? <Badge tone="red">Mora · {p.responsable_cobro_nombre}</Badge> : <Badge tone="green">A tu cargo</Badge>}</td>
                        <td>{p.cliente_nombre}<span className="cell-sub">{p.cliente_zona}</span></td>
                        <td><Fecha value={p.vencimiento} short /></td>
                        <td>{p.vencido ? <Badge tone="red">+{p.dias_vencido} días</Badge> : <Badge tone="green">Al día</Badge>}</td>
                        <td className="num">{p.interes_pendiente > 0 ? <span className="text-red"><Money value={p.interes_pendiente} /></span> : '—'}</td>
                        <td className="num"><Money value={p.saldo} /></td>
                        <td className="num cell-strong"><Money value={p.total_a_cobrar || p.saldo} /></td>
                        <td className="actions"><button className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); abrirCobro(p); }}><Wallet size={12} /> Cobrar</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'facturas' && avanceAbierto && (
          <div className="panel section-gap">
            <div className="panel-head"><div><h3>Informe de avance de cobranza</h3><p>Cartera, vencimientos y visitas de cobro en tiempo real</p></div><BarChart3 size={16} /></div>
            <div className="panel-body">
              <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
                <div className="mini-stat"><span>Total facturas</span><strong>{resumen.facturas || 0}</strong></div>
                <div className="mini-stat"><span>Vencidas</span><strong className="text-red">{resumen.vencidas || 0}</strong></div>
                <div className="mini-stat"><span>Al día</span><strong className="text-green">{resumen.al_dia || 0}</strong></div>
                <div className="mini-stat"><span>Total por cobrar</span><strong><Money value={resumen.total} /></strong></div>
                <div className="mini-stat"><span>Monto vencido</span><strong className="text-red"><Money value={resumen.vencido} /></strong></div>
                <div className="mini-stat"><span>Interés por mora</span><strong><Money value={resumen.interes} /></strong></div>
                <div className="mini-stat"><span>Clientes con deuda</span><strong>{resumen.clientes || 0}</strong></div>
                <div className="mini-stat"><span>Visitados hoy</span><strong>{visitas.filter((v) => v.tipo === 'cobranza').length}</strong></div>
              </div>
              <div className="notice notice-info"><Wallet size={15} /> Administración y supervisor definen las metas mensuales en Ventas → Generar objetivos. Solo las cuentas vencidas pasan al cobrador; las demás las cobra el vendedor.</div>
            </div>
          </div>
        )}

        {tab === 'clientes' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Cliente</th><th>Zona</th><th>Facturas</th><th className="num">Saldo</th><th className="num">Vencido</th><th>Máx. atraso</th><th /></tr></thead>
              <tbody>
                {(data?.clientes || []).map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.nombre}<span className="cell-sub">{c.codigo} · {c.tipo}</span></td>
                    <td>{c.zona}</td>
                    <td>{c.facturas}</td>
                    <td className="num cell-strong"><Money value={c.saldo} /></td>
                    <td className="num"><span className={c.monto_vencido > 0 ? 'text-red' : 'muted'}>{c.monto_vencido > 0 ? <Money value={c.monto_vencido} /> : '—'}</span></td>
                    <td>{c.max_dias > 0 ? <Badge tone={c.max_dias > 15 ? 'red' : 'amber'}>{c.max_dias} días</Badge> : <Badge tone="green">Al día</Badge>}</td>
                    <td className="actions"><button className="btn btn-outline btn-sm" onClick={() => { setSearch(c.nombre); setTab('facturas'); }}>Ver facturas</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.clientes || []).length === 0 && <div className="table-empty">No hay clientes con saldo pendiente.</div>}
          </div>
        )}

        {tab === 'pagos' && (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Recibo</th><th>Cliente</th><th>Pedido</th><th>Método</th><th>Fecha</th><th className="num">Monto</th></tr></thead>
              <tbody>
                {(data?.pagos || []).map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.codigo}</td>
                    <td>{p.cliente_nombre}</td>
                    <td>{p.pedido_codigo}</td>
                    <td><Estado valor={p.metodo} /></td>
                    <td><Fecha value={p.fecha} time /></td>
                    <td className="num cell-strong text-green"><Money value={p.monto} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(data?.pagos || []).length === 0 && <div className="table-empty">Aún no se registraron pagos.</div>}
          </div>
        )}
      </div>

      <Modal
        open={Boolean(cobranzaMapa)}
        onClose={() => setCobranzaMapa(null)}
        title={`Registrar cobranza · ${cobranzaMapa?.codigo || ''}`}
        subtitle={cobranzaMapa ? `${cobranzaMapa.cliente_nombre} · saldo Bs ${Number(cobranzaMapa.saldo || 0).toFixed(2)}` : ''}
        size="md"
      >
        {!cobranzaMapa ? null : (
          <div className="form-stack">
            <div className="notice notice-info"><MapPin size={14} /> Ubicación: {formatoCoords(cobranzaMapaForm.latitud, cobranzaMapaForm.longitud)}</div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <button className="btn btn-primary btn-block" onClick={() => { abrirCobro(cobranzaMapa); setCobranzaMapa(null); }}><CircleDollarSign size={14} /> Registrar pago</button>
              <button className="btn btn-outline btn-block" onClick={() => setCobranzaMapaForm({ ...cobranzaMapaForm, motivo: 'sin_dinero' })}><UserX size={14} /> Registrar no pago</button>
            </div>
            <div className="divider" />
            <div className="field"><label>Motivo de no pago</label>
              <select className="select" value={cobranzaMapaForm.motivo} onChange={(e) => setCobranzaMapaForm({ ...cobranzaMapaForm, motivo: e.target.value })}>
                <option value="sin_dinero">Sin dinero</option><option value="cerrado">Local cerrado</option><option value="rechazo">Rechazó el cobro</option><option value="otro">Otro</option>
              </select>
            </div>
            <div className="field"><label>Notas</label><textarea className="textarea" value={cobranzaMapaForm.notas} onChange={(e) => setCobranzaMapaForm({ ...cobranzaMapaForm, notas: e.target.value })} /></div>
            <div className="inline">
              <button className="btn btn-ghost" onClick={() => setCobranzaMapa(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarNoPago}>Guardar visita sin pago</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(detalle)}
        onClose={() => setDetalle(null)}
        title={detalle?.codigo || 'Detalle de factura'}
        subtitle={detalle ? `${detalle.cliente_nombre} · vence ${detalle.vencimiento}` : ''}
        size="md"
      >
        {!detalle ? null : (
          <div className="form-stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Saldo capital</span><strong><Money value={detalle.saldo} /></strong></div>
              <div className="mini-stat"><span>Interés por mora</span><strong className="text-red"><Money value={detalle.interes_pendiente} /></strong></div>
            </div>
            <div className="info-row"><span>Total a cobrar</span><strong><Money value={detalle.total_a_cobrar || detalle.saldo} /></strong></div>
            <div className="info-row"><span>Ubicación del cliente</span><strong>{formatoCoords(detalle.cliente_latitud, detalle.cliente_longitud)}</strong></div>
            <div className="divider" />
            <div className="inline">
              <button className="btn btn-primary" onClick={() => { abrirCobro(detalle); setDetalle(null); }}><Wallet size={13} /> Generar cobranza</button>
              <BotonWhatsapp tipo="cobranza" clienteId={detalle.cliente_id} pedidoId={detalle.id} telefono={detalle.cliente_telefono} latitud={detalle.cliente_latitud} longitud={detalle.cliente_longitud} monto={detalle.total_a_cobrar || detalle.saldo} label="Enviar detalles de pago" />
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="Registrar cobro"
        subtitle={selected ? `${selected.codigo} · ${selected.cliente_nombre} · a cobrar Bs ${(selected.total_a_cobrar || selected.saldo).toFixed(2)}` : ''}
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setPayOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={cobrar} disabled={busy}>{busy ? 'Registrando…' : 'Confirmar cobro'}</button>
          </>
        )}
      >
        <div className="form-stack">
          <div className="summary-box">
            <div className="split"><span className="small muted">Total factura</span><strong><Money value={selected?.total} /></strong></div>
            <div className="split" style={{ marginTop: 4 }}><span className="small muted">Ya pagado</span><strong className="text-green"><Money value={selected?.pagado} /></strong></div>
            <div className="split" style={{ marginTop: 4 }}><span className="small muted">Saldo pendiente</span><strong className="text-orange"><Money value={selected?.saldo} /></strong></div>
            <div className="split" style={{ marginTop: 4 }}><span className="small muted">Interés por mora</span><strong className="text-red"><Money value={selected?.interes_pendiente} /></strong></div>
            <div className="split" style={{ marginTop: 4 }}><span className="small muted">Total a cobrar</span><strong className="text-orange"><Money value={selected?.total_a_cobrar || selected?.saldo} /></strong></div>
          </div>
          <div className="field"><label>Monto a cobrar (Bs) <span className="req">*</span></label><input className="input" type="number" min="0.01" step="0.01" value={pay.monto} onChange={(e) => setPay({ ...pay, monto: e.target.value })} /></div>
          <div className="field"><label>Método de pago</label><select className="select" value={pay.metodo} onChange={(e) => setPay({ ...pay, metodo: e.target.value })}><option value="efectivo">Efectivo</option><option value="qr">QR simple</option><option value="transferencia">Transferencia</option></select></div>
          <div className="field"><label>Nota / referencia</label><input className="input" value={pay.nota} onChange={(e) => setPay({ ...pay, nota: e.target.value })} placeholder="Nro. de transferencia, observación…" /></div>
          <div className="field-row">
            <div className="field"><label>Tipo de comprobante</label><select className="select" value={pay.tipo_comprobante} onChange={(e) => setPay({ ...pay, tipo_comprobante: e.target.value })}><option value="recibo">Recibo</option><option value="factura">Factura</option><option value="boleta">Boleta</option><option value="transferencia">Transferencia</option></select></div>
            <div className="field"><label>Nro. de comprobante / factura</label><input className="input" value={pay.numero_comprobante} onChange={(e) => setPay({ ...pay, numero_comprobante: e.target.value })} placeholder="Ej. REC-0042" /></div>
          </div>
          <div className="geo-editor">
            <div className="geo-editor-head">
              <div><strong><Navigation size={13} /> Visita de cobranza</strong><span className="hint">Registra tu ubicación para la trazabilidad en campo.</span></div>
              <button type="button" className="btn btn-soft btn-sm" onClick={capturarUbicacion} disabled={ubicando}>
                <Crosshair size={13} /> {ubicando ? 'Ubicando…' : ubicacion ? 'Actualizar ubicación' : 'Usar mi ubicación'}
              </button>
            </div>
            {ubicacion ? <p className="small text-green">Ubicación lista: {formatoCoords(ubicacion.latitud, ubicacion.longitud)} (±{ubicacion.precision} m)</p>
              : <p className="small muted">Sin ubicación: el cobro se registrará igual, pero sin geolocalización.</p>}
          </div>
          <div className="notice notice-info"><CalendarClock size={15} /> El saldo del cliente y los intereses se actualizan automáticamente al registrar el cobro.</div>
          {ultimoComprobante && (
            <div className="notice notice-info">
              Comprobante <strong>{ultimoComprobante.pago?.numero_comprobante || ultimoComprobante.pago?.codigo}</strong> registrado. Envíalo al WhatsApp registrado en el cliente.
              <div style={{ marginTop: 8 }}>
                <BotonWhatsapp
                  tipo="cobranza"
                  clienteId={ultimoComprobante.pedido?.cliente_id || selected?.cliente_id}
                  pedidoId={ultimoComprobante.pedido?.id || selected?.id}
                  telefono={ultimoComprobante.pedido?.cliente_whatsapp || selected?.cliente_whatsapp || undefined}
                  monto={ultimoComprobante.pago?.monto}
                  numeroComprobante={ultimoComprobante.pago?.numero_comprobante}
                  tipoComprobante={ultimoComprobante.pago?.tipo_comprobante}
                  label="Enviar comprobante al WhatsApp"
                />
              </div>
            </div>
          )}
          {selected && !ultimoComprobante && <BotonWhatsapp tipo="cobranza" clienteId={selected.cliente_id} pedidoId={selected.id} telefono={selected.cliente_whatsapp || selected.cliente_telefono} latitud={ubicacion?.latitud || selected.cliente_latitud} longitud={ubicacion?.longitud || selected.cliente_longitud} monto={Number(pay.monto) || selected.total_a_cobrar || selected.saldo} label="Enviar detalle de pago" />}
        </div>
      </Modal>
    </>
  );
}
