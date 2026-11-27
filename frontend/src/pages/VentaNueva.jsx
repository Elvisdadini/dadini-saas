import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, BadgePercent, Banknote, Building2, CalendarClock, Camera, CheckCircle2, Crosshair, CreditCard, Images, MapPin, MessageCircle, Minus, Plus, QrCode, Search, ShoppingCart,
  Printer, Smartphone, Trash2, Truck, UserPlus, UserRound, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { puede, useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import EscanerCodigos from '../components/EscanerCodigos';
import { distanciaMetros, esCoordenaValida, formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, EmptyState, Modal, Money, PageHeader, SkeletonRows, useToast } from '../ui';

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
  const puedeDescuento = puede(user, 'ventas.aplicar_descuento');
  const puedeFacturar = puede(user, 'fiscal.emitir');
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
  const [geocerca, setGeocerca] = useState({ aplica: false });
  const [scanOpen, setScanOpen] = useState(false);
  const [modoImagenes, setModoImagenes] = useState(true);
  const [qrs, setQrs] = useState([]);
  const [qrAlerta, setQrAlerta] = useState([]);
  const [qrOpen, setQrOpen] = useState(false);
  const [ventaExitosa, setVentaExitosa] = useState(null);
  const [telComprobante, setTelComprobante] = useState('');
  const [estadoVentas, setEstadoVentas] = useState(null);
  const [clienteBusqueda, setClienteBusqueda] = useState('');
  const [clienteResultados, setClienteResultados] = useState([]);
  const [clienteModal, setClienteModal] = useState(false);
  const [clienteForm, setClienteForm] = useState({ nombre: '', razon_social: '', nit: '', ci: '', telefono: '', whatsapp: '', direccion: '', tipo: 'minorista' });
  const [facturaForm, setFacturaForm] = useState({ razon_social: '', nit: '' });
  const [fotoSugerencias, setFotoSugerencias] = useState(null);
  const [buscandoImagen, setBuscandoImagen] = useState(false);
  const [autoWhatsapp, setAutoWhatsapp] = useState(true);
  const [ultimaVenta, setUltimaVenta] = useState(null);
  const leerRef = useRef(null);
  const [form, setForm] = useState({
    cliente_id: '',
    whatsapp_cliente: '',
    canal: 'mostrador',
    forma_pago: 'efectivo',
    dias_credito: 15,
    almacen_id: 1,
    descuento: 0,
    descuento_tipo: 'bs',
    descuento_porcentaje: 0,
    envio: 0,
    notas: '',
    entrega_direccion: '',
    documento_entrega: 'comprobante_entrega',
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
      api.get('/configuracion/estado-ventas'),
    ])
      .then(([p, a, c, cfg, prom, cat, mov, estado]) => {
        setEstadoVentas(estado);
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

  useEffect(() => {
    if (!cliente) return;
    setFacturaForm({ razon_social: cliente.razon_social || cliente.nombre, nit: cliente.nit || cliente.ci || '' });
    if (!clienteBusqueda) setClienteBusqueda(cliente.nombre);
  }, [cliente?.id]);
  const almacen = almacenes.find((a) => a.id === Number(form.almacen_id));

  useEffect(() => {
    if (!form.cliente_id) { setGeocerca({ aplica: false }); return; }
    api.get(`/geo/geocerca?cliente_id=${form.cliente_id}&accion=venta`)
      .then(setGeocerca)
      .catch(() => setGeocerca({ aplica: false }));
  }, [form.cliente_id]);

  const distanciaCliente = ubicacion && cliente
    ? distanciaMetros(ubicacion, { latitud: cliente.latitud, longitud: cliente.longitud })
    : null;

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
  const pctDescuento = form.descuento_tipo === 'porcentaje'
    ? Math.min(100, Math.max(0, Number(form.descuento_porcentaje) || 0)) : 0;
  const descuento = pctDescuento > 0
    ? Math.min(subtotalNeto, Math.round(subtotalNeto * pctDescuento) / 100)
    : Math.min(subtotalNeto, Number(form.descuento) || 0);
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

  useEffect(() => {
    if (form.forma_pago !== 'qr') return;
    api.get('/qr-pagos/activos')
      .then((r) => { setQrs(r.qrs || []); setQrAlerta(r.alertas || []); })
      .catch(() => {});
  }, [form.forma_pago]);

  const alLeerProducto = (codigo) => {
    const termino = String(codigo || '').trim().toLowerCase();
    const llaves = (p) => [p.sku, p.codigo_barras, p.codigo, p.nombre].map((x) => String(x || '').toLowerCase());
    const producto = productos.find((p) => llaves(p).includes(termino))
      || productos.find((p) => llaves(p).some((x) => x && x.includes(termino)));
    setScanOpen(false);
    if (!producto) {
      setSearch(codigo);
      return toast(`No se encontró "${codigo}". Ajusta la búsqueda manual.`, 'error');
    }
    agregar(producto);
    setSearch('');
    toast(`${producto.nombre} agregado al carrito`, 'success');
  };
  leerRef.current = alLeerProducto;

  // Lectores de barras «teclado»: escriben el código y pulsan Enter aunque
  // el foco esté en otro lado. Se ignora mientras se escribe en otros campos.
  useEffect(() => {
    let buffer = '';
    let ultima = 0;
    const alTeclear = (evento) => {
      const etiqueta = evento.target?.tagName;
      const escribiendo = ['INPUT', 'SELECT', 'TEXTAREA'].includes(etiqueta);
      if (escribiendo) {
        if (evento.target?.id === 'buscar-producto' && evento.key === 'Enter' && search.trim()) {
          evento.preventDefault();
          leerRef.current?.(search.trim());
          buffer = '';
        }
        return;
      }
      if (/^\d$/.test(evento.key)) {
        if (Date.now() - ultima > 150) buffer = '';
        buffer += evento.key;
        ultima = Date.now();
      } else if (evento.key === 'Enter' && buffer.length >= 4) {
        const codigo = buffer;
        buffer = '';
        leerRef.current?.(codigo);
      } else if (evento.key === 'Escape') buffer = '';
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [search]);

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

  const seleccionarCliente = (c) => {
    setForm((f) => ({
      ...f, cliente_id: c.id,
      whatsapp_cliente: c.whatsapp || c.telefono || f.whatsapp_cliente,
      entrega_direccion: c.direccion || f.entrega_direccion,
    }));
    setFacturaForm({ razon_social: c.razon_social || c.nombre, nit: c.nit || c.ci || '' });
    setClienteBusqueda(`${c.nombre}${c.codigo ? ` · ${c.codigo}` : ''}`);
    setClienteResultados([]);
  };

  const buscarCliente = async () => {
    const termino = clienteBusqueda.trim();
    if (!termino) return;
    try {
      const r = await api.get(`/clientes?search=${encodeURIComponent(termino)}`);
      const lista = (r.clientes || []).filter((c) => c.activo !== false);
      if (!lista.length) {
        setClienteForm({
          nombre: termino, razon_social: termino, nit: '', ci: /^\d{5,}$/.test(termino) ? termino : '',
          telefono: '', whatsapp: '', direccion: '', tipo: 'minorista',
        });
        setClienteModal(true);
        return;
      }
      if (lista.length === 1) return seleccionarCliente(lista[0]);
      setClienteResultados(lista.slice(0, 6));
      toast(`${lista.length} clientes coinciden. Elige uno.`, 'success');
    } catch (error) { toast(error.message, 'error'); }
  };

  const guardarCliente = async () => {
    if (!clienteForm.nombre.trim()) return toast('Escribe el nombre del cliente.', 'error');
    setSaving(true);
    try {
      const r = await api.post('/clientes', clienteForm);
      if (!r.ok) throw new Error(r.error);
      const lista = await api.get('/clientes');
      setClientes((lista.clientes || []).filter((c) => c.activo !== false));
      seleccionarCliente(r.cliente);
      setClienteModal(false);
      toast(`Cliente ${r.cliente.codigo} registrado para futuras ventas`);
    } catch (error) { toast(error.message, 'error'); } finally { setSaving(false); }
  };

  const promediarColor = (imagen) => {
    const lienzo = document.createElement('canvas');
    lienzo.width = 32; lienzo.height = 32;
    const ctx = lienzo.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(imagen, 0, 0, 32, 32);
    const datos = ctx.getImageData(0, 0, 32, 32).data;
    let r = 0; let g = 0; let b = 0;
    for (let i = 0; i < datos.length; i += 4) { r += datos[i]; g += datos[i + 1]; b += datos[i + 2]; }
    const n = datos.length / 4;
    return [r / n, g / n, b / n];
  };

  const detectarPorImagen = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    setBuscandoImagen(true);
    try {
      const Temporal = new Image();
      Temporal.src = URL.createObjectURL(archivo);
      await new Promise((res, rej) => { Temporal.onload = res; Temporal.onerror = rej; });
      const objetivo = promediarColor(Temporal);
      const candidatos = await Promise.all(productos.filter((p) => p.imagen_url).map((p) => new Promise((res) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const c = promediarColor(img);
          res({ producto: p, distancia: Math.hypot(c[0] - objetivo[0], c[1] - objetivo[1], c[2] - objetivo[2]) });
        };
        img.onerror = () => res(null);
        img.src = p.imagen_url;
      })));
      const ordenados = candidatos.filter(Boolean).sort((a, b) => a.distancia - b.distancia).slice(0, 6).map((c) => c.producto);
      setFotoSugerencias(ordenados.length ? ordenados : productos.filter((p) => p.imagen_url).slice(0, 6));
      toast('Elige el producto que coincide con la foto', 'success');
    } catch (error) { toast(error.message, 'error'); } finally { setBuscandoImagen(false); evento.target.value = ''; }
  };

  const sincronizarFactura = async () => {
    if (!cliente) return;
    if (facturaForm.razon_social === (cliente.razon_social || cliente.nombre)
      && facturaForm.nit === (cliente.nit || cliente.ci || '')) return;
    try {
      await api.put(`/clientes/${cliente.id}`, { razon_social: facturaForm.razon_social, nit: facturaForm.nit, ci: cliente.ci || '' });
    } catch (error) { console.error('[POS] datos de factura:', error.message); }
  };

  const reiniciarParaOtraVenta = () => {
    setCart({});
    setSearch('');
    setVentaExitosa(null);
    setUbicacion(null);
    setForm((f) => ({ ...f, descuento: 0, descuento_porcentaje: 0, descuento_tipo: 'bs', notas: '', entrega_direccion: cliente?.direccion || '' }));
    setTimeout(() => document.getElementById('buscar-producto')?.focus(), 50);
  };

  const enviarComprobante = async (pedido, telefono, abrir = true) => {
    if (!pedido || !telefono) return null;
    try {
      const r = await api.post('/whatsapp', {
        tipo: 'pedido', pedido_id: pedido.id, cliente_id: pedido.cliente_id,
        telefono, mensaje: `Hola ${cliente?.nombre || 'cliente'}, su comprobante DADINI ${pedido.codigo} por Bs ${Number(pedido.total || 0).toFixed(2)}. ${pedido.documento_entrega === 'factura_siat' ? 'Factura con registro en el SIN.' : 'Comprobante de entrega.'} Gracias por comprar DADINI.`,
      });
      if (abrir && r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      return r.url;
    } catch (error) { toast(error.message, 'error'); return null; }
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
    let ubicacionFinal = ubicacion;
    if (geocerca.aplica) {
      if (!ubicacionFinal) {
        try { ubicacionFinal = await obtenerUbicacion(); setUbicacion(ubicacionFinal); }
        catch (error) { return toast(`Geocerca activa: ${error.message}`, 'error'); }
      }
      const distancia = distanciaMetros(ubicacionFinal, cliente);
      if (distancia === null) return toast('El cliente no tiene ubicación registrada; no se puede validar la geocerca.', 'error');
      if (distancia > geocerca.radio_m) {
        return toast(`Estás a ${distancia} m del cliente. El límite es ${geocerca.radio_m} m; no se puede registrar la venta.`, 'error');
      }
    }
    setSaving(true);
    try {
      if (form.documento_entrega === 'factura_siat') await sincronizarFactura();
      const data = await api.post('/pedidos', {
        cliente_id: Number(form.cliente_id),
        whatsapp_cliente: form.whatsapp_cliente,
        almacen_id: Number(form.almacen_id),
        almacen_movil_id: almacenMovil?.id || null,
        vendedor_id: form.vendedor_id || undefined,
        canal: form.canal,
        forma_pago: form.forma_pago,
        promociones_aplicadas: evaluacion?.aplicadas || [],
        dias_credito: form.forma_pago === 'credito' ? Number(form.dias_credito) : null,
        latitud: ubicacionFinal?.latitud,
        longitud: ubicacionFinal?.longitud,
        precision: ubicacionFinal?.precision,
        descuento,
        descuento_porcentaje: pctDescuento,
        envio,
        notas: form.notas,
        entrega_direccion: form.entrega_direccion || cliente?.direccion,
        documento_entrega: form.documento_entrega,
        items: lineas.map((l) => ({ producto_id: l.producto.id, cantidad: l.cantidad })),
      });
      toast(`Venta ${data.pedido.codigo} registrada · lista para otra venta`);
      setUltimaVenta(data.pedido);
      setTelComprobante(data.pedido.whatsapp_cliente || cliente?.whatsapp || cliente?.telefono || '');
      const telefono = data.pedido.whatsapp_cliente || cliente?.whatsapp || cliente?.telefono || '';
      if (autoWhatsapp && telefono) await enviarComprobante(data.pedido, telefono, true);
      reiniciarParaOtraVenta();
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
      // Se muestra el modal de comprobante; no se navega automáticamente.
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const mensajeComprobante = ventaExitosa
    ? `Hola ${cliente?.nombre || 'cliente'}, su comprobante de compra DADINI ${ventaExitosa.codigo}:\n${(ventaExitosa.items || []).map((i) => `• ${i.cantidad} x ${i.nombre}`).join('\n')}\nTOTAL: Bs ${Number(ventaExitosa.total || 0).toFixed(2)}\nGracias por comprar DADINI.`
    : '';

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

      {ultimaVenta && (
        <div className="notice notice-info mb-16">
          <CheckCircle2 size={15} />
          <div>
            <strong>Venta {ultimaVenta.codigo} registrada · Bs {Number(ultimaVenta.total || 0).toFixed(2)}</strong>
            <span className="hint">El carrito ya está limpio para la siguiente venta.</span>
          </div>
          <div className="inline" style={{ marginLeft: 'auto' }}>
            <button className="btn btn-green btn-sm" onClick={() => enviarComprobante(ultimaVenta, telComprobante, true)}><MessageCircle size={12} /> WhatsApp</button>
            <button className="btn btn-outline btn-sm" onClick={() => window.print()}><Printer size={12} /> Imprimir comprobante</button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/ventas/${ultimaVenta.id}`)}>Ver pedido</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setUltimaVenta(null)}>×</button>
          </div>
        </div>
      )}

      <div className="pos-layout">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Catálogo</h3><p>{filtrados.length} productos disponibles · venta por {presentacionVenta} · toca la imagen del producto o escanea su código</p></div>
            <div className="inline">
              <button className="btn btn-green btn-sm" onClick={() => setScanOpen(true)}><Camera size={13} /> Escanear código/QR</button>
              <label className="btn btn-soft btn-sm" title="Tomar foto del producto y elegir coincidencia"><Camera size={13} /> {buscandoImagen ? 'Analizando…' : 'Detectar por foto'}<input type="file" accept="image/*" capture="environment" hidden onChange={detectarPorImagen} /></label>
              <button className={`btn btn-sm ${modoImagenes ? 'btn-primary' : 'btn-soft'}`} onClick={() => setModoImagenes((v) => !v)}><Images size={13} /> Imágenes</button>
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
                <input id="buscar-producto" className="input" placeholder="Buscar producto, SKU, código de barras o QR…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <div className={`pos-products ${modoImagenes ? 'imagenes' : ''}`}>
                {filtrados.map((p) => {
                  const disponible = stockEn(p);
                  return (
                    <button key={p.id} className="pos-product" disabled={disponible <= 0} onClick={() => agregar(p)}>
                      {p.imagen_url
                        ? <img className="pp-img" src={p.imagen_url} alt={p.nombre} loading="lazy" />
                        : <span className="pp-emoji">{p.emoji}</span>}
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
              <div className="inline">
                <input className="input" value={clienteBusqueda} onChange={(e) => { setClienteBusqueda(e.target.value); setClienteResultados([]); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); buscarCliente(); } }} placeholder="Nombre, CI/NIT o código CLI-001" />
                <button className="btn btn-soft btn-sm" title="Buscar cliente" onClick={buscarCliente}><UserRound size={13} /> Buscar</button>
                <button className="btn btn-outline btn-sm" title="Registrar cliente nuevo" onClick={() => { setClienteForm({ nombre: clienteBusqueda, razon_social: clienteBusqueda, nit: '', ci: /^\d{5,}$/.test(clienteBusqueda) ? clienteBusqueda : '', telefono: '', whatsapp: '', direccion: '', tipo: 'minorista' }); setClienteModal(true); }}><UserPlus size={13} /> Nuevo</button>
              </div>
              <span className="hint">Escribe el carnet, NIT, nombre o código y pulsa Enter. Si no existe, se registra para futuras compras.</span>
              {clienteResultados.length > 0 && <div className="panel mt-8" style={{ boxShadow: 'none' }}>
                {clienteResultados.map((c) => <button key={c.id} className="btn btn-ghost btn-sm btn-block" onClick={() => seleccionarCliente(c)}>{c.nombre} · {c.codigo} · {c.ci || c.nit || 'sin CI/NIT'}</button>)}
              </div>}
              <select className="select mt-8" value={form.cliente_id} onChange={(e) => { const c = clientes.find((x) => x.id === Number(e.target.value)); setForm({ ...form, cliente_id: e.target.value }); if (c) seleccionarCliente(c); }}>
                <option value="">O seleccionar de la lista…</option>
                {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.codigo}</option>)}
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

            <div className="field mb-12">
              <label>WhatsApp para enviar el comprobante</label>
              <input className="input" value={form.whatsapp_cliente} onChange={(e) => setForm({ ...form, whatsapp_cliente: e.target.value })} placeholder="5917XXXXXXX" />
              <span className="hint">Se guarda en el cliente y permite enviar el detalle de la compra al finalizar.</span>
            </div>

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

            {form.forma_pago === 'qr' && (
              <div className="notice notice-info mb-12">
                <QrCode size={15} />
                <div>
                  {qrs.length ? (
                    <>
                      QR disponible: <strong>{qrs[0].nombre}</strong>{qrs[0].titular ? ` · ${qrs[0].titular}` : ''}. Vence el {qrs[0].fecha_vencimiento}.
                      <div style={{ marginTop: 6 }}><button className="btn btn-soft btn-sm" onClick={() => setQrOpen(true)}><QrCode size={13} /> Mostrar QR al cliente</button></div>
                    </>
                  ) : 'No hay un QR de pago configurado. Pide a administración que lo agregue.'}
                  {qrAlerta.length > 0 && <div className="notice notice-warn mt-8">QR por vencer o vencido: {qrAlerta.map((a) => `${a.nombre} (${a.estado})`).join(', ')}. Solicita el cambio.</div>}
                </div>
              </div>
            )}

            <div className="field-row mb-12">
              {puedeDescuento ? (
                <div className="field-row">
                  <div className="field"><label>Tipo de descuento</label><select className="select" value={form.descuento_tipo} onChange={(e) => setForm({ ...form, descuento_tipo: e.target.value })}><option value="bs">Bs</option><option value="porcentaje">%</option></select></div>
                  <div className="field"><label>Descuento ({form.descuento_tipo === 'porcentaje' ? '%' : 'Bs'})</label>
                    <input type="number" min="0" step={form.descuento_tipo === 'porcentaje' ? '1' : '0.5'} className="input"
                      value={form.descuento_tipo === 'porcentaje' ? form.descuento_porcentaje : form.descuento}
                      onChange={(e) => setForm({ ...form, [form.descuento_tipo === 'porcentaje' ? 'descuento_porcentaje' : 'descuento']: e.target.value })} />
                  </div>
                </div>
              ) : <div className="field"><label>Descuento</label><input className="input" value="Sin autorización para descontar" disabled readOnly /></div>}
              <div className="field"><label>Envío (Bs)</label><input type="number" min="0" step="0.5" className="input" value={form.envio} onChange={(e) => setForm({ ...form, envio: e.target.value })} /></div>
            </div>

            <div className="field-row mb-12">
              <div className="field"><label>Documento a entregar con el pedido</label>
                <select className="select" value={form.documento_entrega} onChange={(e) => setForm({ ...form, documento_entrega: e.target.value })}>
                  <option value="comprobante_entrega">Comprobante de entrega</option>
                  <option value="factura_siat" disabled={!puedeFacturar}>Factura con registro legal en el SIN{puedeFacturar ? '' : ' (sin autorización)'}</option>
                </select>
                <span className="hint">El comprobante lo imprime almacén o el distribuidor, o se envía por WhatsApp. La factura SIN requiere autorización de administración.</span>
              </div>
            </div>

            {form.documento_entrega === 'factura_siat' && (
              <div className="field-row mb-12">
                <div className="field"><label>Nombre del cliente</label><input className="input" value={cliente?.nombre || ''} readOnly /></div>
                <div className="field"><label>Razón social para la factura</label><input className="input" value={facturaForm.razon_social} onChange={(e) => setFacturaForm({ ...facturaForm, razon_social: e.target.value })} placeholder={cliente?.nombre || 'Razón social'} /></div>
                <div className="field"><label>NIT / CI</label><input className="input" value={facturaForm.nit} onChange={(e) => setFacturaForm({ ...facturaForm, nit: e.target.value })} placeholder={cliente?.ci || cliente?.nit || '0'} /></div>
              </div>
            )}
            <label className="check mb-12"><input type="checkbox" checked={autoWhatsapp} onChange={(e) => setAutoWhatsapp(e.target.checked)} /> Enviar comprobante por WhatsApp al registrar la venta</label>
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
                    <Crosshair size={12} /> {ubicando ? 'Ubicando…' : ubicacion ? 'Actualizar mi ubicación' : geocerca.aplica ? 'Capturar ubicación (obligatoria)' : 'Registrar visita aquí'}
                  </button>
                </div>
                {geocerca.aplica && (
                  <div className={`notice ${distanciaCliente !== null && distanciaCliente > geocerca.radio_m ? 'notice-danger' : 'notice-warn'}`} style={{ margin: '8px 0' }}>
                    <AlertTriangle size={14} />
                    Geocerca activa · límite {geocerca.radio_m} m
                    {distanciaCliente !== null ? ` · tu distancia: ${distanciaCliente} m` : ' · captura tu ubicación para continuar'}
                    {geocerca.zona ? ` · zona ${geocerca.zona}` : ''}
                  </div>
                )}
                <Mapa altura={150} puntos={[
                  { latitud: cliente.latitud, longitud: cliente.longitud, nombre: cliente.nombre, tipo: 'cliente' },
                  ...(ubicacion ? [{ latitud: ubicacion.latitud, longitud: ubicacion.longitud, nombre: 'Tu ubicación', tipo: 'venta' }] : []),
                ]} linea={Boolean(ubicacion)} />
              </div>
            )}
            {geocerca.aplica && cliente && !esCoordenaValida(cliente.latitud, cliente.longitud) && (
              <div className="notice notice-danger" style={{ marginBottom: 12 }}>
                <AlertTriangle size={14} /> El cliente no tiene ubicación registrada; la geocerca impide registrar la venta.
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

            {estadoVentas && !estadoVentas.permitido && ['ventas', 'preventista', 'vendedor_camion'].includes(user?.rol) && (
              <div className="notice notice-warn mt-8"><AlertTriangle size={14} /> {estadoVentas.motivo}</div>
            )}
            <button className="btn btn-primary btn-lg btn-block mt-16" onClick={guardar} disabled={saving || !lineas.length || (estadoVentas && !estadoVentas.permitido && ['ventas', 'preventista', 'vendedor_camion'].includes(user?.rol))} style={{ marginTop: 16 }}>
              {saving ? 'Registrando venta…' : `Registrar venta · Bs ${total.toFixed(2)}`}
            </button>
          </div>
        </div>
      </div>

      <EscanerCodigos open={scanOpen} onClose={() => setScanOpen(false)} onLeer={alLeerProducto} />

      <Modal open={qrOpen} onClose={() => setQrOpen(false)} title="QR de pago" subtitle="Muestra este QR al cliente para recibir el pago" size="sm">
        <div className="form-stack">
          {qrs.length === 0 && <div className="notice notice-warn">No hay QR activo configurado.</div>}
          {qrs.map((qr) => (
            <div key={qr.id} style={{ textAlign: 'center' }}>
              <h3>{qr.nombre}</h3>
              {qr.titular && <p className="small muted">A nombre de {qr.titular}</p>}
              <img src={qr.imagen} alt={`QR ${qr.nombre}`} style={{ maxWidth: 260, width: '100%', borderRadius: 10, border: '1px solid var(--line)' }} />
              <p className="small muted">Vigente hasta {qr.fecha_vencimiento}{qr.dias_restantes !== null ? ` · ${qr.dias_restantes} días restantes` : ''}</p>
              <Badge tone={qr.por_vencer ? 'amber' : 'green'}>{qr.estado}</Badge>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={Boolean(clienteModal)} onClose={() => setClienteModal(false)} title="Registrar cliente" subtitle="Se guarda para futuras transacciones" size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setClienteModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarCliente} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</button></>}
      >
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Nombre del cliente *</label><input className="input" value={clienteForm.nombre} onChange={(e) => setClienteForm({ ...clienteForm, nombre: e.target.value })} /></div>
            <div className="field"><label>Razón social</label><input className="input" value={clienteForm.razon_social} onChange={(e) => setClienteForm({ ...clienteForm, razon_social: e.target.value })} placeholder="Igual al nombre si es persona natural" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>CI / Carnet</label><input className="input" value={clienteForm.ci} onChange={(e) => setClienteForm({ ...clienteForm, ci: e.target.value })} /></div>
            <div className="field"><label>NIT</label><input className="input" value={clienteForm.nit} onChange={(e) => setClienteForm({ ...clienteForm, nit: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>WhatsApp</label><input className="input" value={clienteForm.whatsapp} onChange={(e) => setClienteForm({ ...clienteForm, whatsapp: e.target.value })} placeholder="5917XXXXXXX" /></div>
            <div className="field"><label>Teléfono</label><input className="input" value={clienteForm.telefono} onChange={(e) => setClienteForm({ ...clienteForm, telefono: e.target.value })} /></div>
          </div>
          <div className="field"><label>Dirección</label><input className="input" value={clienteForm.direccion} onChange={(e) => setClienteForm({ ...clienteForm, direccion: e.target.value })} /></div>
          <span className="hint">El sistema asigna automáticamente un código tipo CLI-001 para buscarlo en futuras ventas.</span>
        </div>
      </Modal>

      <Modal open={Boolean(fotoSugerencias)} onClose={() => setFotoSugerencias(null)} title="Producto detectado por imagen" subtitle="Elige el que coincide con la foto y se agregará al carrito" size="lg"
        footer={<button className="btn btn-ghost" onClick={() => setFotoSugerencias(null)}>Cancelar</button>}
      >
        <div className="grid grid-3" style={{ gap: 8 }}>
          {(fotoSugerencias || []).map((p) => <button key={p.id} className="pos-product" onClick={() => { agregar(p); setFotoSugerencias(null); toast(`${p.nombre} agregado al carrito`, 'success'); }}>
            {p.imagen_url ? <img className="pp-img" src={p.imagen_url} alt={p.nombre} /> : <span className="pp-emoji">{p.emoji}</span>}
            <span className="pp-name">{p.nombre}</span>
            <span className="pp-meta"><span className="pp-price"><Money value={precioEfectivo(p)} /></span></span>
          </button>)}
        </div>
        <span className="hint">La comparación es por similitud visual de colores con las imágenes registradas. Para lectura exacta usa el escáner de código/QR.</span>
      </Modal>

      <div className="print-only">
        <h3>DADINI · {ultimaVenta?.documento_entrega === 'factura_siat' ? 'Factura' : 'Comprobante de entrega'}</h3>
        <p className="small">{ultimaVenta?.codigo || ''} · {cliente?.nombre || 'Cliente'} · {facturaForm.razon_social} · NIT/CI {facturaForm.nit}</p>
        <table className="data-table"><thead><tr><th>Producto</th><th>Cantidad</th><th>P. unit.</th><th>Subtotal</th></tr></thead><tbody>
          {(ultimaVenta?.items || []).map((i, idx) => <tr key={idx}><td>{i.nombre}</td><td>{i.cantidad}</td><td>Bs {Number(i.precio || 0).toFixed(2)}</td><td>Bs {Number(i.subtotal || 0).toFixed(2)}</td></tr>)}
        </tbody></table>
        <p className="small mt-8"><strong>Total Bs {Number(ultimaVenta?.total || 0).toFixed(2)}</strong> · {ultimaVenta?.forma_pago || ''}</p>
        {ultimaVenta?.factura && <p className="small">Factura N° {ultimaVenta.factura.numero} · IVA Bs {Number(ultimaVenta.factura.iva || 0).toFixed(2)} · IT Bs {Number(ultimaVenta.factura.it || 0).toFixed(2)}</p>}
        <p className="small muted">Creado por DADINI S STORE</p>
      </div>
    </>
  );
}
