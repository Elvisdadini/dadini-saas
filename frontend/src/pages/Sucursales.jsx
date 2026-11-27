import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRightLeft, Bell, Building2, CalendarDays, Check, Layers, Package, Pencil, Plus,
  RefreshCcw, ShieldCheck, ShoppingCart, Users, Wallet,
} from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Confirm, Modal, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIA = {
  codigo: '', nombre: '', direccion: '', empresa: '', razon_social: '', padre_id: '', activa: true,
  modulos: ['operacion'],
  limites: { vendedores: 1, distribucion: 1, almacen: 1, contador: 1, cobranzas: 1, administradores: 1, usuarios: 10 },
  vigencia: { desde: '', hasta: '' },
  notificacion: { activa: true, dias_anticipacion: 30, modo: 'manual' },
  admin: { nombre: '', usuario: '', email: '', password: 'Dadini2026!', telefono: '' },
  migrar: { origen_id: '', entidades: [] },
};

const ETIQUETAS_IMPORTABLES = {
  almacenes: 'Almacenes', producto_categorias: 'Categorías de productos', producto_marcas: 'Marcas',
  productos: 'Productos', cliente_categorias: 'Categorías de clientes', zonas: 'Zonas',
  tipos_cliente: 'Tipos de cliente', rutas_venta: 'Rutas de venta', clientes: 'Clientes',
  proveedores: 'Proveedores', stock: 'Stock', promociones: 'Promociones', cajas: 'Cajas',
  listas_precios: 'Listas de precios', productos_imagenes: 'Productos con imágenes',
  mapeo_geocercas: 'Mapeo de zonas y geocercas',
};

function formDe(s) {
  return {
    codigo: s.codigo || '', nombre: s.nombre || '', direccion: s.direccion || '',
    empresa: s.empresa || '', razon_social: s.razon_social || s.empresa || '',
    padre_id: s.padre_id || '', activa: s.activa !== false,
    modulos: Array.isArray(s.modulos) ? s.modulos : [],
    limites: {
      vendedores: s.limites?.vendedores ?? 1, distribucion: s.limites?.distribucion ?? 1,
      almacen: s.limites?.almacen ?? 1, contador: s.limites?.contador ?? 1,
      cobranzas: s.limites?.cobranzas ?? 1, administradores: s.limites?.administradores ?? 1,
      usuarios: s.limites?.usuarios ?? 10,
    },
    vigencia: { desde: s.vigencia?.desde || '', hasta: s.vigencia?.hasta || '' },
    notificacion: {
      activa: s.notificacion?.activa !== false,
      dias_anticipacion: s.notificacion?.dias_anticipacion || 30,
      modo: s.notificacion?.modo || 'manual',
    },
    admin: VACIA.admin, migrar: VACIA.migrar,
  };
}

export default function Sucursales() {
  const toast = useToast();
  const { cambiarSucursal, sucursalId } = useAuth();
  const [datos, setDatos] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [opciones, setOpciones] = useState({ modulos: [], sucursales: [] });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [asignar, setAsignar] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [busy, setBusy] = useState(false);
  const [migrar, setMigrar] = useState(null);
  const [migrarForm, setMigrarForm] = useState({ origen_id: '', entidades: [] });
  const [importables, setImportables] = useState([]);
  const [eliminar, setEliminar] = useState(null);

  const cargar = useCallback(async () => {
    setBusy(true);
    try {
      const [s, u, o] = await Promise.all([api.get('/sucursales'), api.get('/usuarios'), api.get('/sucursales/opciones')]);
      setDatos(s);
      setUsuarios(u.usuarios || []);
      setOpciones(o);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const cargarImportables = async (origen) => {
    if (!origen) return setImportables([]);
    try { setImportables((await api.get(`/sucursales/importables?origen_id=${origen}`)).entidades || []); }
    catch (error) { toast(error.message, 'error'); }
  };

  const abrirNueva = () => {
    setForm(JSON.parse(JSON.stringify(VACIA)));
    setModal('nueva');
  };

  const abrirEditar = (s) => { setForm(formDe(s)); setModal(s); };

  const abrirMigrar = async (s) => {
    setMigrar(s);
    const origen = (datos?.sucursales || []).find((x) => x.id !== s.id)?.id || '';
    setMigrarForm({ origen_id: origen, entidades: [] });
    await cargarImportables(origen);
  };

  const ejecutarMigrar = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/sucursales/${migrar.id}/importar`, migrarForm);
      if (!r.ok) throw new Error(r.error);
      toast('Datos migrados a la empresa destino');
      setMigrar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const guardar = async () => {
    setBusy(true);
    try {
      if (modal === 'nueva') {
        const r = await api.post('/sucursales/alta-empresa', { ...form, migrar: form.migrar.origen_id ? form.migrar : null });
        if (!r.ok) throw new Error(r.error);
        toast(`Empresa ${r.sucursal?.nombre || ''} registrada con su administrador`);
      } else {
        const r = await api.put(`/sucursales/${modal.id}`, form);
        if (!r.ok) throw new Error(r.error);
        toast('Empresa/sucursal actualizada');
      }
      setModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const notificar = async (s) => {
    try {
      const r = await api.post(`/sucursales/${s.id}/notificar`, {
        titulo: `Aviso de ${s.nombre}`,
        detalle: `Vigencia: ${s.vigencia?.hasta || 'sin definir'} · Módulos: ${(s.modulos || []).join(', ') || 'ninguno'}`,
      });
      toast(r.enviada ? 'Notificación registrada' : 'Ya existe una notificación con ese título');
    } catch (error) { toast(error.message, 'error'); }
  };

  const cambiarEstado = async (s) => {
    try {
      const r = await api.post(`/sucursales/${s.id}/${s.activa !== false ? 'desactivar' : 'activar'}`, {});
      if (!r.ok) throw new Error(r.error);
      toast(r.sucursal.activa ? 'Empresa activada' : 'Empresa desactivada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const confirmarEliminar = async () => {
    setBusy(true);
    try {
      const r = await api.del(`/sucursales/${eliminar.id}`);
      if (!r.ok) throw new Error(r.error);
      toast(`Empresa ${r.eliminada} eliminada`);
      setEliminar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirAsignar = (s) => {
    setAsignar(s);
    setSeleccion(usuarios.filter((u) => Number(u.sucursal_id || 1) === Number(s.id)).map((u) => u.id));
  };

  const guardarAsignacion = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/sucursales/${asignar.id}/usuarios`, { usuario_ids: seleccion });
      toast(`${r.asignados.length} usuario(s) asignados a ${asignar.nombre}`);
      setAsignar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const toggleModulo = (id) => setForm((f) => ({
    ...f, modulos: f.modulos.includes(id) ? f.modulos.filter((x) => x !== id) : [...f.modulos, id],
  }));
  const setLimite = (clave, valor) => setForm((f) => ({ ...f, limites: { ...f.limites, [clave]: valor } }));
  const setVigencia = (clave, valor) => setForm((f) => ({ ...f, vigencia: { ...f.vigencia, [clave]: valor } }));
  const setNotificacion = (clave, valor) => setForm((f) => ({ ...f, notificacion: { ...f.notificacion, [clave]: valor } }));
  const setAdmin = (clave, valor) => setForm((f) => ({ ...f, admin: { ...f.admin, [clave]: valor } }));

  const lista = datos?.sucursales || [];
  const totalVentas = lista.reduce((s, x) => s + Number(x.ventas || 0), 0);
  const totalCartera = lista.reduce((s, x) => s + Number(x.cartera || 0), 0);
  const vencidas = lista.filter((s) => s.vigencia?.hasta && s.vigencia.hasta < new Date().toISOString().slice(0, 10)).length;

  return (
    <>
      <PageHeader
        eyebrow="Sistema / Multi-empresa"
        title="Sucursales y empresas"
        subtitle="Función exclusiva del dueño del sistema. Cada empresa opera de forma autónoma y aislada."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={abrirNueva}><Plus size={14} /> Registrar empresa</button>
        </>}
      />

      <div className="notice notice-info mb-16"><ShieldCheck size={15} />
        <div><strong>Autonomía garantizada.</strong> Clientes, productos, ventas, cobranzas y reportes se etiquetan con la sucursal. Nadie ve los datos de otra empresa. Solo el dueño puede crear empresas, activar módulos, fijar cupos y vigencias.</div>
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Empresas activas" value={lista.filter((s) => s.activa !== false).length} icon={Building2} tone="blue" hint={`${lista.length} en total`} />
        <StatCard label="Clientes" value={<Num value={lista.reduce((s, x) => s + x.clientes, 0)} />} icon={Users} tone="purple" />
        <StatCard label="Ventas" value={<Money value={totalVentas} />} icon={ShoppingCart} tone="orange" />
        <StatCard label="Vigencias vencidas" value={<Num value={vencidas} />} icon={CalendarDays} tone="red" hint={<Money value={totalCartera} />} />
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Empresas registradas</h3><p>Configuración, cupos, vigencia y migración por empresa</p></div><Badge tone="blue">{lista.length}</Badge></div>
        {!datos ? <div className="panel-body"><SkeletonRows rows={5} /></div> : !lista.length ? <div className="table-empty">No hay empresas registradas.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Empresa</th><th>Estado</th><th>Módulos</th><th>Cupos</th><th>Vigencia</th><th className="num">Usuarios</th><th className="num">Ventas</th><th /></tr></thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.nombre}<span className="cell-sub">{s.codigo} · {s.empresa || ''}{s.direccion ? ` · ${s.direccion}` : ''}</span></td>
                    <td><Badge tone={s.activa !== false ? 'green' : 'gray'}>{s.activa !== false ? 'Activa' : 'Inactiva'}</Badge></td>
                    <td><div className="inline" style={{ gap: 4, flexWrap: 'wrap' }}>{(s.modulos || []).map((m) => <span className="badge badge-blue" key={m}>{m}</span>)}{!(s.modulos || []).length && <span className="muted">—</span>}</div></td>
                    <td className="small">V {s.por_rol?.vendedores ?? 0}{s.limites?.vendedores ? `/${s.limites.vendedores}` : ''} · D {s.por_rol?.distribucion ?? 0}{s.limites?.distribucion ? `/${s.limites.distribucion}` : ''} · A {s.por_rol?.almacen ?? 0}{s.limites?.almacen ? `/${s.limites.almacen}` : ''} · C {s.por_rol?.cobranzas ?? 0}{s.limites?.cobranzas ? `/${s.limites.cobranzas}` : ''} · Total {s.usuarios}{s.limites?.usuarios ? `/${s.limites.usuarios}` : ''}</td>
                    <td className="small">{s.vigencia?.desde || '—'} → {s.vigencia?.hasta || '—'}</td>
                    <td className="num"><Num value={s.usuarios} /></td>
                    <td className="num"><Money value={s.ventas} /></td>
                    <td className="actions">
                      {s.id !== sucursalId && <button className="btn btn-soft btn-sm" title="Trabajar en esta empresa" onClick={() => cambiarSucursal(s.id)}><Check size={12} /> Usar</button>}
                      <button className="btn btn-outline btn-sm" onClick={() => abrirAsignar(s)}><Users size={12} /> Usuarios</button>
                      <button className="btn btn-soft btn-sm" title="Migrar datos desde otra empresa" onClick={() => abrirMigrar(s)}><ArrowRightLeft size={12} /> Migrar</button>
                      <button className="btn btn-ghost btn-sm" title="Enviar notificación manual" onClick={() => notificar(s)}><Bell size={12} /> Avisar</button>
                      <button className="btn btn-ghost btn-sm" title={s.activa !== false ? 'Desactivar empresa' : 'Activar empresa'} onClick={() => cambiarEstado(s)}>{s.activa !== false ? 'Desactivar' : 'Activar'}</button>
                      <button className="icon-btn" title="Editar configuración" onClick={() => abrirEditar(s)}><Pencil size={14} /></button>
                      <button className="icon-btn danger" title="Eliminar empresa" onClick={() => setEliminar(s)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} size="lg"
        title={modal === 'nueva' ? 'Registrar nueva empresa' : `Configurar ${modal?.nombre || ''}`}
        subtitle={modal === 'nueva' ? 'Alta, módulos, cupos, vigencia, administrador y migración inicial' : 'Módulos contratados, cupos, vigencia y notificaciones'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : modal === 'nueva' ? 'Registrar empresa' : 'Guardar cambios'}</button></>}
      >
        <div className="form-stack">
          <h4 className="small">1 · Datos de la empresa</h4>
          <div className="field-row">
            <div className="field"><label>Código</label><input className="input" value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ej. EMP-002" /></div>
            <div className="field"><label>Nombre comercial</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Distribuidora MECI" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Razón social</label><input className="input" value={form.empresa} onChange={(e) => setForm({ ...form, empresa: e.target.value })} /></div>
            <div className="field"><label>Dirección</label><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Sucursal padre (sub sucursal)</label><select className="select" value={form.padre_id || ''} onChange={(e) => setForm({ ...form, padre_id: e.target.value })}><option value="">Ninguna · empresa independiente</option>{(datos?.sucursales || []).filter((s) => s.id !== modal?.id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
            <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={Boolean(form.activa)} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Empresa activa y habilitada</label>
          </div>

          <div className="divider" />
          <h4 className="small">2 · Módulos que contrata</h4>
          <div className="grid grid-3" style={{ gap: 8 }}>
            {(opciones.modulos || []).map((m) => (
              <label className="check" key={m.id}><input type="checkbox" checked={form.modulos.includes(m.id)} onChange={() => toggleModulo(m.id)} /> {m.etiqueta}</label>
            ))}
          </div>
          <span className="hint">Los permisos del administrador de esta empresa se generan solo con los módulos activados. Nunca incluye Sucursales ni Panel del dueño.</span>

          <div className="divider" />
          <h4 className="small">3 · Límites de uso por rol (vacío = sin límite)</h4>
          <div className="grid grid-4" style={{ gap: 8 }}>
            {[['vendedores', 'Vendedores'], ['distribucion', 'Distribuidores'], ['almacen', 'Almaceneros'], ['contador', 'Contadores']].map(([clave, etiqueta]) => (
              <div className="field" key={clave}><label>{etiqueta}</label><input className="input" type="number" min="0" value={form.limites[clave]} onChange={(e) => setLimite(clave, e.target.value)} /></div>
            ))}
          </div>
          <div className="field-row mt-8">
            <div className="field"><label>Cobradores</label><input className="input" type="number" min="0" value={form.limites.cobranzas} onChange={(e) => setLimite('cobranzas', e.target.value)} /></div>
            <div className="field"><label>Administradores</label><input className="input" type="number" min="0" value={form.limites.administradores} onChange={(e) => setLimite('administradores', e.target.value)} /></div>
            <div className="field"><label>Total de usuarios</label><input className="input" type="number" min="0" value={form.limites.usuarios} onChange={(e) => setLimite('usuarios', e.target.value)} /></div>
          </div>
          <span className="hint">Por defecto: 1 vendedor, 1 distribuidor, 1 almacenero, 1 contador y 1 administrador (5 usuarios). Con 5 usuarios más se llega a 10, que será el límite total; el administrador no podrá crear otro sin autorización del dueño.</span>

          <div className="divider" />
          <h4 className="small">4 · Vigencia y notificación de vencimiento</h4>
          <div className="field-row">
            <div className="field"><label>Desde</label><input className="input" type="date" value={form.vigencia.desde} onChange={(e) => setVigencia('desde', e.target.value)} /></div>
            <div className="field"><label>Hasta</label><input className="input" type="date" value={form.vigencia.hasta} onChange={(e) => setVigencia('hasta', e.target.value)} /></div>
          </div>
          <div className="field-row">
            <label className="check" style={{ alignSelf: 'end' }}><input type="checkbox" checked={form.notificacion.activa} onChange={(e) => setNotificacion('activa', e.target.checked)} /> Notificar antes del vencimiento</label>
            <div className="field"><label>Días de anticipación</label><input className="input" type="number" min="1" value={form.notificacion.dias_anticipacion} onChange={(e) => setNotificacion('dias_anticipacion', e.target.value)} /></div>
            <div className="field"><label>Modo</label><select className="select" value={form.notificacion.modo} onChange={(e) => setNotificacion('modo', e.target.value)}><option value="manual">Manual</option><option value="automatico">Automático</option></select></div>
          </div>
          <span className="hint">Manual: el dueño pulsa <b>Avisar</b>. Automático: el sistema revisa diariamente y avisa 30 días antes (o los días configurados).</span>

          {modal === 'nueva' && <>
            <div className="divider" />
            <h4 className="small">5 · Primer administrador de la empresa</h4>
            <div className="field-row">
              <div className="field"><label>Nombre</label><input className="input" value={form.admin.nombre} onChange={(e) => setAdmin('nombre', e.target.value)} /></div>
              <div className="field"><label>Usuario</label><input className="input" value={form.admin.usuario} onChange={(e) => setAdmin('usuario', e.target.value)} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Correo</label><input className="input" type="email" value={form.admin.email} onChange={(e) => setAdmin('email', e.target.value)} /></div>
              <div className="field"><label>Contraseña inicial</label><input className="input" value={form.admin.password} onChange={(e) => setAdmin('password', e.target.value)} /></div>
            </div>

            <div className="divider" />
            <h4 className="small">6 · Migrar datos iniciales (opcional)</h4>
            <div className="field"><label>Empresa de origen</label><select className="select" value={form.migrar.origen_id} onChange={(e) => { const id = e.target.value; setForm({ ...form, migrar: { ...form.migrar, origen_id: id, entidades: [] } }); cargarImportables(id); }}>
              <option value="">No migrar datos</option>
              {(datos?.sucursales || []).filter((s) => s.id !== modal?.id).map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.empresa || ''}</option>)}
            </select></div>
            {form.migrar.origen_id && <div className="field"><label>Datos a copiar</label><div className="grid grid-3" style={{ gap: 8 }}>
              {importables.map((e) => <label className="check" key={e.clave}><input type="checkbox" checked={form.migrar.entidades.includes(e.clave)} onChange={() => setForm({ ...form, migrar: { ...form.migrar, entidades: form.migrar.entidades.includes(e.clave) ? form.migrar.entidades.filter((x) => x !== e.clave) : [...form.migrar.entidades, e.clave] } })} /> {ETIQUETAS_IMPORTABLES[e.clave] || e.clave} <span className="small muted">({e.filas})</span></label>)}
            </div></div>}
          </>}
        </div>
      </Modal>

      <Modal open={Boolean(asignar)} onClose={() => setAsignar(null)} title={`Usuarios de ${asignar?.nombre || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setAsignar(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAsignacion} disabled={busy}>{busy ? 'Guardando…' : 'Guardar asignación'}</button></>}
      >
        <div className="form-stack">
          <span className="hint">Los cupos configurados para esta empresa se validan al asignar usuarios.</span>
          <div className="check-list">
            {usuarios.map((u) => (
              <label className="check" key={u.id}>
                <input type="checkbox" checked={seleccion.includes(u.id)} onChange={() => setSeleccion(seleccion.includes(u.id) ? seleccion.filter((x) => x !== u.id) : [...seleccion, u.id])} />
                <span>{u.nombre}<span className="cell-sub">{u.email || u.usuario || ''} · actual: {u.sucursal_nombre || `Sucursal ${u.sucursal_id || 1}`}</span></span>
              </label>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(migrar)} onClose={() => setMigrar(null)} title={`Migrar datos a ${migrar?.nombre || ''}`} subtitle="Selecciona la empresa origen y qué datos copiar" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setMigrar(null)}>Cancelar</button><button className="btn btn-primary" onClick={ejecutarMigrar} disabled={busy || !migrarForm.entidades.length}>{busy ? 'Migrando…' : 'Migrar seleccionados'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><Layers size={15} /> Los registros se copian con nuevos IDs y quedan aislados en la empresa destino. Incluye listas de precios, imágenes de productos y geocercas de zonas.</div>
          <div className="field"><label>Empresa origen</label><select className="select" value={migrarForm.origen_id} onChange={async (e) => { const id = e.target.value; setMigrarForm({ ...migrarForm, origen_id: id, entidades: [] }); await cargarImportables(id); }}>
            {(datos?.sucursales || []).filter((s) => s.id !== migrar?.id).map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.empresa || ''}</option>)}
          </select></div>
          <div className="field"><label>Datos a migrar</label><div className="grid grid-3" style={{ gap: 8 }}>
            {importables.map((e) => <label className="check" key={e.clave}><input type="checkbox" checked={migrarForm.entidades.includes(e.clave)} onChange={() => setMigrarForm({ ...migrarForm, entidades: migrarForm.entidades.includes(e.clave) ? migrarForm.entidades.filter((x) => x !== e.clave) : [...migrarForm.entidades, e.clave] })} /> {ETIQUETAS_IMPORTABLES[e.clave] || e.clave} <span className="small muted">({e.filas})</span></label>)}
          </div></div>
        </div>
      </Modal>

      <Confirm
        open={Boolean(eliminar)}
        onClose={() => setEliminar(null)}
        onConfirm={confirmarEliminar}
        title={`Eliminar ${eliminar?.nombre || ''}`}
        message="Se borrarán la empresa, sus usuarios y todos sus datos aislados. Esta acción no se puede deshacer."
        danger
        loading={busy}
      />
    </>
  );
}
