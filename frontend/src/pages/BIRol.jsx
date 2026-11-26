import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Award, BadgePercent, BarChart3, CalendarCheck, CheckCircle2,
  ChevronRight, ClipboardList, Clock3, Crown, Package, RefreshCcw, ShoppingCart, Sparkles,
  Target, TrendingUp, Truck, Users, Wallet, XCircle,
} from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { AreaChart, Bars, Donut } from '../charts';
import { Badge, EmptyState, Fecha, Money, Num, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const PERIODOS = [{ value: '7d', label: '7 días' }, { value: '30d', label: '30 días' }, { value: '90d', label: '90 días' }];
const CANAL = { mostrador: 'Mostrador', delivery: 'Delivery', ruta: 'Ruta', whatsapp: 'WhatsApp' };

const NIVELES = [
  { id: 'vendedores', label: 'Vendedores', icon: Users, desc: 'Ventas agrupadas por vendedor' },
  { id: 'clientes', label: 'Clientes', icon: Users, desc: 'Clientes atendidos por cada vendedor' },
  { id: 'productos', label: 'Productos', icon: Package, desc: 'Productos vendidos y unidades' },
  { id: 'descuentos', label: 'Descuentos', icon: BadgePercent, desc: 'Descuentos aplicados pedido por pedido' },
  { id: 'visitas', label: 'Visitas', icon: CalendarCheck, desc: 'Asignadas, visitadas, compraron y no compraron' },
];

const PRIORIDAD = { alta: 'red', media: 'amber', baja: 'green' };
const TIPO_ICONO = { objetivo: Target, inventario: Package, cobranza: Wallet, preventa: CalendarCheck, rentabilidad: BadgePercent, ventas: TrendingUp };

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
function desdeDe(rango) { return iso(new Date(Date.now() - ((rango === '7d' ? 7 : rango === '90d' ? 90 : 30) - 1) * 86400000)); }

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
          <button className="btn btn-outline" title="Recalcula los indicadores de tu tablero" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
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

      <ExploradorBI
        global={perfil === 'dueno' || perfil === 'supervisor'}
        onIrPedido={(id) => navigate(`/ventas/${id}`)}
      />
    </>
  );
}

// Explorador interactivo: ventas → vendedor → clientes → productos → descuentos → visitas.
function ExploradorBI({ global, onIrPedido }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [nivel, setNivel] = useState('vendedores');
  const [pila, setPila] = useState([]);
  const [filtros, setFiltros] = useState({ vendedor_id: null, cliente_id: null });
  const [rango, setRango] = useState('30d');
  const [personalizado, setPersonalizado] = useState({ desde: desdeDe('30d'), hasta: iso(new Date()) });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [sugerencias, setSugerencias] = useState(null);
  const [cargandoIA, setCargandoIA] = useState(false);
  const [mejorado, setMejorado] = useState(false);

  const rangoActual = useMemo(() => rango === 'custom' ? personalizado : { desde: desdeDe(rango), hasta: iso(new Date()) }, [rango, personalizado]);
  const actual = NIVELES.find((n) => n.id === nivel) || NIVELES[0];

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const r = await api.get(`/bi/drilldown${qs({ nivel, ...rangoActual, ...filtros })}`);
      setDatos(r);
    } catch (error) { toast(error.message, 'error'); } finally { setCargando(false); }
  }, [nivel, rangoActual, filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const irA = (siguiente, fila = {}) => {
    const etiqueta = fila.cliente || fila.vendedor || siguiente;
    setPila((p) => [...p, { nivel, filtros, etiqueta }]);
    const nuevos = { ...filtros };
    if (fila.vendedor_id) nuevos.vendedor_id = fila.vendedor_id;
    if (fila.cliente_id) nuevos.cliente_id = fila.cliente_id;
    if (siguiente === 'vendedores') { nuevos.vendedor_id = null; nuevos.cliente_id = null; }
    setFiltros(nuevos);
    setNivel(siguiente);
  };

  const volver = () => {
    if (!pila.length) return;
    const anterior = pila[pila.length - 1];
    setPila((p) => p.slice(0, -1));
    setNivel(anterior.nivel);
    setFiltros(anterior.filtros);
  };

  const raiz = (n) => { setPila([]); setNivel(n); setFiltros({ vendedor_id: null, cliente_id: null }); };

  const cargarSugerencias = async (mejorar = false) => {
    setCargandoIA(true);
    try {
      const r = await api.post('/ia/sugerencias', { mejorar });
      setSugerencias(r);
      setMejorado(mejorar && r.origen === 'openai');
    } catch (error) { toast(error.message, 'error'); } finally { setCargandoIA(false); }
  };

  const filas = datos?.filas || [];
  const resumen = datos?.resumen || {};
  return (
    <>
      <div className="panel mt-16">
        <div className="panel-head">
          <div>
            <h3><Sparkles size={15} /> Explorador interactivo</h3>
            <p>De la venta global al detalle: vendedor → clientes → productos → descuentos → visitas</p>
          </div>
          <Badge tone="blue">{filas.length} filas</Badge>
        </div>
        <div className="panel-body">
          <div className="inline mb-16" style={{ flexWrap: 'wrap', gap: 6 }}>
            {NIVELES.map((n) => {
              const Icono = n.icon;
              return <button key={n.id} className={`chip ${nivel === n.id ? 'active' : ''}`} title={n.desc} onClick={() => raiz(n.id)}><Icono size={13} /> {n.label}</button>;
            })}
          </div>

          <div className="field-row mb-16">
            <div className="field"><label>Período</label>
              <select className="select" value={rango} onChange={(e) => setRango(e.target.value)}>
                <option value="7d">Últimos 7 días</option>
                <option value="30d">Últimos 30 días</option>
                <option value="90d">Últimos 90 días</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>
            {rango === 'custom' && <>
              <div className="field"><label>Desde</label><input className="input" type="date" value={personalizado.desde} onChange={(e) => setPersonalizado({ ...personalizado, desde: e.target.value })} /></div>
              <div className="field"><label>Hasta</label><input className="input" type="date" value={personalizado.hasta} onChange={(e) => setPersonalizado({ ...personalizado, hasta: e.target.value })} /></div>
            </>}
            <div className="field"><label>Rango aplicado</label><div className="input" style={{ display: 'flex', alignItems: 'center' }}>{rangoActual.desde} → {rangoActual.hasta}</div></div>
          </div>

          <div className="inline mb-16" style={{ gap: 6, flexWrap: 'wrap' }}>
            {pila.map((p, i) => <span className="chip" key={i} title={p.etiqueta}>{p.etiqueta || NIVELES.find((n) => n.id === p.nivel)?.label} <ChevronRight size={12} /></span>)}
            {pila.length > 0 && <button className="btn btn-ghost btn-sm" onClick={volver}><ArrowLeft size={12} /> Volver</button>}
          </div>

          <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
            <StatCard label="Ventas" value={<Money value={resumen.ventas} />} icon={ShoppingCart} tone="orange" />
            <StatCard label="Pedidos" value={<Num value={resumen.pedidos} />} icon={ClipboardList} tone="blue" />
            <StatCard label="Clientes" value={<Num value={resumen.clientes} />} icon={Users} tone="green" />
            <StatCard label="Descuentos" value={<Money value={resumen.descuentos} />} icon={BadgePercent} tone="red" />
          </div>

          {cargando ? <SkeletonRows rows={5} /> : !filas.length ? (
            <EmptyState icon={BarChart3} title="Sin datos en este nivel" message="Prueba otro período o sube a un nivel superior." />
          ) : (
            <div className="table-wrap"><table className="data-table">
              <thead><tr>{columnas(nivel).map((c) => <th key={c.k} className={c.num ? 'num' : ''}>{c.label}</th>)}<th /></tr></thead>
              <tbody>{filas.map((f, i) => (
                <tr key={f.vendedor_id ?? f.cliente_id ?? f.producto_id ?? f.pedido_id ?? i} style={{ cursor: 'pointer' }} onClick={() => filaClick(nivel, f, irA, onIrPedido)}>

                  {columnas(nivel).map((c) => <td key={c.k} className={c.num ? 'num' : c.strong ? 'cell-strong' : ''}>
                    {renderCelda(f, c)}
                  </td>)}
                  <td className="actions" onClick={(e) => e.stopPropagation()}>
                    {accionesFila(nivel, f, irA, filtros)}
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          {nivel === 'vendedores' && !global && <p className="hint mt-8">Como usuario solo ves tus propios registros. La visión global requiere el permiso <b>datos.ver_todos</b>, otorgado por administración.</p>}
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <div><h3><Sparkles size={15} /> Sugerencias para cumplir objetivos</h3><p>Stock, vencimientos, mora, conversión de visitas y metas del mes</p></div>
          <div className="inline" style={{ gap: 6 }}>
            {sugerencias?.aviso && <Badge tone="amber">Modo local</Badge>}
            {mejorado && <Badge tone="green">Texto mejorado por IA</Badge>}
            <button className="btn btn-outline btn-sm" disabled={cargandoIA} onClick={() => cargarSugerencias(false)}><RefreshCcw size={12} /> Actualizar</button>
            <button className="btn btn-primary btn-sm" disabled={cargandoIA} onClick={() => cargarSugerencias(true)}><Sparkles size={12} /> {cargandoIA ? 'Analizando…' : 'Analizar con IA'}</button>
          </div>
        </div>
        <div className="panel-body">
          {!sugerencias ? <div className="notice notice-info"><Sparkles size={15} /> Presiona <b>Actualizar</b> para ver recomendaciones accionables para tu rol y período.</div>
            : cargandoIA ? <SkeletonRows rows={4} /> : !sugerencias.sugerencias?.length ? (
              <EmptyState icon={CheckCircle2} title="Todo en orden" message="No hay alertas que requieran una decisión inmediata." />
            ) : (
              <>
                {sugerencias.aviso && <div className="notice notice-warn mb-16"><AlertTriangle size={14} /> {sugerencias.aviso}</div>}
                <div className="grid grid-2" style={{ gap: 10 }}>
                  {sugerencias.sugerencias.map((s) => {
                    const Icono = TIPO_ICONO[s.tipo] || Target;
                    return (
                      <div className="panel" key={s.id} style={{ boxShadow: 'none' }}>
                        <div className="panel-head">
                          <div><h4 style={{ margin: 0 }}><Icono size={14} /> {s.titulo}</h4><p>{s.categoria}</p></div>
                          <Badge tone={PRIORIDAD[s.prioridad] || 'gray'}>{s.prioridad}</Badge>
                        </div>
                        <div className="panel-body">
                          <p className="small">{s.detalle}</p>
                          <p className="hint">{s.impacto}</p>
                          {s.accion?.ruta && <button className="btn btn-soft btn-sm mt-8" onClick={() => navigate(s.accion.ruta)}>{s.accion.etiqueta} <ChevronRight size={12} /></button>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
        </div>
      </div>
    </>
  );
}

function columnas(nivel) {
  if (nivel === 'vendedores') return [
    { k: 'vendedor', label: 'Vendedor', strong: true }, { k: 'pedidos', label: 'Pedidos', num: true },
    { k: 'clientes', label: 'Clientes', num: true }, { k: 'unidades', label: 'Unidades', num: true },
    { k: 'total', label: 'Ventas', num: true, money: true }, { k: 'descuento', label: 'Descuentos', num: true, money: true },
    { k: 'visitas', label: 'Visitas', num: true },
  ];
  if (nivel === 'clientes') return [
    { k: 'cliente', label: 'Cliente', strong: true }, { k: 'pedidos', label: 'Pedidos', num: true },
    { k: 'productos', label: 'Productos', num: true }, { k: 'unidades', label: 'Unidades', num: true },
    { k: 'total', label: 'Ventas', num: true, money: true }, { k: 'descuento', label: 'Descuento', num: true, money: true },
    { k: 'visitas', label: 'Visitas', num: true },
  ];
  if (nivel === 'productos') return [
    { k: 'producto', label: 'Producto', strong: true }, { k: 'unidades', label: 'Unidades', num: true },
    { k: 'pedidos', label: 'Pedidos', num: true }, { k: 'total', label: 'Ventas', num: true, money: true },
  ];
  if (nivel === 'visitas') return [
    { k: 'vendedor', label: 'Vendedor', strong: true }, { k: 'asignadas', label: 'Asignadas', num: true },
    { k: 'completadas', label: 'Visitadas', num: true }, { k: 'con_pedido', label: 'Compraron', num: true },
    { k: 'sin_pedido', label: 'No compraron', num: true }, { k: 'tasa', label: 'Conversión', num: true },
  ];
  return [
    { k: 'codigo', label: 'Pedido', strong: true }, { k: 'cliente', label: 'Cliente' }, { k: 'vendedor', label: 'Vendedor' },
    { k: 'fecha', label: 'Fecha' }, { k: 'descuento', label: 'Descuento', num: true, money: true },
    { k: 'porcentaje', label: '%', num: true }, { k: 'total', label: 'Total', num: true, money: true },
  ];
}

function renderCelda(f, c) {
  if (c.k === 'tasa') return `${f.completadas ? Math.round(100 * f.con_pedido / f.completadas) : 0}%`;
  if (c.k === 'porcentaje') return f.porcentaje ? `${f.porcentaje}%` : 'Bs';
  const v = f[c.k];
  if (v === null || v === undefined || v === '') return '—';
  return c.money ? <Money value={v} /> : typeof v === 'number' ? <Num value={v} /> : v;
}

function filaClick(nivel, f, irA, onIrPedido) {
  if (nivel === 'vendedores') irA('clientes', { vendedor_id: f.vendedor_id, vendedor: f.vendedor });
  else if (nivel === 'clientes') irA('productos', { cliente_id: f.cliente_id, cliente: f.cliente });
  else if (nivel === 'descuentos') onIrPedido?.(f.pedido_id);
}

function accionesFila(nivel, f, irA, filtros) {
  if (nivel === 'vendedores') {
    const sel = { vendedor_id: f.vendedor_id, vendedor: f.vendedor };
    return <>
      <button className="btn btn-soft btn-sm" onClick={() => irA('clientes', sel)}>Clientes</button>
      <button className="btn btn-ghost btn-sm" onClick={() => irA('descuentos', sel)}>Descuentos</button>
      <button className="btn btn-ghost btn-sm" onClick={() => irA('visitas', sel)}>Visitas</button>
    </>;
  }
  if (nivel === 'clientes') {
    const sel = { cliente_id: f.cliente_id, cliente: f.cliente, vendedor_id: filtros?.vendedor_id };
    return <>
      <button className="btn btn-soft btn-sm" onClick={() => irA('productos', sel)}>Productos</button>
      <button className="btn btn-ghost btn-sm" onClick={() => irA('descuentos', sel)}>Descuentos</button>
    </>;
  }
  return null;
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
