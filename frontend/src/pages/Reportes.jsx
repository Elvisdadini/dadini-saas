import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, BarChart3, CalendarRange, Download, FileSpreadsheet, Package, RefreshCcw, Search, TrendingUp, Users, Wallet } from 'lucide-react';
import { api, downloadCSV, qs } from '../api';
import { useAuth } from '../auth';
import { AreaChart, Bars, Donut } from '../charts';
import { Badge, EmptyState, Fecha, Money, Num, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';
import SelectorEmpleadosWhatsapp from '../components/SelectorEmpleadosWhatsapp';

function iso(date) { return date.toISOString().slice(0, 10); }

export default function Reportes() {
  const toast = useToast();
  const { empresa } = useAuth();
  const [desde, setDesde] = useState(iso(new Date(Date.now() - 29 * 86400000)));
  const [hasta, setHasta] = useState(iso(new Date()));
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('productos');
  const [campo, setCampo] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [dist, setDist] = useState(null);
  const [fDist, setFDist] = useState({ desde: iso(new Date(Date.now() - 29 * 86400000)), hasta: iso(new Date()), distribuidor_id: '', ruta_venta: 'todas', almacen_id: '' });
  const [fCampo, setFCampo] = useState({
    desde: iso(new Date(Date.now() - 29 * 86400000)),
    hasta: iso(new Date()),
    ruta_venta: 'todas',
    vendedor_id: '',
    distribuidor_id: '',
    dia_visita: '',
    resultado: 'todos',
    motivo: 'todos',
    forma_pago: 'todos',
    estado: 'todos',
    search: '',
    movimiento_tipo: 'todos',
    con_whatsapp: '',
    solo_coordenadas: '',
    en_mora: '',
    categoria_cliente_id: '',
    venta_directa: '',
    solo_reacomodo: '',
  });

  const cargar = async () => {
    setLoading(true);
    try {
      setData(await api.get(`/reportes${qs({ desde, hasta })}`));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [desde, hasta]);

  const preset = (dias) => {
    setDesde(iso(new Date(Date.now() - (dias - 1) * 86400000)));
    setHasta(iso(new Date()));
  };

  const exportar = async (tipo) => {
    try {
      await downloadCSV(`/reportes/export${qs({ tipo, desde, hasta })}`, `dadini-${tipo}-${desde}-${hasta}.csv`);
      toast('Archivo CSV descargado');
    } catch (error) { toast(error.message, 'error'); }
  };

  const serie = useMemo(() => (data?.por_dia || []).map((d) => ({ fecha: d.fecha, total: d.total, pedidos: d.pedidos, anterior: 0 })), [data]);
  const categorias = useMemo(() => (data?.categorias || []).map((c) => ({ label: c.categoria, value: c.total })), [data]);
  const r = data?.resumen || {};

  const cargarCampo = async () => {
    try {
      const q = new URLSearchParams(Object.entries(fCampo).filter(([, v]) => v !== '')).toString();
      setCampo(await api.get(`/campo/reporte?${q}`));
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  useEffect(() => { cargarCampo(); /* eslint-disable-next-line */ }, []);

  const cargarDist = async () => {
    try {
      const q = new URLSearchParams(Object.entries(fDist).filter(([, v]) => v && v !== 'todas')).toString();
      setDist(await api.get(`/lista-distribucion?${q}`));
    } catch (error) { toast(error.message, 'error'); }
  };

  useEffect(() => { cargarDist(); /* eslint-disable-next-line */ }, [fDist]);

  const exportarDist = async () => {
    try {
      const q = new URLSearchParams(Object.entries(fDist).filter(([, v]) => v && v !== 'todas')).toString();
      await downloadCSV(`/lista-distribucion/export?${q}`, `lista-distribucion-${fDist.desde}-${fDist.hasta}.csv`);
      toast('Lista de distribución exportada');
    } catch (error) { toast(error.message, 'error'); }
  };

  const exportarCampo = async () => {
    try {
      const q = new URLSearchParams(Object.entries(fCampo).filter(([, v]) => v !== '')).toString();
      await downloadCSV(`/campo/export?${q}`, `reporte-campo-${fCampo.desde}-${fCampo.hasta}.csv`);
      toast('Reporte de campo exportado');
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Inteligencia de negocio"
        title="Reportes"
        subtitle={`${empresa?.nombre || 'DADINI'} · análisis de ventas, márgenes, productos y clientes.`}
        actions={(
          <>
            <Link className="btn btn-outline btn-sm" to="/reportes/rentabilidad"><TrendingUp size={12} /> Rentabilidad</Link>
            <Link className="btn btn-outline btn-sm" to="/reportes/automatico"><AlarmClock size={12} /> Automáticos</Link>
            <div className="inline">
              <button className="btn btn-outline btn-sm" onClick={() => preset(7)}>7 días</button>
              <button className="btn btn-outline btn-sm" onClick={() => preset(30)}>30 días</button>
              <button className="btn btn-outline btn-sm" onClick={() => preset(90)}>90 días</button>
            </div>
            <button className="btn btn-primary" onClick={() => exportar('ventas')}><Download size={14} /> Exportar</button>
            <button className="btn btn-green" onClick={() => setSelectorOpen(true)}><Wallet size={14} /> Enviar reporte por WhatsApp</button>
          </>
        )}
      />

      <div className="card card-pad mb-16" style={{ padding: 14 }}>
        <div className="filters">
          <span className="small muted"><CalendarRange size={13} style={{ verticalAlign: -2 }} /> Rango de análisis</span>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><label style={{ fontSize: 11 }}>Desde</label><input className="input input-sm" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
          <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><label style={{ fontSize: 11 }}>Hasta</label><input className="input input-sm" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
          <div className="inline" style={{ marginLeft: 'auto', gap: 5 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => exportar('productos')}><FileSpreadsheet size={13} /> Productos</button>
            <button className="btn btn-ghost btn-sm" onClick={() => exportar('clientes')}><FileSpreadsheet size={13} /> Clientes</button>
            <button className="btn btn-ghost btn-sm" onClick={() => exportar('vendedores')}><FileSpreadsheet size={13} /> Vendedores</button>
          </div>
        </div>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Ventas netas" value={<Money value={r.total} />} icon={TrendingUp} tone="orange" hint={`${r.pedidos || 0} pedidos en el rango`} />
        <StatCard label="Utilidad bruta" value={<Money value={r.margen} />} icon={Wallet} tone="green" hint={`${r.utilidad_porcentaje || 0}% sobre ventas`} />
        <StatCard label="Ticket promedio" value={<Money value={r.ticket_promedio} />} icon={BarChart3} tone="blue" hint={`${Number(r.unidades || 0).toLocaleString('es-BO')} unidades vendidas`} />
        <StatCard label="Clientes atendidos" value={(data?.clientes || []).length} icon={Users} tone="purple" hint="Con compras en el período" />
      </div>

      {loading ? <div className="panel"><SkeletonRows rows={8} /></div> : !data ? <EmptyState icon={BarChart3} title="Sin información" message="No se pudieron cargar los reportes." /> : (
        <div className="dash-grid">
          <div className="panel">
            <div className="chart-card-head"><div><h3>Ventas por día</h3><p>Evolución del rango seleccionado</p></div><span className="badge badge-navy">{data.rango.desde} → {data.rango.hasta}</span></div>
            {serie.length > 0 ? <AreaChart data={serie} height={310} showPrevious={false} /> : <div className="table-empty">No hay ventas registradas en el rango.</div>}
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Ventas por categoría</h3><p>Participación en el período</p></div></div>
            <div className="panel-body">
              <Donut items={categorias} centerLabel="Ventas" centerValue={`${((r.total || 0) / 1000).toFixed(1)}k`} />
              <div className="divider" />
              <Bars items={(data.canales || []).map((c) => ({ label: c.canal, value: c.total }))} formatter={(v) => `Bs ${Math.round(v)}`} />
            </div>
          </div>
        </div>
      )}

      {data && (
        <div className="panel section-gap">
          <Tabs
            tabs={[
              { value: 'productos', label: 'Por producto', count: data.productos.length },
              { value: 'clientes', label: 'Por cliente', count: data.clientes.length },
              { value: 'vendedores', label: 'Por vendedor', count: data.vendedores.length },
              { value: 'canales', label: 'Por canal', count: data.canales.length },
            ]}
            active={tab}
            onChange={setTab}
          />
          {tab === 'productos' && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>#</th><th>Producto</th><th>Categoría</th><th className="num">Unidades</th><th className="num">Ventas</th><th className="num">Margen</th><th>Participación</th></tr></thead>
                <tbody>
                  {data.productos.map((p, i) => (
                    <tr key={p.producto_id}>
                      <td className="muted">{i + 1}</td>
                      <td className="cell-strong">{p.emoji} {p.nombre}</td>
                      <td>{p.categoria}</td>
                      <td className="num">{p.cantidad}</td>
                      <td className="num cell-strong"><Money value={p.total} /></td>
                      <td className="num text-green"><Money value={p.margen} /></td>
                      <td style={{ minWidth: 110 }}><div className="progress"><span className="progress-fill" style={{ width: `${r.total ? (p.total / r.total) * 100 : 0}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.productos.length === 0 && <div className="table-empty">Sin ventas en el rango.</div>}
            </div>
          )}
          {tab === 'clientes' && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Cliente</th><th>Zona</th><th className="num">Pedidos</th><th className="num">Comprado</th><th className="num">Saldo</th><th>Participación</th></tr></thead>
                <tbody>
                  {data.clientes.map((c) => (
                    <tr key={c.cliente}>
                      <td className="cell-strong">{c.cliente}</td>
                      <td>{c.zona}</td>
                      <td className="num">{c.pedidos}</td>
                      <td className="num cell-strong"><Money value={c.total} /></td>
                      <td className="num">{c.saldo > 0 ? <span className="text-orange"><Money value={c.saldo} /></span> : '—'}</td>
                      <td style={{ minWidth: 110 }}><div className="progress"><span className="progress-fill progress-green" style={{ width: `${r.total ? (c.total / r.total) * 100 : 0}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.clientes.length === 0 && <div className="table-empty">Sin clientes en el rango.</div>}
            </div>
          )}
          {tab === 'vendedores' && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Vendedor</th><th className="num">Pedidos</th><th className="num">Ventas</th><th>Participación</th></tr></thead>
                <tbody>
                  {data.vendedores.map((v) => (
                    <tr key={v.vendedor}>
                      <td className="cell-strong">{v.vendedor}</td>
                      <td className="num">{v.pedidos}</td>
                      <td className="num cell-strong"><Money value={v.total} /></td>
                      <td style={{ minWidth: 160 }}><div className="progress"><span className="progress-fill progress-purple" style={{ width: `${r.total ? (v.total / r.total) * 100 : 0}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {tab === 'canales' && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Canal</th><th className="num">Pedidos</th><th className="num">Ventas</th><th className="num">Ticket promedio</th><th>Participación</th></tr></thead>
                <tbody>
                  {data.canales.map((c) => (
                    <tr key={c.canal}>
                      <td className="cell-strong" style={{ textTransform: 'capitalize' }}>{c.canal}</td>
                      <td className="num">{c.pedidos}</td>
                      <td className="num cell-strong"><Money value={c.total} /></td>
                      <td className="num"><Money value={c.pedidos ? c.total / c.pedidos : 0} /></td>
                      <td style={{ minWidth: 160 }}><div className="progress"><span className="progress-fill progress-blue" style={{ width: `${r.total ? (c.total / r.total) * 100 : 0}%` }} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="panel section-gap">
        <div className="panel-head">
          <div><h3>Reporte de campo · preventa y distribución</h3><p>Filtros avanzados por ruta, vendedor, distribuidor, día, objeción y forma de pago</p></div>
          <div className="inline">
            <button className="btn btn-outline btn-sm" onClick={cargarCampo}><RefreshCcw size={12} /> Consultar</button>
            <button className="btn btn-primary btn-sm" onClick={exportarCampo}><Download size={12} /> Exportar CSV</button>
          </div>
        </div>
        <div className="panel-body">
          <div className="filters mb-16">
            <input type="date" className="input input-sm" value={fCampo.desde} onChange={(e) => setFCampo({ ...fCampo, desde: e.target.value })} />
            <input type="date" className="input input-sm" value={fCampo.hasta} onChange={(e) => setFCampo({ ...fCampo, hasta: e.target.value })} />
            <select className="select" value={fCampo.ruta_venta} onChange={(e) => setFCampo({ ...fCampo, ruta_venta: e.target.value })}>
              <option value="todas">Todas las rutas</option>{(campo?.catalogos?.rutas || ['R1', 'R2']).map((ruta) => <option key={ruta} value={ruta}>{ruta}</option>)}
            </select>
            <select className="select" value={fCampo.vendedor_id} onChange={(e) => setFCampo({ ...fCampo, vendedor_id: e.target.value })}>
              <option value="">Todos los vendedores</option>{(campo?.catalogos?.vendedores || []).map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
            <select className="select" value={fCampo.distribuidor_id} onChange={(e) => setFCampo({ ...fCampo, distribuidor_id: e.target.value })}>
              <option value="">Todos los distribuidores</option>{(campo?.catalogos?.distribuidores || []).map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
            </select>
            <select className="select" value={fCampo.dia_visita} onChange={(e) => setFCampo({ ...fCampo, dia_visita: e.target.value })}>
              <option value="">Todos los días</option>{[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][d]}</option>)}
            </select>
            <select className="select" value={fCampo.resultado} onChange={(e) => setFCampo({ ...fCampo, resultado: e.target.value })}>
              <option value="todos">Todos los resultados</option><option value="pedido">Con pedido</option><option value="no_pedido">Sin pedido</option><option value="entregado">Entregado</option><option value="parcial">Parcial</option><option value="cerrado">Cerrado</option>
            </select>
            <select className="select" value={fCampo.motivo} onChange={(e) => setFCampo({ ...fCampo, motivo: e.target.value })}>
              <option value="todos">Todos los motivos</option>{(campo?.catalogos?.motivos || []).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select className="select" value={fCampo.forma_pago} onChange={(e) => setFCampo({ ...fCampo, forma_pago: e.target.value })}>
              <option value="todos">Contado y crédito</option><option value="efectivo">Contado</option><option value="credito">Crédito</option>
            </select>
            <select className="select" value={fCampo.estado} onChange={(e) => setFCampo({ ...fCampo, estado: e.target.value })}>
              <option value="todos">Todos los estados</option><option value="pendiente">Pendiente</option><option value="preparando">Preparando</option><option value="enviado">En camino</option><option value="entregado">Entregado</option>
            </select>
            <div className="search-box"><Search size={14} /><input className="input" placeholder="Buscar cliente o pedido…" value={fCampo.search} onChange={(e) => setFCampo({ ...fCampo, search: e.target.value })} /></div>
            <select className="select" value={fCampo.movimiento_tipo} onChange={(e) => setFCampo({ ...fCampo, movimiento_tipo: e.target.value })}>
              <option value="todos">Todos los movimientos</option><option value="visita">Visitas</option><option value="pedido">Pedidos</option><option value="entrega">Entregas</option><option value="cobranza">Cobranzas</option><option value="whatsapp">WhatsApp</option>
            </select>
            <label className="check"><input type="checkbox" checked={fCampo.con_whatsapp === 'true'} onChange={(e) => setFCampo({ ...fCampo, con_whatsapp: e.target.checked ? 'true' : '' })} /> Con WhatsApp</label>
            <label className="check"><input type="checkbox" checked={fCampo.solo_coordenadas === 'true'} onChange={(e) => setFCampo({ ...fCampo, solo_coordenadas: e.target.checked ? 'true' : '' })} /> Solo con coordenadas</label>
            <select className="select" value={fCampo.en_mora} onChange={(e) => setFCampo({ ...fCampo, en_mora: e.target.value })}>
              <option value="">Cualquier cobro</option><option value="true">Solo en mora</option><option value="false">Solo al día</option>
            </select>
            <select className="select" value={fCampo.categoria_cliente_id} onChange={(e) => setFCampo({ ...fCampo, categoria_cliente_id: e.target.value })}>
              <option value="">Todas las categorías</option>{(campo?.catalogos?.categorias || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select className="select" value={fCampo.venta_directa} onChange={(e) => setFCampo({ ...fCampo, venta_directa: e.target.value })}>
              <option value="">Todas las ventas</option><option value="true">Solo venta directa</option><option value="false">Solo almacén</option>
            </select>
            <label className="check"><input type="checkbox" checked={fCampo.solo_reacomodo === 'true'} onChange={(e) => setFCampo({ ...fCampo, solo_reacomodo: e.target.checked ? 'true' : '' })} /> Solo reacomodados</label>
          </div>

          {!campo ? <SkeletonRows rows={6} /> : (
            <>
              <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
                <div className="mini-stat"><span>Visitas</span><strong>{campo.resumen.visitas}</strong></div>
                <div className="mini-stat"><span>Conversión</span><strong>{campo.resumen.conversion}%</strong></div>
                <div className="mini-stat"><span>Pedidos</span><strong>{campo.resumen.pedidos}</strong></div>
                <div className="mini-stat"><span>Monto contado</span><strong><Money value={campo.resumen.monto_contado} /></strong></div>
                <div className="mini-stat"><span>Monto crédito</span><strong><Money value={campo.resumen.monto_credito} /></strong></div>
                <div className="mini-stat"><span>Entregas</span><strong>{campo.resumen.entregadas}/{campo.resumen.entregas}</strong></div>
                <div className="mini-stat"><span>Parciales</span><strong>{campo.resumen.parciales}</strong></div>
                <div className="mini-stat"><span>Unidades devueltas</span><strong>{campo.resumen.unidades_devueltas}</strong></div>
              </div>

              <div className="grid grid-2 mb-16" style={{ gap: 14 }}>
                <div>
                  <h4 className="small">Visitas y objeciones</h4>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Fecha</th><th>Cliente</th><th>Ruta</th><th>Vendedor</th><th>Resultado</th><th>Motivo</th><th>Pedido</th></tr></thead>
                      <tbody>
                        {campo.visitas.slice(0, 25).map((v) => (
                          <tr key={`v-${v.id}`}>
                            <td><Fecha value={v.fecha} short /></td>
                            <td className="cell-strong">{v.cliente}<span className="cell-sub">{v.cliente_codigo}</span></td>
                            <td>{v.ruta_venta}</td><td>{v.vendedor}</td>
                            <td><Badge tone={v.resultado === 'pedido' ? 'green' : 'red'}>{v.resultado}</Badge></td>
                            <td>{v.motivo === '—' ? '—' : v.motivo}</td>
                            <td>{v.pedido}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {campo.visitas.length === 0 && <div className="table-empty">Sin visitas con estos filtros.</div>}
                </div>
                <div>
                  <h4 className="small">Pedidos generados</h4>
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th>Pedido</th><th>Cliente</th><th>Entrega</th><th>Vendedor</th><th>Pago</th><th className="num">Total</th></tr></thead>
                      <tbody>
                        {campo.pedidos.slice(0, 25).map((p) => (
                          <tr key={`p-${p.id}`}>
                            <td className="cell-strong">{p.codigo}</td><td>{p.cliente}</td>
                            <td>{p.entrega_programada}</td><td>{p.vendedor}</td>
                            <td><Badge tone={p.forma_pago === 'credito' ? 'purple' : 'green'}>{p.forma_pago}</Badge></td>
                            <td className="num"><Money value={p.total} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {campo.pedidos.length === 0 && <div className="table-empty">Sin pedidos con estos filtros.</div>}
                </div>
              </div>

              <div className="grid grid-3" style={{ gap: 14 }}>
                <div><h4 className="small">Por vendedor</h4>{campo.por_vendedor.map((v) => <div className="info-row" key={v.nombre}><span>{v.nombre}</span><strong>{v.visitas} visitas · {v.pedidos} pedidos</strong></div>)}</div>
                <div><h4 className="small">Por día</h4>{campo.por_dia.map((d) => <div className="info-row" key={d.dia}><span>{d.dia}</span><strong>{d.visitas} visitas · {d.pedidos} pedidos</strong></div>)}</div>
                <div><h4 className="small">Motivos de no pedido</h4>{campo.motivos.map((m) => <div className="info-row" key={m.motivo}><span>{m.motivo}</span><strong>{m.total}</strong></div>)}{campo.motivos.length === 0 && <p className="small muted">Sin objeciones registradas.</p>}</div>
              </div>

              <div className="divider mt-16" />
              <div className="inline mb-8">
                <h4 className="small" style={{ marginRight: 'auto' }}>Trazabilidad completa de movimientos</h4>
                <Badge tone="blue">{campo.resumen.movimientos || 0} movimientos</Badge>
                <Badge tone="green">{campo.resumen.con_coordenadas || 0} con coordenadas</Badge>
                <Badge tone="purple">{campo.resumen.con_whatsapp || 0} con WhatsApp</Badge>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Fecha y hora</th><th>Tipo</th><th>Acción</th><th>Empleado</th><th>Cliente</th><th>Pedido</th><th>Coordenadas</th><th>WhatsApp</th><th>Notas</th></tr></thead>
                  <tbody>
                    {(campo.movimientos || []).slice(0, 60).map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap"><Fecha value={m.fecha} time /></td>
                        <td><Badge tone={m.tipo === 'pedido' ? 'orange' : m.tipo === 'entrega' ? 'purple' : m.tipo === 'cobranza' ? 'green' : m.tipo === 'whatsapp' ? 'blue' : 'gray'}>{m.tipo}</Badge></td>
                        <td className="cell-strong">{m.accion}</td>
                        <td>{m.empleado}</td>
                        <td>{m.cliente}</td>
                        <td>{m.pedido}</td>
                        <td className="nowrap"><span className="small muted">{m.latitud ? `${Number(m.latitud).toFixed(5)}, ${Number(m.longitud).toFixed(5)}` : '—'}</span></td>
                        <td>{m.whatsapp ? <Badge tone={m.whatsapp.estado === 'enviado' ? 'green' : 'amber'}>{m.whatsapp.tipo} · {m.whatsapp.estado}</Badge> : '—'}</td>
                        <td><span className="small muted">{m.motivo !== '—' ? m.motivo : m.notas || '—'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(campo.movimientos || []).length === 0 && <div className="table-empty">Sin movimientos con estos filtros.</div>}
            </>
          )}
        </div>
      </div>

      <div className="panel section-gap">
        <div className="panel-head">
          <div><h3>Lista de clientes para distribuir</h3><p>Por distribuidor · pedidos, montos, cajas y peso en KG</p></div>
          <button className="btn btn-primary btn-sm" onClick={exportarDist}><Download size={12} /> Exportar lista</button>
        </div>
        <div className="panel-body">
          <div className="filters mb-16">
            <input type="date" className="input input-sm" value={fDist.desde} onChange={(e) => setFDist({ ...fDist, desde: e.target.value })} />
            <input type="date" className="input input-sm" value={fDist.hasta} onChange={(e) => setFDist({ ...fDist, hasta: e.target.value })} />
            <select className="select" value={fDist.distribuidor_id} onChange={(e) => setFDist({ ...fDist, distribuidor_id: e.target.value })}>
              <option value="">Todos los distribuidores</option>{(dist?.distribuidores || []).map((d) => <option key={d.id} value={d.id}>{d.codigo} · {d.nombre}</option>)}
            </select>
            <select className="select" value={fDist.ruta_venta} onChange={(e) => setFDist({ ...fDist, ruta_venta: e.target.value })}><option value="todas">Todas las rutas</option><option value="R1">R1</option><option value="R2">R2</option></select>
          </div>
          {!dist ? <SkeletonRows rows={5} /> : (
            <>
              <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
                <div className="mini-stat"><span>Pedidos a cargar</span><strong>{dist.resumen.pedidos}</strong></div>
                <div className="mini-stat"><span>Total monto</span><strong><Money value={dist.resumen.monto} /></strong></div>
                <div className="mini-stat"><span>Total cajas</span><strong>{dist.resumen.cajas}</strong></div>
                <div className="mini-stat"><span>Total peso (kg)</span><strong>{dist.resumen.peso_kg}</strong></div>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Pedido</th><th>Cliente</th><th>Vendedor</th><th>Distribuidor</th><th className="num">Monto</th><th className="num">Cajas</th><th className="num">Peso kg</th><th>Productos</th></tr></thead>
                  <tbody>
                    {dist.filas.slice(0, 60).map((f) => (
                      <tr key={f.pedido_id}>
                        <td className="cell-strong">{f.pedido_codigo}<span className="cell-sub">{f.ruta_venta}</span></td>
                        <td>{f.cliente}<span className="cell-sub">{f.cliente_zona}</span></td>
                        <td>{f.vendedor}</td>
                        <td>{f.distribuidor}<span className="cell-sub">{f.distribuidor_codigo}</span></td>
                        <td className="num"><Money value={f.total} /></td>
                        <td className="num">{f.cajas}</td>
                        <td className="num">{f.peso_kg}</td>
                        <td><span className="small muted">{f.producto_resumen}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {dist.filas.length === 0 && <div className="table-empty">Sin pedidos con estos filtros.</div>}
            </>
          )}
        </div>
      </div>

      <SelectorEmpleadosWhatsapp
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        titulo="Enviar reporte por WhatsApp"
        tipo="otro"
        tituloDocumento={`Reporte DADINI ${desde} al ${hasta}`}
        mensaje={`Reporte DADINI del ${desde} al ${hasta}\nVentas: Bs ${Number(r.total || 0).toFixed(2)} · Pedidos: ${r.pedidos || 0}\nUnidades: ${Number(r.unidades || 0).toLocaleString('es-BO')} · Utilidad: Bs ${Number(r.margen || 0).toFixed(2)}`}
      />
    </>
  );
}
