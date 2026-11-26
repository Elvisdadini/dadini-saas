import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BadgePercent, CalendarCheck, CheckCircle2, ClipboardList, Package, RefreshCcw,
  ShoppingCart, Target, Truck, Undo2, Users, Wallet,
} from 'lucide-react';
import { api, qs } from '../api';
import { useAuth } from '../auth';
import { AreaChart, Bars } from '../charts';
import {
  Badge, EmptyState, Fecha, Money, Num, PageHeader, ProgressBar, SkeletonRows, StatCard, Tabs, useToast,
} from '../ui';

const PERIODOS = [
  { value: 'hoy', label: 'Hoy' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: 'mes', label: 'Este mes' },
];

function iso(date) { return date.toISOString().slice(0, 10); }

function rangoDe(periodo) {
  const hoy = iso(new Date());
  if (periodo === 'hoy') return { desde: hoy, hasta: hoy };
  if (periodo === 'mes') return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy };
  const dias = periodo === '7d' ? 7 : 30;
  return { desde: iso(new Date(Date.now() - (dias - 1) * 86400000)), hasta: hoy };
}

export default function MiReporte() {
  const toast = useToast();
  const { user } = useAuth();
  const [periodo, setPeriodo] = useState('30d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ventas');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const rango = rangoDe(periodo);
      const datos = await api.get(`/mi-reporte${qs({ ...rango, mes: iso(new Date()).slice(0, 7) })}`);
      setData(datos);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [periodo, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const ventas = data?.ventas || {};
  const objetivo = data?.objetivo || {};
  const entregas = data?.entregas || {};
  const cobranzas = data?.cobranzas || {};
  const devoluciones = data?.devoluciones || {};
  const visitas = data?.visitas || {};
  const serie = useMemo(() => (ventas.por_dia || []).map((d) => ({ ...d })), [ventas]);
  const serieCobros = useMemo(() => (cobranzas.por_dia || []).map((d) => ({ fecha: d.fecha, total: d.monto, pedidos: d.cobros, anterior: 0 })), [cobranzas]);
  const serieEntregas = useMemo(() => (entregas.por_dia || []).map((d) => ({ label: d.fecha.slice(5), value: d.entregadas || 0 })), [entregas]);
  const serieDevoluciones = useMemo(() => (devoluciones.por_dia || []).map((d) => ({ label: d.fecha.slice(5), value: d.unidades || 0 })), [devoluciones]);
  const productos = useMemo(() => (ventas.productos || []).slice(0, 8).map((p) => ({ label: p.nombre, value: p.cantidad })), [ventas]);

  if (loading && !data) return <><PageHeader eyebrow="Mi reporte" title="Cargando…" /><div className="panel"><SkeletonRows rows={8} /></div></>;

  return (
    <>
      <PageHeader
        eyebrow="Análisis / Mi reporte"
        title="Mi reporte"
        subtitle="Solo tus ventas, entregas, cobranzas y devoluciones. Nunca los resultados de otro compañero."
        actions={<>
          <select className="select" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>
            {PERIODOS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
        </>}
      />

      <div className="notice notice-info mb-16"><CheckCircle2 size={15} />
        Sesión de <strong>{data?.usuario?.nombre || user?.nombre}</strong> · {data?.rango?.desde} al {data?.rango?.hasta}
        {' · '}Datos filtrados por usuario y sucursal en el servidor.
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Mis ventas" value={<Money value={ventas.resumen?.total} />} icon={ShoppingCart} tone="orange" hint={`${ventas.resumen?.pedidos || 0} pedidos · ${ventas.resumen?.unidades || 0} unidades`} />
        <StatCard label="Mis clientes" value={<Num value={ventas.resumen?.clientes} />} icon={Users} tone="blue" hint={`Ticket Bs ${Number(ventas.resumen?.ticket || 0).toFixed(2)}`} />
        <StatCard label="Mi avance mensual" value={`${Number(objetivo.progreso || 0).toFixed(1)}%`} icon={Target} tone="green" hint={objetivo.asignado ? `Meta Bs ${Number(objetivo.meta || 0).toFixed(2)}` : 'Sin objetivo asignado'} />
        <StatCard label="Mis cobros" value={<Money value={cobranzas.resumen?.monto} />} icon={Wallet} tone="purple" hint={`${cobranzas.resumen?.cobros || 0} cobros registrados`} />
      </div>

      <div className="panel mb-16">
        <div className="panel-head">
          <div><h3><Target size={15} /> Mi objetivo de {objetivo.mes || ''}</h3><p>Ventas del mes frente a la meta asignada</p></div>
          <Badge tone={(objetivo.progreso || 0) >= 100 ? 'green' : (objetivo.progreso || 0) >= 60 ? 'blue' : 'amber'}>
            {Number(objetivo.progreso || 0).toFixed(1)}%
          </Badge>
        </div>
        <div className="panel-body">
          {!objetivo.asignado ? <EmptyState icon={Target} title="Sin objetivo asignado" message="Administración o supervisión aún no registró una meta para este mes." /> : (
            <>
              <ProgressBar value={Math.min(100, Number(objetivo.progreso || 0))} />
              <div className="grid grid-4 mt-16" style={{ gap: 10 }}>
                <div className="mini-stat"><span>Vendido en el mes</span><strong><Money value={objetivo.ventas_mes} /></strong></div>
                <div className="mini-stat"><span>Meta mensual</span><strong><Money value={objetivo.meta} /></strong></div>
                <div className="mini-stat"><span>Falta</span><strong className="text-orange"><Money value={objetivo.falta} /></strong></div>
                <div className="mini-stat"><span>Meta diaria</span><strong><Money value={objetivo.meta_diaria} /></strong></div>
              </div>
              {objetivo.meta_unidades > 0 && <p className="hint mt-8">Unidades: {objetivo.unidades_mes} de {objetivo.meta_unidades} ({Number(objetivo.progreso_unidades || 0).toFixed(1)}%).</p>}
            </>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Detalle de mi gestión</h3><p>Información exclusive de tu usuario</p></div></div>
        <div className="panel-body">
          <Tabs
            tabs={[
              { value: 'ventas', label: 'Mis ventas', count: ventas.resumen?.pedidos || 0, icon: ShoppingCart },
              { value: 'entregas', label: 'Mis entregas', count: entregas.resumen?.entregadas || 0, icon: Truck },
              { value: 'cobranzas', label: 'Mis cobranzas', count: cobranzas.resumen?.cobros || 0, icon: Wallet },
              { value: 'devoluciones', label: 'Mis devoluciones', count: devoluciones.resumen?.total || 0, icon: Undo2 },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'ventas' && (
            <div className="mt-16">
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div><h4 className="small muted mb-8">Mis ventas por día</h4>
                  {serie.length ? <AreaChart data={serie} height={260} showPrevious={false} /> : <EmptyState icon={ShoppingCart} title="Sin ventas" message="No registraste ventas en el período." />}
                </div>
                <div><h4 className="small muted mb-8">Productos que vendí</h4>
                  {productos.length ? <Bars items={productos} formatter={(v) => `${v} uds`} /> : <EmptyState icon={Package} title="Sin productos" message="Aún no vendiste productos en el período." />}
                </div>
              </div>
              <div className="inline mt-16 mb-8" style={{ gap: 8, flexWrap: 'wrap' }}>
                <Badge tone="blue"><CalendarCheck size={11} /> {visitas.total || 0} visitas propias</Badge>
                <Badge tone="green">{(visitas.con_pedido || 0)} con pedido</Badge>
                <Badge tone="amber">{(visitas.sin_pedido || 0)} sin pedido</Badge>
              </div>
              <Tabla
                titulo="Mis clientes"
                columnas={[{ k: 'cliente', label: 'Cliente' }, { k: 'pedidos', label: 'Pedidos', num: true }, { k: 'total', label: 'Monto', num: true, money: true }]}
                filas={ventas.clientes || []}
                vacio="Solo aparecen los clientes a los que vendiste tú."
              />
              <Tabla
                titulo="Mis pedidos recientes"
                columnas={[
                  { k: 'codigo', label: 'Pedido' }, { k: 'cliente', label: 'Cliente' },
                  { k: 'fecha', label: 'Fecha' }, { k: 'total', label: 'Total', num: true, money: true },
                  { k: 'estado', label: 'Estado' },
                ]}
                filas={ventas.recientes || []}
                vacio="Sin pedidos propios en este período."
              />
            </div>
          )}

          {tab === 'entregas' && (
            <div className="mt-16">
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div><h4 className="small muted mb-8">Entregas por día</h4>
                  {serieEntregas.length ? <Bars items={serieEntregas} formatter={(v) => `${v} entregas`} /> : <EmptyState icon={Truck} title="Sin entregas" message="No hay rutas asignadas a ti en el período." />}
                </div>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div className="mini-stat"><span>Paradas</span><strong>{entregas.resumen?.paradas || 0}</strong></div>
                  <div className="mini-stat"><span>Entregadas</span><strong>{entregas.resumen?.entregadas || 0}</strong></div>
                  <div className="mini-stat"><span>Fallidas</span><strong>{entregas.resumen?.fallidas || 0}</strong></div>
                  <div className="mini-stat"><span>Pendientes</span><strong>{entregas.resumen?.pendientes || 0}</strong></div>
                </div>
              </div>
              <Tabla
                titulo="Mis entregas"
                columnas={[
                  { k: 'codigo', label: 'Pedido' }, { k: 'cliente', label: 'Cliente' },
                  { k: 'fecha', label: 'Fecha' }, { k: 'estado', label: 'Resultado' },
                  { k: 'monto', label: 'Monto', num: true, money: true },
                ]}
                filas={entregas.recientes || []}
                vacio="Solo se listan entregas de tus propias rutas."
              />
            </div>
          )}

          {tab === 'cobranzas' && (
            <div className="mt-16">
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div><h4 className="small muted mb-8">Mis cobros por día</h4>
                  {serieCobros.length ? <AreaChart data={serieCobros} height={260} showPrevious={false} /> : <EmptyState icon={Wallet} title="Sin cobros" message="No registraste cobranzas en el período." />}
                </div>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div className="mini-stat"><span>Cobrado</span><strong><Money value={cobranzas.resumen?.monto} /></strong></div>
                  <div className="mini-stat"><span>Cobros</span><strong>{cobranzas.resumen?.cobros || 0}</strong></div>
                  <div className="mini-stat"><span>Cuentas pendientes</span><strong>{cobranzas.resumen?.cuentas_pendientes || 0}</strong></div>
                  <div className="mini-stat"><span>Saldo pendiente</span><strong><Money value={cobranzas.resumen?.saldo_pendiente} /></strong></div>
                </div>
              </div>
              <Tabla
                titulo="Mis comprobantes de cobro"
                columnas={[
                  { k: 'codigo', label: 'Comprobante' }, { k: 'cliente', label: 'Cliente' },
                  { k: 'pedido_codigo', label: 'Pedido' }, { k: 'fecha', label: 'Fecha' },
                  { k: 'monto', label: 'Monto', num: true, money: true },
                ]}
                filas={cobranzas.recientes || []}
                vacio="Aparecen únicamente los cobros registrados por ti."
              />
            </div>
          )}

          {tab === 'devoluciones' && (
            <div className="mt-16">
              <div className="grid grid-2" style={{ gap: 16 }}>
                <div><h4 className="small muted mb-8">Unidades devueltas por día</h4>
                  {serieDevoluciones.length ? <Bars items={serieDevoluciones} formatter={(v) => `${v} uds`} /> : <EmptyState icon={Undo2} title="Sin devoluciones" message="No registraste devoluciones en el período." />}
                </div>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div className="mini-stat"><span>Devoluciones</span><strong>{devoluciones.resumen?.total || 0}</strong></div>
                  <div className="mini-stat"><span>Unidades</span><strong>{devoluciones.resumen?.unidades || 0}</strong></div>
                  <div className="mini-stat"><span>Buenas</span><strong>{devoluciones.resumen?.buenas || 0}</strong></div>
                  <div className="mini-stat"><span>Dañadas</span><strong>{devoluciones.resumen?.danadas || 0}</strong></div>
                </div>
              </div>
              <Tabla
                titulo="Mis devoluciones"
                columnas={[
                  { k: 'codigo', label: 'Código' }, { k: 'cliente', label: 'Cliente' },
                  { k: 'fecha', label: 'Fecha' }, { k: 'estado', label: 'Estado' },
                  { k: 'unidades', label: 'Unidades', num: true },
                ]}
                filas={devoluciones.recientes || []}
                vacio="Solo se muestran tus propias devoluciones."
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Tabla({ titulo, columnas, filas, vacio }) {
  return (
    <div className="panel mt-16" style={{ boxShadow: 'none' }}>
      <div className="panel-head"><div><h3>{titulo}</h3></div><Badge tone="gray">{filas.length}</Badge></div>
      {!filas.length ? <div className="table-empty">{vacio}</div> : (
        <div className="table-wrap"><table className="data-table">
          <thead><tr>{columnas.map((c) => <th key={c.k} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr></thead>
          <tbody>{filas.map((f, i) => (
            <tr key={f.codigo || f.cliente || f.cliente_id || i}>
              {columnas.map((c) => {
                const valor = f[c.k];
                const contenido = c.k === 'fecha' && valor ? <Fecha value={valor} short /> : valor ?? '—';
                return <td key={c.k} className={c.num ? 'num' : ''}>{c.money ? <Money value={valor} /> : typeof valor === 'number' ? <Num value={valor} /> : contenido}</td>;
              })}
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </div>
  );
}
