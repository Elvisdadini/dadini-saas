import { useCallback, useEffect, useState } from 'react';
import { Building2, Pencil, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import BotonExcel from '../components/BotonExcel';
import { Badge, Confirm, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIO = { nombre: '', nit: '', contacto: '', telefono: '', email: '', direccion: '', ciudad: 'Cochabamba', categorias: [], dias_entrega: [], condiciones_pago: 'Contado', activo: true };
const DIAS = [1, 2, 3, 4, 5, 6, 7];
export default function Proveedores() {
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [busy, setBusy] = useState(false);
  const [eliminar, setEliminar] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [proveedores, catalogo] = await Promise.all([api.get('/proveedores'), api.get('/producto-catalogo')]);
      setData({ ...proveedores, categorias: (catalogo.categorias || []).map((c) => c.nombre) });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (proveedor = null) => {
    setEditando(proveedor);
    setForm(proveedor ? { ...VACIO, ...proveedor } : VACIO);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre) return toast('El nombre es obligatorio.', 'error');
    setBusy(true);
    try {
      if (editando) await api.put(`/proveedores/${editando.id}`, form);
      else await api.post('/proveedores', form);
      toast(editando ? 'Proveedor actualizado' : 'Proveedor creado');
      setModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const borrar = async () => {
    try {
      await api.del(`/proveedores/${eliminar.id}`);
      toast('Proveedor eliminado');
      setEliminar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  return (
    <>
      <PageHeader eyebrow="Compras / Configuración" title="Proveedores" subtitle="Administra proveedores, categorías que surten, días de entrega y condiciones de pago."
        actions={<><BotonExcel filas={data?.proveedores || []} nombre="proveedores" columnas={['codigo', 'nombre', 'nit', 'contacto', 'telefono', 'email', 'condiciones_pago', 'activo']} /><button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button><button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Nuevo proveedor</button></>} />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Proveedores" value={data?.total || 0} icon={Building2} tone="blue" hint="Registrados" />
        <StatCard label="Activos" value={(data?.proveedores || []).filter((p) => p.activo).length} icon={Building2} tone="green" hint="Disponibles" />
        <StatCard label="Categorías surtidas" value={new Set((data?.proveedores || []).flatMap((p) => p.categorias || [])).size} icon={Building2} tone="orange" hint="Cobertura" />
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Cartera de proveedores</h3><p>Información comercial y de contacto</p></div></div>
        {loading ? <SkeletonRows rows={5} /> : !(data?.proveedores || []).length ? <EmptyState icon={Building2} title="Sin proveedores" message="Crea el primero para registrar compras." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Proveedor</th><th>Contacto</th><th>Categorías</th><th>Entrega</th><th>Condiciones</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.proveedores.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.codigo}</td>
                    <td>{p.nombre}<span className="cell-sub">{p.nit || 'sin NIT'}</span></td>
                    <td>{p.contacto || '—'}<span className="cell-sub">{p.telefono || p.email || ''}</span></td>
                    <td>{(p.categorias || []).map((c) => <Badge key={c} tone="gray">{c}</Badge>)}</td>
                    <td>{(p.dias_entrega || []).map((d) => DIAS[d - 1] ? ['L', 'M', 'X', 'J', 'V', 'S', 'D'][d - 1] : '').join(' ')}</td>
                    <td>{p.condiciones_pago}</td>
                    <td><Badge tone={p.activo ? 'green' : 'gray'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge></td>
                    <td className="actions">
                      <button className="icon-btn" title="Editar proveedor" onClick={() => abrir(p)}><Pencil size={14} /></button>
                      {['admin', 'dueno'].includes(user?.rol) && <button className="icon-btn danger" title="Eliminar proveedor" onClick={() => setEliminar(p)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar proveedor' : 'Nuevo proveedor'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>Guardar</button></>}>
        <div className="form-stack">
          <div className="field-row"><div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div><div className="field"><label>NIT</label><input className="input" value={form.nit} onChange={(e) => setForm({ ...form, nit: e.target.value })} /></div></div>
          <div className="field-row"><div className="field"><label>Contacto</label><input className="input" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} /></div><div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div></div>
          <div className="field-row"><div className="field"><label>Correo</label><input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div><div className="field"><label>Ciudad</label><input className="input" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} /></div></div>
          <div className="field"><label>Dirección</label><input className="input" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} /></div>
          <div className="field"><label>Condiciones de pago</label><input className="input" value={form.condiciones_pago} onChange={(e) => setForm({ ...form, condiciones_pago: e.target.value })} /></div>
          <div className="field"><label>Categorías que surte</label><div className="pill-group">
            {(data?.categorias || []).length
              ? data.categorias.map((c) => <button key={c} className={`chip ${(form.categorias || []).includes(c) ? 'active' : ''}`} onClick={() => setForm({ ...form, categorias: (form.categorias || []).includes(c) ? form.categorias.filter((x) => x !== c) : [...(form.categorias || []), c] })}>{c}</button>)
              : <span className="hint">No hay categorías activas. Créalas en Inventario → Catálogo de productos.</span>}
          </div><span className="hint">Solo se muestran las categorías vigentes; las eliminadas ya no aparecen.</span></div>
          <div className="field"><label>Días de entrega</label><div className="pill-group">{DIAS.map((d) => <button key={d} className={`chip ${(form.dias_entrega || []).includes(d) ? 'active' : ''}`} onClick={() => setForm({ ...form, dias_entrega: (form.dias_entrega || []).includes(d) ? form.dias_entrega.filter((x) => x !== d) : [...(form.dias_entrega || []), d] })}>{['L', 'M', 'X', 'J', 'V', 'S', 'D'][d - 1]}</button>)}</div></div>
          <label className="check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Proveedor activo</label>
        </div>
      </Modal>
      <Confirm open={Boolean(eliminar)} onClose={() => setEliminar(null)} onConfirm={borrar} title="Eliminar proveedor" message={`¿Eliminar ${eliminar?.nombre || ''}? No se puede si tiene solicitudes u órdenes de compra asociadas.`} danger />
    </>
  );
}
