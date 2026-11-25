import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { descargarPlantilla, leerExcel } from '../excel';
import { useSearchParams } from 'react-router-dom';
import {
  Building2, CalendarCheck, CheckCircle2, CircleDollarSign, Crosshair, Eye, ExternalLink, FileSpreadsheet, Lock, Mail, MapPin, MessageCircle, Navigation, Pencil, Phone, Plus, Search, ShieldAlert, ShieldCheck, ShoppingCart, Sparkles, Tag, Truck, Unlock, Upload, UserRound, Users, Wallet,
} from 'lucide-react';
import { api, qs } from '../api';
import { puede, useAuth } from '../auth';
import Mapa from '../components/Mapa';
import { abrirEnMapas, esCoordenaValida, formatoCoords, obtenerUbicacion } from '../geo';
import { Badge, EmptyState, Estado, Fecha, Modal, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIO = { nombre: '', tipo: 'minorista', tipo_cliente_id: '', zona: '', direccion: '', telefono: '', whatsapp: '', email: '', limite_credito: 0, contacto: '', notas: '', activo: true, latitud: '', longitud: '', precision: null, ruta_venta: '', dia_visita: '', categoria_cliente_id: '', vendedor_id: '' };

export default function Clientes() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(params.get('q') || '');
  const [tipo, setTipo] = useState('todos');
  const [zona, setZona] = useState('todas');
  const [conSaldo, setConSaldo] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [detail, setDetail] = useState(null);
  const [bloqueo, setBloqueo] = useState(null);
  const [motivoBloqueo, setMotivoBloqueo] = useState('');
  const [porDeuda, setPorDeuda] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importando, setImportando] = useState(false);
  const [creadoModal, setCreadoModal] = useState(null);
  const [diaSugerido, setDiaSugerido] = useState(null);
  const [visitaModal, setVisitaModal] = useState(false);
  const [visitaForm, setVisitaForm] = useState({ resultado: 'pedido', motivo: '', notas: '', latitud: '', longitud: '' });
  const [reasignarModal, setReasignarModal] = useState(false);
  const [reasignarForm, setReasignarForm] = useState({ vendedor_id: '', ruta_venta: '', zona: '', reasignar_pedidos: true });
  const [asignarModal, setAsignarModal] = useState(false);
  const [asignarForm, setAsignarForm] = useState({ vendedor_id: '', cliente_ids: [] });
  const [vendedores, setVendedores] = useState([]);
  const [saving, setSaving] = useState(false);
  const [ubicando, setUbicando] = useState(false);

  const cargar = async () => {
    setLoading(true);
    try {
      setData(await api.get(`/clientes${qs({ search, tipo, zona, con_saldo: conSaldo ? 'true' : '' })}`));
    } catch (error) {
      toast(error.message, 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = window.setTimeout(cargar, 250);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tipo, zona, conSaldo]);

  useEffect(() => {
    api.get('/usuarios').then((r) => setVendedores((r.usuarios || []).filter((u) => ['ventas', 'preventista'].includes(u.rol)))).catch(() => {});
  }, []);

  const puedeEditar = useMemo(() => puede(user, 'clientes'), [user]);
  const puedeCrear = useMemo(() => puede(user, 'clientes_crear'), [user]);
  const puedeAsignar = useMemo(() => puede(user, 'clientes_editar'), [user]);

  // Día de la preventa: el elegido o, si está en "automático", el día actual.
  const diaHoy = (() => { const d = new Date().getDay() || 7; return d > 5 ? 1 : d; })();
  const diaEfectivo = Number(form.dia_visita) || diaHoy;
  const vendedorFormId = Number(form.vendedor_id) || user?.id;
  const tiposDeRuta = useMemo(() => {
    const codigo = form.ruta_venta || editando?.ruta_venta;
    const ruta = (data?.rutasVenta || []).find((r) => r.codigo === codigo);
    const ids = ruta?.tipos_cliente_ids || [];
    return ids.length ? (data?.tiposCliente || []).filter((t) => ids.map(Number).includes(t.id)) : [];
  }, [data, form.ruta_venta, editando]);

  const zonasDelDia = useMemo(() => {
    const ids = new Set();
    const nombres = new Set();
    (data?.rutasVenta || []).forEach((r) => {
      if (r.activa === false) return;
      if (Number(r.vendedor_id) !== Number(vendedorFormId)) return;
      const dias = r.dias_visita || [r.dia_visita];
      if (!dias.map(Number).includes(Number(diaEfectivo))) return;
      const delDia = r.zonas_por_dia?.[diaEfectivo] ?? r.zonas_por_dia?.[String(diaEfectivo)];
      if (Array.isArray(delDia)) {
        delDia.forEach((id) => {
          const zona = (data?.zonasCatalogo || []).find((z) => Number(z.id) === Number(id));
          ids.add(Number(id));
          if (zona) nombres.add(zona.nombre);
        });
        return;
      }
      (r.zona_ids || (r.zona_id ? [r.zona_id] : [])).forEach((id) => ids.add(Number(id)));
      (r.zonas || (r.zona ? [r.zona] : [])).forEach((z) => nombres.add(z));
    });
    const catalogo = data?.zonasCatalogo || [];
    const resultado = catalogo.filter((z) => ids.has(Number(z.id)) || nombres.has(z.nombre));
    if (!resultado.length) {
      catalogo.filter((z) => nombres.has(z.nombre)).forEach((z) => resultado.push(z));
    }
    return resultado;
  }, [data, vendedorFormId, diaEfectivo]);

  useEffect(() => {
    if (!formOpen || !zonasDelDia.length) return;
    if (!zonasDelDia.some((z) => z.nombre === form.zona)) {
      setForm((f) => ({ ...f, zona: zonasDelDia[0].nombre }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, zonasDelDia.map((z) => z.id).join(','), diaEfectivo, vendedorFormId]);

  const abrirNuevo = () => { setEditando(null); setForm(VACIO); setFormOpen(true); };
  const abrirEditar = (c) => {
    setEditando(c);
    setForm({ nombre: c.nombre, tipo: c.tipo, tipo_cliente_id: c.tipo_cliente_id || '', zona: c.zona, direccion: c.direccion, telefono: c.telefono, whatsapp: c.whatsapp || '', email: c.email, limite_credito: c.limite_credito, contacto: c.contacto, notas: c.notas, activo: c.activo, latitud: c.latitud ?? '', longitud: c.longitud ?? '', precision: c.precision ?? null, ruta_venta: c.ruta_venta || '', dia_visita: c.dia_visita || '', categoria_cliente_id: c.categoria_cliente_id || '', vendedor_id: c.vendedor_id || '' });
    setFormOpen(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast('El nombre es obligatorio.', 'error');
    setSaving(true);
    try {
      if (editando) {
        await api.put(`/clientes/${editando.id}`, form);
        toast('Cliente actualizado');
        setFormOpen(false);
      } else {
        const respuesta = await api.post('/clientes', form);
        const nuevo = respuesta.cliente;
        const creados = respuesta.automatico || [];
        toast(creados.length ? `Cliente creado · ${creados.join(', ')}` : 'Cliente creado correctamente');
        setFormOpen(false);
        setCreadoModal({ ...nuevo, automatico: creados });
        setDiaSugerido(nuevo?.dia_visita || null);
      }
      cargar();
    } catch (error) {
      toast(error.message, 'error');
    } finally { setSaving(false); }
  };

  const verDetalle = async (cliente) => {
    setDetailOpen(true);
    setDetail(null);
    try {
      setDetail(await api.get(`/clientes/${cliente.id}`));
    } catch (error) {
      toast(error.message, 'error');
      setDetailOpen(false);
    }
  };

  const capturarUbicacion = async () => {
    setUbicando(true);
    try {
      const punto = await obtenerUbicacion();
      setForm((f) => ({ ...f, ...punto }));
      toast('Ubicación capturada correctamente');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setUbicando(false);
    }
  };

  const abrirVisita = async (cliente) => {
    let ubicacion = null;
    try { ubicacion = await obtenerUbicacion(); } catch (error) { toast(error.message, 'error'); }
    setVisitaForm({
      resultado: 'pedido', motivo: '', notas: '',
      latitud: ubicacion?.latitud ?? cliente.latitud ?? '',
      longitud: ubicacion?.longitud ?? cliente.longitud ?? '',
    });
    setVisitaModal(cliente);
  };

  const guardarVisita = async () => {
    if (!visitaModal) return;
    if (visitaForm.resultado === 'no_pedido' && !visitaForm.motivo) return toast('Selecciona el motivo.', 'error');
    try {
      await api.post('/visitas', {
        cliente_id: visitaModal.id,
        tipo: 'visita',
        modulo: 'Ventas',
        estado: 'completada',
        resultado: visitaForm.resultado,
        motivo: visitaForm.resultado === 'no_pedido' ? visitaForm.motivo : null,
        notas: visitaForm.notas || `Visita registrada desde ficha de cliente`,
        latitud: visitaForm.latitud,
        longitud: visitaForm.longitud,
      });
      toast('Visita registrada con geolocalización');
      setVisitaModal(false);
    } catch (error) { toast(error.message, 'error'); }
  };

  const toggleBloqueo = async (cliente) => {
    if (cliente.activo) { setBloqueo(cliente); setMotivoBloqueo(''); setPorDeuda(false); return; }
    try {
      const r = await api.patch(`/clientes/${cliente.id}/bloqueo`, { activo: true });
      toast('Cliente desbloqueado');
      setDetail({ ...detail, cliente: r.cliente });
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const confirmarBloqueo = async () => {
    if (!motivoBloqueo.trim()) return toast('Indica el motivo del bloqueo.', 'error');
    try {
      const r = await api.patch(`/clientes/${bloqueo.id}/bloqueo`, {
        activo: false,
        por_deuda: porDeuda,
        motivo: motivoBloqueo.trim(),
      });
      toast('Cliente bloqueado: no se le permitirán nuevas ventas ni actividades');
      setDetail({ ...detail, cliente: r.cliente });
      setBloqueo(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const abrirReasignar = (cliente) => {
    setReasignarForm({
      vendedor_id: cliente.vendedor_id ? String(cliente.vendedor_id) : '',
      ruta_venta: cliente.ruta_venta || '',
      zona: cliente.zona || '',
      reasignar_pedidos: true,
    });
    setReasignarModal(cliente);
  };

  const guardarReasignacion = async () => {
    if (!reasignarModal || !reasignarForm.vendedor_id) return toast('Selecciona un vendedor.', 'error');
    try {
      const r = await api.patch(`/clientes/${reasignarModal.id}/reasignar`, {
        ...reasignarForm,
        vendedor_id: Number(reasignarForm.vendedor_id),
      });
      toast(`Cliente reasignado · ${r.pedidos_reasignados} pedidos actualizados en ventas y cobranzas`);
      setReasignarModal(false);
      setDetail({ ...detail, cliente: r.cliente });
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const guardarAsignacionMasiva = async () => {
    if (!asignarForm.vendedor_id || !asignarForm.cliente_ids.length) return toast('Selecciona un vendedor y al menos un cliente.', 'error');
    setSaving(true);
    try {
      const r = await api.post('/clientes/asignar-vendedor', {
        vendedor_id: Number(asignarForm.vendedor_id),
        cliente_ids: asignarForm.cliente_ids.map(Number),
      });
      toast(`${r.asignados} clientes asignados · distribuidor automático aplicado${r.automatico?.length ? ` · ${r.automatico.join(', ')}` : ''}`);
      setAsignarModal(false);
      setAsignarForm({ vendedor_id: '', cliente_ids: [] });
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setSaving(false); }
  };

  const alternarClienteAsignacion = (id) => {
    setAsignarForm((f) => ({
      ...f,
      cliente_ids: f.cliente_ids.includes(id) ? f.cliente_ids.filter((x) => x !== id) : [...f.cliente_ids, id],
    }));
  };

  const columnasClientes = ['nombre', 'codigo', 'tipo', 'zona', 'direccion', 'telefono', 'email', 'contacto', 'limite_credito', 'latitud', 'longitud', 'ruta_venta', 'dia_visita', 'notas'];

  const procesarExcelClientes = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      const filas = await leerExcel(archivo);
      setImportRows(filas);
      setImportResult(null);
      if (!filas.length) toast('El archivo no contiene filas.', 'error');
    } catch (error) { toast('No se pudo leer el archivo Excel.', 'error'); }
  };

  const confirmarImportacionClientes = async () => {
    if (!importRows.length) return toast('Carga un archivo primero.', 'error');
    setImportando(true);
    try {
      const r = await api.post('/clientes/importar', { clientes: importRows });
      setImportResult(r);
      toast(`${r.creados} clientes importados${r.errores.length ? ` · ${r.errores.length} errores` : ''}`);
      setImportOpen(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setImportando(false); }
  };

  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader
        eyebrow="Cartera comercial"
        title="Clientes"
        subtitle="Gestiona mayoristas, minoristas, zonas de reparto y cupos de crédito."
        actions={<>
            <Link className="btn btn-ghost" to="/crm"><Sparkles size={14} /> CRM 360</Link>
            {puedeEditar && <>
            <Link className="btn btn-ghost" to="/clientes/categorias"><Tag size={14} /> Categorías</Link>
            <Link className="btn btn-ghost" to="/ventas/rutas"><MapPin size={14} /> Rutas y zonas</Link>
            {puedeAsignar && <button className="btn btn-outline" onClick={() => setAsignarModal(true)}><Users size={14} /> Asignar vendedores</button>}
            {puedeCrear && <button className="btn btn-outline" onClick={() => setImportOpen(true)}><Upload size={14} /> Importar Excel</button>}
            {puedeCrear && <button className="btn btn-primary" onClick={abrirNuevo}><Plus size={15} /> Nuevo cliente</button>}
            </>}
        </>}
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Clientes activos" value={resumen.total || 0} icon={Users} tone="blue" hint="En toda la cartera" />
        <StatCard label="Mayoristas" value={resumen.mayoristas || 0} icon={Building2} tone="purple" hint="Con compra por volumen" />
        <StatCard label="Con saldo pendiente" value={resumen.con_saldo || 0} icon={UserRound} tone="amber" hint="Requieren seguimiento" />
        <StatCard label="Total por cobrar" value={<Money value={resumen.por_cobrar} />} icon={Wallet} tone="red" hint="Cartera en crédito" />
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h3>Cartera de clientes</h3><p>{data?.clientes?.length || 0} resultados</p></div>
        </div>
        <div className="panel-body" style={{ paddingBottom: 12 }}>
          <div className="filters">
            <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar por nombre, código, zona o teléfono…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="select" value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="todos">Todos los tipos</option><option value="minorista">Minorista</option><option value="mayorista">Mayorista</option>
            </select>
            <select className="select" value={zona} onChange={(e) => setZona(e.target.value)}>
              <option value="todas">Todas las zonas</option>
              {(data?.zonas || []).map((z) => <option key={z} value={z}>{z}</option>)}
            </select>
            <label className="check"><input type="checkbox" checked={conSaldo} onChange={(e) => setConSaldo(e.target.checked)} /> Solo con saldo</label>
          </div>
        </div>

        {loading ? <SkeletonRows rows={7} /> : !data?.clientes?.length ? (
          <EmptyState icon={Users} title="No hay clientes" message="Ajusta los filtros o registra tu primer cliente." action={puedeEditar && <button className="btn btn-soft btn-sm mt-8" onClick={abrirNuevo}>Nuevo cliente</button>} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Cliente</th><th>Contacto</th><th>Zona</th><th>Tipo</th><th className="num">Pedidos</th><th className="num">Comprado</th><th className="num">Saldo</th><th>Última compra</th><th /></tr></thead>
              <tbody>
                {data.clientes.map((c) => (
                  <tr key={c.id} className="clickable" onClick={() => verDetalle(c)}>
                    <td><span className="cell-strong">{c.nombre}</span><span className="cell-sub">{c.codigo} · {c.contacto || 'Sin contacto'}{c.ruta_venta ? ` · ${c.ruta_venta}/${['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][c.dia_visita] || ''}` : ''}</span></td>
                    <td><span style={{ fontSize: 11.5 }}>{c.telefono || '—'}</span><span className="cell-sub">{c.email || 'Sin correo'}</span></td>
                    <td>{c.zona}</td>
                    <td><Badge tone={c.tipo === 'mayorista' ? 'purple' : 'blue'}>{c.tipo}</Badge></td>
                    <td className="num">{c.pedidos}</td>
                    <td className="num"><Money value={c.comprado} /></td>
                    <td className="num"><span className={c.saldo > 0 ? 'text-red' : 'muted'}>{c.saldo > 0 ? <Money value={c.saldo} /> : '—'}</span></td>
                    <td className="nowrap">{c.ultima_compra ? <Fecha value={c.ultima_compra} short /> : '—'}</td>
                    <td className="actions">
                      <button className="icon-btn" title="Ver ficha" onClick={(e) => { e.stopPropagation(); verDetalle(c); }}><Eye size={15} /></button>
                      {puedeEditar && <button className="icon-btn" title="Editar" onClick={(e) => { e.stopPropagation(); abrirEditar(c); }}><Pencil size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? 'Editar cliente' : 'Nuevo cliente'}
        subtitle={editando ? editando.codigo : 'Registra los datos comerciales y el cupo de crédito.'}
        size="lg"
        footer={(
          <>
            <button className="btn btn-ghost" onClick={() => setFormOpen(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardar} disabled={saving}>{saving ? 'Guardando…' : 'Guardar cliente'}</button>
          </>
        )}
      >
        <div className="form-stack">
          <div className="field"><label>Nombre o razón social <span className="req">*</span></label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Minimarket La Recoleta" /></div>
          <div className="field-row">
            <div className="field"><label>Vendedor asignado</label><select className="select" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })}><option value="">Automático (quien crea el cliente)</option>{(data?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select><span className="hint">La ruta, zona, día, categoría y distribuidor se derivan de este vendedor.</span></div>
            <div className="field"><label>Tipo de cliente</label>
              <select className="select" value={form.tipo_cliente_id || ''} onChange={(e) => {
                const t = (data?.tiposCliente || []).find((x) => x.id === Number(e.target.value));
                setForm({ ...form, tipo_cliente_id: e.target.value, tipo: (t?.nombre || 'minorista').toLowerCase() });
              }}>
                <option value="">Seleccionar…</option>
                {(tiposDeRuta.length ? tiposDeRuta : (data?.tiposClienteOrdenados || data?.tiposCliente || [])).map((t) => (
                  <option key={t.id} value={t.id}>{t.nivel ? '↳ ' : ''}{t.nombre}</option>
                ))}
              </select>
              <span className="hint">{tiposDeRuta.length
                ? `Tipos definidos para la ruta ${form.ruta_venta}.`
                : 'Incluye los subtipos creados para cada negocio.'}</span>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Zona / barrio</label>
              <select className="select" value={form.zona || ''} onChange={(e) => setForm({ ...form, zona: e.target.value })}>
                <option value="">Automática según vendedor</option>
                {(zonasDelDia.length ? zonasDelDia.map((z) => z.nombre) : (data?.zonas || [])).map((z) => <option key={z} value={z}>{z}</option>)}
              </select>
              <span className="hint">{zonasDelDia.length
                ? `Zonas que ${vendedorFormId ? 'el vendedor' : 'tu'} visita el ${['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][diaEfectivo]}: ${zonasDelDia.map((z) => z.nombre).join(', ')}`
                : 'No hay zonas programadas para ese día; se muestran todas.'}</span>
            </div>
            <div className="field"><label>Ruta de preventa</label><select className="select" value={form.ruta_venta} onChange={(e) => setForm({ ...form, ruta_venta: e.target.value })}><option value="">Automática según vendedor</option>{(data?.rutasVenta || []).map((r) => <option key={r.id} value={r.codigo}>{r.codigo} · {r.zona}</option>)}</select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Día de visita</label><select className="select" value={form.dia_visita} onChange={(e) => setForm({ ...form, dia_visita: e.target.value })}><option value="">Hoy / automático según vendedor</option>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][d]}</option>)}</select><span className="hint">Hoy es {['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][diaHoy]}. Las zonas del selector se filtran por este día.</span></div>
            <div className="field"><label>Categoría de cliente</label><select className="select" value={form.categoria_cliente_id} onChange={(e) => setForm({ ...form, categoria_cliente_id: e.target.value })}><option value="">Automática según vendedor</option>{(data?.categorias || []).map((c) => <option key={c.id} value={c.id}>{c.padre_id ? `↳ ${c.nombre}` : c.nombre} · {c.descuento_porcentaje}%</option>)}</select></div>
          </div>
          <div className="notice notice-info"><ShieldCheck size={15} /> Si falta una ruta, zona, tipo o categoría, el sistema la crea automáticamente y asigna el distribuidor del vendedor para evitar errores al guardar.</div>
          <div className="field"><label>Dirección</label><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Calle, número y referencia" /></div>
          <div className="geo-editor">
            <div className="geo-editor-head">
              <div><strong><MapPin size={13} /> Geolocalización del cliente</strong><span className="hint">Se usa para visitas, rutas y cobranzas en campo.</span></div>
              <button type="button" className="btn btn-soft btn-sm" onClick={capturarUbicacion} disabled={ubicando}>
                <Crosshair size={13} /> {ubicando ? 'Ubicando…' : 'Usar mi ubicación actual'}
              </button>
            </div>
            <div className="field-row">
              <div className="field"><label>Latitud</label><input className="input" type="number" step="0.000001" value={form.latitud} onChange={(e) => setForm({ ...form, latitud: e.target.value })} placeholder="-17.393800" /></div>
              <div className="field"><label>Longitud</label><input className="input" type="number" step="0.000001" value={form.longitud} onChange={(e) => setForm({ ...form, longitud: e.target.value })} placeholder="-66.157100" /></div>
            </div>
            {esCoordenaValida(form.latitud, form.longitud) && (
              <Mapa altura={170} puntos={[{ latitud: form.latitud, longitud: form.longitud, nombre: form.nombre || 'Nuevo cliente', tipo: 'cliente' }]} />
            )}
          </div>
          <div className="field-row">
            <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} placeholder="7XXXXXXX" /></div>
            <div className="field"><label>WhatsApp para comprobantes</label><input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5917XXXXXXX" /><span className="hint">Aquí se enviarán los comprobantes de cobranza.</span></div>
            <div className="field"><label>Correo electrónico</label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="cliente@correo.bo" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Persona de contacto</label><input className="input" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} /></div>
            <div className="field"><label>Límite de crédito (Bs)</label><input className="input" type="number" min="0" step="100" value={form.limite_credito} onChange={(e) => setForm({ ...form, limite_credito: e.target.value })} /><span className="hint">0 = sin crédito habilitado</span></div>
          </div>
          <div className="field"><label>Notas internas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Días de visita, preferencias, acuerdos…" /></div>
          {editando && (
            <label className="check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Cliente activo</label>
          )}
        </div>
      </Modal>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={detail?.cliente?.nombre || 'Ficha del cliente'} subtitle={detail?.cliente ? `${detail.cliente.codigo} · ${detail.cliente.tipo} · ${detail.cliente.zona}` : 'Cargando…'} size="xl">
        {!detail ? <SkeletonRows rows={6} /> : (
          <div className="grid" style={{ gap: 16 }}>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <div className="mini-stat"><span>Total comprado</span><strong><Money value={detail.pedidos.filter((p) => p.estado !== 'cancelado').reduce((s, p) => s + p.total, 0)} /></strong></div>
              <div className="mini-stat"><span>Saldo pendiente</span><strong className={detail.cliente.saldo > 0 ? 'text-red' : 'text-green'}><Money value={detail.cliente.saldo} /></strong></div>
              <div className="mini-stat"><span>Límite de crédito</span><strong><Money value={detail.cliente.limite_credito} /></strong></div>
            </div>
            <div className="grid grid-3" style={{ gap: 10 }}>
              <div className="info-row"><span><Phone size={10} /> Teléfono</span><strong>{detail.cliente.telefono || '—'}</strong></div>
              <div className="info-row"><span><MessageCircle size={10} /> WhatsApp</span><strong>{detail.cliente.whatsapp || detail.cliente.telefono || '—'}</strong></div>
              <div className="info-row"><span><Mail size={10} /> Correo</span><strong>{detail.cliente.email || '—'}</strong></div>
              <div className="info-row"><span><MapPin size={10} /> Dirección</span><strong>{detail.cliente.direccion || '—'}</strong></div>
            </div>
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head">
                <h3>Acciones sobre el cliente</h3>
                {detail.cliente.bloqueado_por_deuda && <Badge tone="red"><Lock size={11} /> {detail.cliente.motivo_bloqueo || 'Bloqueado'}</Badge>}
              </div>
              <div className="panel-body">
                <div className="inline" style={{ flexWrap: 'wrap', gap: 8 }}>
                  <button className="btn btn-soft btn-sm" onClick={() => abrirVisita(detail.cliente)}><CalendarCheck size={13} /> Registrar visita</button>
                  <button className="btn btn-primary btn-sm" disabled={!detail.cliente.activo} onClick={() => navigate(`/ventas/nueva?cliente=${detail.cliente.id}`)}><ShoppingCart size={13} /> Crear venta</button>
                  <button className="btn btn-outline btn-sm" onClick={() => navigate(`/distribucion/programados?cliente=${detail.cliente.id}`)}><Truck size={13} /> Entregas</button>
                  <button className="btn btn-green btn-sm" onClick={() => navigate(`/cobranzas?cliente=${detail.cliente.id}`)}><CircleDollarSign size={13} /> Cobranzas</button>
                  {['admin', 'dueno'].includes(user?.rol) && (
                    <>
                      <button className="btn btn-outline btn-sm" onClick={() => abrirReasignar(detail.cliente)}><UserRound size={13} /> Reasignar vendedor / ruta</button>
                      <button className={`btn btn-sm ${detail.cliente.activo ? 'btn-danger-soft' : 'btn-navy'}`} onClick={() => toggleBloqueo(detail.cliente)}>
                        {detail.cliente.activo ? <><Lock size={13} /> Bloquear</> : <><Unlock size={13} /> Desbloquear</>}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="geo-detail">
              <div className="geo-detail-head">
                <div><strong><Navigation size={13} /> Coordenadas del cliente</strong><span className="hint">{formatoCoords(detail.cliente.latitud, detail.cliente.longitud)}</span></div>
                {esCoordenaValida(detail.cliente.latitud, detail.cliente.longitud) && (
                  <button className="btn btn-outline btn-sm" onClick={() => abrirEnMapas(detail.cliente.latitud, detail.cliente.longitud)}><ExternalLink size={12} /> Abrir en mapas</button>
                )}
              </div>
              <Mapa altura={220} puntos={esCoordenaValida(detail.cliente.latitud, detail.cliente.longitud)
                ? [{ latitud: detail.cliente.latitud, longitud: detail.cliente.longitud, nombre: detail.cliente.nombre, descripcion: detail.cliente.direccion, tipo: 'cliente' }]
                : []} />
              {(detail.visitas || []).length > 0 && (
                <div className="geo-lista">
                  <strong className="small">Últimas visitas geolocalizadas</strong>
                  {detail.visitas.slice(0, 4).map((v) => (
                    <div className="geo-lista-item" key={v.id}>
                      <Badge tone={v.tipo === 'cobranza' ? 'green' : v.tipo === 'distribucion' ? 'purple' : 'orange'}>{v.tipo}</Badge>
                      <span>{v.notas || 'Visita registrada'}</span>
                      <small><Fecha value={v.fecha} short /></small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head"><h3>Historial de pedidos</h3><span className="panel-sub">{detail.pedidos.length} pedidos</span></div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Pedido</th><th>Fecha</th><th>Estado</th><th>Pago</th><th className="num">Total</th><th className="num">Saldo</th></tr></thead>
                  <tbody>
                    {detail.pedidos.slice(0, 12).map((p) => (
                      <tr key={p.id}>
                        <td className="cell-strong">{p.codigo}</td>
                        <td><Fecha value={p.created_at} short /></td>
                        <td><Estado valor={p.estado} /></td>
                        <td><Estado valor={p.estado_pago} /></td>
                        <td className="num"><Money value={p.total} /></td>
                        <td className="num">{p.saldo > 0 ? <Money value={p.saldo} /> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {detail.pedidos.length === 0 && <div className="table-empty">Este cliente aún no tiene pedidos.</div>}
            </div>
          </div>
        )}
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar clientes desde Excel" subtitle="Columnas: nombre, codigo, tipo, zona, direccion, telefono, email, contacto, limite_credito, latitud, longitud, ruta_venta, dia_visita, notas" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setImportOpen(false)}>Cerrar</button><button className="btn btn-outline" onClick={() => descargarPlantilla(columnasClientes, 'plantilla-clientes.xlsx')}><FileSpreadsheet size={14} /> Descargar plantilla</button><button className="btn btn-primary" onClick={confirmarImportacionClientes} disabled={importando || !importRows.length}>{importando ? 'Importando…' : `Importar ${importRows.length} filas`}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Archivo .xlsx o .xls</label><input className="input" type="file" accept=".xlsx,.xls" onChange={procesarExcelClientes} /></div>
          {importRows.length > 0 && (
            <>
              <div className="notice notice-info"><FileSpreadsheet size={14} /> {importRows.length} filas listas. Columnas detectadas: {Object.keys(importRows[0]).join(', ')}</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Nombre</th><th>Zona</th><th>Teléfono</th><th>Ruta</th><th>Día</th></tr></thead>
                  <tbody>
                    {importRows.slice(0, 12).map((f, i) => (
                      <tr key={i}><td>{i + 2}</td><td className="cell-strong">{f.nombre || f.Nombre || f.NOMBRE || '—'}</td><td>{f.zona || f.Zona || '—'}</td><td>{f.telefono || f.Teléfono || '—'}</td><td>{f.ruta_venta || f.ruta || '—'}</td><td>{f.dia_visita || f.dia || '—'}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {importResult && (
            <div className={`notice ${importResult.errores.length ? 'notice-warn' : 'notice-info'}`}>
              {importResult.creados} creados · {importResult.errores.length} errores de {importResult.total} filas.
              {importResult.errores.slice(0, 5).map((e) => <div key={e.fila}>Fila {e.fila}: {e.error}</div>)}
            </div>
          )}
        </div>
      </Modal>

      <Modal open={Boolean(visitaModal)} onClose={() => setVisitaModal(false)} title={`Registrar visita · ${visitaModal?.nombre || ''}`} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setVisitaModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarVisita}>Guardar visita</button></>}>
        <div className="form-stack">
          <div className="field"><label>Resultado</label><div className="pill-group">
            <button className={`chip ${visitaForm.resultado === 'pedido' ? 'active' : ''}`} onClick={() => setVisitaForm({ ...visitaForm, resultado: 'pedido', motivo: '' })}><ShoppingCart size={12} /> Con pedido</button>
            <button className={`chip ${visitaForm.resultado === 'no_pedido' ? 'active' : ''}`} onClick={() => setVisitaForm({ ...visitaForm, resultado: 'no_pedido' })}><ShieldAlert size={12} /> Sin pedido</button>
          </div></div>
          {visitaForm.resultado === 'no_pedido' && (
            <div className="field"><label>Motivo</label><select className="select" value={visitaForm.motivo} onChange={(e) => setVisitaForm({ ...visitaForm, motivo: e.target.value })}>
              <option value="">Seleccionar…</option><option value="cerrado">Local cerrado</option><option value="con_stock">Aún tiene stock</option><option value="sin_dinero">Sin dinero</option><option value="otro">Otro</option>
            </select></div>
          )}
          <div className="field"><label>Notas</label><textarea className="textarea" value={visitaForm.notas} onChange={(e) => setVisitaForm({ ...visitaForm, notas: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Latitud</label><input className="input" type="number" step="0.000001" value={visitaForm.latitud} onChange={(e) => setVisitaForm({ ...visitaForm, latitud: e.target.value })} /></div>
            <div className="field"><label>Longitud</label><input className="input" type="number" step="0.000001" value={visitaForm.longitud} onChange={(e) => setVisitaForm({ ...visitaForm, longitud: e.target.value })} /></div>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(bloqueo)} onClose={() => setBloqueo(null)} title="Bloquear cliente" subtitle={bloqueo ? bloqueo.nombre : ''} size="sm"
        footer={<><button className="btn btn-ghost" onClick={() => setBloqueo(null)}>Cancelar</button><button className="btn btn-danger" onClick={confirmarBloqueo}>Bloquear cliente</button></>}>
        <div className="form-stack">
          <div className="notice notice-warn"><Lock size={15} /> El cliente no podrá recibir nuevas ventas ni registrar actividades. Las cobranzas siguen permitidas para regularizar su cuenta.</div>
          <div className="field"><label>Motivo del bloqueo <span className="req">*</span></label><textarea className="textarea" value={motivoBloqueo} onChange={(e) => setMotivoBloqueo(e.target.value)} placeholder="Ej. Cuenta pendiente con la empresa" /></div>
          <label className="check"><input type="checkbox" checked={porDeuda} onChange={(e) => setPorDeuda(e.target.checked)} /> Bloqueo por deuda con la empresa</label>
        </div>
      </Modal>

      <Modal open={Boolean(reasignarModal)} onClose={() => setReasignarModal(false)} title="Reasignar cliente" subtitle={`${reasignarModal?.nombre || ''} · ventas y cobranzas`} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setReasignarModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarReasignacion}>Reasignar</button></>}>
        <div className="form-stack">
          <div className="field"><label>Nuevo vendedor</label><select className="select" value={reasignarForm.vendedor_id} onChange={(e) => setReasignarForm({ ...reasignarForm, vendedor_id: e.target.value })}><option value="">Seleccionar…</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre} · {v.ruta_venta || 'sin ruta'}</option>)}</select></div>
          <div className="field-row">
            <div className="field"><label>Ruta</label><select className="select" value={reasignarForm.ruta_venta} onChange={(e) => setReasignarForm({ ...reasignarForm, ruta_venta: e.target.value })}><option value="">Sin cambio</option><option value="R1">R1</option><option value="R2">R2</option></select></div>
            <div className="field"><label>Zona</label><input className="input" value={reasignarForm.zona} onChange={(e) => setReasignarForm({ ...reasignarForm, zona: e.target.value })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={reasignarForm.reasignar_pedidos} onChange={(e) => setReasignarForm({ ...reasignarForm, reasignar_pedidos: e.target.checked })} /> Reasignar también sus pedidos pendientes y cobranzas al día</label>
        </div>
      </Modal>

      <Modal open={asignarModal} onClose={() => setAsignarModal(false)} title="Asignar clientes a vendedores" subtitle="Ruta, zona, día, categoría y distribuidor se asignan en forma automática." size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setAsignarModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAsignacionMasiva} disabled={saving}>{saving ? 'Guardando…' : `Asignar ${asignarForm.cliente_ids.length} clientes`}</button></>}>
        <div className="form-stack">
          <div className="field"><label>Vendedor</label><select className="select" value={asignarForm.vendedor_id} onChange={(e) => setAsignarForm({ ...asignarForm, vendedor_id: e.target.value })}><option value="">Seleccionar…</option>{(data?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nombre} · {v.ruta_venta || 'sin ruta'}</option>)}</select></div>
          <div className="field"><label>Clientes a asignar</label>
            <div className="grid grid-2" style={{ gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {(data?.clientes || []).map((c) => (
                <label key={c.id} className="check"><input type="checkbox" checked={asignarForm.cliente_ids.includes(c.id)} onChange={() => alternarClienteAsignacion(c.id)} /> {c.nombre}<span className="hint"> · {c.ruta_venta || 'sin ruta'}</span></label>
              ))}
            </div>
          </div>
          <div className="notice notice-info"><ShieldCheck size={15} /> Al asignar, cada cliente hereda el distribuidor del vendedor y se crean las zonas, rutas, tipos y categorías que falten.</div>
        </div>
      </Modal>

      <Modal open={Boolean(creadoModal)} onClose={() => setCreadoModal(null)} title="Cliente creado" subtitle={`${creadoModal?.codigo || ''} · ${creadoModal?.nombre || ''}`} size="md">
        <div className="form-stack">
          <div className="notice notice-info"><CheckCircle2 size={15} /> El cliente quedó registrado con ruta, zona, categoría, tipo y distribuidor asignados automáticamente.</div>
          <div className="grid grid-2" style={{ gap: 10 }}>
            <div className="mini-stat"><span>Ruta</span><strong>{creadoModal?.ruta_venta || '—'}</strong></div>
            <div className="mini-stat"><span>Día de visita</span><strong>{['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][diaSugerido] || '—'}</strong></div>
            <div className="mini-stat"><span>Zona</span><strong>{creadoModal?.zona || '—'}</strong></div>
            <div className="mini-stat"><span>Distribuidor</span><strong>{(data?.distribuidores || []).find((d) => d.id === creadoModal?.distribuidor_id)?.nombre || '—'}</strong></div>
          </div>
          {creadoModal?.automatico?.length > 0 && <div className="notice notice-warn"><Plus size={15} /> Se crearon automáticamente: {creadoModal.automatico.join(', ')}.</div>}
          <div className="grid" style={{ gap: 8 }}>
            <button className="btn btn-primary btn-block" onClick={() => {
              const query = new URLSearchParams();
              query.set('cliente', creadoModal.id);
              if (diaSugerido) query.set('dia', diaSugerido);
              navigate(`/ventas/agenda?${query.toString()}`);
              setCreadoModal(null);
            }}><MapPin size={14} /> Crear pedido desde el mapa de ruta</button>
            <button className="btn btn-outline btn-block" onClick={() => { navigate(`/ventas/nueva?cliente=${creadoModal.id}`); setCreadoModal(null); }}><ShoppingCart size={14} /> Ir directo al punto de venta</button>
            <button className="btn btn-ghost btn-block" onClick={() => setCreadoModal(null)}>Cerrar</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
