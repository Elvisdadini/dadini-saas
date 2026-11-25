import { useCallback, useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, CheckCircle2, Lock, RefreshCcw, Wallet } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import { Money, Num } from '../ui';

const VACIO_APERTURA = { saldo_inicial: 0, notas: '' };
const VACIO_CIERRE = { saldo_declarado: '', notas: '' };
const VACIO_MOV = { tipo: 'ingreso', monto: '', motivo: '' };

export default function Caja() {
  const toast = useToast();
  const [actual, setActual] = useState(null);
  const [resumen, setResumen] = useState(null);
  const [fecha, setFecha] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(VACIO_APERTURA);
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [a, r] = await Promise.all([
        api.get('/caja/actual'),
        api.get(`/caja/resumen?fecha=${fecha}`),
      ]);
      setActual(a.caja);
      setResumen(r);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [fecha, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (tipo) => {
    setModal(tipo);
    if (tipo === 'apertura') setForm(VACIO_APERTURA);
    if (tipo === 'cierre') setForm({ ...VACIO_CIERRE, saldo_declarado: actual?.saldo_esperado ?? 0 });
    if (tipo === 'movimiento') setForm(VACIO_MOV);
  };

  const guardar = async () => {
    setBusy(true);
    try {
      if (modal === 'apertura') {
        await api.post('/caja/apertura', { saldo_inicial: Number(form.saldo_inicial) || 0, notas: form.notas });
        toast('Caja abierta');
      } else if (modal === 'cierre') {
        await api.post('/caja/cierre', { saldo_declarado: Number(form.saldo_declarado) || 0, notas: form.notas });
        toast('Caja cerrada y arqueada');
      } else {
        await api.post('/caja/movimiento', { tipo: form.tipo, monto: Number(form.monto) || 0, motivo: form.motivo });
        toast('Movimiento registrado en caja');
      }
      setModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const cajas = resumen?.cajas || [];

  return (
    <>
      <PageHeader
        eyebrow="Operación / Tesorería"
        title="Caja y arqueo"
        subtitle="Abre tu caja, registra ingresos y egresos, y cierra con el saldo declarado."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          {actual
            ? <><button className="btn btn-soft" onClick={() => abrir('movimiento')}><Wallet size={14} /> Agregar movimiento</button><button className="btn btn-primary" onClick={() => abrir('cierre')}><Lock size={14} /> Cerrar caja</button></>
            : <button className="btn btn-primary" onClick={() => abrir('apertura')}><Wallet size={14} /> Abrir caja</button>}
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Saldo inicial" value={<Money value={actual?.saldo_inicial} />} icon={Wallet} tone="blue" />
        <StatCard label="Ingresos" value={<Money value={actual?.ingresos} />} icon={ArrowDownToLine} tone="green" />
        <StatCard label="Egresos" value={<Money value={actual?.egresos} />} icon={ArrowUpFromLine} tone="amber" />
        <StatCard label="Saldo esperado" value={<Money value={actual?.saldo_esperado} />} icon={Wallet} tone="purple" />
      </div>

      {loading ? <div className="panel"><SkeletonRows rows={6} /></div> : (
        <>
          <div className="panel mb-16">
            <div className="panel-head">
              <div><h3>Mi caja</h3><p>{actual ? `Abierta ${actual.codigo} · ${new Date(actual.apertura_en).toLocaleString('es-BO')}` : 'No tienes una caja abierta hoy'}</p></div>
              {actual && <Badge tone="green">Abierta</Badge>}
            </div>
            <div className="panel-body">
              {!actual ? (
                <EmptyState icon={Wallet} title="Caja cerrada" message="Abre tu caja para registrar cobros y movimientos. El primer cobro la abre automáticamente en Bs 0." />
              ) : (
                <>
                  <div className="grid grid-3" style={{ gap: 10 }}>
                    <div className="mini-stat"><span>Ingresos</span><strong><Money value={actual.ingresos} /></strong></div>
                    <div className="mini-stat"><span>Egresos</span><strong><Money value={actual.egresos} /></strong></div>
                    <div className="mini-stat"><span>Saldo esperado</span><strong><Money value={actual.saldo_esperado} /></strong></div>
                  </div>
                  <div className="table-wrap mt-16">
                    <table className="data-table">
                      <thead><tr><th>Fecha</th><th>Tipo</th><th>Motivo</th><th>Referencia</th><th className="num">Monto</th></tr></thead>
                      <tbody>
                        {(actual.movimientos || []).map((m) => (
                          <tr key={m.id}>
                            <td><Fecha value={m.fecha} time /></td>
                            <td><Badge tone={m.tipo === 'ingreso' ? 'green' : 'amber'}>{m.tipo}</Badge></td>
                            <td>{m.motivo || '—'}</td>
                            <td>{m.referencia || '—'}</td>
                            <td className="num"><strong>{m.tipo === 'ingreso' ? '+' : '-'}<Money value={m.monto} /></strong></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!(actual.movimientos || []).length && <div className="table-empty">Sin movimientos todavía.</div>}
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div><h3>Arqueo del día</h3><p>Fecha: {fecha}</p></div>
              <input type="date" className="input" style={{ width: 160 }} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Código</th><th>Estado</th><th className="num">Inicial</th><th className="num">Esperado</th><th className="num">Declarado</th><th className="num">Diferencia</th></tr></thead>
                <tbody>
                  {cajas.map((c) => (
                    <tr key={c.id}>
                      <td className="cell-strong">{c.codigo}</td>
                      <td><Badge tone={c.estado === 'abierta' ? 'green' : 'gray'}>{c.estado}</Badge></td>
                      <td className="num"><Money value={c.saldo_inicial} /></td>
                      <td className="num"><Money value={c.saldo_esperado} /></td>
                      <td className="num">{c.saldo_declarado !== undefined ? <Money value={c.saldo_declarado} /> : '—'}</td>
                      <td className="num">
                        {c.diferencia !== undefined
                          ? <span className={Math.abs(c.diferencia) < 0.01 ? 'text-green' : 'text-red'}><Num value={c.diferencia} /> Bs</span>
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!cajas.length && <div className="table-empty">Sin cajas para esta fecha.</div>}
            </div>
          </div>
        </>
      )}

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'apertura' ? 'Abrir caja' : modal === 'cierre' ? 'Cerrar y arquear caja' : 'Agregar movimiento'}
        footer={<><button className="btn btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar'}</button></>}
      >
        <div className="form-stack">
          {modal === 'apertura' && (
            <>
              <div className="field"><label>Saldo inicial (Bs)</label><input className="input" type="number" step="0.01" value={form.saldo_inicial} onChange={(e) => setForm({ ...form, saldo_inicial: e.target.value })} /></div>
              <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Ej. efectivo en caja al iniciar" /></div>
            </>
          )}
          {modal === 'cierre' && (
            <>
              <div className="notice notice-info"><CheckCircle2 size={14} /> Saldo esperado: Bs <Num value={actual?.saldo_esperado || 0} />. Declara el efectivo real para calcular la diferencia.</div>
              <div className="field"><label>Saldo declarado (Bs)</label><input className="input" type="number" step="0.01" value={form.saldo_declarado} onChange={(e) => setForm({ ...form, saldo_declarado: e.target.value })} /></div>
              <div className="field"><label>Notas de cierre</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
            </>
          )}
          {modal === 'movimiento' && (
            <>
              <div className="field"><label>Tipo</label><select className="select" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}><option value="ingreso">Ingreso</option><option value="egreso">Egreso</option></select></div>
              <div className="field"><label>Monto (Bs)</label><input className="input" type="number" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
              <div className="field"><label>Motivo</label><input className="input" value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ej. pago a proveedor, cambio, etc." /></div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
