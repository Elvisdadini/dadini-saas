import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarChart3, CheckCircle2, ClipboardList, Crosshair, MapPin, Navigation, Plus, RefreshCcw, ShoppingCart,
  Target, UserX, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import Mapa from '../components/Mapa';
import BotonWhatsapp from '../components/BotonWhatsapp';
import { formatoCoords, obtenerUbicacion } from '../geo';
import { optimizarImagen } from '../imagen';
import { Badge, EmptyState, Modal, Money, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const DIAS = [
  { value: 1, label: 'Lunes' }, { value: 2, label: 'Martes' }, { value: 3, label: 'Miércoles' },
  { value: 4, label: 'Jueves' }, { value: 5, label: 'Viernes' }, { value: 6, label: 'Sábado' }, { value: 7, label: 'Domingo' },
];
const CAMBIO_VACIO = { producto_id: '', nombre_producto: '', cantidad: 1, motivo: 'mal estado', detalle: '', lote: '', fecha_vencimiento: '', foto: null };

const MOTIVOS = [
  { value: 'cerrado', label: 'Local cerrado' },
  { value: 'con_stock', label: 'Aún tiene stock' },
  { value: 'sin_dinero', label: 'Sin dinero / crédito' },
  { value: 'otro', label: 'Otra objeción' },
  { value: 'cambio', label: 'Cambio de producto' },
];

export default function AgendaPreventa() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const esAdmin = ['admin', 'dueno'].includes(user?.rol);
  const [data, setData] = useState(null);
  const [visitas, setVisitas] = useState([]);
  const [dia, setDia] = useState(Number(params.get('dia')) || null);
  const [vendedorId, setVendedorId] = useState(params.get('vendedor_id') || '');
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [visitaMapa, setVisitaMapa] = useState(null);
  const [visitaMapaForm, setVisitaMapaForm] = useState({ motivo: 'cerrado', notas: '', detalle: '', foto: null, latitud: '', longitud: '' });
  const [avanceAbierto, setAvanceAbierto] = useState(false);
  const [avance, setAvance] = useState(null);
  const [form, setForm] = useState({ resultado: 'pedido', motivo: '', notas: '', detalle: '', foto: null, latitud: '', longitud: '', precision: null });
  const [ubicando, setUbicando] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productos, setProductos] = useState([]);
  const [cambioForm, setCambioForm] = useState(CAMBIO_VACIO);

  const queryAgenda = () => {
    const q = new URLSearchParams();
    if (dia) q.set('dia', dia);
    if (vendedorId) q.set('vendedor_id', vendedorId);
    const texto = q.toString();
    return texto ? `?${texto}` : '';
  };

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [a, v, av, pr] = await Promise.all([
        api.get(`/visitas/agenda${queryAgenda()}`),
        api.get('/visitas?tipo=preventa&limit=200'),
        api.get(`/objetivos/avance${vendedorId ? `?vendedor_id=${vendedorId}` : ''}`),
        api.get('/productos'),
      ]);
      setProductos(pr.productos || []);
      setData(a);
      setVisitas(v.visitas || []);
      setAvance(av);
      if (!dia && a.dia) setDia(a.dia);
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, vendedorId, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const v = await api.get('/visitas?tipo=preventa&limit=200');
        setVisitas(v.visitas || []);
        const a = await api.get(`/visitas/agenda${queryAgenda()}`);
        setData(a);
      } catch (error) { /* silencioso */ }
    }, 15000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dia, vendedorId]);

  const abrirVisita = (cliente) => {
    setModal(cliente);
    setForm({ resultado: 'pedido', motivo: '', notas: '', detalle: '', foto: null, latitud: cliente.latitud || '', longitud: cliente.longitud || '', precision: null });
    setCambioForm(CAMBIO_VACIO);
  };

  const capturar = async () => {
    setUbicando(true);
    try {
      const punto = await obtenerUbicacion();
      setForm((f) => ({ ...f, ...punto }));
      toast('Ubicación capturada');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUbicando(false);
    }
  };

  const abrirVisitaMapa = async (cliente) => {
    let ubicacion = null;
    try { ubicacion = await obtenerUbicacion(); } catch (error) { toast(error.message, 'error'); }
    setVisitaMapaForm({
      motivo: 'cerrado', notas: '', detalle: '', foto: null,
      latitud: ubicacion?.latitud ?? cliente.latitud ?? '',
      longitud: ubicacion?.longitud ?? cliente.longitud ?? '',
    });
    setCambioForm(CAMBIO_VACIO);
    setVisitaMapa(cliente);
  };

  const bloqueCambio = (origen, actualizar) => (
    <div className="panel" style={{ boxShadow: 'none' }}>
      <div className="panel-head"><h3>Cambio de producto</h3><Badge tone="orange">{origen.motivo === 'cambio' ? 'Requerido' : 'Opcional'}</Badge></div>
      <div className="panel-body">
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Producto</label>
              <select className="select" value={cambioForm.producto_id} onChange={(e) => {
                const p = productos.find((x) => x.id === Number(e.target.value));
                setCambioForm({ ...cambioForm, producto_id: e.target.value, nombre_producto: p?.nombre || '' });
              }}>
                <option value="">Seleccionar…</option>
                {productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
            <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" value={cambioForm.cantidad} onChange={(e) => setCambioForm({ ...cambioForm, cantidad: e.target.value })} /></div>
          </div>
          <div className="field"><label>Motivo del cambio</label>
            <select className="select" value={cambioForm.motivo} onChange={(e) => setCambioForm({ ...cambioForm, motivo: e.target.value })}>
              <option value="mal estado">Producto en mal estado</option>
              <option value="solicitud vendedor">Cambio solicitado por el vendedor</option>
              <option value="error entrega">Error en la entrega</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="field"><label>Detalles</label><textarea className="textarea" value={cambioForm.detalle} onChange={(e) => setCambioForm({ ...cambioForm, detalle: e.target.value })} placeholder="Describe qué se cambia y por qué…" /></div>
          <div className="field-row">
            <div className="field"><label>Lote</label><input className="input" value={cambioForm.lote} onChange={(e) => setCambioForm({ ...cambioForm, lote: e.target.value })} placeholder="Ej. LOTE-2401" /></div>
            <div className="field"><label>Fecha de vencimiento</label><input className="input" type="date" value={cambioForm.fecha_vencimiento} onChange={(e) => setCambioForm({ ...cambioForm, fecha_vencimiento: e.target.value })} /></div>
          </div>
          <div className="field">
            <label>Foto de comprobante</label>
            <input type="file" accept="image/*" className="input" onChange={async (e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              try { setCambioForm({ ...cambioForm, foto: await optimizarImagen(archivo) }); }
              catch (error) { toast(error.message, 'error'); }
              e.target.value = '';
            }} />
            {cambioForm.foto && <img src={cambioForm.foto} alt="Comprobante" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 7, marginTop: 8 }} />}
          </div>
        </div>
      </div>
    </div>
  );

  const payloadCambio = (motivo) => {
    const tiene = cambioForm.producto_id || cambioForm.detalle || cambioForm.lote || cambioForm.foto;
    if (motivo !== 'cambio' && !tiene) return [];
    if (motivo === 'cambio' && !cambioForm.producto_id) {
      toast('Selecciona el producto del cambio.', 'error');
      return null;
    }
    return [{
      producto_id: Number(cambioForm.producto_id) || null,
      nombre_producto: cambioForm.nombre_producto,
      cantidad: Math.max(1, Number(cambioForm.cantidad) || 1),
      motivo: cambioForm.motivo,
      detalle: cambioForm.detalle,
      lote: cambioForm.lote,
      fecha_vencimiento: cambioForm.fecha_vencimiento,
      foto: cambioForm.foto,
    }];
  };

  const guardarNoCompra = async () => {
    if (!visitaMapa) return;
    const cambios = payloadCambio(visitaMapaForm.motivo);
    if (cambios === null) return;
    try {
      await api.post('/visitas', {
        cliente_id: visitaMapa.id,
        tipo: 'preventa',
        modulo: 'Ventas',
        estado: 'completada',
        resultado: 'no_pedido',
        motivo: visitaMapaForm.motivo,
        detalle: visitaMapaForm.detalle,
        foto: visitaMapaForm.foto,
        cambios,
        notas: visitaMapaForm.notas || `Sin compra: ${visitaMapaForm.motivo}`,
        latitud: visitaMapaForm.latitud,
        longitud: visitaMapaForm.longitud,
      });
      toast('Visita sin compra registrada con coordenadas');
      setVisitaMapa(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const guardar = async () => {
    if (!modal) return;
    if (form.resultado === 'no_pedido' && !form.motivo) return toast('Selecciona el motivo de la objeción.', 'error');
    const motivo = form.resultado === 'no_pedido' ? form.motivo : null;
    const cambios = payloadCambio(motivo);
    if (cambios === null) return;
    setSaving(true);
    try {
      await api.post('/visitas', {
        cliente_id: modal.id,
        tipo: 'preventa',
        modulo: 'Ventas',
        estado: 'completada',
        resultado: form.resultado,
        motivo,
        detalle: form.detalle,
        foto: form.foto,
        cambios,
        notas: form.notas || (form.resultado === 'pedido' ? 'Pedido confirmado en visita' : `Sin pedido: ${motivo}`),
        latitud: form.latitud,
        longitud: form.longitud,
        precision: form.precision,
      });
      toast(form.resultado === 'pedido' ? 'Visita con pedido registrada' : 'Objeción registrada');
      setModal(null);
      await cargar();
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const resumen = data?.resumen || {};
  const clientes = data?.clientes || [];

  useEffect(() => {
    const clienteId = Number(params.get('cliente'));
    if (!clienteId || !clientes.length || visitaMapa) return;
    const encontrado = clientes.find((c) => c.id === clienteId);
    const limpiarParametro = () => {
      const restantes = new URLSearchParams(params);
      restantes.delete('cliente');
      const texto = restantes.toString();
      navigate(`/ventas/agenda${texto ? `?${texto}` : ''}`, { replace: true });
    };
    if (encontrado) {
      abrirVisitaMapa(encontrado);
      limpiarParametro();
      return;
    }
    api.get(`/clientes/${clienteId}`)
      .then((r) => { if (r.cliente) { abrirVisitaMapa(r.cliente); limpiarParametro(); } })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, clientes]);
  const puntosMapa = [
    ...clientes.map((c) => ({
      id: `cli-${c.id}`,
      latitud: c.latitud,
      longitud: c.longitud,
      nombre: c.nombre,
      descripcion: `${c.codigo} · ${c.direccion}`,
      tipo: 'cliente',
      estado: c.sin_compra_mes ? 'sin_compra_mes' : c.visitada ? (c.ultima_visita?.resultado === 'pedido' ? 'visitado' : 'sin_pedido') : 'pendiente',
      acciones: [
        { label: 'Registrar visita', tone: 'green', onClick: (punto) => { const id = Number(String(punto.id).replace('cli-', '')); const cli = clientes.find((x) => x.id === id); if (cli) abrirVisitaMapa(cli); } },
      ],
    })),
    ...visitas
      .filter((v) => clientes.some((c) => c.id === v.cliente_id))
      .map((v) => ({
        id: `vis-${v.id}`,
        latitud: v.latitud,
        longitud: v.longitud,
        nombre: `${v.cliente_nombre} · ${v.resultado}`,
        descripcion: v.notas,
        tipo: 'visita',
        estado: v.resultado,
      })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Preventa"
        title="Agenda de visitas"
        subtitle={data ? `${data.vendedor_nombre || 'Vendedor'} · ${data.ruta_venta || 'Sin ruta'} / ${data.zona || 'sin zona'} · Distribuidor: ${data.distribuidor_nombre} · se actualiza cada 15 s` : 'Cargando agenda…'}
        actions={<button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>}
      />

      {esAdmin && (
        <div className="filters mb-16">
          <select className="select" value={vendedorId} onChange={(e) => setVendedorId(e.target.value)}>
            <option value="">Todos los vendedores</option>
            {(data?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nombre} · {v.ruta_venta || 'sin ruta'}</option>)}
          </select>
          <span className="small muted">Selecciona un vendedor para ver solo sus clientes asignados por día y zona.</span>
        </div>
      )}

      <div className="inline mb-16">
        <button className={`btn ${avanceAbierto ? 'btn-navy' : 'btn-primary'}`} onClick={() => setAvanceAbierto(!avanceAbierto)}>
          <BarChart3 size={14} /> {avanceAbierto ? 'Ocultar avance de ruta' : 'Avance de ruta'}
        </button>
      </div>

      <div className="inline mb-16">
        {(data?.por_dia || DIAS).map((d) => (
          <button key={d.dia || d.value} className={`chip ${dia === (d.dia || d.value) ? 'active' : ''}`} onClick={() => setDia(d.dia || d.value)}>
            {(DIAS.find((x) => x.value === (d.dia || d.value)) || {}).label || d.label} <span className="tab-count">{d.total ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(5, minmax(0,1fr))' }}>
        <StatCard label="Clientes asignados" value={resumen.asignados || 0} icon={ClipboardList} tone="blue" hint={`Día ${dia || '—'}`} />
        <StatCard label="Visitados" value={resumen.visitados || 0} icon={CheckCircle2} tone="green" hint="Check-ins registrados" />
        <StatCard label="Con pedido" value={resumen.con_pedido || 0} icon={ShoppingCart} tone="orange" hint="Migran al distribuidor" />
        <StatCard label="Sin pedido" value={resumen.sin_pedido || 0} icon={UserX} tone="red" hint="Objeciones registradas" />
        <StatCard label="Pedidos del día" value={resumen.pedidos || 0} icon={Wallet} tone="purple" hint="Creados por ti hoy" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3>Mapa de visitas del día</h3><p>Todos los clientes asignados a {data?.vendedor_nombre || 'este vendedor'} en {data?.zona || 'su zona'} · ruta {data?.ruta_venta || '—'} · geolocalización en tiempo real</p></div>
          <span className="badge badge-orange">{puntosMapa.length} puntos</span>
        </div>
        <div className="panel-body">
          <Mapa altura={320} puntos={puntosMapa} />
        </div>
      </div>

      {avanceAbierto && (
      <div className="panel">
        <div className="panel-head"><div><h3>Clientes a visitar</h3><p>{clientes.length} clientes · registra el resultado de cada visita</p></div></div>
        {loading ? <SkeletonRows rows={8} /> : clientes.length === 0 ? (
          <EmptyState icon={MapPin} title="Sin clientes para este día" message="Cambia el día en los filtros superiores." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Cliente</th><th>Zona</th><th>Resultado</th><th>Compras mes</th><th>Visitas mes</th><th>Pedidos hoy</th><th /></tr></thead>
              <tbody>
                {clientes.map((c) => {
                  const v = c.ultima_visita;
                  return (
                    <tr key={c.id} className="clickable" onClick={() => setDetalle(c)}>
                      <td className="cell-strong">{c.nombre}<span className="cell-sub">{c.codigo} · {c.tipo}</span></td>
                      <td>{c.zona}</td>
                      <td>{v ? (
                        <div className="inline"><Badge tone={v.resultado === 'pedido' ? 'green' : 'red'}>{v.resultado === 'pedido' ? 'Pedido' : 'Sin pedido'}</Badge>{v.motivo && <span className="small muted">{v.motivo}</span>}</div>
                      ) : <Badge tone="gray">Pendiente</Badge>}</td>
                      <td className="num">{c.sin_compra_mes ? <Badge tone="gray">0</Badge> : <strong>{c.compras_mes || 0}</strong>}</td>
                      <td className="num">{c.visitas_mes || 0}</td>
                      <td className="num">{c.pedidos_hoy || 0}</td>
                      <td className="actions">
                        <button className="btn btn-soft btn-sm" onClick={(e) => { e.stopPropagation(); abrirVisita(c); }}><Navigation size={12} /> Visitar</button>
                        <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/ventas/nueva?cliente=${c.id}`); }}><Plus size={12} /> Vender</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}

      {avanceAbierto && (
        <div className="panel section-gap">
          <div className="panel-head"><div><h3>Informe de avance de ruta</h3><p>Actualizado en tiempo real · visitas, pedidos y meta mensual</p></div><Target size={16} /></div>
          <div className="panel-body">
            <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Total clientes del día</span><strong>{data?.resumen?.asignados || 0}</strong></div>
              <div className="mini-stat"><span>Realizaron pedido</span><strong className="text-green">{data?.resumen?.con_pedido || 0}</strong></div>
              <div className="mini-stat"><span>Sin pedido</span><strong className="text-red">{data?.resumen?.sin_pedido || 0}</strong></div>
              <div className="mini-stat"><span>Sin compra en el mes</span><strong className="muted">{data?.resumen?.sin_compra_mes || 0}</strong></div>
              <div className="mini-stat"><span>Visitas en el mes</span><strong>{data?.resumen?.visitas_mes || 0}</strong></div>
              <div className="mini-stat"><span>Compras en el mes</span><strong>{data?.resumen?.compras_mes || 0}</strong></div>
              <div className="mini-stat"><span>Ventas mes</span><strong><Money value={data?.resumen?.total_mes} /></strong></div>
              <div className="mini-stat"><span>Ventas hoy</span><strong><Money value={avance?.avance?.ventas_hoy} /></strong></div>
            </div>

            {avance?.objetivo ? (
              <>
                <div className="divider" />
                <div className="inline mb-8"><h4 className="small" style={{ marginRight: 'auto' }}>Objetivo mensual · {avance.objetivo.mes}</h4><Badge tone="orange">{avance.objetivo.tipo}</Badge></div>
                <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
                  <div className="mini-stat"><span>Meta mensual</span><strong><Money value={avance.avance.meta} /></strong></div>
                  <div className="mini-stat"><span>Días laborables</span><strong>{avance.avance.dias_laborables}</strong></div>
                  <div className="mini-stat"><span>Meta diaria</span><strong><Money value={avance.avance.meta_diaria} /></strong></div>
                  <div className="mini-stat"><span>Progreso</span><strong>{avance.avance.progreso}%</strong></div>
                  <div className="mini-stat"><span>Falta diaria</span><strong className="text-orange"><Money value={avance.avance.falta_diaria} /></strong></div>
                  <div className="mini-stat"><span>Clientes hoy</span><strong>{avance.avance.clientes_dia}</strong></div>
                  <div className="mini-stat"><span>Con pedido hoy</span><strong>{avance.avance.con_pedido_hoy}</strong></div>
                  <div className="mini-stat"><span>Sin pedido hoy</span><strong>{avance.avance.sin_pedido_hoy}</strong></div>
                </div>
                <div className="notice notice-info"><Target size={15} /> Debes vender <strong><Money value={avance.avance.monto_por_cliente} /></strong> a cada cliente pendiente de los {avance.avance.sin_pedido_hoy} que aún no compraron hoy para cumplir la meta diaria de <Money value={avance.avance.meta_diaria} />.</div>
                {avance.objetivo.tipo !== 'monto' && (
                  <div className="notice notice-warn mt-8">Meta de {avance.objetivo.tipo}: {avance.objetivo.producto_nombre} · {avance.avance.unidades_producto} / {avance.avance.meta_unidades} unidades ({avance.avance.progreso_producto}%).</div>
                )}
              </>
            ) : (
              <div className="notice notice-warn">Aún no hay objetivo mensual configurado para este vendedor. Ve a Ventas → Generar objetivos mensuales.</div>
            )}
          </div>
        </div>
      )}

      <Modal open={Boolean(visitaMapa)} onClose={() => setVisitaMapa(null)} title={`Registrar visita · ${visitaMapa?.nombre || ''}`} subtitle={visitaMapa ? `${visitaMapa.codigo} · ${visitaMapa.zona}` : ''} size="md">
        {!visitaMapa ? null : (
          <div className="form-stack">
            <div className="notice notice-info"><MapPin size={14} /> Ubicación: {formatoCoords(visitaMapaForm.latitud, visitaMapaForm.longitud)}</div>
            <div className="grid grid-2" style={{ gap: 10 }}>
              <button className="btn btn-primary btn-block" onClick={() => navigate(`/ventas/nueva?cliente=${visitaMapa.id}&from=mapa`)}>
                <Plus size={14} /> Registrar pedido
              </button>
              <button className="btn btn-outline btn-block" onClick={() => setVisitaMapaForm({ ...visitaMapaForm, motivo: 'cerrado' })}>
                <UserX size={14} /> Registrar no compra
              </button>
            </div>
            <div className="divider" />
            <div className="field"><label>Detalle de la visita</label>
              <select className="select" value={visitaMapaForm.motivo} onChange={(e) => setVisitaMapaForm({ ...visitaMapaForm, motivo: e.target.value })}>
                <option value="cerrado">Local cerrado</option>
                <option value="con_stock">Aún tiene stock</option>
                <option value="sin_dinero">Sin dinero</option>
                <option value="otro">Otra objeción</option>
                <option value="cambio">Cambio de producto</option>
              </select>
            </div>
            <div className="field"><label>Detalle del motivo</label><textarea className="textarea" value={visitaMapaForm.detalle} onChange={(e) => setVisitaMapaForm({ ...visitaMapaForm, detalle: e.target.value })} placeholder="Ej. el cliente quiere cambiar el producto por otro…" /></div>
            <div className="field"><label>Foto de comprobante</label><input type="file" accept="image/*" className="input" onChange={async (e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              try { setVisitaMapaForm({ ...visitaMapaForm, foto: await optimizarImagen(archivo) }); }
              catch (error) { toast(error.message, 'error'); }
              e.target.value = '';
            }} />{visitaMapaForm.foto && <img src={visitaMapaForm.foto} alt="Comprobante" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />}</div>
            {visitaMapaForm.motivo === 'cambio' && bloqueCambio(visitaMapaForm, setVisitaMapaForm)}
            <div className="field"><label>Notas</label><textarea className="textarea" value={visitaMapaForm.notas} onChange={(e) => setVisitaMapaForm({ ...visitaMapaForm, notas: e.target.value })} placeholder="Observaciones de la visita…" /></div>
            <div className="inline">
              <button className="btn btn-ghost" onClick={() => setVisitaMapa(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarNoCompra}>Guardar visita sin compra</button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(detalle)} onClose={() => setDetalle(null)} title={detalle?.nombre || 'Ficha del cliente'} subtitle={detalle ? `${detalle.codigo} · ${detalle.ruta_venta} · ${detalle.zona}` : ''} size="md">
        {!detalle ? null : (
          <div className="form-stack">
            <div className="grid grid-2" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Día de visita</span><strong>{['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][detalle.dia_visita] || '—'}</strong></div>
              <div className="mini-stat"><span>Coordenadas</span><strong style={{ fontSize: 12 }}>{formatoCoords(detalle.latitud, detalle.longitud)}</strong></div>
            </div>
            <div className="info-row"><span>Dirección</span><strong>{detalle.direccion || '—'}</strong></div>
            <div className="info-row"><span>Última visita</span><strong>{detalle.ultima_visita ? `${detalle.ultima_visita.resultado} · ${new Date(detalle.ultima_visita.fecha).toLocaleString('es-BO')}` : 'Sin registrar'}</strong></div>
            {detalle.ultima_visita?.detalle && <div className="info-row"><span>Detalle del motivo</span><strong>{detalle.ultima_visita.detalle}</strong></div>}
            {detalle.ultima_visita?.cambios?.length > 0 && (
              <div className="notice notice-warn">
                <strong>Cambio de producto registrado</strong>
                {detalle.ultima_visita.cambios.map((c, i) => (
                  <p key={i} style={{ margin: '4px 0 0' }}>
                    {c.nombre_producto || `#${c.producto_id}`} · {c.cantidad} ud. · {c.motivo}
                    {c.detalle ? ` · ${c.detalle}` : ''}
                    {c.lote ? ` · Lote ${c.lote}` : ''}
                    {c.fecha_vencimiento ? ` · Vence ${c.fecha_vencimiento}` : ''}
                  </p>
                ))}
              </div>
            )}
            {detalle.ultima_visita?.foto_url && <a href={detalle.ultima_visita.foto_url} target="_blank" rel="noreferrer"><img src={detalle.ultima_visita.foto_url} alt="Comprobante" style={{ width: 90, height: 68, objectFit: 'cover', borderRadius: 6 }} /></a>}
            {detalle.ultima_visita?.cambios?.some((c) => c.foto_url) && detalle.ultima_visita.cambios.filter((c) => c.foto_url).map((c, i) => (
              <a key={i} href={c.foto_url} target="_blank" rel="noreferrer"><img src={c.foto_url} alt="Comprobante de cambio" style={{ width: 90, height: 68, objectFit: 'cover', borderRadius: 6, marginLeft: 6 }} /></a>
            ))}
            <div className="divider" />
            <div className="inline">
              <button className="btn btn-primary" onClick={() => { setModal(detalle); setDetalle(null); }}><Navigation size={13} /> Marcar visitado / motivo</button>
              <button className="btn btn-navy" onClick={() => navigate(`/ventas/nueva?cliente=${detalle.id}`)}><Plus size={13} /> Crear pedido</button>
            </div>
            <BotonWhatsapp tipo="pedido" clienteId={detalle.id} telefono={detalle.telefono} latitud={detalle.latitud} longitud={detalle.longitud} referencia="Visita de preventa" label="Avisar por WhatsApp" />
          </div>
        )}
      </Modal>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal?.nombre || 'Registrar visita'} subtitle={modal ? `${modal.codigo} · ${modal.zona} · ${formatoCoords(modal.latitud, modal.longitud)}` : ''} size="md">
        <div className="form-stack">
          <div className="field"><label>Resultado de la visita</label>
            <div className="pill-group">
              <button className={`chip ${form.resultado === 'pedido' ? 'active' : ''}`} onClick={() => setForm({ ...form, resultado: 'pedido', motivo: '' })}><ShoppingCart size={12} /> Hice pedido</button>
              <button className={`chip ${form.resultado === 'no_pedido' ? 'active' : ''}`} onClick={() => setForm({ ...form, resultado: 'no_pedido' })}><UserX size={12} /> No hice pedido</button>
            </div>
          </div>
          {form.resultado === 'no_pedido' && (
            <div className="field"><label>Motivo de la objeción</label>
              <select className="select" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>
                <option value="">Seleccionar motivo…</option>
                {MOTIVOS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}
          {form.resultado === 'no_pedido' && (
            <>
              <div className="field"><label>Detalle del motivo</label><textarea className="textarea" value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} placeholder="Ej. quiere cambiar el producto por otro modelo…" /></div>
              <div className="field"><label>Foto de comprobante</label><input type="file" accept="image/*" className="input" onChange={async (e) => {
                const archivo = e.target.files?.[0];
                if (!archivo) return;
                try { setForm({ ...form, foto: await optimizarImagen(archivo) }); }
                catch (error) { toast(error.message, 'error'); }
                e.target.value = '';
              }} />{form.foto && <img src={form.foto} alt="Comprobante" style={{ width: 80, height: 60, objectFit: 'cover', borderRadius: 6, marginTop: 6 }} />}</div>
              {form.motivo === 'cambio' && bloqueCambio(form, setForm)}
            </>
          )}
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Observaciones de la visita…" /></div>
          <div className="geo-editor">
            <div className="geo-editor-head">
              <div><strong><Crosshair size={13} /> Ubicación de la visita</strong><span className="hint">Se muestra en el mapa del distribuidor y en el reporte.</span></div>
              <button className="btn btn-soft btn-sm" onClick={capturar} disabled={ubicando}>{ubicando ? 'Ubicando…' : 'Usar mi ubicación'}</button>
            </div>
            <div className="field-row">
              <div className="field"><label>Latitud</label><input className="input" type="number" step="0.000001" value={form.latitud} onChange={(e) => setForm({ ...form, latitud: e.target.value })} /></div>
              <div className="field"><label>Longitud</label><input className="input" type="number" step="0.000001" value={form.longitud} onChange={(e) => setForm({ ...form, longitud: e.target.value })} /></div>
            </div>
          </div>
          <div className="inline mt-8">
            <button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar visita'}</button>
            {form.resultado === 'pedido' && <button className="btn btn-navy" onClick={() => navigate(`/ventas/nueva?cliente=${modal.id}`)}><Plus size={13} /> Registrar venta</button>}
          </div>
        </div>
      </Modal>
    </>
  );
}
