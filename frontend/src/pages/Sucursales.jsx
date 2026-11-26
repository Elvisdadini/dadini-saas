import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, Building2, Check, Layers, Package, Pencil, Plus, RefreshCcw, ShoppingCart, Users, Wallet } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Modal, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIA = { codigo: '', nombre: '', direccion: '', empresa: '', padre_id: '', administrador_id: '', activa: true };

export default function Sucursales() {
  const toast = useToast();
  const { user, cambiarSucursal, sucursalId } = useAuth();
  const [datos, setDatos] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [asignar, setAsignar] = useState(null);
  const [seleccion, setSeleccion] = useState([]);
  const [busy, setBusy] = useState(false);
  const [migrar, setMigrar] = useState(null);
  const [migrarForm, setMigrarForm] = useState({ origen_id: '', entidades: [] });
  const [importables, setImportables] = useState([]);

  const cargar = useCallback(async () => {
    setBusy(true);
    try {
      const [s, u] = await Promise.all([api.get('/sucursales'), api.get('/usuarios')]);
      setDatos(s);
      setUsuarios(u.usuarios || []);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => { setForm(VACIA); setModal('nueva'); };
  const abrirEditar = (s) => { setForm({ codigo: s.codigo, nombre: s.nombre, direccion: s.direccion || '', empresa: s.empresa || '', padre_id: s.padre_id || '', administrador_id: s.administrador_id || '', activa: s.activa !== false }); setModal(s); };

  const abrirMigrar = async (s) => {
    setMigrar(s);
    const origen = (datos?.sucursales || []).find((x) => x.id !== s.id)?.id || '';
    setMigrarForm({ origen_id: origen, entidades: [] });
    if (origen) {
      try { setImportables((await api.get(`/sucursales/importables?origen_id=${origen}`)).entidades || []); } catch (error) { toast(error.message, 'error'); }
    }
  };

  const ejecutarMigrar = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/sucursales/${migrar.id}/importar`, migrarForm);
      if (!r.ok) throw new Error(r.error);
      toast('Datos migrados a la sucursal destino');
      setMigrar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const guardar = async () => {
    setBusy(true);
    try {
      if (modal === 'nueva') await api.post('/sucursales', form);
      else await api.put(`/sucursales/${modal.id}`, form);
      toast(modal === 'nueva' ? 'Sucursal creada' : 'Sucursal actualizada');
      setModal(null);
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

  const lista = datos?.sucursales || [];
  const totalVentas = lista.reduce((s, x) => s + Number(x.ventas || 0), 0);
  const totalCartera = lista.reduce((s, x) => s + Number(x.cartera || 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Sistema / Multi-sucursal"
        title="Sucursales"
        subtitle="Cada sucursal opera con clientes, inventario, cobranzas y reportes aislados."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" title="Crear una sucursal vacía con datos aislados" onClick={abrirNueva}><Plus size={14} /> Nueva sucursal</button>
        </>}
      />

      <div className="notice notice-info mb-16"><Building2 size={15} />
        <div><strong>Aislamiento por tenant.</strong> Los datos se etiquetan con la sucursal y cada petición solo ve los suyos. Los administradores pueden cambiar de sucursal con el selector de la barra superior o desde la tabla. Los IDs correlativos son globales para evitar colisiones.</div>
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Sucursales activas" value={lista.filter((s) => s.activa !== false).length} icon={Building2} tone="blue" hint={`${lista.length} en total`} />
        <StatCard label="Clientes" value={<Num value={lista.reduce((s, x) => s + x.clientes, 0)} />} icon={Users} tone="purple" />
        <StatCard label="Ventas" value={<Money value={totalVentas} />} icon={ShoppingCart} tone="orange" hint="En todas las sucursales" />
        <StatCard label="Cartera" value={<Money value={totalCartera} />} icon={Wallet} tone="green" hint="Saldos pendientes" />
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Sucursales</h3><p>Datos y usuarios asignados</p></div><Badge tone="blue">{lista.length}</Badge></div>
        {!datos ? <div className="panel-body"><SkeletonRows rows={5} /></div> : !lista.length ? <div className="table-empty">No hay sucursales configuradas.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Sucursal</th><th>Estado</th><th className="num">Clientes</th><th className="num">Productos</th><th className="num">Pedidos</th><th className="num">Ventas</th><th className="num">Cartera</th><th className="num">Usuarios</th><th /></tr></thead>
              <tbody>
                {lista.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.nombre}<span className="cell-sub">{s.codigo}{s.direccion ? ` · ${s.direccion}` : ''}</span></td>
                    <td><Badge tone={s.activa !== false ? 'green' : 'gray'}>{s.activa !== false ? 'Activa' : 'Inactiva'}</Badge></td>
                    <td className="num"><Num value={s.clientes} /></td>
                    <td className="num"><Num value={s.productos} /></td>
                    <td className="num"><Num value={s.pedidos} /></td>
                    <td className="num"><Money value={s.ventas} /></td>
                    <td className="num"><Money value={s.cartera} /></td>
                    <td className="num"><Num value={s.usuarios} /></td>
                    <td className="actions">
                      {s.id !== sucursalId && <button className="btn btn-soft btn-sm" title="Trabajar en esta sucursal" onClick={() => cambiarSucursal(s.id)}><Check size={12} /> Usar</button>}
                      <button className="btn btn-outline btn-sm" onClick={() => abrirAsignar(s)}><Users size={12} /> Usuarios</button>
                      {user?.rol === 'dueno' && <button className="btn btn-soft btn-sm" title="Migrar datos desde otra sucursal" onClick={() => abrirMigrar(s)}><ArrowRightLeft size={12} /> Migrar</button>}
                      <button className="icon-btn" title="Editar sucursal" onClick={() => abrirEditar(s)}><Pencil size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'nueva' ? 'Nueva sucursal' : `Editar ${modal?.nombre || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></>}
      >
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Código</label><input className="input" value={form.codigo || ''} onChange={(e) => setForm({ ...form, codigo: e.target.value })} placeholder="Ej. SUC-002" /></div>
            <div className="field"><label>Nombre</label><input className="input" value={form.nombre || ''} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Sucursal Quillacollo" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Dirección</label><input className="input" value={form.direccion || ''} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
            <div className="field"><label>Empresa / razón social</label><input className="input" value={form.empresa || ''} onChange={(e) => setForm({ ...form, empresa: e.target.value })} placeholder="Ej. Importadora DADINI" /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Sucursal padre (sub sucursal)</label><select className="select" value={form.padre_id || ''} onChange={(e) => setForm({ ...form, padre_id: e.target.value })}><option value="">Ninguna · empresa independiente</option>{(datos?.sucursales || []).filter((s) => s.id !== modal?.id).map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}</select></div>
            <div className="field"><label>Administrador asignado</label><select className="select" value={form.administrador_id || ''} onChange={(e) => setForm({ ...form, administrador_id: e.target.value })}><option value="">Sin asignar</option>{usuarios.filter((u) => ['admin', 'dueno', 'supervisor'].includes(u.rol)).map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
          </div>
          <label className="check"><input type="checkbox" checked={Boolean(form.activa)} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Sucursal activa</label>
          <span className="hint">Al crearla no se copian datos: empieza vacía. Usa <b>Migrar</b> para traer clientes, productos, zonas, rutas y más desde otra sucursal.</span>
        </div>
      </Modal>

      <Modal open={Boolean(asignar)} onClose={() => setAsignar(null)} title={`Usuarios de ${asignar?.nombre || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setAsignar(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAsignacion} disabled={busy}>{busy ? 'Guardando…' : 'Guardar asignación'}</button></>}
      >
        <div className="form-stack">
          <span className="hint">Cada usuario trabaja en una sola sucursal. Los administradores pueden cambiar temporalmente con el selector superior.</span>
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

      <Modal open={Boolean(migrar)} onClose={() => setMigrar(null)} title={`Migrar datos a ${migrar?.nombre || ''}`} subtitle="Selecciona la sucursal origen y qué datos copiar" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setMigrar(null)}>Cancelar</button><button className="btn btn-primary" onClick={ejecutarMigrar} disabled={busy || !migrarForm.entidades.length}>{busy ? 'Migrando…' : 'Migrar seleccionados'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><Layers size={15} /> Los registros se copian con nuevos IDs y quedan aislados en la sucursal destino. No se mezclan con los existentes.</div>
          <div className="field"><label>Sucursal origen</label><select className="select" value={migrarForm.origen_id} onChange={async (e) => { const id = e.target.value; setMigrarForm({ ...migrarForm, origen_id: id, entidades: [] }); try { setImportables((await api.get(`/sucursales/importables?origen_id=${id}`)).entidades || []); } catch (error) { toast(error.message, 'error'); } }}>
            {(datos?.sucursales || []).filter((s) => s.id !== migrar?.id).map((s) => <option key={s.id} value={s.id}>{s.nombre} · {s.empresa || ''}</option>)}
          </select></div>
          <div className="field"><label>Datos a migrar</label><div className="grid grid-3" style={{ gap: 8 }}>
            {importables.map((e) => <label className="check" key={e.clave}><input type="checkbox" checked={migrarForm.entidades.includes(e.clave)} onChange={() => setMigrarForm({ ...migrarForm, entidades: migrarForm.entidades.includes(e.clave) ? migrarForm.entidades.filter((x) => x !== e.clave) : [...migrarForm.entidades, e.clave] })} /> {e.clave.replaceAll('_', ' ')} <span className="small muted">({e.filas})</span></label>)}
          </div></div>
        </div>
      </Modal>
    </>
  );
}
