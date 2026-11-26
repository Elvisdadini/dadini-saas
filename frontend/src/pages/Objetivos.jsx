import { useCallback, useEffect, useState } from 'react';
import { Pencil, Plus, RefreshCcw, Target, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, Modal, Money, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const hoy = () => new Date().toISOString().slice(0, 7);
const VACIO = { mes: hoy(), vendedor_id: '', ruta_venta: '', tipo: 'monto', producto_id: '', meta_monto: '', meta_unidades: '', dias_laborables: 22, notas: '' };

export default function Objetivos() {
  const toast = useToast();
  const { user } = useAuth();
  const puedeGestionar = ['admin', 'dueno', 'supervisor'].includes(user?.rol);
  const [data, setData] = useState(null);
  const [vendedores, setVendedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [busy, setBusy] = useState(false);
  const [avance, setAvance] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [o, p] = await Promise.all([
        api.get('/objetivos'),
        puedeGestionar ? api.get('/productos') : Promise.resolve({ productos: [] }),
      ]);
      setData(o);
      setProductos(p.productos || []);
      if (puedeGestionar) {
        const u = await api.get('/usuarios');
        setVendedores((u.usuarios || []).filter((x) => ['ventas', 'preventista', 'vendedor_camion'].includes(x.rol)));
      }
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast, puedeGestionar]);

  useEffect(() => { cargar(); }, [cargar]);

  const consultarAvance = async (vendedorId) => {
    if (!vendedorId) return;
    try { setAvance(await api.get(`/objetivos/avance?vendedor_id=${vendedorId}`)); } catch (error) { toast(error.message, 'error'); }
  };

  const abrir = (obj = null) => {
    setEditando(obj);
    setForm(obj ? { ...VACIO, ...obj } : VACIO);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.mes) return toast('Selecciona el mes.', 'error');
    setBusy(true);
    try {
      const payload = {
        ...form,
        vendedor_id: form.vendedor_id ? Number(form.vendedor_id) : null,
        producto_id: form.producto_id ? Number(form.producto_id) : null,
        meta_monto: Number(form.meta_monto) || 0,
        meta_unidades: Number(form.meta_unidades) || 0,
        dias_laborables: Number(form.dias_laborables) || 22,
      };
      if (editando) await api.put(`/objetivos/${editando.id}`, payload);
      else await api.post('/objetivos', payload);
      toast(editando ? 'Objetivo actualizado' : 'Objetivo mensual creado');
      setModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Ventas / Planeación"
        title={puedeGestionar ? 'Generar objetivos mensuales' : 'Mis objetivos'}
        subtitle={puedeGestionar
          ? 'Define metas por monto, producto o volumen. Administración y supervisor las ajustan en tiempo real.'
          : 'Solo la meta asignada a ti y tu avance. Administración y supervisor la ajustan.'}
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          {puedeGestionar && <button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Nuevo objetivo</button>}
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Objetivos" value={data?.total || 0} icon={Target} tone="purple" hint="Definidos" />
        <StatCard label="Vendedores con meta" value={(data?.objetivos || []).filter((o) => o.vendedor_id).length} icon={Users} tone="blue" hint="Asignados" />
        <StatCard label="Meta total del mes" value={<Money value={(data?.objetivos || []).reduce((s, o) => s + o.meta_monto, 0)} />} icon={Target} tone="orange" hint="Suma de planes" />
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Metas configuradas</h3><p>Se reflejan en el informe de avance de ruta</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.objetivos || []).length ? (
          <EmptyState icon={Target} title="Sin objetivos" message={puedeGestionar ? 'Crea la primera meta mensual.' : 'Aún no tienes una meta asignada para este mes.'} />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Mes</th><th>Vendedor / Ruta</th><th>Tipo</th><th>Meta</th><th>Días laborables</th><th>Meta diaria</th><th /></tr></thead>
              <tbody>
                {data.objetivos.map((o) => (
                  <tr key={o.id}>
                    <td className="cell-strong">{o.mes}</td>
                    <td>{o.vendedor_nombre}<span className="cell-sub">{o.ruta_venta || 'todas'}</span></td>
                    <td><Badge tone="purple">{o.tipo}</Badge>{o.tipo !== 'monto' && <span className="cell-sub">{o.producto_nombre}</span>}</td>
                    <td className="cell-strong">{o.tipo === 'monto' ? <Money value={o.meta_monto} /> : `${o.meta_unidades} uds.`}</td>
                    <td className="num">{o.dias_laborables}</td>
                    <td className="num"><Money value={o.dias_laborables ? o.meta_monto / o.dias_laborables : 0} /></td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" onClick={() => consultarAvance(o.vendedor_id || user?.id)}>Ver avance</button>
                      {puedeGestionar && <button className="icon-btn" onClick={() => abrir(o)}><Pencil size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {avance?.avance && (
        <div className="panel section-gap">
          <div className="panel-head"><div><h3>Avance en tiempo real</h3><p>{avance.objetivo?.vendedor_nombre} · {avance.objetivo?.mes}</p></div><Badge tone={avance.avance.progreso >= 100 ? 'green' : 'orange'}>{avance.avance.progreso}%</Badge></div>
          <div className="grid grid-4" style={{ gap: 10, padding: 14 }}>
            <div className="mini-stat"><span>Meta mensual</span><strong><Money value={avance.avance.meta} /></strong></div>
            <div className="mini-stat"><span>Vendido en el mes</span><strong><Money value={avance.avance.ventas_mes} /></strong></div>
            <div className="mini-stat"><span>Vendido hoy</span><strong><Money value={avance.avance.ventas_hoy} /></strong></div>
            <div className="mini-stat"><span>Falta diaria</span><strong className="text-orange"><Money value={avance.avance.falta_diaria} /></strong></div>
            <div className="mini-stat"><span>Clientes hoy</span><strong>{avance.avance.clientes_dia}</strong></div>
            <div className="mini-stat"><span>Sin pedido hoy</span><strong>{avance.avance.sin_pedido_hoy}</strong></div>
            <div className="mini-stat"><span>Monto por cliente</span><strong><Money value={avance.avance.monto_por_cliente} /></strong></div>
            <div className="mini-stat"><span>Pedidos mes</span><strong>{avance.avance.pedidos_mes}</strong></div>
          </div>
          {(avance.objetivos || []).length > 1 && (
            <div className="notice notice-info mb-8"><Target size={14} /> Objetivos combinados: {(avance.objetivos || []).map((o) => `${o.tipo}${o.producto_nombre !== '—' ? ` (${o.producto_nombre})` : ''}`).join(' + ')}</div>
          )}
          {(avance.avance.productos || []).length > 0 && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Producto</th><th>Tipo</th><th className="num">Meta uds.</th><th className="num">Vendido</th><th className="num">Progreso</th></tr></thead>
                <tbody>
                  {avance.avance.productos.map((p) => (
                    <tr key={p.objetivo_id}><td className="cell-strong">{p.producto_nombre}</td><td><Badge tone="purple">{p.tipo}</Badge></td><td className="num">{p.meta_unidades}</td><td className="num">{p.vendido}</td><td className="num">{p.progreso}%</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editando ? 'Editar objetivo' : 'Nuevo objetivo mensual'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Guardar objetivo'}</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Mes</label><input type="month" className="input" value={form.mes} onChange={(e) => setForm({ ...form, mes: e.target.value })} /></div>
            <div className="field"><label>Vendedor</label><select className="select" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })}><option value="">Todos</option>{vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Ruta</label><select className="select" value={form.ruta_venta} onChange={(e) => setForm({ ...form, ruta_venta: e.target.value })}><option value="">Todas</option><option value="R1">R1</option><option value="R2">R2</option></select></div>
            <div className="field"><label>Tipo de objetivo</label><select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="monto">Monto general</option><option value="producto">Producto específico</option><option value="volumen">Volumen de producto</option></select></div>
          </div>
          {(form.tipo === 'producto' || form.tipo === 'volumen') && (
            <div className="field"><label>Producto</label><select className="select" value={form.producto_id} onChange={(e) => setForm({ ...form, producto_id: e.target.value })}><option value="">Seleccionar…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
          )}
          <div className="field-row">
            <div className="field"><label>Meta monetaria (Bs)</label><input type="number" className="input" value={form.meta_monto} onChange={(e) => setForm({ ...form, meta_monto: e.target.value })} /></div>
            <div className="field"><label>Meta en unidades</label><input type="number" className="input" value={form.meta_unidades} onChange={(e) => setForm({ ...form, meta_unidades: e.target.value })} /></div>
          </div>
          <div className="field"><label>Días laborables del mes</label><input type="number" className="input" value={form.dias_laborables} onChange={(e) => setForm({ ...form, dias_laborables: e.target.value })} /></div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
          <div className="notice notice-info"><Target size={14} /> Con estos datos el sistema calcula la meta diaria, cuánto debe vender cada cliente pendiente y el avance en tiempo real en el mapa de ruta.</div>
        </div>
      </Modal>
    </>
  );
}
