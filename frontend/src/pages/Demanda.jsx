import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarClock, ClipboardList, PackagePlus, RefreshCcw, ShieldCheck, ShoppingCart, TrendingUp, Wallet } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Fecha, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const TONES = { critica: 'red', alta: 'orange', media: 'amber', baja: 'green' };
const LABELS = { critica: 'Quiebra inminente', alta: 'Riesgo alto', media: 'Vigilar', baja: 'Cubierto' };

export default function Demanda() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [config, setConfig] = useState({ dias_historial: 30, lead_time_dias: 7, stock_seguridad_dias: 3 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [soloRiesgo, setSoloRiesgo] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([api.get(`/demanda/sugerencias${soloRiesgo ? '?solo_urgentes=true' : ''}`), api.get('/configuracion')]);
      setData(d);
      setConfig({
        dias_historial: c.configuracion?.reposicion?.dias_historial || 30,
        lead_time_dias: c.configuracion?.reposicion?.lead_time_dias || 7,
        stock_seguridad_dias: c.configuracion?.reposicion?.stock_seguridad_dias || 3,
      });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [soloRiesgo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarConfig = async () => {
    setBusy(true);
    try {
      await api.put('/configuracion', { reposicion: config });
      toast('Parámetros de reposición guardados');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const generarSolicitud = async () => {
    const items = (data?.sugerencias || []).filter((s) => s.sugerido > 0)
      .map((s) => ({ producto_id: s.producto_id, cantidad: s.sugerido, precio_estimado: s.precio_estimado, proveedor_id: s.proveedor_id }));
    if (!items.length) return toast('No hay productos para reponer.', 'error');
    setBusy(true);
    try {
      const r = await api.post('/solicitudes-compra', {
        almacen_id: 1,
        proveedor_id: items.find((i) => i.proveedor_id)?.proveedor_id || null,
        notas: 'Generada desde predicción de demanda',
        items,
      });
      toast(`Solicitud ${r.solicitud?.codigo || ''} creada con ${items.length} producto(s)`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader eyebrow="Compras / Predicción" title="Demanda y reposición"
        subtitle="Sugerencias calculadas con el historial real de ventas, stock vendible y lead time."
        actions={<>
          <button className={`chip ${soloRiesgo ? 'active' : ''}`} onClick={() => setSoloRiesgo(!soloRiesgo)}><AlertTriangle size={12} /> Solo riesgo</button>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={generarSolicitud} disabled={busy || !(data?.sugerencias || []).some((s) => s.sugerido > 0)}><ShoppingCart size={14} /> Generar solicitud</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Productos analizados" value={resumen.productos || 0} icon={ClipboardList} tone="blue" hint={`Últimos ${resumen.dias_historial || 30} días`} />
        <StatCard label="Quiebras inminentes" value={resumen.quiebras || 0} icon={AlertTriangle} tone="red" hint="Stock vendible en cero" />
        <StatCard label="Riesgo alto" value={resumen.riesgo_alto || 0} icon={TrendingUp} tone="orange" hint="Cobertura menor al lead time" />
        <StatCard label="Inversión sugerida" value={<Money value={resumen.inversion_estimada} />} icon={Wallet} tone="green" hint={<><Num value={resumen.sugerido_total} /> unidades</>} />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Parámetros de reposición</h3><p>Se usan para calcular el punto de reorden</p></div><ShieldCheck size={15} /></div>
        <div className="panel-body">
          <div className="filters">
            <div className="field"><label>Días de historial</label><input className="input" type="number" min="7" max="180" value={config.dias_historial} onChange={(e) => setConfig({ ...config, dias_historial: Number(e.target.value) })} /></div>
            <div className="field"><label>Lead time (días)</label><input className="input" type="number" min="1" max="60" value={config.lead_time_dias} onChange={(e) => setConfig({ ...config, lead_time_dias: Number(e.target.value) })} /></div>
            <div className="field"><label>Stock de seguridad (días)</label><input className="input" type="number" min="0" max="30" value={config.stock_seguridad_dias} onChange={(e) => setConfig({ ...config, stock_seguridad_dias: Number(e.target.value) })} /></div>
            <button className="btn btn-outline" onClick={guardarConfig} disabled={busy}>Guardar parámetros</button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Sugerencias de compra</h3><p>Demanda diaria = unidades vendidas / días analizados · cobertura = stock vendible / demanda</p></div><Badge tone="orange">{(data?.sugerencias || []).length} productos</Badge></div>
        {loading && !data ? <div className="panel-body"><SkeletonRows rows={6} /></div> : !(data?.sugerencias || []).length ? <EmptyState icon={PackagePlus} title="Sin sugerencias" message="No hay ventas históricas o todos los productos están cubiertos." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th>Urgencia</th><th className="num">Demanda/día</th><th className="num">Stock vendible</th><th className="num">Cobertura</th><th>Quiebre estimado</th><th className="num">Pedir</th><th>Proveedor</th></tr></thead>
              <tbody>
                {data.sugerencias.map((s) => (
                  <tr key={s.producto_id}>
                    <td className="cell-strong">{s.nombre}<span className="cell-sub">{s.sku} · {s.categoria}</span></td>
                    <td><Badge tone={TONES[s.urgencia] || 'gray'}>{LABELS[s.urgencia] || s.urgencia}</Badge></td>
                    <td className="num">{s.demanda_diaria}<span className="cell-sub">{s.demanda_total} en {s.dias_analizados}d</span></td>
                    <td className="num">{s.vendible}<span className="cell-sub">{s.vencido > 0 ? `${s.vencido} vencido(s)` : `mín. ${s.stock_minimo}`}</span></td>
                    <td className="num">{s.dias_cobertura === null ? '—' : `${s.dias_cobertura} d`}<span className="cell-sub">lead {s.lead_time_dias} d</span></td>
                    <td>{s.quiebre_en ? <Fecha value={s.quiebre_en} short /> : '—'}</td>
                    <td className="num"><strong>{s.sugerido}</strong> {s.unidad}<span className="cell-sub">Punto de reorden {s.punto_reorden}</span></td>
                    <td>{s.proveedor_nombre || '—'}<span className="cell-sub">{s.precio_estimado ? <Money value={s.precio_estimado} /> : ''}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
