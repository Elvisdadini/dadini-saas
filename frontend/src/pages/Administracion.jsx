import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, Clock, KeyRound, Lock, Palette, Pencil, Plus, QrCode, RefreshCcw, Search, Settings,
  ShieldCheck, UserPlus, Users, Database, ScrollText,
} from 'lucide-react';
import { api, qs } from '../api';
import { ROL_COLOR, ROL_LABEL, useAuth } from '../auth';
import {
  Avatar, Badge, EmptyState, Estado, Fecha, Modal, Money, PageHeader, SkeletonRows, Tabs, useToast,
} from '../ui';

const USUARIO_VACIO = { nombre: '', email: '', usuario: '', pin: '', rol: 'ventas', cargo: '', telefono: '', whatsapp: '', password: 'Dadini2026!', repartidor_id: '', vehiculo_id: '', ruta_venta: 'R1', zona_venta: '', geocerca_activa: false, geocerca_radio_m: 50, categoria_cliente_id: '', es_venta_directa: false, salario_base: 2500, comision_venta_pct: 0, comision_distribucion_pct: 0, bono_fijo: 0, descuento_fijo: 0, dias_visita: [1, 2, 3, 4, 5], activo: true, plantilla: '', permisos: [], bloqueos: { vender: false, cobrar: false, entregar: false, supervisar: false } };

export default function Administracion() {
  const { user, refresh } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('usuarios');
  const [usuarios, setUsuarios] = useState([]);
  const [resumen, setResumen] = useState({});
  const [repartidores, setRepartidores] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [rol, setRol] = useState('todos');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(USUARIO_VACIO);
  const [config, setConfig] = useState(null);
  const [uso, setUso] = useState({});
  const [empresa, setEmpresa] = useState(null);
  const [credito, setCredito] = useState({ aplicar_interes: true, tasa_interes_mensual: 3, dias_gracia: 0, sancion_fija: 0, porcentaje_sancion: 0 });
  const [auditoria, setAuditoria] = useState([]);
  const [acciones, setAcciones] = useState([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAccion, setAuditAccion] = useState('todas');
  const [busy, setBusy] = useState(false);
  const [soloFuncionesActivas, setSoloFuncionesActivas] = useState(true);
  const [reset, setReset] = useState(null);
  const [bloqueo, setBloqueo] = useState(null);
  const [motivoBloqueo, setMotivoBloqueo] = useState('');
  const [qrs, setQrs] = useState([]);
  const [qrAlertas, setQrAlertas] = useState([]);
  const [qrForm, setQrForm] = useState({ nombre: '', imagen: '', fecha_vencimiento: '', titular: '', notas: '' });
  const [qrEditando, setQrEditando] = useState(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrModal, setQrModal] = useState(false);
  const [catalogos, setCatalogos] = useState({ modulos: [], acciones: [], plantillas: [] });

  const cargarUsuarios = async () => {
    setLoading(true);
    try {
      const data = await api.get(`/usuarios${qs({ search, rol })}`);
      setUsuarios(data.usuarios);
      setResumen(data.resumen);
      const [rep, veh, cat, per] = await Promise.all([api.get('/repartidores'), api.get('/vehiculos'), api.get('/categorias'), api.get('/permisos')]);
      setRepartidores(rep.repartidores || []);
      setVehiculos(veh.vehiculos || []);
      setCategorias(cat.categorias || []);
      setCatalogos(per);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  };

  const cargarConfig = async () => {
    try {
      const data = await api.get('/configuracion');
      setConfig(data.configuracion);
      setUso(data.uso);
      setEmpresa(data.configuracion.empresa);
      setCredito(data.credito || data.configuracion.credito || credito);
    } catch (error) { toast(error.message, 'error'); }
  };

  const cargarAuditoria = async () => {
    try {
      const data = await api.get(`/configuracion/auditoria${qs({ search: auditSearch, accion: auditAccion })}`);
      setAuditoria(data.registros);
      setAcciones(data.acciones);
    } catch (error) { toast(error.message, 'error'); }
  };

  const cargarQrs = async () => {
    try {
      const r = await api.get('/qr-pagos');
      setQrs(r.qrs || []);
      setQrAlertas(r.alertas || []);
    } catch (error) { toast(error.message, 'error'); }
  };

  const subirImagenQr = (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setQrForm((q) => ({ ...q, imagen: String(lector.result) }));
    lector.readAsDataURL(archivo);
  };

  const guardarQr = async () => {
    if (!qrForm.nombre.trim() || !qrForm.fecha_vencimiento) return toast('Nombre y fecha de vencimiento son obligatorios.', 'error');
    if (!qrEditando && !qrForm.imagen) return toast('Sube la imagen del QR.', 'error');
    setQrBusy(true);
    try {
      const payload = { ...qrForm, activo: true };
      if (qrEditando) await api.put(`/qr-pagos/${qrEditando.id}`, payload);
      else await api.post('/qr-pagos', payload);
      toast(qrEditando ? 'QR actualizado' : 'QR de pago agregado');
      setQrModal(false);
      setQrEditando(null);
      setQrForm({ nombre: '', imagen: '', fecha_vencimiento: '', titular: '', notas: '' });
      await cargarQrs();
    } catch (error) { toast(error.message, 'error'); } finally { setQrBusy(false); }
  };

  useEffect(() => {
    if (tab === 'usuarios') cargarUsuarios();
    if (tab === 'configuracion') cargarConfig();
    if (tab === 'auditoria') cargarAuditoria();
    if (tab === 'qrs') cargarQrs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, search, rol, auditSearch, auditAccion]);

  const abrirUsuario = (u = null) => {
    setEditing(u);
    const modeloVendedor = (catalogos.plantillas || []).find((p) => p.id === 'vendedor');
    setForm(u ? { nombre: u.nombre, email: u.email, usuario: u.usuario || '', pin: '', rol: u.rol, cargo: u.cargo, telefono: u.telefono, whatsapp: u.whatsapp || '', password: '', repartidor_id: u.repartidor_id || '', vehiculo_id: u.vehiculo_id || '', ruta_venta: u.ruta_venta || 'R1', zona_venta: u.zona_venta || '', geocerca_activa: u.geocerca?.activa === true || u.geocerca_activa === true, geocerca_radio_m: u.geocerca?.radio_m || u.geocerca_radio_m || 50, categoria_cliente_id: u.categoria_cliente_id || '', es_venta_directa: Boolean(u.es_venta_directa), salario_base: u.salario_base || 0, comision_venta_pct: u.comision_venta_pct || 0, comision_distribucion_pct: u.comision_distribucion_pct || 0, bono_fijo: u.bono_fijo || 0, descuento_fijo: u.descuento_fijo || 0, dias_visita: u.dias_visita || [1, 2, 3, 4, 5], activo: u.activo, plantilla: u.plantilla_permisos || '', permisos: u.permisos || [], bloqueos: u.bloqueos || { vender: false, cobrar: false, entregar: false, supervisar: false } } : { ...USUARIO_VACIO, rol: 'preventista', plantilla: 'vendedor', permisos: [...(modeloVendedor?.permisos || [])], repartidor_id: repartidores.find((r) => r.activo !== false)?.id || '' });
    setModal(true);
  };

  const aplicarPlantilla = (id) => {
    const plantilla = (catalogos.plantillas || []).find((p) => p.id === id);
    if (!plantilla) return;
    setForm((f) => ({ ...f, plantilla: id, rol: plantilla.rol, permisos: [...plantilla.permisos] }));
    toast(`Modelo ${plantilla.nombre} aplicado · ${plantilla.permisos.length} funciones activas`);
  };

  // Cascada: al elegir un rol se aplica automáticamente su modelo de permisos.
  const cambiarRol = (rol) => {
    const plantilla = (catalogos.plantillas || []).find((p) => p.rol === rol);
    const esVendedor = ['ventas', 'preventista', 'vendedor_camion'].includes(rol);
    setForm((f) => ({
      ...f,
      rol,
      plantilla: plantilla?.id || '',
      permisos: plantilla ? [...plantilla.permisos] : f.permisos,
      repartidor_id: esVendedor && !f.repartidor_id ? (repartidores.find((r) => r.activo !== false)?.id || '') : f.repartidor_id,
    }));
  };

  const alternarPermiso = (codigo) => {
    setForm((f) => ({
      ...f,
      plantilla: 'personalizado',
      permisos: (f.permisos || []).includes(codigo) ? f.permisos.filter((p) => p !== codigo) : [...(f.permisos || []), codigo],
    }));
  };

  const guardarUsuario = async () => {
    if (!form.nombre || !form.email) return toast('Nombre y correo son obligatorios.', 'error');
    setBusy(true);
    try {
      if (editing) await api.put(`/usuarios/${editing.id}`, form);
      else await api.post('/usuarios', form);
      toast(editing ? 'Usuario actualizado' : 'Usuario creado');
      setModal(false);
      cargarUsuarios();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const toggleActivo = async (u) => {
    if (u.activo) { setBloqueo(u); setMotivoBloqueo(''); return; }
    setBusy(true);
    try {
      await api.patch(`/usuarios/${u.id}/bloqueo`, { activo: true });
      toast('Usuario activado');
      cargarUsuarios();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const confirmarBloqueo = async () => {
    if (!motivoBloqueo.trim()) return toast('Indica el motivo del bloqueo.', 'error');
    setBusy(true);
    try {
      await api.patch(`/usuarios/${bloqueo.id}/bloqueo`, { activo: false, motivo: motivoBloqueo.trim() });
      toast(`${bloqueo.nombre} bloqueado: no podrá ingresar ni realizar actividades`);
      setBloqueo(null);
      cargarUsuarios();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const resetPassword = async () => {
    setBusy(true);
    try {
      const data = await api.post(`/usuarios/${reset.id}/password`, { password: 'Dadini2026!' });
      toast(`Contraseña temporal de ${reset.nombre}: ${data.temporal}`);
      setReset(null);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const guardarConfig = async () => {
    setBusy(true);
    try {
      await api.put('/configuracion', { empresa, credito });
      await refresh();
      toast('Configuración guardada correctamente');
      cargarConfig();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const admins = useMemo(() => usuarios.filter((u) => u.rol === 'admin').length, [usuarios]);

  return (
    <>
      <PageHeader
        eyebrow="Administración del sistema"
        title="Configuración y equipo"
        subtitle="Gestiona usuarios, roles, parámetros de la empresa y la trazabilidad de cada acción."
        actions={(
          <>
            <Link className="btn btn-outline" to="/administracion/personalizacion"><Palette size={14} /> Marca y APK</Link>
            {tab === 'usuarios' && <button className="btn btn-primary" onClick={() => abrirUsuario()}><UserPlus size={15} /> Nuevo usuario</button>}
          </>
        )}
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCardSimple label="Usuarios del sistema" value={resumen.total || uso.usuarios || 0} hint={`${resumen.activos || uso.usuarios || 0} activos`} icon={Users} tone="blue" />
        <StatCardSimple label="Administradores" value={resumen.admins || admins} hint="Acceso total" icon={ShieldCheck} tone="orange" />
        <StatCardSimple label="Almacenes" value={uso.almacenes || 0} hint="Operativos" icon={Building2} tone="purple" />
        <StatCardSimple label="Plan contratado" value={config?.plan?.nombre || 'Business'} hint={config?.plan?.precio ? `Bs ${config.plan.precio}/mes` : 'Suscripción SaaS'} icon={Lock} tone="green" />
      </div>

      <div className="panel">
        <Tabs tabs={[{ value: 'usuarios', label: 'Usuarios y roles', count: usuarios.length }, { value: 'configuracion', label: 'Configuración' }, { value: 'qrs', label: 'QR de pago', count: qrs.length }, { value: 'auditoria', label: 'Auditoría' }]} active={tab} onChange={setTab} />

        {tab === 'usuarios' && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar por nombre, correo o cargo…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <select className="select" value={rol} onChange={(e) => setRol(e.target.value)}>
                  <option value="todos">Todos los roles</option>
                  {Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            {loading ? <SkeletonRows rows={7} /> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Usuario</th><th>Rol</th><th>Cargo</th><th>Último acceso</th><th className="num">Ventas</th><th>Estado</th><th /></tr></thead>
                  <tbody>
                    {usuarios.map((u) => (
                      <tr key={u.id}>
                        <td><div className="inline" style={{ gap: 8 }}><Avatar name={u.nombre} size={31} tone={ROL_COLOR[u.rol] || 'navy'} /><div><span className="cell-strong">{u.nombre}</span><span className="cell-sub">{u.email}</span></div></div></td>
                        <td><Badge tone={ROL_COLOR[u.rol] || 'gray'}>{ROL_LABEL[u.rol] || u.rol}</Badge></td>
                        <td>{u.cargo || '—'}</td>
                        <td className="nowrap">{u.ultimo_acceso ? <Fecha value={u.ultimo_acceso} time /> : 'Nunca'}</td>
                        <td className="num"><Money value={u.ventas} /></td>
                        <td><Badge tone={u.activo ? 'green' : 'gray'}>{u.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                        <td className="actions">
                          <button className="icon-btn" title="Editar" onClick={() => abrirUsuario(u)}><Pencil size={14} /></button>
                          <button className="icon-btn" title="Restablecer contraseña" onClick={() => setReset(u)}><KeyRound size={14} /></button>
                          {u.id !== user?.id && <button className="btn btn-sm btn-ghost" onClick={() => toggleActivo(u)} disabled={busy}>{u.activo ? 'Desactivar' : 'Activar'}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {usuarios.length === 0 && <EmptyState icon={Users} title="Sin usuarios" message="No hay usuarios que coincidan con la búsqueda." />}
              </div>
            )}
          </>
        )}

        {tab === 'configuracion' && (
          <div className="panel-body">
            {!config ? <SkeletonRows rows={8} /> : (
              <div className="grid grid-2" style={{ alignItems: 'start' }}>
                <div className="form-stack">
                  <h3>Datos de la empresa</h3>
                  <div className="field"><label>Nombre comercial</label><input className="input" value={empresa?.nombre || ''} onChange={(e) => setEmpresa({ ...empresa, nombre: e.target.value })} /></div>
                  <div className="field"><label>Eslogan</label><input className="input" value={empresa?.slogan || ''} onChange={(e) => setEmpresa({ ...empresa, slogan: e.target.value })} /></div>
                  <div className="field-row">
                    <div className="field"><label>NIT</label><input className="input" value={empresa?.nit || ''} onChange={(e) => setEmpresa({ ...empresa, nit: e.target.value })} /></div>
                    <div className="field"><label>Teléfono</label><input className="input" value={empresa?.telefono || ''} onChange={(e) => setEmpresa({ ...empresa, telefono: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Correo</label><input className="input" value={empresa?.email || ''} onChange={(e) => setEmpresa({ ...empresa, email: e.target.value })} /></div>
                  <div className="field"><label>Dirección</label><input className="input" value={empresa?.direccion || ''} onChange={(e) => setEmpresa({ ...empresa, direccion: e.target.value })} /></div>
                  <div className="field-row">
                    <div className="field"><label>Ciudad</label><input className="input" value={empresa?.ciudad || ''} onChange={(e) => setEmpresa({ ...empresa, ciudad: e.target.value })} /></div>
                    <div className="field"><label>País</label><input className="input" value={empresa?.pais || ''} onChange={(e) => setEmpresa({ ...empresa, pais: e.target.value })} /></div>
                  </div>
                  <div className="field"><label>Horario de atención</label><input className="input" value={empresa?.horario || ''} onChange={(e) => setEmpresa({ ...empresa, horario: e.target.value })} /></div>
                  <button className="btn btn-primary" onClick={guardarConfig} disabled={busy}>{busy ? 'Guardando…' : 'Guardar configuración'}</button>
                </div>

                <div className="form-stack">
                  <h3>Parámetros operativos</h3>
                  <div className="field-row">
                    <div className="field"><label>Moneda</label><select className="select" value={empresa?.moneda || 'BOB'} onChange={(e) => setEmpresa({ ...empresa, moneda: e.target.value })}><option value="BOB">Bolivianos (BOB)</option><option value="USD">Dólares (USD)</option></select></div>
                    <div className="field"><label>Tarifa de envío (Bs)</label><input className="input" type="number" min="0" value={empresa?.tarifa_envio || 0} onChange={(e) => setEmpresa({ ...empresa, tarifa_envio: e.target.value })} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Stock mínimo global</label><input className="input" type="number" min="0" value={empresa?.stock_minimo || 0} onChange={(e) => setEmpresa({ ...empresa, stock_minimo: e.target.value })} /></div>
                    <div className="field"><label>Días de crédito</label><input className="input" type="number" min="0" value={empresa?.dias_credito || 0} onChange={(e) => setEmpresa({ ...empresa, dias_credito: e.target.value })} /></div>
                  </div>
                  <div className="divider" />
                  <h3><Clock size={14} /> Sanciones e intereses por mora</h3>
                  <label className="check"><input type="checkbox" checked={!!credito.aplicar_interes} onChange={(e) => setCredito({ ...credito, aplicar_interes: e.target.checked })} /> Aplicar interés automático a facturas vencidas</label>
                  <div className="field-row">
                    <div className="field"><label>Tasa de interés mensual (%)</label><input className="input" type="number" min="0" step="0.5" value={credito.tasa_interes_mensual ?? 3} onChange={(e) => setCredito({ ...credito, tasa_interes_mensual: e.target.value })} /></div>
                    <div className="field"><label>Días de gracia</label><input className="input" type="number" min="0" value={credito.dias_gracia ?? 0} onChange={(e) => setCredito({ ...credito, dias_gracia: e.target.value })} /></div>
                  </div>
                  <div className="field-row">
                    <div className="field"><label>Sanción fija (Bs)</label><input className="input" type="number" min="0" step="0.5" value={credito.sancion_fija ?? 0} onChange={(e) => setCredito({ ...credito, sancion_fija: e.target.value })} /></div>
                    <div className="field"><label>Sanción adicional (%)</label><input className="input" type="number" min="0" step="0.5" value={credito.porcentaje_sancion ?? 0} onChange={(e) => setCredito({ ...credito, porcentaje_sancion: e.target.value })} /></div>
                  </div>
                  <div className="notice notice-warn"><Clock size={15} /> El interés se calcula diariamente sobre el saldo vencido (tasa mensual ÷ 30) y se cobra antes que el capital. La sanción se agrega una sola vez al vencerse.</div>
                  <div className="divider" />
                  <h3>Uso del plan</h3>
                  <div className="summary-box">
                    <div className="split"><span className="small muted">Usuarios</span><strong>{uso.usuarios} / {config.plan.usuarios_incluidos}</strong></div>
                    <div className="progress mt-8"><span className="progress-fill" style={{ width: `${Math.min(100, (uso.usuarios / config.plan.usuarios_incluidos) * 100)}%` }} /></div>
                    <div className="split mt-12"><span className="small muted">Almacenes</span><strong>{uso.almacenes} / {config.plan.almacenes_incluidos}</strong></div>
                    <div className="progress mt-8"><span className="progress-fill progress-purple" style={{ width: `${Math.min(100, (uso.almacenes / config.plan.almacenes_incluidos) * 100)}%` }} /></div>
                    <div className="split mt-12"><span className="small muted">Productos activos</span><strong>{uso.productos}</strong></div>
                    <div className="split mt-8"><span className="small muted">Pedidos del mes</span><strong>{uso.pedidos_mes}</strong></div>
                  </div>
                  <div className="notice notice-info"><ShieldCheck size={15} /> Los cambios se aplican de inmediato a toda la operación y quedan registrados en la auditoría.</div>
                  <div className="notice notice-info"><Database size={15} /> Entorno de producción: los datos se respaldan en Supabase y cada cambio queda registrado en la auditoría.</div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'qrs' && (
          <div className="panel mb-16">
            <div className="panel-head">
              <div><h3>QR de pago de la empresa</h3><p>Imagen, nombre, titular y vencimiento. Se avisa automáticamente 2 semanas antes.</p></div>
              <button className="btn btn-primary btn-sm" onClick={() => { setQrEditando(null); setQrForm({ nombre: '', imagen: '', fecha_vencimiento: '', titular: '', notas: '' }); setQrModal(true); }}><Plus size={13} /> Agregar QR</button>
            </div>
            <div className="panel-body">
              {qrAlertas.length > 0 && <div className="notice notice-warn mb-12"><QrCode size={15} /> QRs por vencer o vencidos: {qrAlertas.map((a) => `${a.nombre} (${a.estado}${a.dias_restantes !== null ? `, ${a.dias_restantes} días` : ''})`).join(', ')}. Solicita el cambio y sube el nuevo QR.</div>}
              {qrs.length === 0 ? <EmptyState icon={QrCode} title="Sin QR configurado" message="Sube la imagen del QR que deben usar los clientes para pagar." /> : (
                <div className="grid grid-3" style={{ gap: 12 }}>
                  {qrs.map((qr) => (
                    <div className="card card-pad" key={qr.id} style={{ textAlign: 'center' }}>
                      <img src={qr.imagen} alt={`QR ${qr.nombre}`} style={{ width: 130, height: 130, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)' }} />
                      <strong style={{ display: 'block', marginTop: 8 }}>{qr.nombre}</strong>
                      <span className="small muted">{qr.titular || 'Sin titular'} · Vence {qr.fecha_vencimiento}</span>
                      <div className="inline mt-8" style={{ justifyContent: 'center' }}>
                        <Badge tone={qr.por_vencer ? 'amber' : qr.vencido ? 'red' : qr.activo !== false ? 'green' : 'gray'}>{qr.estado}</Badge>
                        <button className="btn btn-soft btn-sm" onClick={() => { setQrEditando(qr); setQrForm({ nombre: qr.nombre, imagen: qr.imagen, fecha_vencimiento: qr.fecha_vencimiento, titular: qr.titular || '', notas: qr.notas || '' }); setQrModal(true); }}>Editar</button>
                        <button className="btn btn-ghost btn-sm" onClick={async () => { await api.patch(`/qr-pagos/${qr.id}/estado`, { activo: qr.activo === false }); await cargarQrs(); }}>{qr.activo === false ? 'Activar' : 'Desactivar'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'auditoria' && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar en la auditoría…" value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} /></div>
                <select className="select" value={auditAccion} onChange={(e) => setAuditAccion(e.target.value)}>
                  <option value="todas">Todas las acciones</option>
                  {acciones.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button className="btn btn-outline btn-sm" onClick={cargarAuditoria}><RefreshCcw size={13} /> Actualizar</button>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Fecha</th><th>Usuario</th><th>Rol</th><th>Acción</th><th>Entidad</th><th>Detalle</th><th>IP</th></tr></thead>
                <tbody>
                  {auditoria.map((r) => (
                    <tr key={r.id}>
                      <td className="nowrap"><Fecha value={r.fecha} time /></td>
                      <td className="cell-strong">{r.usuario}</td>
                      <td><Badge tone={ROL_COLOR[r.rol] || 'gray'}>{ROL_LABEL[r.rol] || r.rol}</Badge></td>
                      <td>{r.accion}</td>
                      <td>{r.entidad}</td>
                      <td className="small">{r.detalle}</td>
                      <td className="small muted">{r.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {auditoria.length === 0 && <EmptyState icon={ScrollText} title="Sin registros" message="No hay acciones de auditoría con esos filtros." />}
            </div>
            <div className="panel-foot"><span className="small muted">Se conservan los últimos 500 eventos del sistema.</span><span className="small muted">{auditoria.length} registros mostrados</span></div>
          </>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar usuario' : 'Nuevo usuario'} subtitle={editing ? 'Actualiza los datos y permisos del miembro del equipo.' : 'Crea un acceso con el rol adecuado.'} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarUsuario} disabled={busy}>{busy ? 'Guardando…' : 'Guardar usuario'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Nombre completo <span className="req">*</span></label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Correo <span className="req">*</span></label><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
            <div className="field"><label>WhatsApp del empleado</label><input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} placeholder="5917XXXXXXX" /><span className="hint">Aquí se enviarán catálogos, APK, boletas y reportes.</span></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Usuario de acceso</label><input className="input" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} placeholder="Ej. admin · se genera solo si se deja vacío" /><span className="hint">El usuario ingresa con este nombre, sin correo.</span></div>
            <div className="field"><label>PIN (opcional)</label><input className="input" inputMode="numeric" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="4 a 8 dígitos" /><span className="hint">Permite ingresar solo con PIN si elige esa opción.</span></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Rol de acceso</label><select className="select" value={form.rol} onChange={(e) => cambiarRol(e.target.value)}>{Object.entries(ROL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><span className="hint">Al elegir el rol se aplica en cascada su modelo de permisos.</span></div>
            <div className="field"><label>Cargo</label><input className="input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
            {['ventas', 'preventista', 'vendedor_camion'].includes(form.rol) && (
              <>
                <div className="field-row">
                  <div className="field"><label>Distribuidor asignado</label><select className="select" value={form.repartidor_id} onChange={(e) => setForm({ ...form, repartidor_id: e.target.value })}><option value="">Sin asignar (automático)</option>{repartidores.map((r) => <option key={r.id} value={r.id}>{r.emoji} {r.nombre}</option>)}</select><span className="hint">Se asigna automáticamente al crear el vendedor; puedes modificarlo aquí.</span></div>
                  <div className="field"><label>Vehículo asignado</label><select className="select" value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}><option value="">Sin asignar</option>{vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}</select></div>
                </div>
                {form.rol === 'preventista' && (
                  <>
                    <div className="field"><label>Ruta de preventa</label><select className="select" value={form.ruta_venta} onChange={(e) => setForm({ ...form, ruta_venta: e.target.value })}><option value="R1">R1</option><option value="R2">R2</option></select></div>
                    <div className="field"><label>Zona asignada</label><input className="input" value={form.zona_venta} onChange={(e) => setForm({ ...form, zona_venta: e.target.value })} placeholder="Ej. Centro, Quillacollo…" /></div>
            <div className="field-row">
              <label className="check"><input type="checkbox" checked={Boolean(form.geocerca_activa)} onChange={(e) => setForm({ ...form, geocerca_activa: e.target.checked })} /> Exigir geocerca a este usuario</label>
              <div className="field"><label>Radio (m)</label><input className="input" type="number" min="1" value={form.geocerca_radio_m || 50} onChange={(e) => setForm({ ...form, geocerca_radio_m: e.target.value })} /></div>
            </div>
            <span className="hint">Si está activo, el vendedor solo podrá registrar ventas y cobranzas dentro del radio de la tienda (o de la zona configurada).</span>
                    <div className="field"><label>Categoría de clientes asignada</label><select className="select" value={form.categoria_cliente_id} onChange={(e) => setForm({ ...form, categoria_cliente_id: e.target.value })}><option value="">Sin asignar</option>{categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.descuento_porcentaje}%</option>)}</select><span className="hint">Los clientes nuevos de este vendedor heredarán esta categoría.</span></div>
                    <label className="check"><input type="checkbox" checked={form.es_venta_directa} onChange={(e) => setForm({ ...form, es_venta_directa: e.target.checked })} /> Venta directa desde almacén móvil</label>
                    <div className="divider" />
                    <strong className="small">Configuración de planilla</strong>
                    <div className="field-row">
                      <div className="field"><label>Sueldo base (Bs)</label><input type="number" min="0" className="input" value={form.salario_base} onChange={(e) => setForm({ ...form, salario_base: e.target.value })} /></div>
                      <div className="field"><label>Bono fijo (Bs)</label><input type="number" min="0" className="input" value={form.bono_fijo} onChange={(e) => setForm({ ...form, bono_fijo: e.target.value })} /></div>
                      <div className="field"><label>Descuento fijo (Bs)</label><input type="number" min="0" className="input" value={form.descuento_fijo} onChange={(e) => setForm({ ...form, descuento_fijo: e.target.value })} /></div>
                    </div>
                    <div className="field-row">
                      <div className="field"><label>Comisión por venta (%)</label><input type="number" min="0" step="0.5" className="input" value={form.comision_venta_pct} onChange={(e) => setForm({ ...form, comision_venta_pct: e.target.value })} /></div>
                      <div className="field"><label>Comisión por entrega (Bs c/u)</label><input type="number" min="0" step="0.5" className="input" value={form.comision_distribucion_pct} onChange={(e) => setForm({ ...form, comision_distribucion_pct: e.target.value })} /></div>
                    </div>
                    <div className="field"><label>Días de visita</label>
                      <div className="pill-group">
                        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                          <button key={d} className={`chip ${(form.dias_visita || []).includes(d) ? 'active' : ''}`} onClick={() => {
                            const actual = form.dias_visita || [];
                            setForm({ ...form, dias_visita: actual.includes(d) ? actual.filter((x) => x !== d) : [...actual, d].sort() });
                          }}>{['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][d]}</button>
                        ))}
                      </div>
                      <span className="hint">Los clientes de esta ruta y día aparecerán en su agenda.</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="divider" />
          <strong className="small">Modelo y permisos de acceso</strong>
          <div className="field"><label>Modelo de permisos</label>
            <select className="select" value={form.plantilla || ''} onChange={(e) => aplicarPlantilla(e.target.value)}>
              <option value="">Personalizado / sin modelo</option>
              {(catalogos.plantillas || []).map((p) => <option key={p.id} value={p.id}>{p.nombre} · {p.permisos.length} funciones</option>)}
            </select>
            <span className="hint">Elige Vendedor, Distribuidor, Almacén, Supervisor, Ventas directa o Cobranzas para limitar el acceso.</span>
          </div>
          {(form.rol === 'admin' || form.rol === 'dueno') ? (
            <div className="notice notice-info"><ShieldCheck size={15} /> Administradores y dueños tienen todas las funciones activas.</div>
          ) : (
            <>
              <div className="inline" style={{ justifyContent: 'space-between' }}>
                <span className="small muted">Funciones activas ({(form.permisos || []).length}):</span>
                <label className="check"><input type="checkbox" checked={soloFuncionesActivas} onChange={(e) => setSoloFuncionesActivas(e.target.checked)} /> Solo activas</label>
              </div>
              <div className="grid grid-3" style={{ gap: 8 }}>
                {[...(catalogos.modulos || []), ...(catalogos.acciones || [])]
                  .filter((permiso) => !soloFuncionesActivas || (form.permisos || []).includes(permiso.codigo))
                  .map((permiso) => (
                    <label key={permiso.codigo} className="check"><input type="checkbox" checked={(form.permisos || []).includes(permiso.codigo)} onChange={() => alternarPermiso(permiso.codigo)} /> {permiso.etiqueta}</label>
                  ))}
              </div>
              <span className="hint">Los cambios aparecen o desaparecen para el usuario al cerrar sesión y volver a ingresar.</span>
            </>
          )}
          {form.rol !== 'admin' && form.rol !== 'dueno' && (
            <div className="field"><label>Bloqueo de actividades</label>
              <div className="grid grid-2" style={{ gap: 8 }}>
                {[['vender', 'Vender'], ['cobrar', 'Cobrar'], ['entregar', 'Entregar'], ['supervisar', 'Supervisar']].map(([clave, label]) => (
                  <label className="check" key={clave}><input type="checkbox" checked={Boolean(form.bloqueos?.[clave])} onChange={(e) => setForm({ ...form, bloqueos: { ...(form.bloqueos || {}), [clave]: e.target.checked } })} /> Bloquear {label.toLowerCase()}</label>
                ))}
              </div>
              <span className="hint">El usuario puede ingresar, pero el sistema rechazará esa acción con un aviso claro.</span>
            </div>
          )}
          {!editing && <div className="field"><label>Contraseña inicial</label><input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><span className="hint">Mínimo 8 caracteres. El usuario puede cambiarla luego.</span></div>}
          <div className="notice notice-info"><ShieldCheck size={15} /> Los permisos limitan funciones sensibles: nadie que no sea supervisión o administración puede borrar pedidos, cobranzas ni alterar los reportes mensuales.</div>
        </div>
      </Modal>

      <Modal open={qrModal} onClose={() => { setQrModal(false); setQrEditando(null); }} title={qrEditando ? 'Editar QR de pago' : 'Agregar QR de pago'} subtitle="Se mostrará en el punto de venta cuando se elija pago con QR." size="md"
        footer={<><button className="btn btn-ghost" onClick={() => { setQrModal(false); setQrEditando(null); }}>Cancelar</button><button className="btn btn-primary" onClick={guardarQr} disabled={qrBusy}>{qrBusy ? 'Guardando…' : 'Guardar QR'}</button></>}>
        <div className="form-stack">
          <div className="inline">
            {qrForm.imagen ? <img src={qrForm.imagen} alt="Vista previa QR" style={{ width: 96, height: 96, objectFit: 'contain', borderRadius: 8, border: '1px solid var(--line)' }} /> : <div className="logo-empty"><QrCode size={22} /></div>}
            <div><label className="btn btn-soft btn-sm"><QrCode size={13} /> Subir imagen QR<input type="file" accept="image/*" hidden onChange={subirImagenQr} /></label><span className="hint">PNG o JPG del QR de la empresa.</span></div>
          </div>
          <div className="field"><label>Nombre del QR</label><input className="input" value={qrForm.nombre} onChange={(e) => setQrForm({ ...qrForm, nombre: e.target.value })} placeholder="Ej. QR principal Bancos" /></div>
          <div className="field"><label>A nombre de</label><input className="input" value={qrForm.titular} onChange={(e) => setQrForm({ ...qrForm, titular: e.target.value })} placeholder="Titular de la cuenta" /></div>
          <div className="field"><label>Fecha de vencimiento <span className="req">*</span></label><input type="date" className="input" value={qrForm.fecha_vencimiento} onChange={(e) => setQrForm({ ...qrForm, fecha_vencimiento: e.target.value })} /><span className="hint">Se solicitará el cambio 2 semanas antes.</span></div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={qrForm.notas} onChange={(e) => setQrForm({ ...qrForm, notas: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={Boolean(bloqueo)} onClose={() => setBloqueo(null)} title="Bloquear usuario" subtitle={bloqueo ? `${bloqueo.nombre} · ${bloqueo.email}` : ''} size="sm"
        footer={<><button className="btn btn-ghost" onClick={() => setBloqueo(null)}>Cancelar</button><button className="btn btn-danger" onClick={confirmarBloqueo} disabled={busy}>{busy ? 'Bloqueando…' : 'Bloquear acceso'}</button></>}>
        <div className="form-stack">
          <div className="notice notice-warn"><Lock size={15} /> El usuario no podrá iniciar sesión ni ejecutar ninguna actividad mientras esté bloqueado.</div>
          <div className="field"><label>Motivo del bloqueo <span className="req">*</span></label><textarea className="textarea" value={motivoBloqueo} onChange={(e) => setMotivoBloqueo(e.target.value)} placeholder="Ej. Cuenta pendiente con la empresa, revisión de cobranzas…" /></div>
        </div>
      </Modal>

      <Modal open={Boolean(reset)} onClose={() => setReset(null)} title="Restablecer contraseña" subtitle={reset ? `${reset.nombre} · ${reset.email}` : ''} size="sm"
        footer={<><button className="btn btn-ghost" onClick={() => setReset(null)}>Cancelar</button><button className="btn btn-primary" onClick={resetPassword} disabled={busy}>Restablecer</button></>}
      >
        <div className="notice notice-warn"><Clock size={15} /> Se asignará la contraseña temporal <strong>Dadini2026!</strong> y se pedirá cambiarla en el próximo acceso.</div>
      </Modal>
    </>
  );
}

function StatCardSimple({ label, value, hint, icon: Icon, tone }) {
  return (
    <div className="stat-card">
      <div className="stat-top"><span className={`stat-icon stat-${tone}`}><Icon size={19} /></span></div>
      <strong>{value}</strong>
      <span className="stat-label">{label}</span>
      <span className="stat-hint">{hint}</span>
    </div>
  );
}
