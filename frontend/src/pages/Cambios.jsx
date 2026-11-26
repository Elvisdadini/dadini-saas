import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Camera, CheckCircle2, Clock3, PackageCheck, Plus, RefreshCcw, Trash2, Undo2, XCircle } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Confirm, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIO = { cliente_id: '', pedido_id: '', producto_id: '', reemplazo_id: '', cantidad: 1, motivo: 'defecto', razon: '', foto: '' };

const TONES = { pendiente: 'amber', confirmado: 'green', rechazado: 'red' };

export default function Cambios() {
  const toast = useToast();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [catalogo, setCatalogo] = useState({ productos: [], clientes: [], motivos: [] });
  const [filtros, setFiltros] = useState({ estado: 'todos', motivo: 'todos', search: '' });
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [confirmar, setConfirmar] = useState(null);
  const [rechazar, setRechazar] = useState(null);
  const [eliminar, setEliminar] = useState(null);
  const [verFoto, setVerFoto] = useState(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setBusy(true);
    try {
      const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v && v !== 'todos')).toString();
      const [d, p, c, m] = await Promise.all([
        api.get(`/cambios${q ? `?${q}` : ''}`), api.get('/productos?todos=true'),
        api.get('/clientes'), api.get('/cambios/catalogo'),
      ]);
      setData(d);
      setCatalogo({ productos: p.productos || [], clientes: c.clientes || [], motivos: m.motivos || [] });
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  }, [filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const esDistribucion = ['admin', 'dueno', 'distribucion'].includes(user?.rol);
  const puedeEditar = ['admin', 'dueno', 'supervisor', 'distribucion'].includes(user?.rol);

  const leerFoto = async (evento, clave, setter) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    const dato = await new Promise((resolve, reject) => {
      const lector = new FileReader();
      lector.onload = () => resolve(String(lector.result));
      lector.onerror = () => reject(new Error('No se pudo leer la imagen.'));
      lector.readAsDataURL(archivo);
    });
    setter((f) => ({ ...f, [clave]: dato }));
  };

  const guardar = async () => {
    try {
      await api.post('/cambios', form);
      toast('Cambio registrado. El distribuidor debe verificarlo.');
      setModal(null);
      setForm(VACIO);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const confirmarCambio = async () => {
    try {
      const r = await api.post(`/cambios/${confirmar.id}/confirmar`, {
        producto_entregado_id: Number(confirmar.producto_entregado_id), nota: confirmar.nota || '', foto_entrega: confirmar.foto_entrega || '',
      });
      if (!r.ok) throw new Error(r.error);
      toast('Cambio confirmado: el producto entregado coincide con el registrado');
      setConfirmar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const rechazarCambio = async () => {
    try {
      await api.post(`/cambios/${rechazar.id}/rechazar`, { nota: rechazar.nota || '' });
      toast('Cambio rechazado');
      setRechazar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const borrar = async () => {
    try {
      await api.del(`/cambios/${eliminar.id}`);
      toast('Cambio eliminado');
      setEliminar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const resumen = data?.resumen || {};
  const productos = catalogo.productos;

  return (
    <>
      <PageHeader eyebrow="Ventas / Distribución" title="Cambios de producto"
        subtitle="Registra el producto con detalle con foto y razón; distribución verifica que el producto bueno entregado sea el mismo."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={() => { setForm(VACIO); setModal(true); }}><Plus size={15} /> Registrar cambio</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Pendientes" value={resumen.pendientes || 0} icon={Clock3} tone="amber" hint="Por verificar en distribución" />
        <StatCard label="Confirmados" value={resumen.confirmados || 0} icon={CheckCircle2} tone="green" hint="Producto verificado" />
        <StatCard label="Rechazados" value={resumen.rechazados || 0} icon={XCircle} tone="red" />
        <StatCard label="Total" value={data?.total || 0} icon={Undo2} tone="blue" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Filtros</h3><p>Busca por código, producto o razón</p></div></div>
        <div className="panel-body">
          <div className="filters">
            <input className="input" placeholder="Buscar…" value={filtros.search} onChange={(e) => setFiltros({ ...filtros, search: e.target.value })} />
            <select className="select" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
              <option value="todos">Todos los estados</option><option value="pendiente">Pendientes</option><option value="confirmado">Confirmados</option><option value="rechazado">Rechazados</option>
            </select>
            <select className="select" value={filtros.motivo} onChange={(e) => setFiltros({ ...filtros, motivo: e.target.value })}>
              <option value="todos">Todas las razones</option>
              {catalogo.motivos.map((m) => <option key={m.clave} value={m.clave}>{m.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Cambios registrados</h3><p>Con trazabilidad de quién registró y quién confirmó</p></div></div>
        {busy && !data ? <div className="panel-body"><SkeletonRows rows={6} /></div> : !(data?.cambios || []).length ? <EmptyState icon={Undo2} title="Sin cambios" message="Registra el primero con foto y razón del producto." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Cliente</th><th>Producto con detalle</th><th>Razón</th><th className="num">Cant.</th><th>Estado</th><th>Foto</th><th /></tr></thead>
              <tbody>
                {data.cambios.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong">{c.codigo}<span className="cell-sub"><Fecha value={c.creado_en} short /> · {c.vendedor_nombre}</span></td>
                    <td>{(catalogo.clientes.find((x) => x.id === c.cliente_id)?.nombre) || `#${c.cliente_id}`}</td>
                    <td>{c.producto_nombre || `#${c.producto_id}`}<span className="cell-sub">Entregar: {c.reemplazo_nombre || `#${c.reemplazo_id}`}</span></td>
                    <td>{catalogo.motivos.find((m) => m.clave === c.motivo)?.label || c.motivo}<span className="cell-sub">{c.razon}</span></td>
                    <td className="num">{c.cantidad}</td>
                    <td><Badge tone={TONES[c.estado] || 'gray'}>{c.estado}</Badge>{c.confirmado_en && <span className="cell-sub"><Fecha value={c.confirmado_en} short /></span>}</td>
                    <td>{c.foto_url ? <button className="icon-btn" title="Ver foto" onClick={() => setVerFoto(c.foto_url)}><Camera size={14} /></button> : '—'}</td>
                    <td className="actions">
                      {esDistribucion && c.estado === 'pendiente' && <>
                        <button className="btn btn-soft btn-sm" onClick={() => setConfirmar({ ...c, producto_entregado_id: c.reemplazo_id || c.producto_id })}><BadgeCheck size={12} /> Confirmar</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setRechazar(c)}>Rechazar</button>
                      </>}
                      {['admin', 'dueno', 'supervisor'].includes(user?.rol) && <button className="icon-btn danger" title="Eliminar" onClick={() => setEliminar(c)}><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal === 'nuevo'} onClose={() => setModal(null)} title="Registrar cambio de producto" subtitle="El distribuidor verificará el producto al entregarlo" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>Guardar cambio</button></>}
      >
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Cliente</label><select className="select" value={form.cliente_id} onChange={(e) => setForm({ ...form, cliente_id: e.target.value })}><option value="">Seleccionar…</option>{catalogo.clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="field"><label>Producto con detalle</label><select className="select" value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value, reemplazo_id: form.reemplazo_id || e.target.value })}><option value="">Seleccionar…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}</select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Producto bueno a entregar</label><select className="select" value={form.reemplazo_id} onChange={(e) => setForm({ ...form, reemplazo_id: e.target.value })}><option value="">Igual al registrado</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}</select></div>
            <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} /></div>
          </div>
          <div className="field"><label>Razón del cambio</label><select className="select" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })}>{catalogo.motivos.map((m) => <option key={m.clave} value={m.clave}>{m.label}</option>)}</select></div>
          <div className="field"><label>Detalle</label><textarea className="textarea" value={form.razon} onChange={(e) => setForm({ ...form, razon: e.target.value })} placeholder="Describe el defecto, vencimiento, rotación o error en el pedido" /></div>
          <div className="field"><label>Foto del producto</label><input className="input" type="file" accept="image/*" onChange={(e) => leerFoto(e, 'foto', setForm)} />{form.foto && <img src={form.foto} alt="Vista previa" style={{ maxWidth: '100%', maxHeight: 180, borderRadius: 8 }} />}</div>
        </div>
      </Modal>

      <Modal open={Boolean(confirmar)} onClose={() => setConfirmar(null)} title={`Confirmar ${confirmar?.codigo || ''}`} subtitle="Verifica físicamente que el producto entregado sea el registrado" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setConfirmar(null)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarCambio}><BadgeCheck size={14} /> Confirmar cambio</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><BadgeCheck size={15} /> El backend rechazará la confirmación si el producto entregado no coincide con el que registró el vendedor.</div>
          <div className="field"><label>Producto esperado</label><input className="input" readOnly value={confirmar?.reemplazo_nombre || confirmar?.producto_nombre || ''} /></div>
          <div className="field"><label>Producto que entregaste</label><select className="select" value={confirmar?.producto_entregado_id || ''} onChange={(e) => setConfirmar({ ...confirmar, producto_entregado_id: e.target.value })}>{productos.map((p) => <option key={p.id} value={p.id}>{p.sku} · {p.nombre}</option>)}</select></div>
          <div className="field"><label>Foto del producto entregado (opcional)</label><input className="input" type="file" accept="image/*" onChange={(e) => leerFoto(e, 'foto_entrega', setConfirmar)} /></div>
          <div className="field"><label>Nota de verificación</label><textarea className="textarea" value={confirmar?.nota || ''} onChange={(e) => setConfirmar({ ...confirmar, nota: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={Boolean(rechazar)} onClose={() => setRechazar(null)} title={`Rechazar ${rechazar?.codigo || ''}`} subtitle="El cambio volverá a pendiente del vendedor"
        footer={<><button className="btn btn-ghost" onClick={() => setRechazar(null)}>Cancelar</button><button className="btn btn-danger" onClick={rechazarCambio}>Rechazar</button></>}
      >
        <div className="field"><label>Motivo del rechazo</label><textarea className="textarea" value={rechazar?.nota || ''} onChange={(e) => setRechazar({ ...rechazar, nota: e.target.value })} /></div>
      </Modal>

      <Confirm open={Boolean(eliminar)} onClose={() => setEliminar(null)} onConfirm={borrar} title="Eliminar cambio" message={`¿Eliminar ${eliminar?.codigo || ''}?`} danger />
      <Modal open={Boolean(verFoto)} onClose={() => setVerFoto(null)} title="Foto del producto" footer={<button className="btn btn-ghost" onClick={() => setVerFoto(null)}>Cerrar</button>}>
        <img src={verFoto || ''} alt="Producto" style={{ maxWidth: '100%', borderRadius: 8 }} />
      </Modal>
    </>
  );
}
