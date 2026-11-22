import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCcw, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { api, downloadCSV } from '../api';
import { AreaChart, Bars, Donut } from '../charts';
import { Badge, Money, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const hoy = () => new Date().toISOString().slice(0, 10);
const hace30 = () => new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10);

export default function Rentabilidad() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filtros, setFiltros] = useState({ desde: hace30(), hasta: hoy(), agrupacion: 'dia' });
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams(filtros).toString();
      setData(await api.get(`/rentabilidad?${q}`));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [filtros, toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const exportar = async () => {
    try {
      const q = new URLSearchParams(filtros).toString();
      await downloadCSV(`/rentabilidad/export?${q}`, `rentabilidad-${filtros.desde}-${filtros.hasta}.csv`);
      toast('Reporte de rentabilidad exportado');
    } catch (error) { toast(error.message, 'error'); }
  };

  const k = data?.kpis || {};
  const serie = (data?.serie || []).map((f) => ({ fecha: f.clave, total: f.ventas, anterior: f.utilidad, pedidos: f.pedidos }));

  return (
    <>
      <PageHeader eyebrow="Reportes / Finanzas" title="Rentabilidad de la empresa" subtitle="Ventas, compras, gastos, utilidad neta y retorno en un dashboard interactivo."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={exportar}><Download size={14} /> Exportar CSV</button>
        </>} />
      <div className="filters mb-16">
        <input type="date" className="input input-sm" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
        <input type="date" className="input input-sm" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
        <select className="select" value={filtros.agrupacion} onChange={(e) => setFiltros({ ...filtros, agrupacion: e.target.value })}>
          <option value="dia">Por día</option><option value="semana">Por semana</option><option value="mes">Por mes</option>
        </select>
      </div>

      {loading || !data ? <SkeletonRows rows={8} /> : (
        <>
          <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <StatCard label="Ventas del período" value={<Money value={k.ventas} />} icon={TrendingUp} tone="blue" hint={`${k.pedidos} pedidos`} />
            <StatCard label="Margen bruto" value={<Money value={k.margen_bruto} />} icon={TrendingUp} tone="green" hint={`Costo Bs ${(k.costo_ventas || 0).toFixed(2)}`} />
            <StatCard label="Gastos" value={<Money value={k.gastos} />} icon={TrendingDown} tone="red" hint="Egresos del período" />
            <StatCard label="Utilidad neta" value={<Money value={k.utilidad_neta} />} icon={Wallet} tone="orange" hint={`Rentabilidad ${k.rentabilidad}%`} />
          </div>
          <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <div className="mini-stat"><span>Compras</span><strong>Bs {(k.compras || 0).toFixed(2)}</strong></div>
            <div className="mini-stat"><span>Pagos a proveedores</span><strong>Bs {(k.pagos_proveedor || 0).toFixed(2)}</strong></div>
            <div className="mini-stat"><span>Deuda proveedores</span><strong className="text-red">Bs {(k.deuda_proveedores || 0).toFixed(2)}</strong></div>
            <div className="mini-stat"><span>Ticket promedio</span><strong>Bs {(k.ticket_promedio || 0).toFixed(2)}</strong></div>
          </div>
          <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            <StatCard label="Capital en almacenes" value={<Money value={k.capital_almacenes} />} icon={Wallet} tone="blue" hint="Stock valorizado al costo" />
            <StatCard label="Capital en camiones" value={<Money value={k.capital_movil} />} icon={Wallet} tone="orange" hint="Almacenes móviles" />
            <StatCard label="Ganancia neta después de gastos" value={<Money value={k.ganancia_neta} />} icon={TrendingUp} tone={k.ganancia_neta >= 0 ? 'green' : 'red'} hint={`${k.rentabilidad}% sobre ventas · capital total Bs ${(k.capital_total || 0).toFixed(2)}`} />
          </div>

          <div className="grid grid-2 mb-16" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head"><div><h3>Evolución financiera</h3><p>Ventas vs utilidad por {filtros.agrupacion}</p></div></div>
              <div className="panel-body"><AreaChart data={serie} height={300} label="Ventas" /></div>
            </div>
            <div className="panel">
              <div className="panel-head"><div><h3>Gastos por categoría</h3><p>Distribución del egreso</p></div></div>
              <div className="panel-body">
                <Donut items={(data.por_categoria_gasto || []).map((c) => ({ label: c.categoria, value: c.total }))} centerLabel="Gastos" centerValue={`Bs ${(k.gastos || 0).toFixed(0)}`} />
                <div className="divider" />
                <Bars items={(data.por_proveedor || []).map((p) => ({ label: p.proveedor, value: p.total }))} formatter={(v) => `Bs ${Math.round(v)}`} />
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Detalle del período</h3><p>Serie {filtros.agrupacion} con ventas, costo, gastos, compras y utilidad</p></div><Badge tone="purple">{data.serie.length} filas</Badge></div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Período</th><th className="num">Ventas</th><th className="num">Costo</th><th className="num">Gastos</th><th className="num">Compras</th><th className="num">Utilidad</th><th className="num">Pedidos</th></tr></thead>
                <tbody>
                  {data.serie.map((f) => <tr key={f.clave}>
                    <td className="cell-strong">{f.clave}</td>
                    <td className="num">Bs {f.ventas.toFixed(2)}</td>
                    <td className="num">Bs {f.costo.toFixed(2)}</td>
                    <td className="num">Bs {f.gastos.toFixed(2)}</td>
                    <td className="num">Bs {f.compras.toFixed(2)}</td>
                    <td className={`num cell-strong ${f.utilidad >= 0 ? 'text-green' : 'text-red'}`}>Bs {f.utilidad.toFixed(2)}</td>
                    <td className="num">{f.pedidos}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}
