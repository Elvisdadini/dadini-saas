import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Award, CalendarClock, Clock3, Download, HeartHandshake, MessageCircle, Package,
  RefreshCcw, Search, ShieldAlert, Sparkles, Star, TrendingUp, UserRound, Users, Wallet, Zap,
} from 'lucide-react';
import { api, qs } from '../api';
import { useAuth, puede } from '../auth';
import {
  Avatar, Badge, Confirm, EmptyState, Fecha, Modal, Money, Num, PageHeader,
  SkeletonRows, StatCard, Tabs, useToast,
} from '../ui';
import BotonWhatsapp from '../components/BotonWhatsapp';

const FILTROS_VACIOS = { search: '', segmento: 'todos', zona: '', vendedor_id: '', tipo: 'todos', riesgo: 'todos', sort: 'score' };

const TONES = {
  Campeones: 'green', Leales: 'blue', 'Potencial leal': 'purple', Nuevos: 'green', Prometedores: 'blue',
  'Necesitan atención': 'amber', Hibernando: 'orange', 'En riesgo': 'red', Perdidos: 'red', 'Sin actividad': 'gray',
};

function RFM({ value, label }) {
  const tone = value >= 4 ? 'good' : value >= 3 ? 'warn' : 'bad';
  return (
    <span className="rfm-score" title={`${label}: ${value}/5`}>
      <span className="rfm-track"><span className={`rfm-fill ${value ? tone : ''}`} style={{ width: `${Math.max(4, value * 20)}%` }} /></span>
      <span className="rfm-value">{value}</span>
    </span>
  );
}

function exportarCSV(clientes) {
  const columnas = ['Codigo', 'Cliente', 'Segmento', 'Score', 'R', 'F', 'M', 'Recencia dias', 'Pedidos', 'Compras 12m', 'Saldo', 'Zona', 'Vendedor'];
  const filas = clientes.map((c) => [
    c.codigo, c.nombre, c.segmento, c.score, c.score_r, c.score_f, c.score_m,
    c.recencia_dias ?? '', c.frecuencia, c.monetario_12m.toFixed(2), c.saldo.toFixed(2), c.zona,
  ]);
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = `\uFEFF${[columnas, ...filas].map((f) => f.map(esc).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'dadini-crm-rfm.csv'; a.click();
  URL.revokeObjectURL(url);
}

export default function CRM() {
  const toast = useToast();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [data, setData] = useState(null);
  const [catalogo, setCatalogo] = useState({ zonas: [], vendedores: [] });
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('resumen');
  const [nota, setNota] = useState({ texto: '', tipo: 'seguimiento' });
  const [notaEliminar, setNotaEliminar] = useState(null);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setData(await api.get(`/crm/clientes${qs(filtros)}`)); }
    catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    api.get('/clientes').then((r) => setCatalogo({ zonas: r.zonas || [], vendedores: r.vendedores || [] })).catch(() => {});
  }, []);

  const cargarDetalle = useCallback(async (id) => {
    if (!id) { setDetail(null); return; }
    try {
      const d = await api.get(`/crm/clientes/${id}`);
      setDetail(d);
      setTab('resumen');
    } catch (error) { toast(error.message, 'error'); }
  }, [toast]);

  useEffect(() => { cargarDetalle(params.get('cliente')); }, [params, cargarDetalle]);

  const abrir = (id) => setParams({ cliente: id });
  const cerrar = () => setParams({}, { replace: true });

  const guardarNota = async () => {
    setBusy(true);
    try {
      await api.post(`/crm/clientes/${detail.cliente.id}/notas`, nota);
      toast('Nota de seguimiento guardada');
      setNota({ texto: '', tipo: 'seguimiento' });
      await cargarDetalle(detail.cliente.id);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const borrarNota = async () => {
    try {
      await api.del(`/crm/notas/${notaEliminar.id}`);
      toast('Nota eliminada');
      setNotaEliminar(null);
      await cargarDetalle(detail.cliente.id);
    } catch (error) { toast(error.message, 'error'); }
  };

  const resumen = data?.resumen || {};
  const clientes = data?.clientes || [];
  const segmentos = data?.segmentos || [];
  const puedeNotas = puede(user, 'clientes');

  return (
    <>
      <PageHeader
        eyebrow="Inteligencia de negocio / Clientes"
        title="CRM 360"
        subtitle="Scoring RFM por cliente: quién compra más, quién se está yendo y qué hacer con cada uno."
        actions={<>
          <Link className="btn btn-outline" to="/clientes"><UserRound size={14} /> Clientes</Link>
          <button className="btn btn-outline" onClick={() => exportarCSV(clientes)} disabled={!clientes.length}><Download size={14} /> Exportar</button>
          <button className="btn btn-primary" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Clientes activos" value={<Num value={resumen.total} />} icon={Users} tone="blue" hint={`Score promedio ${resumen.score_promedio || 0}`} />
        <StatCard label="Campeones" value={<Num value={resumen.campeones} />} icon={Award} tone="green" hint="RFM alto: cuidar y fidelizar" />
        <StatCard label="En riesgo / perdidos" value={<Num value={resumen.en_riesgo} />} icon={ShieldAlert} tone="red" hint={`${resumen.en_mora || 0} con deuda vencida`} />
        <StatCard label="Cartera por cobrar" value={<Money value={resumen.cartera} />} icon={Wallet} tone="orange" hint={<>{<Money value={resumen.vencido} />} vencido</>} />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Segmentos RFM</h3><p>Haz clic en un segmento para filtrar la tabla</p></div><Badge tone="blue">{clientes.length} clientes</Badge></div>
        <div className="panel-body">
          <div className="filters">
            {segmentos.map((s) => (
              <button key={s} className={`chip ${filtros.segmento === s ? 'active' : ''}`} onClick={() => setFiltros({ ...filtros, segmento: filtros.segmento === s ? 'todos' : s })}>
                {s}<b>{(resumen.por_segmento || {})[s] || 0}</b>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Filtros</h3><p>Búsqueda, zona, vendedor y orden</p></div></div>
        <div className="panel-body">
          <div className="filters">
            <div className="search-box"><Search size={14} /><input className="input" placeholder="Buscar cliente, código, zona o teléfono" value={filtros.search} onChange={(e) => setFiltros({ ...filtros, search: e.target.value })} /></div>
            <select className="select" value={filtros.zona} onChange={(e) => setFiltros({ ...filtros, zona: e.target.value })}><option value="">Todas las zonas</option>{catalogo.zonas.map((z) => <option key={z} value={z}>{z}</option>)}</select>
            <select className="select" value={filtros.vendedor_id} onChange={(e) => setFiltros({ ...filtros, vendedor_id: e.target.value })}><option value="">Todos los vendedores</option>{catalogo.vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}</select>
            <select className="select" value={filtros.riesgo} onChange={(e) => setFiltros({ ...filtros, riesgo: e.target.value })}><option value="todos">Sin filtro de riesgo</option><option value="mora">Con deuda vencida</option><option value="sin_actividad">Sin actividad</option></select>
            <select className="select" value={filtros.sort} onChange={(e) => setFiltros({ ...filtros, sort: e.target.value })}><option value="score">Mayor score</option><option value="recencia">Más recientes</option><option value="monetario">Mayor compra 12m</option><option value="frecuencia">Más frecuentes</option><option value="saldo">Mayor saldo</option></select>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Ranking de clientes</h3><p>R = recencia · F = frecuencia · M = monetario (1 a 5)</p></div><Badge tone="orange">Score RFM</Badge></div>
        {loading && !data ? <div className="panel-body"><SkeletonRows rows={8} /></div> : !clientes.length ? <EmptyState icon={Users} title="Sin clientes con estos filtros" message="Prueba cambiando el segmento o la búsqueda." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Cliente</th><th>Segmento</th><th>RFM</th><th className="num">Recencia</th><th className="num">Pedidos / 12m</th><th className="num">Compras 12m</th><th className="num">Saldo</th><th className="num">Prioridad</th><th /></tr></thead>
              <tbody>
                {clientes.map((c) => (
                  <tr key={c.id}>
                    <td className="cell-strong"><span className="inline"><Avatar name={c.nombre} size={28} tone={TONES[c.segmento] === 'green' ? 'green' : 'navy'} /> {c.nombre}</span><span className="cell-sub">{c.codigo} · {c.zona || 'Sin zona'}{c.en_mora ? ' · ⚠ en mora' : ''}</span></td>
                    <td><Badge tone={TONES[c.segmento] || 'gray'}>{c.segmento}</Badge></td>
                    <td><span className="inline" style={{ gap: 8 }}><RFM value={c.score_r} label="Recencia" /><RFM value={c.score_f} label="Frecuencia" /><RFM value={c.score_m} label="Monetario" /><b className="small">{c.score}</b></span></td>
                    <td className="num">{c.recencia_dias === null ? '—' : `${c.recencia_dias} d`}<span className="cell-sub">{c.ultima_compra ? <Fecha value={c.ultima_compra} short /> : 'Sin compras'}</span></td>
                    <td className="num">{c.frecuencia}<span className="cell-sub">{c.frecuencia_12m} en 12m</span></td>
                    <td className="num"><Money value={c.monetario_12m} /><span className="cell-sub">Ticket <Money value={c.ticket_promedio} /></span></td>
                    <td className="num"><Money value={c.saldo} />{c.en_mora && <span className="cell-sub">Vencido <Money value={c.vencido} /></span>}</td>
                    <td className="num"><Badge tone={c.prioridad >= 5 ? 'red' : c.prioridad >= 4 ? 'amber' : c.prioridad >= 3 ? 'blue' : 'green'}>P{c.prioridad}</Badge></td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" onClick={() => abrir(c.id)}><Sparkles size={12} /> Ver 360</button>
                      <BotonWhatsapp tipo="otro" clienteId={c.id} telefono={c.whatsapp} mensaje={`Hola ${c.nombre}, desde DADINI queremos recordarte que estamos listos para ayudarte con tu próximo pedido. ¿Te agendamos una visita?`} label="Contactar" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(detail)} onClose={cerrar} title={detail?.cliente?.nombre || 'Cliente'} subtitle={detail ? `${detail.cliente.codigo} · ${detail.cliente.tipo} · ${detail.cliente.zona || 'Sin zona'}` : ''} size="xl"
        footer={<><button className="btn btn-ghost" onClick={cerrar}>Cerrar</button><Link className="btn btn-outline" to={`/ventas/nueva?cliente=${detail?.cliente?.id || ''}`}><Package size={14} /> Nueva venta</Link><Link className="btn btn-outline" to={`/cobranzas?cliente=${detail?.cliente?.id || ''}`}><Wallet size={14} /> Cobranzas</Link></>}
      >
        {detail && (
          <div className="form-stack">
            <div className="notice notice-info"><Sparkles size={15} /> <strong>{detail.rfm.segmento}</strong> · Score {detail.rfm.score}/100. {detail.rfm.accion}</div>
            <div className="summary-box">
              <div className="grid grid-2" style={{ gap: 10 }}>
                <div className="mini-stat"><span>Recencia (R)</span><strong><RFM value={detail.rfm.score_r} label="Recencia" /> {detail.rfm.score_r}/5</strong><span className="hint">{detail.rfm.recencia_dias === null ? 'Sin compras' : `${detail.rfm.recencia_dias} días desde la última`}</span></div>
                <div className="mini-stat"><span>Frecuencia (F)</span><strong><RFM value={detail.rfm.score_f} label="Frecuencia" /> {detail.rfm.score_f}/5</strong><span className="hint">{detail.rfm.frecuencia_12m} compras en 12 meses</span></div>
                <div className="mini-stat"><span>Monetario (M)</span><strong><RFM value={detail.rfm.score_m} label="Monetario" /> {detail.rfm.score_m}/5</strong><span className="hint"><Money value={detail.rfm.monetario_12m} /> en 12 meses</span></div>
                <div className="mini-stat"><span>Prioridad de acción</span><strong>P{detail.rfm.prioridad}</strong><span className="hint">{detail.rfm.en_mora ? `${detail.rfm.facturas_vencidas} factura(s) vencida(s)` : 'Sin deuda vencida'}</span></div>
              </div>
            </div>
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { value: 'resumen', label: 'Resumen' },
                { value: 'pedidos', label: 'Pedidos', count: detail.pedidos.length },
                { value: 'visitas', label: 'Visitas', count: detail.visitas.length },
                { value: 'cobros', label: 'Cobros', count: detail.pedidos.filter((p) => p.saldo > 0).length },
                { value: 'notas', label: 'Notas', count: detail.notas.length },
              ]}
            />

            {tab === 'resumen' && (
              <div className="grid grid-2" style={{ gap: 12 }}>
                <div className="panel">
                  <div className="panel-head"><div><h3>Momento de recompra</h3><p>Según el ciclo histórico del cliente</p></div><CalendarClock size={15} /></div>
                  <div className="panel-body">
                    <div className="form-stack">
                      <div className="split"><span className="small muted">Ciclo promedio</span><strong>{detail.rfm.ciclo_dias} días</strong></div>
                      <div className="split"><span className="small muted">Próxima visita sugerida</span><strong>{detail.rfm.proxima_compra_sugerida ? <Fecha value={detail.rfm.proxima_compra_sugerida} /> : '—'}</strong></div>
                      <div className="split"><span className="small muted">Última compra</span><strong>{detail.rfm.ultima_compra ? <Fecha value={detail.rfm.ultima_compra} time /> : '—'}</strong></div>
                      <div className="split"><span className="small muted">Ticket promedio</span><strong><Money value={detail.rfm.ticket_promedio} /></strong></div>
                      <div className="split"><span className="small muted">Compras históricas</span><strong><Money value={detail.resumen.total_comprado} /></strong></div>
                      <BotonWhatsapp tipo="otro" clienteId={detail.cliente.id} telefono={detail.cliente.whatsapp || detail.cliente.telefono} mensaje={`Hola ${detail.cliente.nombre}, tu última compra fue hace ${detail.rfm.recencia_dias ?? 0} días. ¿Quieres que te llevemos una nueva propuesta de DADINI?`} label="Reactivar por WhatsApp" />
                    </div>
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-head"><div><h3>Productos favoritos</h3><p>Lo más comprado por este cliente</p></div><Star size={15} /></div>
                  {!detail.productos_favoritos.length ? <div className="table-empty">Sin productos registrados.</div> : (
                    <div className="table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th className="num">Unidades</th><th className="num">Monto</th></tr></thead><tbody>
                      {detail.productos_favoritos.map((p) => <tr key={p.producto_id}><td className="cell-strong">{p.nombre}</td><td className="num">{p.cantidad}</td><td className="num"><Money value={p.total} /></td></tr>)}
                    </tbody></table></div>
                  )}
                </div>
              </div>
            )}

            {tab === 'pedidos' && (!detail.pedidos.length ? <EmptyState icon={Package} title="Sin pedidos" message="Este cliente todavía no tiene compras registradas." /> : (
              <div className="table-wrap"><table className="data-table"><thead><tr><th>Código</th><th>Fecha</th><th>Estado</th><th className="num">Total</th><th className="num">Saldo</th><th>Vencimiento</th></tr></thead><tbody>
                {detail.pedidos.map((p) => <tr key={p.id}><td className="cell-strong"><Link to={`/ventas/${p.id}`}>{p.codigo}</Link></td><td><Fecha value={p.created_at} /></td><td><Badge tone={p.estado === 'cancelado' ? 'red' : p.estado_pago === 'pagado' ? 'green' : 'amber'}>{p.estado_pago === 'pagado' ? 'Pagado' : p.estado}</Badge></td><td className="num"><Money value={p.total} /></td><td className="num"><Money value={p.saldo} /></td><td>{p.vencido ? <Badge tone="red">Vencido {p.dias_vencido}d</Badge> : p.vencimiento ? <Fecha value={p.vencimiento} /> : '—'}</td></tr>)}
              </tbody></table></div>
            ))}

            {tab === 'visitas' && (!detail.visitas.length ? <EmptyState icon={CalendarClock} title="Sin visitas" message="Registra una visita desde la ficha de clientes." /> : (
              <div className="timeline">
                {detail.visitas.slice(0, 20).map((v) => (
                  <div className="timeline-item" key={v.id}>
                    <span className={`timeline-dot ${v.estado === 'completada' ? 'done' : 'current'}`}><CalendarClock size={12} /></span>
                    <div className="timeline-copy"><strong>{v.tipo} · {v.resultado || v.estado}</strong><span><Fecha value={v.fecha} time /> · {v.usuario_nombre} {[v.motivo, v.notas].filter(Boolean).join(' · ')}</span></div>
                  </div>
                ))}
              </div>
            ))}

            {tab === 'cobros' && (
              <div className="form-stack">
                {!detail.pedidos.some((p) => p.saldo > 0) ? <EmptyState icon={Wallet} title="Sin saldo pendiente" message="Este cliente está al día." /> : (
                  <div className="table-wrap"><table className="data-table"><thead><tr><th>Pedido</th><th className="num">Saldo</th><th className="num">A cobrar</th><th className="num">Días vencido</th><th /></tr></thead><tbody>
                    {detail.pedidos.filter((p) => p.saldo > 0).map((p) => <tr key={p.id}><td className="cell-strong">{p.codigo}</td><td className="num"><Money value={p.saldo} /></td><td className="num"><Money value={p.total_a_cobrar} /></td><td className="num">{p.dias_vencido || 0}</td><td className="actions"><BotonWhatsapp tipo="cobranza" clienteId={detail.cliente.id} pedidoId={p.id} telefono={detail.cliente.whatsapp || detail.cliente.telefono} monto={p.total_a_cobrar || p.saldo} label="Cobrar" /></td></tr>)}
                  </tbody></table></div>
                )}
                {detail.pagos.length > 0 && (
                  <div className="panel"><div className="panel-head"><div><h3>Últimos pagos</h3><p>{detail.pagos.length} registros</p></div></div>
                    <div className="table-wrap"><table className="data-table"><thead><tr><th>Fecha</th><th className="num">Monto</th><th>Método</th><th>Pedido</th><th>Usuario</th></tr></thead><tbody>
                      {detail.pagos.slice(0, 12).map((p) => <tr key={p.id}><td><Fecha value={p.fecha} time /></td><td className="num"><Money value={p.monto} /></td><td>{p.metodo || '—'}</td><td>{p.pedido_codigo || '—'}</td><td>{p.usuario_nombre}</td></tr>)}
                    </tbody></table></div>
                  </div>
                )}
              </div>
            )}

            {tab === 'notas' && (
              <div className="form-stack">
                {puedeNotas && (
                  <div className="summary-box">
                    <div className="field"><label>Nueva nota de seguimiento</label><textarea className="textarea" value={nota.texto} onChange={(e) => setNota({ ...nota, texto: e.target.value })} placeholder="Ej. Llamar el lunes para confirmar recompra de ANIMALOKOS" /></div>
                    <div className="field"><label>Tipo</label><select className="select" value={nota.tipo} onChange={(e) => setNota({ ...nota, tipo: e.target.value })}><option value="seguimiento">Seguimiento</option><option value="llamada">Llamada</option><option value="visita">Visita</option><option value="cobranza">Cobranza</option></select></div>
                    <button className="btn btn-primary" onClick={guardarNota} disabled={busy || !nota.texto.trim()}>{busy ? 'Guardando…' : 'Guardar nota'}</button>
                  </div>
                )}
                {!detail.notas.length ? <EmptyState icon={HeartHandshake} title="Sin notas" message="Registra el seguimiento comercial de este cliente." /> : (
                  <div className="timeline">
                    {detail.notas.map((n) => (
                      <div className="timeline-item" key={n.id}>
                        <span className="timeline-dot done"><HeartHandshake size={12} /></span>
                        <div className="timeline-copy"><strong>{n.tipo} · {n.usuario_nombre}</strong><span><Fecha value={n.fecha} time /> · {n.texto}</span></div>
                        {puedeNotas && <button className="icon-btn danger" onClick={() => setNotaEliminar(n)}>×</button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
      <Confirm open={Boolean(notaEliminar)} onClose={() => setNotaEliminar(null)} onConfirm={borrarNota} title="Eliminar nota" message={`¿Eliminar la nota del ${notaEliminar ? new Date(notaEliminar.fecha).toLocaleDateString('es-BO') : ''}?`} danger />
    </>
  );
}
