import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, Filter, MapPin, Plus, Search, ShoppingCart, Target, Truck } from 'lucide-react';
import { api, qs } from '../api';
import { puede, useAuth } from '../auth';
import { Badge, EmptyState, Estado, Fecha, Money, PageHeader, SkeletonRows, Tabs, useToast } from '../ui';
import BotonExcel from '../components/BotonExcel';

export default function Ventas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [tab, setTab] = useState('todos');
  const [search, setSearch] = useState(params.get('q') || '');
  const [canal, setCanal] = useState('todos');
  const [pago, setPago] = useState('todos');
  const [pedidos, setPedidos] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [rutasVendedores, setRutasVendedores] = useState([]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const query = tab === 'por_cobrar'
          ? { search, canal, estado_pago: 'pendiente' }
          : { search, canal, estado: tab, estado_pago: pago };
        const data = await api.get(`/pedidos${qs(query)}`);
        setPedidos(data.pedidos);
        setCounts(data.counts);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [tab, search, canal, pago, toast]);

  useEffect(() => {
    api.get('/usuarios').then((r) => setRutasVendedores(
      (r.usuarios || []).filter((u) => ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol) && u.activo),
    )).catch(() => {});
  }, []);

  const tabs = useMemo(() => [
    { value: 'todos', label: 'Todos', count: counts.todos },
    { value: 'pendiente', label: 'Pendientes', count: counts.pendiente },
    { value: 'preparando', label: 'Preparando', count: counts.preparando },
    { value: 'enviado', label: 'Enviados', count: counts.enviado },
    { value: 'entregado', label: 'Entregados', count: counts.entregado },
    { value: 'por_cobrar', label: 'Por cobrar', count: counts.por_cobrar },
    { value: 'cancelado', label: 'Cancelados', count: counts.cancelado },
  ], [counts]);

  const totalFiltrado = pedidos.reduce((s, p) => s + p.total, 0);
  const saldoFiltrado = pedidos.reduce((s, p) => s + p.saldo, 0);

  return (
    <>
      <PageHeader
        eyebrow="Ventas"
        title="Pedidos y facturación"
        subtitle="Registra ventas, da seguimiento a los pedidos y controla los cobros de tu cartera."
        actions={(
          <>
            <BotonExcel filas={pedidos} nombre="pedidos" columnas={['codigo', 'cliente_nombre', 'fecha', 'vendedor_nombre', 'canal', 'total', 'saldo', 'estado', 'estado_pago']} />
            {puede(user, 'objetivos') && <button className="btn btn-outline" onClick={() => navigate('/ventas/objetivos')}><Target size={14} /> Generar objetivos</button>}
            <button className="btn btn-navy" onClick={() => navigate('/ventas/agenda?iniciar=1')}><MapPin size={14} /> Iniciar ruta</button>
            <button className="btn btn-outline" onClick={() => navigate('/clientes')}><Search size={14} /> Clientes</button>
            {puede(user, 'venta_nueva') && <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}><Plus size={15} /> Nueva venta</button>}
          </>
        )}
      />

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Rutas asignadas a vendedores</h3><p>Consulta la ruta, zona y cliente de cada vendedor para generar sus pedidos</p></div></div>
        <div className="grid grid-4" style={{ gap: 10, padding: 14 }}>
          {rutasVendedores.map((v) => (
            <div className="card card-pad" key={v.id} style={{ padding: 12 }}>
              <div className="inline" style={{ justifyContent: 'space-between' }}><strong style={{ fontSize: 12.5 }}>{v.nombre}</strong><Badge tone={v.ruta_venta === 'R1' ? 'orange' : 'purple'}>{v.ruta_venta || 'sin ruta'}</Badge></div>
              <div className="small muted"><MapPin size={11} /> {v.zona_venta || 'sin zona'} · {v.rol}</div>
              <div className="small muted">{v.es_venta_directa ? <><Truck size={11} /> Almacén móvil {v.almacen_movil_id || ''}</> : 'Venta desde almacén'}</div>
              <button className="btn btn-soft btn-sm mt-8" onClick={() => navigate(`/ventas/nueva?vendedor=${v.id}`)}>Generar pedido</button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <Tabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="panel-body" style={{ paddingBottom: 12 }}>
          <div className="filters">
            <div className="search-box">
              <Search size={15} />
              <input className="input" placeholder="Buscar por código, cliente o zona…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="select" value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="todos">Todos los canales</option>
              <option value="mostrador">Mostrador</option>
              <option value="delivery">Delivery</option>
              <option value="ruta">Ruta</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            {tab !== 'por_cobrar' && (
              <select className="select" value={pago} onChange={(e) => setPago(e.target.value)}>
                <option value="todos">Todos los pagos</option>
                <option value="pagado">Pagado</option>
                <option value="pendiente">Pendiente</option>
                <option value="parcial">Parcial</option>
                <option value="anulado">Anulado</option>
              </select>
            )}
            <span className="small muted" style={{ marginLeft: 'auto' }}><Filter size={12} style={{ verticalAlign: -2 }} /> {pedidos.length} resultados</span>
          </div>
        </div>

        {loading ? <SkeletonRows rows={8} /> : pedidos.length === 0 ? (
          <EmptyState icon={ShoppingCart} title="No hay pedidos con estos filtros" message="Prueba con otro estado, canal o término de búsqueda." action={puede(user, 'venta_nueva') ? <button className="btn btn-soft btn-sm mt-8" onClick={() => navigate('/ventas/nueva')}>Registrar una venta</button> : null} />
        ) : (
          <>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Canal</th><th className="num">Total</th><th className="num">Saldo</th><th>Estado</th><th>Pago</th><th />
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/ventas/${p.id}`)}>
                      <td className="cell-strong">{p.codigo}<span className="cell-sub">{p.items_count} unidades · {p.vendedor_nombre.split(' ')[0]}</span></td>
                      <td>{p.cliente_nombre}<span className="cell-sub">{p.cliente_zona} · {p.cliente_tipo}</span></td>
                      <td className="nowrap"><Fecha value={p.created_at} short /><span className="cell-sub">{new Date(p.created_at).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}</span></td>
                      <td><Estado valor={p.canal} /></td>
                      <td className="num cell-strong"><Money value={p.total} /></td>
                      <td className="num"><span className={p.saldo > 0 ? 'text-orange' : 'muted'}>{p.saldo > 0 ? <Money value={p.saldo} /> : '—'}</span></td>
                      <td><Estado valor={p.estado} /></td>
                      <td><Estado valor={p.estado_pago} /></td>
                      <td className="actions"><button className="icon-btn" onClick={(e) => { e.stopPropagation(); navigate(`/ventas/${p.id}`); }} title="Ver detalle"><Eye size={15} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-foot">
              <span>{pedidos.length} pedidos · Total <strong><Money value={totalFiltrado} /></strong></span>
              <span>Saldo pendiente <strong className={saldoFiltrado > 0 ? 'text-orange' : ''}><Money value={saldoFiltrado} /></strong></span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
