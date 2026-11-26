import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowRight, BadgeDollarSign, Boxes, CheckCircle2, CircleDollarSign, Clock3,
  Package, Plus, ShoppingCart, Truck, Wallet, RefreshCcw, Users,
} from 'lucide-react';
import { api } from '../api';
import { puede, useAuth } from '../auth';
import { AreaChart, Donut } from '../charts';
import { Estado, Fecha, Money, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const PERIODOS = [
  { value: '7d', label: 'Últimos 7 días' },
  { value: '30d', label: 'Últimos 30 días' },
  { value: '90d', label: 'Últimos 90 días' },
];

const CANAL_LABEL = { mostrador: 'Mostrador', delivery: 'Delivery', ruta: 'Ruta', whatsapp: 'WhatsApp' };

export default function Dashboard() {
  const { user, empresa } = useAuth();
  const veFinanzas = puede(user, 'finanzas.ver_margenes');
  const navigate = useNavigate();
  const toast = useToast();
  const [periodo, setPeriodo] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = async (silencioso = false) => {
    if (silencioso) setRefreshing(true); else setLoading(true);
    try {
      setData(await api.get(`/dashboard?periodo=${periodo}`));
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [periodo]);

  const trendHoy = useMemo(() => {
    if (!data) return 0;
    const ayer = data.kpis.ventas_ayer || 0;
    if (!ayer) return data.kpis.ventas_hoy > 0 ? 100 : 0;
    return ((data.kpis.ventas_hoy - ayer) / ayer) * 100;
  }, [data]);

  const canales = useMemo(() => (data?.por_canal || []).map((c) => ({ label: CANAL_LABEL[c.canal] || c.canal, value: c.total })), [data]);
  const fechaHoy = new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Panel general" title={`Hola, ${user?.nombre?.split(' ')[0] || 'equipo'} 👋`} subtitle="Cargando el resumen de tu operación…" />
        <div className="stat-grid">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="card card-pad" style={{ height: 118 }}><SkeletonRows rows={3} /></div>)}</div>
        <div className="panel"><SkeletonRows rows={7} /></div>
      </>
    );
  }
  if (!data) return null;

  const k = data.kpis;

  return (
    <>
      <PageHeader
        eyebrow="Panel general"
        title={`Hola, ${user?.nombre?.split(' ')[0]} 👋`}
        subtitle={`${fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1)} · ${empresa?.nombre || 'DADINI'}, ${empresa?.ciudad || 'Cochabamba'}`}
        actions={(
          <>
            <select className="select" style={{ width: 170 }} value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
              {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <button className="btn btn-outline" onClick={() => cargar(true)} disabled={refreshing}>
              <RefreshCcw size={14} className={refreshing ? 'spin' : ''} /> Actualizar
            </button>
            {puede(user, 'venta_nueva') && (
              <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}><Plus size={15} /> Nueva venta</button>
            )}
          </>
        )}
      />

      <div className="stat-grid">
        <StatCard label="Ventas de hoy" value={<Money value={k.ventas_hoy} />} hint={`${k.pedidos_hoy} pedidos registrados`} icon={ShoppingCart} tone="orange" trend={trendHoy} onClick={() => navigate('/ventas')} />
        <StatCard label="Por cobrar" value={<Money value={k.por_cobrar} />} hint={`${k.cobranzas_vencidas} facturas vencidas`} icon={Wallet} tone="red" onClick={() => navigate('/cobranzas')} />
        <StatCard label="Pedidos pendientes" value={k.pedidos_pendientes} hint="Por preparar y despachar" icon={Clock3} tone="blue" onClick={() => navigate('/ventas')} />
        <StatCard label="Entregas en ruta" value={k.en_ruta} hint={`${data.rutas.filter((r) => r.estado === 'en_camino').length} rutas activas hoy`} icon={Truck} tone="purple" onClick={() => navigate('/distribucion')} />
        <StatCard label="Stock bajo" value={k.stock_bajo} hint="Productos por reponer" icon={Package} tone="amber" onClick={() => navigate('/inventario')} />
      </div>

      <div className="dash-grid">
        <div className="panel">
          <div className="chart-card-head">
            <div>
              <h3>Evolución de ventas</h3>
              <p>Comparativo contra el período anterior</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span className="small muted">Ventas del período</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <strong style={{ fontSize: 22, letterSpacing: '-0.03em' }}><Money value={k.ventas_periodo} /></strong>
                <span className={`trend ${k.variacion_periodo >= 0 ? 'up' : 'down'}`}>{k.variacion_periodo >= 0 ? '▲' : '▼'} {Math.abs(k.variacion_periodo).toFixed(1)}%</span>
              </div>
            </div>
          </div>
          <AreaChart data={data.serie} height={300} />
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Ventas por canal</h3><p>{periodo === '7d' ? 'Últimos 7 días' : periodo === '90d' ? 'Últimos 90 días' : 'Últimos 30 días'}</p></div></div>
          <div className="panel-body">
            <Donut items={canales} centerLabel="Ventas" centerValue={`${(k.ventas_periodo / 1000).toFixed(1)}k`} />
            <div className="divider" />
            <div className="inline" style={{ justifyContent: 'space-between' }}>
              <span className="small muted">Ticket promedio</span>
              <strong style={{ fontSize: 14 }}><Money value={k.ticket_promedio} /></strong>
            </div>
            {veFinanzas && <div className="inline" style={{ justifyContent: 'space-between', marginTop: 7 }}>
              <span className="small muted">Margen bruto período</span>
              <strong style={{ fontSize: 14, color: 'var(--green)' }}><Money value={k.margen_periodo} /></strong>
            </div>}
            <div className="inline" style={{ justifyContent: 'space-between', marginTop: 7 }}>
              <span className="small muted">Clientes activos</span>
              <strong style={{ fontSize: 14 }}>{k.clientes_activos}</strong>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid section-gap">
        <div className="panel">
          <div className="panel-head">
            <div><h3>Últimos pedidos</h3><p>Actividad reciente de ventas</p></div>
            <button className="link-btn" onClick={() => navigate('/ventas')}>Ver todos <ArrowRight size={12} style={{ verticalAlign: -1 }} /></button>
          </div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th className="num">Total</th><th>Estado</th><th>Pago</th></tr></thead>
              <tbody>
                {data.recientes.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/ventas/${p.id}`)}>
                    <td className="cell-strong">{p.codigo}<span className="cell-sub">{CANAL_LABEL[p.canal]}</span></td>
                    <td>{p.cliente_nombre}<span className="cell-sub">{p.cliente_zona}</span></td>
                    <td className="nowrap"><Fecha value={p.created_at} short /></td>
                    <td className="num cell-strong"><Money value={p.total} /></td>
                    <td><Estado valor={p.estado} /></td>
                    <td><Estado valor={p.estado_pago} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid" style={{ gap: 16 }}>
          <div className="panel">
            <div className="panel-head"><div><h3>Alertas operativas</h3><p>Lo que requiere tu atención</p></div><span className="badge badge-amber">{data.alertas.length}</span></div>
            <div className="panel-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {data.alertas.length === 0 && <p className="small muted">Sin alertas. Todo está bajo control.</p>}
              {data.alertas.map((a, i) => (
                <div className="alert-item" key={i}>
                  <span className={`alert-icon ${a.tipo}`}>{a.tipo === 'stock' ? <Package size={15} /> : a.tipo === 'cobranza' ? <Wallet size={15} /> : <Clock3 size={15} />}</span>
                  <div><strong>{a.titulo}</strong><p>{a.detalle}</p></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Rutas de hoy</h3><p>Seguimiento de entregas</p></div><button className="link-btn" onClick={() => navigate('/distribucion')}>Gestionar</button></div>
            <div className="panel-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
              {data.rutas.length === 0 && <p className="small muted">Aún no hay rutas programadas para hoy.</p>}
              {data.rutas.map((r) => (
                <div className="route-mini" key={r.id} onClick={() => navigate(`/distribucion/${r.id}`)} style={{ cursor: 'pointer' }}>
                  <span style={{ fontSize: 22 }}>{r.emoji}</span>
                  <div className="rm-copy">
                    <strong>{r.codigo} · {r.repartidor}</strong>
                    <span>{r.entregadas}/{r.total_paradas} entregas · {r.estado === 'en_camino' ? 'En camino' : r.estado}</span>
                  </div>
                  <div className="progress"><span className={`progress-fill ${r.progreso === 100 ? 'progress-green' : ''}`} style={{ width: `${r.progreso}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><h3>Acciones rápidas</h3></div>
            <div className="panel-body">
              <div className="quick-actions">
                {puede(user, 'venta_nueva') && <button className="quick-action" onClick={() => navigate('/ventas/nueva')}><span className="qa-icon stat-orange"><ShoppingCart size={15} /></span> Nueva venta</button>}
                {puede(user, 'cobranzas') && <button className="quick-action" onClick={() => navigate('/cobranzas')}><span className="qa-icon stat-green"><CircleDollarSign size={15} /></span> Registrar cobro</button>}
                {puede(user, 'distribucion') && <button className="quick-action" onClick={() => navigate('/distribucion')}><span className="qa-icon stat-purple"><Truck size={15} /></span> Planificar ruta</button>}
                {puede(user, 'inventario') && <button className="quick-action" onClick={() => navigate('/inventario')}><span className="qa-icon stat-blue"><Boxes size={15} /></span> Reponer stock</button>}
                {puede(user, 'administracion') && <button className="quick-action" onClick={() => navigate('/reportes')}><span className="qa-icon stat-navy"><BadgeDollarSign size={15} /></span> Ver reportes</button>}
                {puede(user, 'administracion') && <button className="quick-action" onClick={() => navigate('/administracion')}><span className="qa-icon stat-amber"><Users size={15} /></span> Gestionar equipo</button>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid section-gap">
        <div className="panel">
          <div className="panel-head"><div><h3>Productos más vendidos</h3><p>Top 5 del período seleccionado</p></div><button className="link-btn" onClick={() => navigate('/inventario')}>Inventario</button></div>
          <div className="panel-body" style={{ paddingTop: 8 }}>
            {data.top_productos.map((p, i) => (
              <div className="top-product" key={p.producto_id}>
                <span className="product-thumb">{p.emoji || '📦'}</span>
                <div className="tp-name"><strong>{p.nombre}</strong><span>{p.cantidad} unidades vendidas</span></div>
                <div className="tp-value"><Money value={p.total} /></div>
                <span className="badge badge-gray">#{i + 1}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head"><div><h3>Estado de la operación</h3><p>Indicadores del período</p></div></div>
          <div className="panel-body">
            <div className="mini-kpis dos-columnas">
              <div className="mini-stat"><span>Ventas período</span><strong><Money value={k.ventas_periodo} /></strong></div>
              <div className="mini-stat"><span>Ticket promedio</span><strong><Money value={k.ticket_promedio} /></strong></div>
              <div className="mini-stat"><span>Monto vencido</span><strong style={{ color: 'var(--red)' }}><Money value={k.monto_vencido} /></strong></div>
              {veFinanzas && <div className="mini-stat"><span>Margen bruto</span><strong style={{ color: 'var(--green)' }}><Money value={k.margen_periodo} /></strong></div>}
            </div>
            <div className="notice notice-info mt-16"><CheckCircle2 size={15} /> La operación se actualiza en tiempo real. Los indicadores se recalculan con cada venta, pago o movimiento de inventario.</div>
            <div className="notice notice-warn mt-8"><AlertTriangle size={15} /> Recuerda conciliar las cobranzas antes del cierre diario.</div>
          </div>
        </div>
      </div>
    </>
  );
}
