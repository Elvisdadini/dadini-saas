import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, Calculator, CheckCircle2, ClipboardCheck, Download, Landmark, Receipt, RefreshCcw, Wallet,
} from 'lucide-react';
import { api, downloadCSV, qs } from '../api';
import { Badge, EmptyState, Fecha, Money, Num, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';

const hoy = () => new Date().toISOString().slice(0, 10);

export default function Contabilidad() {
  const toast = useToast();
  const [tab, setTab] = useState('resumen');
  const [desde, setDesde] = useState(new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy());
  const [fechaCaja, setFechaCaja] = useState(hoy());
  const [data, setData] = useState(null);
  const [cajas, setCajas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [libros, setLibros] = useState(null);
  const [impuestos, setImpuestos] = useState(null);
  const [seleccionPagos, setSeleccionPagos] = useState([]);
  const [seleccionGastos, setSeleccionGastos] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [res, cj, pg, gs, lb, im] = await Promise.all([
        api.get('/contabilidad'),
        api.get(`/contabilidad/cajas${qs({ fecha: fechaCaja })}`),
        api.get(`/contabilidad/pagos${qs({ desde, hasta })}`),
        api.get(`/contabilidad/gastos${qs({ desde, hasta })}`),
        api.get(`/contabilidad/libros${qs({ desde, hasta })}`),
        api.get(`/contabilidad/impuestos${qs({ mes: hasta.slice(0, 7) })}`),
      ]);
      setData(res);
      setCajas(cj.cajas || []);
      setPagos(pg.pagos || []);
      setGastos(gs.gastos || []);
      setLibros(lb);
      setImpuestos(im);
      setSeleccionPagos([]);
      setSeleccionGastos([]);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [desde, hasta, fechaCaja, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const validarCaja = async (caja) => {
    setBusy(true);
    try {
      await api.post(`/contabilidad/cajas/${caja.id}/validar`, { nota: 'Arqueo revisado y conforme' });
      toast(`Arqueo de ${caja.usuario_nombre} validado`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const validar = async (tipo) => {
    const seleccion = tipo === 'pagos' ? seleccionPagos : seleccionGastos;
    if (!seleccion.length) return toast('Selecciona al menos un comprobante.', 'error');
    setBusy(true);
    try {
      const r = await api.post(`/contabilidad/${tipo}/validar`, { ids: seleccion });
      toast(`${r.validados} comprobantes validados`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  if (loading && !data) return <><PageHeader eyebrow="Contabilidad" title="Cargando…" /><div className="panel"><SkeletonRows rows={8} /></div></>;

  const r = data?.resumen || {};

  return (
    <>
      <PageHeader eyebrow="Sistema / Contabilidad" title="Contabilidad"
        subtitle="Cierre y validación de arqueos, cobranzas, pagos y gastos; libros e impuestos de la empresa."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-soft" onClick={() => downloadCSV(`/contabilidad/libros/export${qs({ desde, hasta })}`, `libro-diario-${desde}-${hasta}.csv`)}><Download size={14} /> Exportar libro</button>
        </>}
      />

      <div className="field-row mb-16">
        <div className="field"><label>Desde</label><input className="input" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        <div className="field"><label>Hasta</label><input className="input" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        <div className="field"><label>Fecha de arqueos</label><input className="input" type="date" value={fechaCaja} onChange={(e) => setFechaCaja(e.target.value)} /></div>
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Arqueos por validar" value={<Num value={r.cajas_sin_validar} />} icon={ClipboardCheck} tone="amber" hint={`${r.cajas_cerradas || 0} cajas cerradas`} />
        <StatCard label="Pagos por validar" value={<Num value={r.pagos_sin_validar} />} icon={Receipt} tone="blue" hint={<Money value={r.monto_sin_validar} />} />
        <StatCard label="Gastos por validar" value={<Num value={r.gastos_sin_validar} />} icon={Wallet} tone="orange" hint={<Money value={r.monto_gastos_sin_validar} />} />
        <StatCard label="Facturado en el mes" value={<Money value={impuestos?.totales?.facturado} />} icon={Landmark} tone="green" hint={`IVA Bs ${Number(impuestos?.totales?.iva || 0).toFixed(2)} · IT Bs ${Number(impuestos?.totales?.it || 0).toFixed(2)}`} />
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Revisión contable</h3><p>Todo lo que registran las áreas debe pasar por contabilidad</p></div></div>
        <div className="panel-body">
          <Tabs
            tabs={[
              { value: 'resumen', label: 'Resumen' },
              { value: 'cajas', label: 'Arqueos', count: cajas.length },
              { value: 'pagos', label: 'Pagos y cobranzas', count: pagos.length },
              { value: 'gastos', label: 'Gastos', count: gastos.length },
              { value: 'libros', label: 'Libros' },
              { value: 'impuestos', label: 'Impuestos' },
            ]}
            active={tab}
            onChange={setTab}
          />

          {tab === 'resumen' && (
            <div className="grid grid-2 mt-16" style={{ gap: 12 }}>
              <div className="notice notice-warn"><CheckCircle2 size={15} /> El cierre y arqueo de caja lo realiza <b>contabilidad</b>. Vendedores, distribuidores y cobranzas pueden abrir y movimentar su caja, pero no cerrarla.</div>
              <div className="notice notice-info"><Calculator size={15} /> Cada cobranza, pago y gasto queda marcado como pendiente hasta que contabilidad lo valida y lo refleja en los libros.</div>
              <div className="mini-stat"><span>Cajas registradas</span><strong>{r.cajas_cerradas || 0} cerradas</strong></div>
              <div className="mini-stat"><span>Comprobantes revisados</span><strong>{(r.pagos_totales || 0) + (r.gastos_totales || 0)}</strong></div>
            </div>
          )}

          {tab === 'cajas' && (
            <div className="table-wrap mt-16"><table className="data-table">
              <thead><tr><th>Código</th><th>Responsable</th><th>Esperado</th><th>Declarado</th><th>Diferencia</th><th>Estado</th><th /></tr></thead>
              <tbody>{cajas.map((c) => <tr key={c.id}>
                <td className="cell-strong">{c.codigo}</td>
                <td>{c.usuario_nombre}</td>
                <td className="num"><Money value={c.saldo_esperado} /></td>
                <td className="num"><Money value={c.saldo_declarado} /></td>
                <td className="num"><Money value={c.diferencia} /></td>
                <td>{c.validado ? <Badge tone="green">Validada por {c.validado_nombre}</Badge> : <Badge tone={c.estado === 'cerrada' ? 'amber' : 'blue'}>{c.estado}</Badge>}</td>
                <td className="actions">{!c.validado && c.estado === 'cerrada' && <button className="btn btn-soft btn-sm" disabled={busy} onClick={() => validarCaja(c)}><CheckCircle2 size={12} /> Validar arqueo</button>}</td>
              </tr>)}</tbody>
            </table>{!cajas.length && <div className="table-empty">No hay cajas para esa fecha.</div>}</div>
          )}

          {tab === 'pagos' && (
            <>
              <div className="inline mb-12"><button className="btn btn-primary btn-sm" disabled={busy || !seleccionPagos.length} onClick={() => validar('pagos')}><CheckCircle2 size={12} /> Validar seleccionados ({seleccionPagos.length})</button></div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th /><th>Comprobante</th><th>Cliente</th><th>Pedido</th><th>Responsable</th><th>Fecha</th><th className="num">Monto</th><th>Validación</th></tr></thead>
                <tbody>{pagos.map((p) => <tr key={p.id}>
                  <td><input type="checkbox" disabled={Boolean(p.validado_por)} checked={seleccionPagos.includes(p.id)} onChange={() => setSeleccionPagos(seleccionPagos.includes(p.id) ? seleccionPagos.filter((x) => x !== p.id) : [...seleccionPagos, p.id])} /></td>
                  <td className="cell-strong">{p.numero_comprobante || p.codigo || '—'}</td>
                  <td>{p.cliente_nombre}</td><td>{p.pedido_codigo || '—'}</td><td>{p.usuario_nombre}</td>
                  <td><Fecha value={p.fecha} short /></td><td className="num"><Money value={p.monto} /></td>
                  <td>{p.validado ? <Badge tone="green">Validado</Badge> : <Badge tone="amber">Pendiente</Badge>}</td>
                </tr>)}</tbody>
              </table>{!pagos.length && <div className="table-empty">No hay pagos en el rango.</div>}</div>
            </>
          )}

          {tab === 'gastos' && (
            <>
              <div className="inline mb-12"><button className="btn btn-primary btn-sm" disabled={busy || !seleccionGastos.length} onClick={() => validar('gastos')}><CheckCircle2 size={12} /> Validar seleccionados ({seleccionGastos.length})</button></div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th /><th>Código</th><th>Tipo</th><th>Comprobante</th><th>Responsable</th><th>Fecha</th><th className="num">Monto</th><th>Validación</th></tr></thead>
                <tbody>{gastos.map((g) => <tr key={g.id}>
                  <td><input type="checkbox" disabled={Boolean(g.validado_por)} checked={seleccionGastos.includes(g.id)} onChange={() => setSeleccionGastos(seleccionGastos.includes(g.id) ? seleccionGastos.filter((x) => x !== g.id) : [...seleccionGastos, g.id])} /></td>
                  <td className="cell-strong">{g.codigo}</td><td>{g.tipo}</td><td>{g.comprobante || '—'}</td>
                  <td>{g.usuario_nombre}</td><td><Fecha value={g.fecha} short /></td><td className="num"><Money value={g.monto} /></td>
                  <td>{g.validado ? <Badge tone="green">Validado</Badge> : <Badge tone="amber">Pendiente</Badge>}</td>
                </tr>)}</tbody>
              </table>{!gastos.length && <div className="table-empty">No hay gastos en el rango.</div>}</div>
            </>
          )}

          {tab === 'libros' && (
            <>
              <div className="inline mb-12"><Badge tone="blue">Debe Bs {Number(libros?.totales?.debe || 0).toFixed(2)}</Badge><Badge tone="green">Haber Bs {Number(libros?.totales?.haber || 0).toFixed(2)}</Badge></div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Fecha</th><th>Cuenta</th><th>Detalle</th><th className="num">Debe</th><th className="num">Haber</th></tr></thead>
                <tbody>{(libros?.libros || []).map((f, i) => <tr key={i}>
                  <td>{f.fecha}</td><td>{f.cuenta}</td><td>{f.detalle}</td>
                  <td className="num"><Money value={f.debe} /></td><td className="num"><Money value={f.haber} /></td>
                </tr>)}</tbody>
              </table>{!libros?.libros?.length && <div className="table-empty">Sin movimientos en el rango.</div>}</div>
            </>
          )}

          {tab === 'impuestos' && (
            <>
              <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
                <div className="mini-stat"><span>Facturado</span><strong><Money value={impuestos?.totales?.facturado} /></strong></div>
                <div className="mini-stat"><span>IVA</span><strong><Money value={impuestos?.totales?.iva} /></strong></div>
                <div className="mini-stat"><span>IT</span><strong><Money value={impuestos?.totales?.it} /></strong></div>
              </div>
              <div className="notice notice-info mb-16"><BookOpen size={15} /> Normativa fiscal vigente: {impuestos?.normativa || 'registro interno'}.</div>
              <div className="table-wrap"><table className="data-table">
                <thead><tr><th>Factura</th><th>Fecha</th><th>Cliente</th><th className="num">Total</th><th className="num">IVA</th><th className="num">IT</th><th>Estado</th></tr></thead>
                <tbody>{(impuestos?.facturas || []).map((f, i) => <tr key={i}>
                  <td className="cell-strong">{f.numero}</td><td><Fecha value={f.fecha} short /></td><td>{f.cliente}</td>
                  <td className="num"><Money value={f.total} /></td><td className="num"><Money value={f.iva} /></td><td className="num"><Money value={f.it} /></td>
                  <td><Badge tone={f.estado === 'vigente' ? 'green' : 'amber'}>{f.estado}</Badge></td>
                </tr>)}</tbody>
              </table>{!impuestos?.facturas?.length && <div className="table-empty">No hay facturas en ese mes.</div>}</div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
