import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BadgePercent, Banknote, Building2, CalendarClock, Crosshair, CreditCard, MapPin, Minus, Plus, Search, ShoppingCart,
  Smartphone, Trash2, Truck, UserRound, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import { esCoordenaValida, formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, EmptyState, Money, PageHeader, SkeletonRows, useToast } from '../ui';

const CANALES = [
  { value: 'mostrador', label: 'Mostrador' },
  { value: 'delivery', label: 'Delivery' },
  { value: 'ruta', label: 'Ruta' },
  { value: 'whatsapp', label: 'WhatsApp' },
];
const PAGOS = [
  { value: 'efectivo', label: 'Efectivo', icon: Banknote },
  { value: 'qr', label: 'QR simple', icon: Smartphone },
  { value: 'transferencia', label: 'Transferencia', icon: Building2 },
  { value: 'credito', label: 'Crédito', icon: CreditCard },
];

export default function VentaNueva() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const toast = useToast();
  const { user, empresa } = useAuth();
  const [productos, setProductos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [categorias, setCategorias] = useState([]);
  const [cart, setCart] = useState({});
  const [credito, setCredito] = useState({ aplicar_interes: true, tasa_interes_mensual: 3, dias_gracia: 0 });
  const [promociones, setPromociones] = useState([]);
  const [evaluacion, setEvaluacion] = useState(null);
  const [almacenMovil, setAlmacenMovil] = useState(null);
  const [categoriasCliente, setCategoriasCliente] = useState([]);
  const [presentacionVenta, setPresentacionVenta] = useState('unidad');
  const [ubicacion, setUbicacion] = useState(null);
  const [ubicando, setUbicando] = useState(false);
  const [form, setForm] = useState({
    cliente_id: '',
    canal: 'mostrador',
    forma_pago: 'efectivo',
    dias_credito: 15,
    almacen_id: 1,
    descuento: 0,
    envio: 0,
    notas: '',
    entrega_direccion: '',
  });

  useEffect(() => {
    const esVendedor = ['ventas', 'preventista', 'vendedor_camion'].includes(user?.rol);
    Promise.all([
      api.get('/productos'),
      api.get('/almacenes'),
      api.get(`/clientes${esVendedor ? '?solo_mios=true' : ''}`),
      api.get('/configuracion'),
      api.get('/promociones?estado=activas'),
      api.get('/categorias'),
      esVendedor ? api.get('/almacenes-moviles/mio') : Promise.resolve({ almacen: null }),
    ])
      .then(([p, a, c, cfg, prom, cat, mov]) => {
        setPromociones(prom.promociones || []);
        setCategoriasCliente(cat.categorias || []);
        setAlmacenMovil(mov.almacen || null);
        setCredito(cfg.credito || { aplicar_interes: true, tasa_interes_mensual: 3, dias_gracia: 0 });
        setForm((f) => ({ ...f, dias_credito: Number(cfg.configuracion?.empresa?.dias_credito) || 15 }));
        setProductos(p.productos);
        setCategorias(p.categorias);
        setAlmacenes(a.almacenes);
        setClientes(c.clientes.filter((x) => x.activo));
        const primero = c.clientes.find((x) => x.activo);
        const solicitado = params.get('cliente');
        setForm((f) => ({ ...f, cliente_id: solicitado || primero?.id || '', almacen_id: a.almacenes[0]?.id || 1, vendedor_id: params.get('vendedor') || f.vendedor_id }));
      })
      .catch((error) => toast(error.message, 'error'))
      .finally(() => setLoading(false));
  }, [toast, params, user?.rol]);

  const cliente = clientes.find((c) => c.id === Number(form.cliente_id));
  const almacen = almacenes.find((a) => a.id === Number(form.almacen_id));

  const filtrados = useMemo(() => productos.filter((p) => {
    if (almacenMovil && !(almacenMovil.lineas || []).some((l) => l.producto_id === p.id && l.cantidad > 0)) return false;
    if (cliente?.categoria_cliente_id && (p.categorias_clientes || []).length && !p.categorias_clientes.map(Number).includes(Number(cliente.categoria_cliente_id))) return false;
    if (categoria !== 'todas' && p.categoria !== categoria) return false;
    if (search && !`${p.nombre} ${p.sku}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [productos, categoria, search, almacenMovil, cliente]);

  const categoriaCliente = categoriasCliente.find((c) => c.id === cliente?.categoria_cliente_id);
  const precioEfectivo = (p) => {
    if (!categoriaCliente) return p.precio;
    const especial = (categoriaCliente.precios || []).find((x) => x.producto_id === p.id);
    if (especial && Number(especial.precio) > 0) return Number(especial.precio);
    return Math.max(0, p.precio * (1 - Number(categoriaCliente.descuento_porcentaje || 0) / 100) - Number(categoriaCliente.descuento_fijo || 0));
  };
  const unidadesPorPresentacion = (p) => presentacionVenta === 'caja'
    ? Math.max(1, Number(p.unidades_por_caja) || 1)
    : presentacionVenta === 'paquete'
      ? Math.max(1, Number(p.unidades_por_paquete) || 1)
      : 1;

  const stockEn = (p) => almacenMovil
    ? Number(almacenMovil.lineas?.find((l) => l.producto_id === p.id)?.cantidad || 0)
    : Number(p.stock_por_almacen?.find((s) => s.almacen_id === Number(form.almacen_id))?.cantidad || 0);

  const lineas = useMemo(() => Object.entries(cart)
    .map(([id, cantidad]) => {
      const producto = productos.find((p) => p.id === Number(id));
      if (!producto || cantidad <= 0) return null;
      return { producto, cantidad, subtotal: cantidad * precioEfectivo(producto) };
    })
    .filter(Boolean), [cart, productos, categoriaCliente]);

  const subtotal = lineas.reduce((s, l) => s + l.subtotal, 0);
  const descuentoPromos = Number(evaluacion?.descuento_total) || 0;
  const subtotalNeto = Math.max(0, subtotal - descuentoPromos);
  const descuento = Math.min(subtotalNeto, Number(form.descuento) || 0);
  const envio = Number(form.envio) || 0;
  const total = Math.max(0, subtotalNeto - descuento + envio);
  const unidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  const vencimiento = (() => {
    if (form.forma_pago !== 'credito') return null;
    const d = new Date();
    d.setDate(d.getDate() + (Number(form.dias_credito) || 15));
    return d.toISOString().slice(0, 10);
  })();

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

  useEffect(() => {
    const items = Object.entries(cart).map(([id, cantidad]) => ({ producto_id: Number(id), cantidad }));
    if (!items.length) { setEvaluacion(null); return; }
    api.post('/promociones/evaluar', { items, almacen_id: Number(form.almacen_id), cliente_id: form.cliente_id, almacen_movil_id: almacenMovil?.id })
      .then(setEvaluacion)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(cart), form.almacen_id, form.cliente_id, almacenMovil]);

  const agregar = (p) => {
    const disponible = stockEn(p);
    const paso = unidadesPorPresentacion(p);
    const actual = cart[p.id] || 0;
    if (actual + paso > disponible) {
      toast(`Stock insuficiente de ${p.nombre} en ${almacen?.nombre || 'el almacén'}. Disponible: ${disponible} uds.`, 'error');
      return;
    }
    setCart({ ...cart, [p.id]: actual + paso });
  };

  const cambiar = (id, delta) => {
    const producto = productos.find((p) => p.id === Number(id));
    const paso = unidadesPorPresentacion(producto);
    const actual = cart[id] || 0;
    const nuevo = actual + delta * paso;
    if (nuevo <= 0) {
      const next = { ...cart };
      delete next[id];
      setCart(next);
      return;
    }
    if (delta > 0 && nuevo > stockEn(producto)) {
      toast(`Solo hay ${stockEn(producto)} unidades disponibles.`, 'error');
      return;
    }
    setCart({ ...cart, [id]: nuevo });
  };

  const setCanal = (canal) => {
    setForm((f) => ({ ...f, canal, envio: canal === 'delivery' ? Number(empresa?.tarifa_envio ?? 5) : 0 }));
  };

  const guardar = async () => {
    if (!form.cliente_id) return toast('Selecciona un cliente.', 'error');
    if (!lineas.length) return toast('Agrega al menos un producto.', 'error');
    if (form.forma_pago === 'credito' && cliente) {
      if (!cliente.limite_credito) return toast('Este cliente no tiene crédito habilitado.', 'error');
      if (cliente.saldo + total > cliente.limite_credito) {
        return toast(`Supera el límite de crédito. Disponible: ${(cliente.limite_credito - cliente.saldo).toFixed(2)} Bs.`, 'error');
      }
    }
    setSaving(true);
    try {
      const data = await api.post('/pedidos', {
        cliente_id: Number(form.cliente_id),
        almacen_id: Number(form.almacen_id),
        almacen_movil_id: almacenMovil?.id || null,
        vendedor_id: form.vendedor_id || undefined,
        canal: form.canal,
        forma_pago: form.forma_pago,
        promociones_aplicadas: evaluacion?.aplicadas || [],
        dias_credito: form.forma_pago === 'credito' ? Number(form.dias_credito) : null,
        latitud: ubicacion?.latitud,
        longitud: ubicacion?.longitud,
        precision: ubicacion?.precision,
        descuento,
        envio,
        notas: form.notas,
        entrega_direccion: form.entrega_direccion || cliente?.direccion,
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      });
      toast(`Venta ${data.pedido.codigo} registrada correctamente`);
      if (params.get('from') === 'mapa') {
        try {
          await api.post('/visitas', {
            cliente_id: data.pedido.cliente_id,
            pedido_id: data.pedido.id,
            tipo: 'preventa',
            modulo: 'Ventas',
            estado: 'completada',
            resultado: 'pedido',
            notas: `Pedido ${data.pedido.codigo} registrado desde el mapa de ruta`,
            latitud: ubicacion?.latitud || cliente?.latitud,
            longitud: ubicacion?.longitud || cliente?.longitud,
            precision: ubicacion?.precision || null,
          });
        } catch (error) { /* la venta ya quedó registrada */ }
        toast('Pedido registrado. Regresando al mapa de ruta para continuar');
        navigate('/ventas/agenda');
        return;
      }
      navigate(`/ventas/${data.pedido.id}`);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <><PageHeader title="Nueva venta" subtitle="Cargando catálogo y clientes…" /><div className="panel"><SkeletonRows rows={8} /></div></>;
  }

  return (
    <>
      <PageHeader
        eyebrow="Punto de venta"
        title="Nueva venta"
        subtitle="Selecciona productos, cliente y forma de pago. El stock se descuenta automáticamente."
        actions={<button className="btn btn-ghost" onClick={() => navigate('/ventas')}><ArrowLeft size={15} /> Volver a ventas</button>}
      />

      <div className="pos-layout">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Catálogo</h3><p>{filtrados.length} productos disponibles · venta por {presentacionVenta}</p></div>
            <div className="inline">
              <div className="pill-group">
                {['unidad', 'caja', 'paquete'].map((v) => <button key={v} className={`chip ${presentacionVenta === v ? 'active' : ''}`} onClick={() => setPresentacionVenta(v)}>{v}</button>)}
              </div>
              <span className="badge badge-navy"><Building2 size={12} /> {almacen?.nombre || 'Almacén'}</span>
            </div>
          </div>
          <div className="panel-body">
            <div className="filters" style={{ marginBottom: 13 }}>
              <div className="search-box">
                <Search size={15} />
                <input className="input" placeholder="Buscar producto o SKU…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <select className="select" value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: Number(e.target.value) })}>
                {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
              </select>
            </div>
            <div className="pill-group mb-16">
              <button className={`chip ${categoria === 'todas' ? 'active' : ''}`} onClick={() => setCategoria('todas')}>Todas</button>
              {categorias.map((c) => <button key={c} className={`chip ${categoria === c ? 'active' : ''}`} onClick={() => setCategoria(c)}>{c}</button>)}
            </div>

            {filtrados.length === 0 ? <EmptyState icon={ShoppingCart} title="Sin productos" message="No hay productos que coincidan con la búsqueda." /> : (
              <div className="pos-products">
                {filtrados.map((p) => {
                  const disponible = stockEn(p);
                  return (
                    <button key={p.id} className="pos-product" disabled={disponible <= 0} onClick={() => agregar(p)}>
                      <span className="pp-emoji">{p.emoji}</span>
                      <span className="pp-name">{p.nombre}</span>
                      <span className="pp-meta">
                        <span className="pp-price"><Money value={precioEfectivo(p) * unidadesPorPresentacion(p)} /> <small className="muted">/ {presentacionVenta}</small></span>
                        <span className={`pp-stock ${disponible <= p.stock_minimo ? 'low' : ''}`}>{Math.floor(disponible / unidadesPorPresentacion(p))} {presentacionVenta}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="panel pos-cart">
          <div className="panel-head">
            <div><h3>Carrito <span className="badge badge-orange">{unidades}</span></h3><p>{lineas.length} productos</p></div>
            {lineas.length > 0 && <button className="link-btn" onClick={() => setCart({})}>Vaciar</button>}
          </div>
          <div className="panel-body">
            <div className="field mb-12">
              <label>Cliente <span className="req">*</span></label>
              <select className="select" value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}>
                <option value="">Seleccionar cliente…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.zona}</option>)}
              </select>
            </div>

            {cliente && (
              <div className="customer-pick mb-12">
                <span className="avatar avatar-navy" style={{ width: 32, height: 32, fontSize: 11 }}><UserRound size={15} /></span>
                <div className="cp-copy">
                  <strong>{cliente.nombre}</strong>
                  <span>{cliente.tipo} · {cliente.telefono} {cliente.limite_credito ? `· Crédito: Bs ${cliente.limite_credito}` : '· Sin crédito'}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span className="small muted" style={{ display: 'block' }}>Saldo</span>
                  <strong style={{ fontSize: 12, color: cliente.saldo > 0 ? 'var(--red)' : 'var(--green)' }}><Money value={cliente.saldo} /></strong>
                </div>
              </div>
            )}

            <div className="cart-items">
              {lineas.length === 0 && <div className="cart-empty"><ShoppingCart size={22} style={{ display: 'block', margin: '0 auto 6px' }} />Toca un producto para agregarlo al carrito.</div>}
              {lineas.map(({ producto, cantidad, subtotal: sub }) => (
                <div className="cart-item" key={producto.id}>
                  <span className="ci-emoji">{producto.emoji}</span>
                  <div className="ci-copy"><strong>{producto.nombre}</strong><span><Money value={producto.precio} /> c/u</span></div>
                  <div className="qty">
                    <button onClick={() => cambiar(producto.id, -1)}><Minus size={11} /></button>
                    <span>{cantidad}</span>
                    <button onClick={() => cambiar(producto.id, 1)}><Plus size={11} /></button>
                  </div>
                  <span className="ci-total"><Money value={sub} /></span>
                  <button className="icon-btn" style={{ width: 25, height: 25 }} onClick={() => { const n = { ...cart }; delete n[producto.id]; setCart(n); }}><Trash2 size={13} /></button>
                </div>
              ))}
            </div>

            <div className="divider" />

            <div className="field-row mb-12">
              <div className="field">
                <label>Canal</label>
                <select className="select" value={form.canal} onChange={(e) => setCanal(e.target.value)}>
                  {CANALES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Almacén</label>
                <select className="select" value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: Number(e.target.value) })}>
                  {almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                </select>
              </div>
            </div>

            {(almacenMovil || categoriaCliente) && (
              <div className="notice notice-info" style={{ marginBottom: 12 }}>
                <Truck size={15} />
                {almacenMovil
                  ? `Venta directa desde ${almacenMovil.codigo} · ${almacenMovil.total_unidades} unidades cargadas. Solo se muestra ese inventario.`
                  : `Categoría ${categoriaCliente.nombre} · descuento ${categoriaCliente.descuento_porcentaje}% aplicado a los precios.`}
                {categoriaCliente && almacenMovil && ` Precios ${categoriaCliente.nombre} activos.`}
              </div>
            )}

            <div className="field mb-12">
              <label>Forma de pago</label>
              <div className="pill-group">
                {PAGOS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <button key={p.value} className={`chip ${form.forma_pago === p.value ? 'active' : ''}`} onClick={() => setForm({ ...form, forma_pago: p.value })}>
                      <Icon size={12} /> {p.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="field-row mb-12">
              <div className="field"><label>Descuento (Bs)</label><input type="number" min="0" step="0.5" className="input" value={form.descuento} onChange={(e) => setForm({ ...form, descuento: e.target.value })} /></div>
              <div className="field"><label>Envío (Bs)</label><input type="number" min="0" step="0.5" className="input" value={form.envio} onChange={(e) => setForm({ ...form, envio: e.target.value })} /></div>
            </div>

            <div className="field mb-12"><label>Notas del pedido</label><input className="input" placeholder="Referencia, horario o indicaciones…" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>

            {form.canal === 'delivery' && (
              <div className="field mb-12"><label>Dirección de entrega</label><input className="input" placeholder={cliente?.direccion || 'Dirección de entrega'} value={form.entrega_direccion} onChange={(e) => setForm({ ...form, entrega_direccion: e.target.value })} /></div>
            )}

            {form.forma_pago === 'credito' && (
              <>
                <div className="field-row mb-12">
                  <div className="field"><label>Plazo del crédito (días)</label><input type="number" min="1" max="365" className="input" value={form.dias_credito} onChange={(e) => setForm({ ...form, dias_credito: e.target.value })} /></div>
                  <div className="field"><label>Vencimiento estimado</label><input className="input" value={vencimiento || ''} readOnly /></div>
                </div>
                <div className="notice notice-info" style={{ marginBottom: 12 }}>
                  <CalendarClock size={15} />
                  {credito.aplicar_interes
                    ? `Interés por mora: ${credito.tasa_interes_mensual}% mensual después de ${credito.dias_gracia || 0} días de gracia. Se calcula automáticamente al vencerse.`
                    : 'El cobro de intereses por mora está desactivado en Configuración.'}
                </div>
              </>
            )}

            {cliente && esCoordenaValida(cliente.latitud, cliente.longitud) && (
              <div className="geo-mini">
                <div className="geo-mini-head">
                  <span><MapPin size={12} /> Cliente geolocalizado · {formatoCoords(cliente.latitud, cliente.longitud)}</span>
                  <button type="button" className="btn btn-soft btn-sm" onClick={capturarUbicacion} disabled={ubicando}>
                    <Crosshair size={12} /> {ubicando ? 'Ubicando…' : ubicacion ? 'Actualizar mi ubicación' : 'Registrar visita aquí'}
                  </button>
                </div>
                <Mapa altura={150} puntos={[
                  { latitud: cliente.latitud, longitud: cliente.longitud, nombre: cliente.nombre, tipo: 'cliente' },
                  ...(ubicacion ? [{ latitud: ubicacion.latitud, longitud: ubicacion.longitud, nombre: 'Tu ubicación', tipo: 'venta' }] : []),
                ]} linea={Boolean(ubicacion)} />
              </div>
            )}

            {form.forma_pago === 'credito' && cliente && (
              <div className={`notice ${cliente.limite_credito && cliente.saldo + total <= cliente.limite_credito ? 'notice-warn' : 'notice-danger'}`} style={{ marginBottom: 12 }}>
                <Wallet size={15} />
                {cliente.limite_credito
                  ? `Crédito disponible: Bs ${(cliente.limite_credito - cliente.saldo).toFixed(2)}. Esta venta dejará un saldo de Bs ${(cliente.saldo + total).toFixed(2)}.`
                  : 'Este cliente no tiene crédito habilitado.'}
              </div>
            )}

            {(evaluacion?.aplicadas?.length > 0 || evaluacion?.bonificaciones?.length > 0) && (
              <div className="promo-box mb-12">
                <strong><BadgePercent size={13} /> Promociones aplicadas en tiempo real</strong>
                {evaluacion.aplicadas.map((p, i) => (
                  <div className="promo-line" key={`${p.id}-${i}`}>
                    <Badge tone="purple">{p.codigo}</Badge>
                    <span>{p.nombre} · {p.detalle}</span>
                  </div>
                ))}
                {(evaluacion.bonificaciones || []).map((b, i) => (
                  <div className="promo-line" key={`b-${i}`}>
                    <Badge tone="green">Bonificación</Badge>
                    <span>{b.cantidad} × {b.nombre} · {b.motivo}</span>
                  </div>
                ))}
                {descuentoPromos > 0 && <div className="promo-line"><strong>Descuento promociones: <Money value={descuentoPromos} /></strong></div>}
                {(evaluacion.insuficientes || []).length > 0 && (
                  <div className="notice notice-danger"><AlertTriangle size={13} /> Stock insuficiente para bonificaciones: {evaluacion.insuficientes.map((s) => `${s.nombre} (${s.disponible})`).join(', ')}</div>
                )}
              </div>
            )}

            {promociones.length > 0 && !evaluacion?.aplicadas?.length && (
              <div className="small muted mb-8">{promociones.length} promociones activas disponibles</div>
            )}

            <div className="divider" />

            <div className="totals">
              <div className="t-row"><span>Subtotal ({unidades} u.)</span><strong><Money value={subtotal} /></strong></div>
              <div className="t-row"><span>Descuento</span><strong>- <Money value={descuento} /></strong></div>
              <div className="t-row"><span>Envío</span><strong><Money value={envio} /></strong></div>
              <div className="t-total"><span>Total</span><Money value={total} /></div>
            </div>

            <button className="btn btn-primary btn-lg btn-block mt-16" onClick={guardar} disabled={saving || !lineas.length} style={{ marginTop: 16 }}>
              {saving ? 'Registrando venta…' : `Registrar venta · Bs ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
