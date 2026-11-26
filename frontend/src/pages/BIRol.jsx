import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Award, BarChart3, CalendarCheck, ClipboardList, Clock3, Crown, Package, RefreshCcw,
  ShoppingCart, TrendingUp, Truck, Users, Wallet,
} from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { AreaChart, Bars, Donut } from '../charts';
import { Badge, EmptyState, Fecha, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const PERIODOS = [{ value: '7d', label: '7 días' }, { value: '30d', label: '30 días' }, { value: '90d', label: '90 días' }];
const CANAL = { mostrador: 'Mostrador', delivery: 'Delivery', ruta: 'Ruta', whatsapp: 'WhatsApp' };

function perfilDe(rol) {
  if (['admin', 'dueno'].includes(rol)) return 'dueno';
  if (rol === 'supervisor') return 'supervisor';
  if (rol === 'cobranzas') return 'cobrador';
  if (['ventas', 'preventista', 'vendedor_camion'].includes(rol)) return 'vendedor';
  return 'operacion';
}

const TITULO = {
  dueno: ['Tablero del dueño', 'Rentabilidad, capital y performance de toda la operación'],
  supervisor: ['Tablero del supervisor', 'Equipo, visitas, rutas y cumplimiento de objetivos'],
  vendedor: ['Mi tablero', 'Mis ventas, mi agenda y mis créditos'],
  cobrador: ['Tablero de cobranzas', 'Cartera vencida, cobros y caja del día'],
  operacion: ['Tablero operativo', 'Inventario y logística de la sucursal'],
};

function iso(date) { return date.toISOString().slice(0, 10); }

export default function BIRol() {
  const toast = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const perfil = perfilDe(user?.rol);
  const [periodo, setPeriodo] = useState('30d');
  const [data, setData] = useState(null);
  const [extra, setExtra] = useState(null);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const dias = periodo === '7d' ? 7 : periodo === '90d' ? 90 : 30;
      const rango = { desde: iso(new Date(Date.now() - (dias - 1) * 86400000)), hasta: iso(new Date()) };
      const principal = api.get(`/dashboard?periodo=${periodo}`);
      let complemento = Promise.resolve({});
      if (perfil === 'dueno') {
        complemento = Promise.all([
          api.get(`/reportes${qs(rango)}`),
          api.get(`/rentabilidad${qs({ ...rango, agrupacion: 'dia' })}`),
        ]).then(([reporte, rentabilidad]) => ({ reporte, rentabilidad }));
      } else if (perfil === 'supervisor') {
        complemento = Promise.all([
          api.get(`/reportes${qs(rango)}`), api.get('/visitas/resumen'),
          api.get(`/rutas${qs(rango)}`), api.get('/usuarios?rol=preventista'),
        ]).then(([reporte, visitas, rutas, usuarios]) => ({ reporte, visitas, rutas, usuarios }));
      } else if (perfil === 'vendedor') {
        complemento = Promise.all([
          api.get(`/visitas/agenda?dia=${new Date().getDay() || 7}`),
          api.get(`/pedidos${qs({ ...rango, vendedor_id: user.id })}`),
          api.get('/cobranzas'),
        ]).then(([agenda, pedidos, cobranzas]) => ({ agenda, pedidos, cobranzas }));
      } else if (perfil === 'cobrador') {
        complemento = Promise.all([
          api.get('/cobranzas'), api.get('/cobranzas/mis-cobros'),
          api.get('/caja/actual'), api.get(`/visitas${qs({ tipo: 'cobranza', usuario_id: user.id, ...rango })}`),
        ]).then(([cobranzas, misCobros, caja, visitas]) => ({ cobranzas, misCobros, caja, visitas }));
      }
      const [base, comp] = await Promise.all([principal, complemento]);
      setData(base);
      setExtra(comp);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [periodo, perfil, user.id, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const k = data?.kpis || {};
  const serie = useMemo(() => data?.serie || [], [data]);
  const canales = useMemo(() => (data?.por_canal || []).map((c) => ({ label: CANAL[c.canal] || c.canal, value: c.total })), [data]);
  const porDia = useMemo(() => (extra?.reporte?.por_dia || []).map((d) => ({ fecha: d.fecha, total: d.total, pedidos: d.pedidos, anterior: 0 })), [extra]);
  const rentSerie = useMemo(() => (extra?.rentabilidad?.serie || []).map((d) => ({ fecha: d.clave, total: d.ventas, pedidos: d.pedidos, anterior: 0 })), [extra]);

  if (loading && !data) return <><PageHeader eyebrow="Inteligencia" title="Cargando tablero…" /><div className="panel"><SkeletonRows rows={8} /></div></>;

  const stats = [];
  const panels = [];
  if (perfil === 'dueno') {
    const rent = extra?.rentabilidad?.kpis || {};
    stats.push(
      { label: 'Ventas del período', value: <Money value={k.ventas_periodo} />, icon: ShoppingCart, tone: 'orange', hint: `${k.pedidos_hoy || 0} pedidos hoy` },
      { label: 'Utilidad neta', value: <Money value={rent.utilidad_neta} />, icon: TrendingUp, tone: 'green', hint: `${Number(rent.rentabilidad || 0).toFixed(1)}% sobre ventas` },
      { label: 'Capital en inventario', value: <Money value={rent.capital_total} />, icon: Package, tone: 'blue' },
      { label: 'Por cobrar', value: <Money value={k.por_cobrar} />, icon: Wallet, tone: 'red', hint: `${k.cobranzas_vencidas || 0} vencidas` },
    );
    panels.push(
      { id: 'serie', title: 'Evolución de ventas', node: <AreaChart data={serie} height={300} /> },
      { id: 'rent', title: 'Ventas y utilidad', node: <AreaChart data={rentSerie} height={260} showPrevious={false} /> },
      { id: 'canales', title: 'Ventas por canal', node: <Donut items={canales} centerLabel="Ventas" centerValue={`${(Number(k.ventas_periodo || 0) / 1000).toFixed(1)}k`} /> },
      { id: 'vendedores', title: 'Ranking de vendedores', node: <Bars items={(extra?.reporte?.vendedores || []).map((v) => ({ label: v.vendedor, value: v.total }))} formatter={(v) => `Bs ${Math.round(v)}`} /> },
    );
  } else if (perfil === 'supervisor') {
    const vis = extra?.visitas?.por_tipo || [];
    const r = extra?.rutas?.resumen || {};
    stats.push(
      { label: 'Ventas del período', value: <Money value={k.ventas_periodo} />, icon: ShoppingCart, tone: 'orange', hint: `${k.variacion_periodo >= 0 ? '▲' : '▼'} ${Math.abs(Number(k.variacion_periodo || 0)).toFixed(1)}%` },
      { label: 'Pedidos por preparar', value: <Num value={k.pedidos_pendientes} />, icon: ClipboardList, tone: 'blue' },
      { label: 'Visitas hoy', value: <Num value={extra?.visitas?.hoy || 0} />, icon: CalendarCheck, tone: 'green', hint: `${extra?.visitas?.en_curso || 0} en curso` },
      { label: 'Rutas en camino', value: <Num value={r.en_camino || 0} />, icon: Truck, tone: 'purple', hint: `${r.total || 0} rutas en el período` },
    );
    panels.push(
      { id: 'serie', title: 'Evolución de ventas', node: <AreaChart data={serie} height={300} /> },
      { id: 'visitas', title: 'Visitas por tipo (hoy)', node: <Bars items={vis.map((v) => ({ label: v.tipo, value: v.hoy }))} /> },
      { id: 'equipo', title: 'Ventas por vendedor', node: <Bars items={(extra?.reporte?.vendedores || []).map((v) => ({ label: v.vendedor, value: v.total }))} formatter={(v) => `Bs ${Math.round(v)}`} /> },
    );
  } else if (perfil === 'vendedor') {
    const pedidos = extra?.pedidos?.pedidos || [];
    const misVentas = pedidos.reduce((s, p) => s + Number(p.total || 0), 0);
    const agenda = extra?.agenda?.resumen || {};
    stats.push(
      { label: 'Mis ventas', value: <Money value={misVentas} />, icon: ShoppingCart, tone: 'orange', hint: `${pedidos.length} pedidos` },
      { label: 'Visitas asignadas', value: <Num value={agenda.asignados || 0} />, icon: CalendarCheck, tone: 'blue', hint: `${agenda.visitados || 0} visitadas` },
      { label: 'Con pedido hoy', value: <Num value={agenda.con_pedido || 0} />, icon: CheckIcon, tone: 'green' },
      { label: 'Mis créditos', value: <Money value={extra?.cobranzas?.resumen?.total || 0} />, icon: Wallet, tone: 'red', hint: `${extra?.cobranzas?.resumen?.vencidas || 0} vencidas` },
    );
    const diarios = new Map();
    pedidos.forEach((p) => {
      const f = String(p.created_at || '').slice(0, 10);
      const fila = diarios.get(f) || { fecha: f, total: 0, pedidos: 0 };
      fila.total += Number(p.total || 0); fila.pedidos += 1;
      diarios.set(f, fila);
    });
    panels.push(
      { id: 'serie', title: 'Mis ventas por día', node: <AreaChart data={[...diarios.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((d) => ({ ...d, anterior: 0 }))} height={280} showPrevious={false} /> },
      { id: 'agenda', title: 'Agenda por día', node: <Bars items={(extra?.agenda?.por_dia || []).map((d) => ({ label: `Día ${d.dia}`, value: d.total }))} /> },
      { id: 'canales', title: 'Canales de la sucursal', node: <Donut items={canales} /> },
    );
  } else if (perfil === 'cobrador') {
    const cob = extra?.cobranzas?.resumen || {};
    const mis = extra?.misCobros?.resumen || {};
    const caja = extra?.caja?.caja || {};
    stats.push(
      { label: 'Cartera total', value: <Money value={cob.total} />, icon: Wallet, tone: 'orange', hint: `${cob.facturas || 0} facturas` },
      { label: 'Vencido', value: <Money value={cob.vencido} />, icon: Clock3, tone: 'red', hint: `${cob.vencidas || 0} vencidas` },
      { label: 'Cobrado', value: <Money value={mis.monto} />, icon: TrendingUp, tone: 'green', hint: `${mis.cobros || 0} cobros` },
      { label: 'Saldo esperado caja', value: <Money value={caja.saldo_esperado} />, icon: Wallet, tone: 'blue' },
    );
    panels.push(
      { id: 'buckets', title: 'Cartera por antigüedad', node: <Donut items={(extra?.cobranzas?.buckets || []).map((b) => ({ label: b.label, value: b.monto }))} /> },
      { id: 'deudores', title: 'Cliente con mayor deuda', node: <Bars items={(extra?.cobranzas?.clientes || []).slice(0, 8).map((c) => ({ label: c.nombre, value: c.monto_vencido }))} formatter={(v) => `Bs ${Math.round(v)}`} /> },
      { id: 'visitas', title: 'Visitas de cobranza', node: <Bars items={(visitasPorDia(extra?.visitas?.visitas || [])).map((d) => ({ label: d.fecha, value: d.total }))} /> },
    );
  } else {
    stats.push(
      { label: 'Stock bajo', value: <Num value={k.stock_bajo} />, icon: Package, tone: 'amber' },
      { label: 'Pedidos pendientes', value: <Num value={k.pedidos_pendientes} />, icon: ClipboardList, tone: 'blue' },
      { label: 'En ruta', value: <Num value={k.en_ruta} />, icon: Truck, tone: 'purple' },
      { label: 'Clientes activos', value: <Num value={k.clientes_activos} />, icon: Users, tone: 'green' },
    );
    panels.push({ id: 'serie', title: 'Evolución de ventas', node: <AreaChart data={serie} height={300} /> });
  }

  return (
    <>
      <PageHeader eyebrow="Inteligencia de negocio / Por rol" title={TITULO[perfil][0]} subtitle={TITULO[perfil][1]}
        actions={<>
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={() => navigate('/')}><BarChart3 size={14} /> Panel general</button>
        </>}
      />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        {stats.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-2" style={{ gap: 16 }}>
        {panels.map((p) => (
          <div className="panel" key={p.id}>
            <div className="panel-head"><div><h3>{p.title}</h3></div></div>
            <div className="panel-body">{p.node}</div>
          </div>
        ))}
      </div>

      {(data?.alertas || []).length > 0 && (
        <div className="panel mt-16">
          <div className="panel-head"><div><h3>Alertas operativas</h3><p>Solo las relevantes para tu rol</p></div><Badge tone="amber">{data.alertas.length}</Badge></div>
          <div className="panel-body">
            {data.alertas.filter((a) => perfil === 'cobrador' ? a.tipo === 'cobranza' : perfil === 'vendedor' ? a.tipo !== 'cobranza' : true).slice(0, 6)
              .map((a, i) => <div className="alert-item" key={i}><span className={`alert-icon ${a.tipo}`}><Clock3 size={14} /></span><div><strong>{a.titulo}</strong><p>{a.detalle}</p></div></div>)}
          </div>
        </div>
      )}
      {!panels.length && <EmptyState icon={Award} title="Sin datos" message="Aún no hay información para este tablero." />}
    </>
  );
}

function CheckIcon() { return <Award size={19} />; }

function visitasPorDia(visitas) {
  const mapa = new Map();
  visitas.forEach((v) => {
    const fecha = String(v.fecha || '').slice(0, 10);
    mapa.set(fecha, (mapa.get(fecha) || 0) + 1);
  });
  return [...mapa.entries()].map(([fecha, total]) => ({ fecha, total })).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
