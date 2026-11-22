import { useCallback, useEffect, useState } from 'react';
import { Plus, Receipt, RefreshCcw, Settings2 } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const GAS_VACIO = { tipo_gasto_id: '', proveedor_id: '', monto: '', fecha: new Date().toISOString().slice(0, 10), metodo: 'efectivo', comprobante: '', notas: '' };
const TIPO_VACIO = { nombre: '', categoria: 'Operación', descripcion: '', requiere_comprobante: true, activo: true };
const CATEGORIAS = ['Operación', 'Distribución', 'Personal', 'Marketing', 'Otros'];

export default function Gastos() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(GAS_VACIO);
  const [tipoModal, setTipoModal] = useState(false);
  const [tipoForm, setTipoForm] = useState(TIPO_VACIO);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [g, t, p] = await Promise.all([api.get('/gastos'), api.get('/tipos-gasto'), api.get('/proveedores?activo=true')]);
      setData(g); setTipos(t.tipos || []); setProveedores(p.proveedores || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardarGasto = async () => {
    setBusy(true);
    try {
      await api.post('/gastos', { ...form, tipo_gasto_id: Number(form.tipo_gasto_id), proveedor_id: form.proveedor_id ? Number(form.proveedor_id) : null, monto: Number(form.monto) });
      toast('Gasto registrado');
      setModal(false); setForm(GAS_VACIO); await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const guardarTipo = async () => {
    setBusy(true);
    try {
      await api.post('/tipos-gasto', tipoForm);
      toast('Tipo de gasto creado');
      setTipoModal(false); setTipoForm(TIPO_VACIO); await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const resumen = data?.resumen || {};
  return (
    <>
      <PageHeader eyebrow="Compras / Gastos" title="Gastos y tipos configurables" subtitle="Registra egresos por categoría y manten el control frente a las ventas."
        actions={<>
          <button className="btn btn-outline" onClick={() => setTipoModal(true)}><Settings2 size={14} /> Tipos de gasto</button>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={() => { setForm({ ...GAS_VACIO, tipo_gasto_id: tipos[0]?.id || '' }); setModal(true); }}><Plus size={15} /> Registrar gasto</button>
        </>} />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))' }}>
        <StatCard label="Total gastos" value={`Bs ${(resumen.total || 0).toFixed(2)}`} icon={Receipt} tone="red" hint="Período consultado" />
        <StatCard label="Categorías" value={(resumen.por_categoria || []).length} icon={Settings2} tone="blue" hint="Con movimientos" />
      </div>
      <div className="grid grid-2 mb-16" style={{ gap: 10 }}>
        {(resumen.por_categoria || []).map((c) => <div className="mini-stat" key={c.categoria}><span>{c.categoria}</span><strong>Bs {c.total.toFixed(2)}</strong></div>)}
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Movimientos de gastos</h3><p>Detalle con fecha, responsable y comprobante</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.gastos || []).length ? <EmptyState icon={Receipt} title="Sin gastos" message="Registra el primer gasto." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Fecha</th><th>Tipo</th><th>Categoría</th><th>Proveedor</th><th>Responsable</th><th className="num">Monto</th><th>Comprobante</th></tr></thead>
              <tbody>
                {data.gastos.map((g) => <tr key={g.id}>
                  <td className="cell-strong">{g.codigo}</td>
                  <td>{new Date(g.fecha).toLocaleDateString('es-BO')}</td>
                  <td>{g.tipo_nombre}</td><td><Badge tone="gray">{g.categoria}</Badge></td>
                  <td>{g.proveedor_nombre}</td><td>{g.usuario_nombre}</td>
                  <td className="num cell-strong">Bs {g.monto.toFixed(2)}</td>
                  <td>{g.comprobante || '—'}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Registrar gasto" size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarGasto} disabled={busy}>Guardar gasto</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Tipo de gasto</label><select className="select" value={form.tipo_gasto_id} onChange={(e) => setForm({ ...form, tipo_gasto_id: e.target.value })}>{tipos.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
            <div className="field"><label>Monto (Bs)</label><input className="input" type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Fecha</label><input className="input" type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} /></div>
            <div className="field"><label>Método</label><select className="select" value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="qr">QR</option></select></div>
          </div>
          <div className="field"><label>Proveedor (opcional)</label><select className="select" value={form.proveedor_id} onChange={(e) => setForm({ ...form, proveedor_id: e.target.value })}><option value="">Ninguno</option>{proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          <div className="field"><label>Comprobante</label><input className="input" value={form.comprobante} onChange={(e) => setForm({ ...form, comprobante: e.target.value })} /></div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={tipoModal} onClose={() => setTipoModal(false)} title="Tipos de gasto configurables" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setTipoModal(false)}>Cerrar</button><button className="btn btn-primary" onClick={guardarTipo} disabled={busy}>Crear tipo</button></>}>
        <div className="form-stack">
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Nombre</th><th>Categoría</th><th>Comprobante</th><th>Estado</th></tr></thead>
              <tbody>{tipos.map((t) => <tr key={t.id}><td className="cell-strong">{t.codigo}</td><td>{t.nombre}</td><td>{t.categoria}</td><td>{t.requiere_comprobante ? 'Sí' : 'No'}</td><td><Badge tone={t.activo ? 'green' : 'gray'}>{t.activo ? 'Activo' : 'Inactivo'}</Badge></td></tr>)}</tbody>
            </table>
          </div>
          <div className="divider" />
          <div className="field-row"><div className="field"><label>Nombre</label><input className="input" value={tipoForm.nombre} onChange={(e) => setTipoForm({ ...tipoForm, nombre: e.target.value })} /></div><div className="field"><label>Categoría</label><select className="select" value={tipoForm.categoria} onChange={(e) => setTipoForm({ ...tipoForm, categoria: e.target.value })}>{CATEGORIAS.map((c) => <option key={c}>{c}</option>)}</select></div></div>
          <div className="field"><label>Descripción</label><input className="input" value={tipoForm.descripcion} onChange={(e) => setTipoForm({ ...tipoForm, descripcion: e.target.value })} /></div>
          <label className="check"><input type="checkbox" checked={tipoForm.requiere_comprobante} onChange={(e) => setTipoForm({ ...tipoForm, requiere_comprobante: e.target.checked })} /> Requiere comprobante</label>
        </div>
      </Modal>
    </>
  );
}
