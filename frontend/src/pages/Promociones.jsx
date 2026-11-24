import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, BadgePercent, Boxes, CalendarDays, Gift, Layers, Pencil, Plus, RefreshCcw,
  Tag, Trash2, X,
} from 'lucide-react';
import { api } from '../api';
import { optimizarImagen } from '../imagen';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const TIPOS = [
  { value: 'volumen', label: 'Descuento por volumen', icon: BadgePercent },
  { value: 'bonificacion', label: 'Bonificación', icon: Gift },
  { value: '2x1', label: '2x1 / NxM', icon: Layers },
  { value: 'mixto', label: 'Promoción mixta', icon: Boxes },
];

const hoy = () => new Date().toISOString().slice(0, 10);
const en60 = () => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); };

const VACIA = {
  nombre: '', tipo: 'volumen', descripcion: '', productos_ids: [], categorias: [], categorias_clientes: [],
  reglas: [{ min: '', max: '', descuento_porcentaje: '', descuento_fijo: '' }],
  dos_por_uno: { paga: 2, gratis: 1 },
  bonificacion: { requiere_cantidad: 2, producto_id: '', cantidad: 1 },
  mixto: { items: [{ producto_id: '', cantidad: 1 }], descuento_porcentaje: 10, bonificacion_producto_id: '', bonificacion_cantidad: 0 },
  fecha_inicio: hoy(), fecha_fin: en60(), activa: true, prioridad: 5, imagenes: [],
};

export default function Promociones() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [catalogos, setCatalogos] = useState({ productos: [], categorias: [], categoriasClientes: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [busy, setBusy] = useState(false);
  const [imagenesPendientes, setImagenesPendientes] = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cat, cliCat] = await Promise.all([api.get('/promociones'), api.get('/productos'), api.get('/categorias')]);
      setData(p);
      setCatalogos({ productos: cat.productos || [], categorias: cat.categorias || [], categoriasClientes: cliCat.categorias || [] });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (promo = null) => {
    setEditando(promo);
    setForm(promo ? {
      ...VACIA,
      ...promo,
      productos_ids: promo.productos_ids || [],
      categorias: promo.categorias || [],
      categorias_clientes: promo.categorias_clientes || [],
      reglas: promo.reglas?.length ? promo.reglas : VACIA.reglas,
      dos_por_uno: promo.dos_por_uno || VACIA.dos_por_uno,
      bonificacion: promo.bonificacion || VACIA.bonificacion,
      mixto: promo.mixto || VACIA.mixto,
    } : VACIA);
    setImagenesPendientes([]);
    setModal(true);
  };

  const seleccionarImagenes = async (evento) => {
    const archivos = Array.from(evento.target.files || []).slice(0, 2 - (form.imagenes || []).length);
    if (!archivos.length) return;
    try {
      const optimizadas = await Promise.all(archivos.map((a) => optimizarImagen(a)));
      setImagenesPendientes((prev) => [...prev, ...optimizadas].slice(0, 2 - (form.imagenes || []).length));
    } catch (error) { toast(error.message, 'error'); }
    evento.target.value = '';
  };

  const guardar = async () => {
    if (!form.nombre.trim()) return toast('El nombre es obligatorio.', 'error');
    setBusy(true);
    try {
      const imagenes = [...(form.imagenes || []), ...imagenesPendientes].slice(0, 2);
      const payload = {
        ...form,
        imagenes,
        productos_ids: form.productos_ids.map(Number),
        categorias_clientes: form.categorias_clientes.map(Number),
        reglas: form.reglas.map((r) => ({ min: Number(r.min) || 0, max: r.max === '' || r.max === null ? null : Number(r.max), descuento_porcentaje: Number(r.descuento_porcentaje) || 0, descuento_fijo: Number(r.descuento_fijo) || 0 })),
        dos_por_uno: { paga: Number(form.dos_por_uno.paga) || 2, gratis: Number(form.dos_por_uno.gratis) || 1 },
        bonificacion: { requiere_cantidad: Number(form.bonificacion.requiere_cantidad) || 1, producto_id: Number(form.bonificacion.producto_id) || null, cantidad: Number(form.bonificacion.cantidad) || 1 },
        mixto: {
          ...form.mixto,
          items: form.mixto.items.map((i) => ({ producto_id: Number(i.producto_id), cantidad: Number(i.cantidad) || 1 })).filter((i) => i.producto_id),
          descuento_porcentaje: Number(form.mixto.descuento_porcentaje) || 0,
          bonificacion_producto_id: Number(form.mixto.bonificacion_producto_id) || null,
          bonificacion_cantidad: Number(form.mixto.bonificacion_cantidad) || 0,
        },
        prioridad: Number(form.prioridad) || 0,
      };
      if (editando) await api.put(`/promociones/${editando.id}`, payload);
      else await api.post('/promociones', payload);
      toast(editando ? 'Promoción actualizada' : 'Promoción creada');
      setModal(false);
      await cargar();
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  const toggle = async (promo) => {
    try {
      await api.patch(`/promociones/${promo.id}/estado`, { activa: !promo.activa });
      toast(promo.activa ? 'Promoción desactivada' : 'Promoción activada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const eliminar = async (promo) => {
    if (!window.confirm(`¿Eliminar la promoción ${promo.codigo}?`)) return;
    try {
      await api.del(`/promociones/${promo.id}`);
      toast('Promoción eliminada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader
        eyebrow="Inventario / Promociones"
        title="Promociones"
        subtitle="Descuentos por volumen, bonificaciones, 2x1 y combos mixtos aplicados en tiempo real al inventario."
        actions={(
          <>
            <Link className="btn btn-ghost" to="/inventario"><ArrowLeft size={14} /> Inventario</Link>
            <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
            <button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Nueva promoción</button>
          </>
        )}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Promociones" value={resumen.total || 0} icon={Tag} tone="blue" hint="Creadas" />
        <StatCard label="Activas" value={resumen.activas || 0} icon={BadgePercent} tone="green" hint="Aplicando ahora" />
        {(resumen.por_tipo || []).slice(0, 2).map((t) => (
          <StatCard key={t.tipo} label={t.tipo} value={t.total} icon={Layers} tone="orange" hint="Promociones" />
        ))}
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Reglas configuradas</h3><p>Se aplican automáticamente en el punto de venta</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.promociones || []).length ? (
          <EmptyState icon={Tag} title="Sin promociones" message="Crea la primera promoción para empezar." action={<button className="btn btn-primary btn-sm" onClick={() => abrir()}>Nueva promoción</button>} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Promoción</th><th>Tipo</th><th>Vigencia</th><th>Prioridad</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.promociones.map((p) => (
                  <tr key={p.id}>
                    <td className="cell-strong">{p.codigo}</td>
                    <td>{p.nombre}<span className="cell-sub">{p.descripcion}</span>
                      {!!p.imagenes?.length && <span className="inline" style={{ gap: 4, marginTop: 4 }}>{p.imagenes.slice(0, 2).map((url, i) => <img key={i} src={url} alt="" style={{ width: 34, height: 26, objectFit: 'cover', borderRadius: 4 }} />)}</span>}
                    </td>
                    <td><Badge tone="purple">{p.tipo_label}</Badge></td>
                    <td className="nowrap"><Fecha value={p.fecha_inicio} short /> → {p.fecha_fin ? <Fecha value={p.fecha_fin} short /> : 'sin fin'}</td>
                    <td className="num">{p.prioridad}</td>
                    <td><Badge tone={p.activa ? 'green' : 'gray'}>{p.activa ? 'Activa' : 'Inactiva'}</Badge></td>
                    <td className="actions">
                      <button className="icon-btn" title="Editar" onClick={() => abrir(p)}><Pencil size={14} /></button>
                      <button className="btn btn-soft btn-sm" onClick={() => toggle(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>
                      <button className="icon-btn" title="Eliminar" onClick={() => eliminar(p)}><Trash2 size={14} color="var(--red)" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar promoción' : 'Nueva promoción'} subtitle="Define la regla y los productos participantes" size="xl"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar promoción'}</button></>}
      >
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Nombre <span className="req">*</span></label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. 2x1 en KEKITO" /></div>
            <div className="field"><label>Tipo</label><select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>{TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          </div>
          <div className="field"><label>Descripción</label><input className="input" value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></div>
          <div className="field">
            <label>Imágenes de la promoción (máximo 2)</label>
            <input type="file" accept="image/*" multiple className="input" onChange={seleccionarImagenes} disabled={(form.imagenes || []).length + imagenesPendientes.length >= 2} />
            <div className="inline mt-8" style={{ gap: 8, flexWrap: 'wrap' }}>
              {[...(form.imagenes || []), ...imagenesPendientes].map((url, i) => (
                <span key={i} style={{ position: 'relative' }}>
                  <img src={url} alt={`Promoción ${i + 1}`} style={{ width: 70, height: 55, objectFit: 'cover', borderRadius: 7, border: '1px solid var(--line)' }} />
                  <button type="button" className="chip-del" title="Quitar imagen" onClick={() => {
                    if (i < (form.imagenes || []).length) setForm({ ...form, imagenes: form.imagenes.filter((_, j) => j !== i) });
                    else setImagenesPendientes((prev) => prev.filter((_, j) => j !== i - (form.imagenes || []).length));
                  }}><X size={11} /></button>
                </span>
              ))}
            </div>
            <span className="hint">Se usan para generar el catálogo de promociones.</span>
          </div>
          <div className="field-row">
            <div className="field"><label>Desde</label><input type="date" className="input" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} /></div>
            <div className="field"><label>Hasta</label><input type="date" className="input" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} /></div>
            <div className="field"><label>Prioridad</label><input type="number" className="input" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Productos participantes</label>
              <select multiple className="select" style={{ minHeight: 90 }} value={form.productos_ids.map(String)} onChange={(e) => setForm({ ...form, productos_ids: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
                {catalogos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
              <span className="hint">Ctrl+clic para varios productos. Vacío = aplica por categoría o a todo.</span>
            </div>
            <div className="field"><label>Categorías participantes</label>
              <select multiple className="select" style={{ minHeight: 90 }} value={form.categorias} onChange={(e) => setForm({ ...form, categorias: [...e.target.selectedOptions].map((o) => o.value) })}>
                {catalogos.categorias.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="field"><label>Categorías de clientes</label>
              <select multiple className="select" style={{ minHeight: 90 }} value={form.categorias_clientes.map(String)} onChange={(e) => setForm({ ...form, categorias_clientes: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
                {catalogos.categoriasClientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <span className="hint">Vacío = aplica a todos los clientes. Mayoristas y tiendas pueden tener promociones distintas.</span>
            </div>
          </div>

          {form.tipo === 'volumen' && (
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head"><h3>Escalas de descuento</h3><button className="btn btn-soft btn-sm" onClick={() => setForm({ ...form, reglas: [...form.reglas, { min: '', max: '', descuento_porcentaje: '', descuento_fijo: '' }] })}><Plus size={12} /> Agregar escala</button></div>
              {form.reglas.map((r, i) => (
                <div className="field-row" key={i}>
                  <div className="field"><label>Desde</label><input type="number" className="input" value={r.min} onChange={(e) => { const x = [...form.reglas]; x[i] = { ...x[i], min: e.target.value }; setForm({ ...form, reglas: x }); }} /></div>
                  <div className="field"><label>Hasta (0 = sin límite)</label><input type="number" className="input" value={r.max} onChange={(e) => { const x = [...form.reglas]; x[i] = { ...x[i], max: e.target.value }; setForm({ ...form, reglas: x }); }} /></div>
                  <div className="field"><label>Descuento %</label><input type="number" className="input" value={r.descuento_porcentaje} onChange={(e) => { const x = [...form.reglas]; x[i] = { ...x[i], descuento_porcentaje: e.target.value }; setForm({ ...form, reglas: x }); }} /></div>
                  <div className="field"><label>Descuento fijo Bs</label><input type="number" className="input" value={r.descuento_fijo} onChange={(e) => { const x = [...form.reglas]; x[i] = { ...x[i], descuento_fijo: e.target.value }; setForm({ ...form, reglas: x }); }} /></div>
                  <button className="icon-btn" onClick={() => setForm({ ...form, reglas: form.reglas.filter((_, j) => j !== i) })}><X size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {form.tipo === '2x1' && (
            <div className="field-row">
              <div className="field"><label>Paga</label><input type="number" min="1" className="input" value={form.dos_por_uno.paga} onChange={(e) => setForm({ ...form, dos_por_uno: { ...form.dos_por_uno, paga: e.target.value } })} /></div>
              <div className="field"><label>Gratis</label><input type="number" min="1" className="input" value={form.dos_por_uno.gratis} onChange={(e) => setForm({ ...form, dos_por_uno: { ...form.dos_por_uno, gratis: e.target.value } })} /></div>
            </div>
          )}

          {form.tipo === 'bonificacion' && (
            <div className="field-row">
              <div className="field"><label>Cada cuántas unidades</label><input type="number" min="1" className="input" value={form.bonificacion.requiere_cantidad} onChange={(e) => setForm({ ...form, bonificacion: { ...form.bonificacion, requiere_cantidad: e.target.value } })} /></div>
              <div className="field"><label>Producto bonificado</label><select className="select" value={form.bonificacion.producto_id} onChange={(e) => setForm({ ...form, bonificacion: { ...form.bonificacion, producto_id: e.target.value } })}><option value="">Seleccionar…</option>{catalogos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
              <div className="field"><label>Cantidad a bonificar</label><input type="number" min="1" className="input" value={form.bonificacion.cantidad} onChange={(e) => setForm({ ...form, bonificacion: { ...form.bonificacion, cantidad: e.target.value } })} /></div>
            </div>
          )}

          {form.tipo === 'mixto' && (
            <div className="panel" style={{ boxShadow: 'none' }}>
              <div className="panel-head"><h3>Combina productos</h3><button className="btn btn-soft btn-sm" onClick={() => setForm({ ...form, mixto: { ...form.mixto, items: [...form.mixto.items, { producto_id: '', cantidad: 1 }] } })}><Plus size={12} /> Agregar producto</button></div>
              {form.mixto.items.map((it, i) => (
                <div className="field-row" key={i}>
                  <div className="field"><label>Producto</label><select className="select" value={it.producto_id} onChange={(e) => { const x = [...form.mixto.items]; x[i] = { ...x[i], producto_id: e.target.value }; setForm({ ...form, mixto: { ...form.mixto, items: x } }); }}><option value="">Seleccionar…</option>{catalogos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                  <div className="field"><label>Cantidad requerida</label><input type="number" min="1" className="input" value={it.cantidad} onChange={(e) => { const x = [...form.mixto.items]; x[i] = { ...x[i], cantidad: e.target.value }; setForm({ ...form, mixto: { ...form.mixto, items: x } }); }} /></div>
                  <button className="icon-btn" onClick={() => setForm({ ...form, mixto: { ...form.mixto, items: form.mixto.items.filter((_, j) => j !== i) } })}><X size={14} /></button>
                </div>
              ))}
              <div className="field-row">
                <div className="field"><label>Descuento %</label><input type="number" className="input" value={form.mixto.descuento_porcentaje} onChange={(e) => setForm({ ...form, mixto: { ...form.mixto, descuento_porcentaje: e.target.value } })} /></div>
                <div className="field"><label>Producto bonificado (opcional)</label><select className="select" value={form.mixto.bonificacion_producto_id} onChange={(e) => setForm({ ...form, mixto: { ...form.mixto, bonificacion_producto_id: e.target.value } })}><option value="">Ninguno</option>{catalogos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div className="field"><label>Cantidad bonificada</label><input type="number" className="input" value={form.mixto.bonificacion_cantidad} onChange={(e) => setForm({ ...form, mixto: { ...form.mixto, bonificacion_cantidad: e.target.value } })} /></div>
              </div>
            </div>
          )}

          <label className="check"><input type="checkbox" checked={form.activa} onChange={(e) => setForm({ ...form, activa: e.target.checked })} /> Promoción activa</label>
          <div className="notice notice-info"><CalendarDays size={14} /> El sistema revalida stock de productos y bonificaciones antes de confirmar cada venta, por lo que nunca se generan negativos.</div>
        </div>
      </Modal>
    </>
  );
}
