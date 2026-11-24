import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, BadgePercent, Pencil, Plus, RefreshCcw, Tag, Users } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIA = { nombre: '', descripcion: '', padre_id: '', descuento_porcentaje: 0, descuento_fijo: 0, precios: [], activa: true };

export default function CategoriasClientes() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, p] = await Promise.all([api.get('/categorias'), api.get('/productos')]);
      setData(c);
      setProductos(p.productos || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (cat = null) => {
    setEditando(cat);
    setForm(cat ? { ...VACIA, ...cat, precios: cat.precios || [] } : VACIA);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast('El nombre es obligatorio.', 'error');
    setBusy(true);
    try {
      const payload = {
        ...form,
        descuento_porcentaje: Number(form.descuento_porcentaje) || 0,
        descuento_fijo: Number(form.descuento_fijo) || 0,
        precios: form.precios.map((p) => ({ producto_id: Number(p.producto_id), precio: Number(p.precio) })).filter((p) => p.producto_id && p.precio > 0),
      };
      if (editando) await api.put(`/categorias/${editando.id}`, payload);
      else await api.post('/categorias', payload);
      toast(editando ? 'Categoría actualizada' : 'Categoría creada');
      setModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Clientes / Configuración"
        title="Categorías de clientes"
        subtitle="Cada categoría define descuento global y precios especiales que se reflejan automáticamente en las ventas."
        actions={<>
          <Link className="btn btn-ghost" to="/clientes"><ArrowLeft size={14} /> Clientes</Link>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Nueva categoría</button>
        </>}
      />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Categorías" value={data?.total || 0} icon={Tag} tone="blue" hint="Configuradas" />
        <StatCard label="Clientes categorizados" value={(data?.categorias || []).reduce((s, c) => s + c.clientes, 0)} icon={Users} tone="green" hint="Cartera" />
        <StatCard label="Vendedores con categoría" value={(data?.categorias || []).reduce((s, c) => s + c.vendedores, 0)} icon={BadgePercent} tone="orange" hint="Asignación automática" />
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Categorías</h3><p>Las nuevas ventas de un vendedor toman su categoría por defecto</p></div></div>
        {loading ? <SkeletonRows rows={5} /> : !(data?.categorias || []).length ? (
          <EmptyState icon={Tag} title="Sin categorías" message="Crea la primera categoría." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Categoría</th><th className="num">Descuento</th><th className="num">Clientes</th><th>Precios especiales</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.categorias.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.codigo}</td>
                    <td>{c.padre_id ? `↳ ${c.nombre}` : <strong>{c.nombre}</strong>}<span className="cell-sub">{c.padre_nombre ? `Subcategoría de ${c.padre_nombre} · ` : ''}{c.descripcion}</span></td>
                    <td className="num"><Badge tone="orange">{c.descuento_porcentaje}% {c.descuento_fijo ? `+ Bs ${c.descuento_fijo}` : ''}</Badge></td>
                    <td className="num">{c.clientes}</td>
                    <td>{c.precios?.length || 0} productos</td>
                    <td><Badge tone={c.activa ? 'green' : 'gray'}>{c.activa ? 'Activa' : 'Inactiva'}</Badge></td>
                    <td className="actions"><button className="icon-btn" onClick={() => abrir(c)}><Pencil size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar categoría' : 'Nueva categoría'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></>}>
        <div className="form-stack">
          <div className="field"><label>Nombre</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div className="field"><label>Descripción</label><input className="input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
          <div className="field"><label>Categoría padre (subcategoría)</label><select className="select" value={form.padre_id || ''} onChange={(e) => setForm({ ...form, padre_id: e.target.value })}><option value="">Es una categoría principal</option>{(data?.categorias || []).filter((c) => c.id !== editando?.id && !c.padre_id).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select><span className="hint">Ej. Tienda de barrio → Tienda A, Tienda B, Supermercado, Minimercado.</span></div>
          <div className="field-row">
            <div className="field"><label>Descuento porcentual (%)</label><input type="number" className="input" value={form.descuento_porcentaje} onChange={(e) => setForm({ ...form, descuento_porcentaje: e.target.value })} /></div>
            <div className="field"><label>Descuento fijo (Bs)</label><input type="number" className="input" value={form.descuento_fijo} onChange={(e) => setForm({ ...form, descuento_fijo: e.target.value })} /></div>
          </div>
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panel-head"><h3>Precios especiales por producto</h3><button className="btn btn-soft btn-sm" onClick={() => setForm({ ...form, precios: [...form.precios, { producto_id: '', precio: '' }] })}><Plus size={12} /> Agregar</button></div>
            {form.precios.map((p, i) => (
              <div className="field-row" key={i}>
                <div className="field"><label>Producto</label><select className="select" value={p.producto_id} onChange={(e) => { const x = [...form.precios]; x[i] = { ...x[i], producto_id: e.target.value }; setForm({ ...form, precios: x }); }}><option value="">Seleccionar…</option>{productos.map((prod) => <option key={prod.id} value={prod.id}>{prod.nombre}</option>)}</select></div>
                <div className="field"><label>Precio especial (Bs)</label><input type="number" className="input" value={p.precio} onChange={(e) => { const x = [...form.precios]; x[i] = { ...x[i], precio: e.target.value }; setForm({ ...form, precios: x }); }} /></div>
              </div>
            ))}
            {form.precios.length === 0 && <p className="small muted">Sin precios especiales: se aplica el descuento porcentual global.</p>}
          </div>
          <label className="check"><input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Categoría activa</label>
        </div>
      </Modal>
    </>
  );
}
