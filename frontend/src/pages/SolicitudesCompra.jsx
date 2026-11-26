import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, PackagePlus, Plus, RefreshCcw, TrendingUp, Truck, XCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const ESTADO_TONE = { pendiente: 'amber', aprobada: 'blue', recibida: 'green', rechazada: 'red' };

export default function SolicitudesCompra() {
  const toast = useToast();
  const { user } = useAuth();
  const puedeAprobar = ['admin', 'dueno'].includes(user?.rol);
  const [data, setData] = useState(null);
  const [productos, setProductos] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [demanda, setDemanda] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ almacen_id: 1, proveedor_id: '', notas: '', items: [] });
  const [aprobar, setAprobar] = useState(null);
  const [aprobarForm, setAprobarForm] = useState({ proveedor_id: '', items: [] });
  const [recibir, setRecibir] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState(null);
  const [editForm, setEditForm] = useState({ almacen_id: 1, proveedor_id: '', notas: '', items: [] });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, todos, prov, dem] = await Promise.all([
        api.get('/solicitudes-compra'), api.get('/productos?bajo_stock=true'), api.get('/productos'),
        api.get('/proveedores?activo=true'), api.get('/demanda/sugerencias?solo_urgentes=true'),
      ]);
      setData(s);
      setProductos(p.productos || []);
      setCatalogo(todos.productos || []);
      setProveedores(prov.proveedores || []);
      setDemanda(dem.sugerencias || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const abrirNueva = () => {
    const sugeridas = demanda.filter((s) => s.sugerido > 0);
    const items = sugeridas.length
      ? sugeridas.map((s) => ({ producto_id: s.producto_id, nombre: s.nombre, cantidad: s.sugerido, precio_estimado: s.precio_estimado, proveedor_id: s.proveedor_id }))
      : productos.map((p) => ({ producto_id: p.id, nombre: p.nombre, cantidad: Math.max(1, p.stock_minimo - p.stock_total), precio_estimado: p.costo }));
    setForm({
      almacen_id: 1,
      proveedor_id: sugeridas.find((s) => s.proveedor_id)?.proveedor_id || proveedores[0]?.id || '',
      notas: sugeridas.length ? 'Sugerencias calculadas por predicción de demanda' : '',
      items,
    });
    setModal(true);
  };

  const guardar = async () => {
    const items = form.items.filter((i) => i.cantidad > 0);
    if (!items.length) return toast('Agrega productos a reponer.', 'error');
    setBusy(true);
    try {
      await api.post('/solicitudes-compra', { ...form, proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null, items });
      toast('Solicitud de compra enviada al administrador');
      setModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirEdicion = (solicitud) => {
    setEditando(solicitud);
    setEditForm({
      almacen_id: solicitud.almacen_id,
      proveedor_id: String(solicitud.proveedor_id || ''),
      notas: solicitud.notas || '',
      items: solicitud.items.map((i) => ({ ...i })),
    });
  };

  const guardarEdicion = async () => {
    setBusy(true);
    try {
      await api.put(`/solicitudes-compra/${editando.id}`, {
        ...editForm,
        proveedor_id: editForm.proveedor_id ? Number(editForm.proveedor_id) : null,
        items: editForm.items.filter((i) => i.cantidad > 0),
      });
      toast('Solicitud actualizada');
      setEditando(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirAprobacion = (solicitud) => {
    setAprobar(solicitud);
    setAprobarForm({ proveedor_id: String(solicitud.proveedor_id || proveedores[0]?.id || ''), items: solicitud.items.map((i) => ({ producto_id: i.producto_id, cantidad: i.cantidad })) });
  };

  const confirmarAprobacion = async () => {
    setBusy(true);
    try {
      const r = await api.put(`/solicitudes-compra/${aprobar.id}/aprobar`, { proveedor_id: Number(aprobarForm.proveedor_id), items: aprobarForm.items });
      toast(`Solicitud aprobada · Orden ${r.orden.codigo} generada`);
      setAprobar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const confirmarRecepcion = async () => {
    setBusy(true);
    try {
      await api.post(`/solicitudes-compra/${recibir.id}/recibir`, { cantidades });
      toast('Productos recibidos · Inventario actualizado en tiempo real');
      setRecibir(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const resumen = data?.resumen || {};
  return (
    <>
      <PageHeader eyebrow="Compras / Reposición" title="Solicitudes de compra" subtitle="El almacenero solicita stock bajo; el administrador aprueba y la recepción actualiza el inventario."
        actions={<><Link className="btn btn-outline" to="/compras/demanda"><TrendingUp size={14} /> Demanda</Link><button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button><button className="btn btn-primary" onClick={abrirNueva}><Plus size={15} /> Nueva solicitud</button></>} />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Pendientes" value={resumen.pendientes || 0} icon={ClipboardList} tone="amber" hint="Por aprobar" />
        <StatCard label="Aprobadas" value={resumen.aprobadas || 0} icon={CheckCircle2} tone="blue" hint="Órdenes generadas" />
        <StatCard label="Recibidas" value={resumen.recibidas || 0} icon={PackagePlus} tone="green" hint="Stock actualizado" />
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Solicitudes registradas</h3><p>Seguimiento completo de reposición</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.solicitudes || []).length ? <EmptyState icon={ClipboardList} title="Sin solicitudes" message="Crea una solicitud para reponer stock." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Fecha</th><th>Solicitante</th><th>Proveedor</th><th className="num">Items</th><th className="num">Total estimado</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.codigo}<span className="cell-sub">{s.orden_codigo || ''}</span></td>
                    <td>{new Date(s.fecha).toLocaleDateString('es-BO')}</td>
                    <td>{s.solicitante}</td>
                    <td>{s.proveedor_nombre}</td>
                    <td className="num">{s.items.length}</td>
                    <td className="num"><strong>Bs {s.total_estimado.toFixed(2)}</strong></td>
                    <td><Badge tone={ESTADO_TONE[s.estado] || 'gray'}>{s.estado}</Badge></td>
                    <td className="actions">
                      {s.estado === 'pendiente' && <button className="btn btn-outline btn-sm" onClick={() => abrirEdicion(s)}>Editar</button>}
                      {s.estado === 'pendiente' && puedeAprobar && <button className="btn btn-primary btn-sm" onClick={() => abrirAprobacion(s)}><CheckCircle2 size={12} /> Aprobar</button>}
                      {s.estado === 'aprobada' && <button className="btn btn-soft btn-sm" onClick={() => { setRecibir(s); setCantidades(Object.fromEntries(s.items.map((i) => [i.producto_id, i.cantidad_aprobada ?? i.cantidad]))); }}><Truck size={12} /> Recibir</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Nueva solicitud de reposición" subtitle="Cantidades sugeridas por demanda histórica, cobertura y lead time" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>Enviar solicitud</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Almacén</label><select className="select" value={form.almacen_id} onChange={(e) => setForm({ ...form, almacen_id: Number(e.target.value) })}><option value={1}>Almacén Central</option></select></div>
            <div className="field"><label>Proveedor sugerido</label><select className="select" value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}><option value="">Sin definir</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Stock actual</th><th className="num">Mínimo</th><th className="num">Cantidad a pedir</th></tr></thead>
              <tbody>
                {form.items.map((i, idx) => {
                  const producto = productos.find((p) => p.id === i.producto_id);
                  return <tr key={i.producto_id}><td className="cell-strong">{i.nombre}</td><td className="num">{producto?.stock_total ?? 0}</td><td className="num">{producto?.stock_minimo ?? 0}</td><td className="num"><input className="input input-sm" style={{ width: 90 }} type="number" min="0" value={i.cantidad} onChange={(e) => { const x = [...form.items]; x[idx] = { ...x[idx], cantidad: Number(e.target.value) }; setForm({ ...form, items: x }); }} /></td></tr>;
                })}
              </tbody>
            </table>
          </div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={Boolean(aprobar)} onClose={() => setAprobar(null)} title={`Aprobar ${aprobar?.codigo || ''}`} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setAprobar(null)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarAprobacion} disabled={busy}>Aprobar y generar orden</button></>}>
        <div className="form-stack">
          <div className="field"><label>Proveedor</label><select className="select" value={aprobarForm.proveedor_id} onChange={(e) => setAprobarForm({ ...aprobarForm, proveedor_id: e.target.value })}>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Solicitado</th><th className="num">Aprobar</th></tr></thead>
              <tbody>
                {aprobarForm.items.map((i, idx) => <tr key={i.producto_id}><td className="cell-strong">{aprobar?.items?.find((x) => x.producto_id === i.producto_id)?.nombre}</td><td className="num">{i.cantidad}</td><td className="num"><input className="input input-sm" style={{ width: 90 }} type="number" min="0" value={i.cantidad} onChange={(e) => { const x = [...aprobarForm.items]; x[idx] = { ...x[idx], cantidad: Number(e.target.value) }; setAprobarForm({ ...aprobarForm, items: x }); }} /></td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(recibir)} onClose={() => setRecibir(null)} title={`Recibir ${recibir?.codigo || ''}`} subtitle="El stock se actualizará automáticamente" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setRecibir(null)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarRecepcion} disabled={busy}>Confirmar recepción</button></>}>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Producto</th><th className="num">Aprobado</th><th className="num">Recibido</th></tr></thead>
            <tbody>
              {(recibir?.items || []).map((i) => <tr key={i.producto_id}><td className="cell-strong">{i.nombre}</td><td className="num">{i.cantidad_aprobada ?? i.cantidad}</td><td className="num"><input className="input input-sm" style={{ width: 90 }} type="number" min="0" value={cantidades[i.producto_id] ?? 0} onChange={(e) => setCantidades({ ...cantidades, [i.producto_id]: Number(e.target.value) })} /></td></tr>)}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal open={Boolean(editando)} onClose={() => setEditando(null)} title={`Editar ${editando?.codigo || ''}`} subtitle="Solo editable mientras esté pendiente" size="xl"
        footer={<><button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarEdicion} disabled={busy}>Guardar cambios</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Proveedor</label><select className="select" value={editForm.proveedor_id} onChange={(e) => setEditForm({ ...editForm, proveedor_id: e.target.value })}><option value="">Sin definir</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
            <div className="field"><label>Agregar producto</label>
              <select className="select" defaultValue="" onChange={(e) => {
                const producto = catalogo.find((p) => p.id === Number(e.target.value));
                if (!producto) return;
                if (editForm.items.some((i) => i.producto_id === producto.id)) return;
                setEditForm({ ...editForm, items: [...editForm.items, { producto_id: producto.id, nombre: producto.nombre, cantidad: 1, precio_estimado: producto.costo }] });
                e.target.value = '';
              }}>
                <option value="">Seleccionar…</option>
                {catalogo.filter((p) => !editForm.items.some((i) => i.producto_id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Cantidad</th><th className="num">Precio estimado</th><th /></tr></thead>
              <tbody>
                {editForm.items.map((i, idx) => <tr key={i.producto_id}>
                  <td className="cell-strong">{i.nombre}</td>
                  <td className="num"><input className="input input-sm" style={{ width: 90 }} type="number" min="0" value={i.cantidad} onChange={(e) => { const x = [...editForm.items]; x[idx] = { ...x[idx], cantidad: Number(e.target.value) }; setEditForm({ ...editForm, items: x }); }} /></td>
                  <td className="num"><input className="input input-sm" style={{ width: 100 }} type="number" min="0" value={i.precio_estimado} onChange={(e) => { const x = [...editForm.items]; x[idx] = { ...x[idx], precio_estimado: Number(e.target.value) }; setEditForm({ ...editForm, items: x }); }} /></td>
                  <td className="actions"><button className="icon-btn" onClick={() => setEditForm({ ...editForm, items: editForm.items.filter((_, j) => j !== idx) })}>×</button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={editForm.notas} onChange={(e) => setEditForm({ ...editForm, notas: e.target.value })} /></div>
        </div>
      </Modal>
    </>
  );
}
