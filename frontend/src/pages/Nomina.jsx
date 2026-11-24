import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Pencil, Plus, Printer, RefreshCcw, Settings2, Users } from 'lucide-react';
import { api } from '../api';
import BotonWhatsapp from '../components/BotonWhatsapp';
import SelectorEmpleadosWhatsapp from '../components/SelectorEmpleadosWhatsapp';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const mesActual = () => new Date().toISOString().slice(0, 7);

export default function Nomina() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [periodo, setPeriodo] = useState(mesActual());
  const [loading, setLoading] = useState(true);
  const [boleta, setBoleta] = useState(null);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [empleados, setEmpleados] = useState([]);
  const [conceptos, setConceptos] = useState([]);
  const [configModal, setConfigModal] = useState(null);
  const [configForm, setConfigForm] = useState({});
  const [conceptoForm, setConceptoForm] = useState({ nombre: '', tipo: 'bono', base: 'fijo', monto: '', porcentaje: '' });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [b, u, c] = await Promise.all([
        api.get(`/nomina/boletas?periodo=${periodo}`),
        api.get('/usuarios'),
        api.get('/nomina/conceptos'),
      ]);
      setData(b);
      setEmpleados((u.usuarios || []).filter((x) => x.activo && !['admin', 'dueno'].includes(x.rol)));
      setConceptos(c.conceptos || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [periodo, toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const generar = async () => {
    setBusy(true);
    try {
      const r = await api.post('/nomina/generar', { periodo });
      toast(`Planilla generada · ${r.boletas.length} boletas`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const pagar = async (b) => {
    try {
      await api.patch(`/nomina/boletas/${b.id}/pagar`, { metodo: 'efectivo' });
      toast('Boleta marcada como pagada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const abrirConfig = (empleado) => {
    setConfigModal(empleado);
    setConfigForm({
      salario_base: empleado.salario_base || 0,
      comision_venta_pct: empleado.comision_venta_pct || 0,
      comision_distribucion_pct: empleado.comision_distribucion_pct || 0,
      bono_fijo: empleado.bono_fijo || 0,
      descuento_fijo: empleado.descuento_fijo || 0,
      antiguedad_anios: empleado.antiguedad_anios || 0,
    });
    setConceptoForm({ nombre: '', tipo: 'bono', base: 'fijo', monto: '', porcentaje: '' });
  };

  const guardarConfig = async () => {
    setBusy(true);
    try {
      await api.put(`/usuarios/${configModal.id}`, configForm);
      toast('Configuración salarial guardada');
      setConfigModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const agregarConcepto = async () => {
    if (!conceptoForm.nombre) return toast('Nombre del concepto obligatorio.', 'error');
    setBusy(true);
    try {
      await api.post('/nomina/conceptos', {
        ...conceptoForm,
        usuario_id: configModal.id,
        monto: Number(conceptoForm.monto) || 0,
        porcentaje: Number(conceptoForm.porcentaje) || 0,
      });
      setConceptoForm({ nombre: '', tipo: 'bono', base: 'fijo', monto: '', porcentaje: '' });
      toast('Concepto agregado al empleado');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const eliminarConcepto = async (id) => {
    try {
      await api.del(`/nomina/conceptos/${id}`);
      toast('Concepto eliminado');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const r = data?.resumen || {};
  const mensajeBoleta = boleta
    ? `Hola ${boleta.empleado}, adjunto tu boleta de pago ${boleta.codigo} del período ${boleta.periodo}. Total: Bs ${boleta.total.toFixed(2)}. Salario base Bs ${boleta.salario_base.toFixed(2)}, comisiones Bs ${(boleta.comision_ventas + boleta.comision_distribucion).toFixed(2)}, bono Bs ${boleta.bono.toFixed(2)}, descuento Bs ${boleta.descuento.toFixed(2)}.`
    : '';

  return (
    <>
      <PageHeader eyebrow="Gastos / Planilla" title="Sueldos y boletas de pago" subtitle="Genera la planilla mensual con sueldo base, comisiones, bonos y descuentos configurados por empleado."
        actions={<>
          <input type="month" className="input input-sm" value={periodo} onChange={(e) => setPeriodo(e.target.value)} />
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={generar} disabled={busy}><Users size={14} /> Generar planilla</button>
          <button className="btn btn-green" onClick={() => setSelectorOpen(true)}><Printer size={14} /> Enviar boletas por WhatsApp</button>
        </>} />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Total planilla" value={`Bs ${(r.total || 0).toFixed(2)}`} icon={CircleDollarSign} tone="blue" hint={periodo} />
        <StatCard label="Pendientes" value={r.pendientes || 0} icon={Users} tone="amber" hint="Por pagar" />
        <StatCard label="Pagadas" value={r.pagadas || 0} icon={CircleDollarSign} tone="green" hint="Con respaldo" />
      </div>
      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Configuración salarial por empleado</h3><p>Cada sueldo es independiente: antigüedad, función, bonos, comisiones y descuentos propios</p></div><Settings2 size={16} /></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Empleado</th><th>Rol</th><th className="num">Antigüedad</th><th className="num">Sueldo base</th><th className="num">Com. venta</th><th className="num">Com. entrega</th><th className="num">Conceptos</th><th /></tr></thead>
            <tbody>
              {empleados.map((e) => {
                const conceptosEmpleado = conceptos.filter((c) => c.usuario_id === e.id);
                return <tr key={e.id}>
                  <td className="cell-strong">{e.nombre}</td>
                  <td>{e.rol}</td>
                  <td className="num">{e.antiguedad_anios || 0} años</td>
                  <td className="num">Bs {(e.salario_base || 0).toFixed(2)}</td>
                  <td className="num">{e.comision_venta_pct || 0}%</td>
                  <td className="num">Bs {(e.comision_distribucion_pct || 0).toFixed(2)}</td>
                  <td className="num">{conceptosEmpleado.length}</td>
                  <td className="actions"><button className="btn btn-soft btn-sm" onClick={() => abrirConfig(e)}><Pencil size={12} /> Configurar</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Boletas de pago</h3><p>Imprime o envía cada boleta por WhatsApp para respaldo de ambas partes</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.boletas || []).length ? <EmptyState icon={Users} title="Sin boletas" message="Genera la planilla del período." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Boleta</th><th>Empleado</th><th>Cargo</th><th className="num">Base</th><th className="num">Comisiones</th><th className="num">Bono</th><th className="num">Total</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.boletas.map((b) => <tr key={b.id}>
                  <td className="cell-strong">{b.codigo}</td>
                  <td>{b.empleado}</td><td>{b.cargo}</td>
                  <td className="num">Bs {b.salario_base.toFixed(2)}</td>
                  <td className="num">Bs {(b.comision_ventas + b.comision_distribucion).toFixed(2)}</td>
                  <td className="num">Bs {b.bono.toFixed(2)}</td>
                  <td className="num cell-strong">Bs {b.total.toFixed(2)}</td>
                  <td><Badge tone={b.estado === 'pagada' ? 'green' : 'amber'}>{b.estado}</Badge></td>
                  <td className="actions">
                    <button className="btn btn-soft btn-sm" onClick={() => setBoleta(b)}><Printer size={12} /> Ver boleta</button>
                    {b.estado === 'pendiente' && <button className="btn btn-primary btn-sm" onClick={() => pagar(b)}>Pagar</button>}
                  </td>
                </tr>)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(configModal)} onClose={() => setConfigModal(null)} title={`Configurar sueldo · ${configModal?.nombre || ''}`} subtitle={configModal?.rol || ''} size="xl"
        footer={<><button className="btn btn-ghost" onClick={() => setConfigModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarConfig} disabled={busy}>Guardar sueldo</button></>}>
        <div className="form-stack">
          <div className="field-row">
            <div className="field"><label>Sueldo base (Bs)</label><input className="input" type="number" min="0" value={configForm.salario_base} onChange={(e) => setConfigForm({ ...configForm, salario_base: e.target.value })} /></div>
            <div className="field"><label>Antigüedad (años)</label><input className="input" type="number" min="0" value={configForm.antiguedad_anios} onChange={(e) => setConfigForm({ ...configForm, antiguedad_anios: e.target.value })} /></div>
            <div className="field"><label>Bono fijo (Bs)</label><input className="input" type="number" min="0" value={configForm.bono_fijo} onChange={(e) => setConfigForm({ ...configForm, bono_fijo: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Comisión por venta (%)</label><input className="input" type="number" min="0" step="0.5" value={configForm.comision_venta_pct} onChange={(e) => setConfigForm({ ...configForm, comision_venta_pct: e.target.value })} /></div>
            <div className="field"><label>Comisión por entrega (Bs c/u)</label><input className="input" type="number" min="0" step="0.5" value={configForm.comision_distribucion_pct} onChange={(e) => setConfigForm({ ...configForm, comision_distribucion_pct: e.target.value })} /></div>
            <div className="field"><label>Descuento fijo (Bs)</label><input className="input" type="number" min="0" value={configForm.descuento_fijo} onChange={(e) => setConfigForm({ ...configForm, descuento_fijo: e.target.value })} /></div>
          </div>
          <div className="divider" />
          <strong className="small">Conceptos adicionales (bonos por antigüedad, función, productividad…)</strong>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Concepto</th><th>Tipo</th><th>Base</th><th className="num">Monto / %</th><th /></tr></thead>
              <tbody>
                {conceptos.filter((c) => c.usuario_id === configModal?.id).map((c) => <tr key={c.id}>
                  <td className="cell-strong">{c.nombre}</td><td>{c.tipo}</td><td>{c.base}</td>
                  <td className="num">{c.base === 'ventas' ? `${c.porcentaje}%` : `Bs ${c.monto}`}</td>
                  <td className="actions"><button className="icon-btn" onClick={() => eliminarConcepto(c.id)}>×</button></td>
                </tr>)}
                {conceptos.filter((c) => c.usuario_id === configModal?.id).length === 0 && <tr><td colSpan="5" className="table-empty">Sin conceptos adicionales.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="field-row">
            <div className="field"><label>Nuevo concepto</label><input className="input" value={conceptoForm.nombre} onChange={(e) => setConceptoForm({ ...conceptoForm, nombre: e.target.value })} /></div>
            <div className="field"><label>Tipo</label><select className="select" value={conceptoForm.tipo} onChange={(e) => setConceptoForm({ ...conceptoForm, tipo: e.target.value })}><option value="bono">Bono</option><option value="comision">Comisión</option><option value="descuento">Descuento</option><option value="otro">Otro</option></select></div>
            <div className="field"><label>Base</label><select className="select" value={conceptoForm.base} onChange={(e) => setConceptoForm({ ...conceptoForm, base: e.target.value })}><option value="fijo">Fijo</option><option value="ventas">% Ventas</option><option value="entregas">Por entrega</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Monto (Bs)</label><input className="input" type="number" min="0" value={conceptoForm.monto} onChange={(e) => setConceptoForm({ ...conceptoForm, monto: e.target.value })} /></div>
            <div className="field"><label>Porcentaje (%)</label><input className="input" type="number" min="0" step="0.5" value={conceptoForm.porcentaje} onChange={(e) => setConceptoForm({ ...conceptoForm, porcentaje: e.target.value })} /></div>
            <button className="btn btn-outline" onClick={agregarConcepto} disabled={busy}><Plus size={13} /> Agregar concepto</button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(boleta)} onClose={() => setBoleta(null)} title={`Boleta de pago ${boleta?.codigo || ''}`} subtitle={`${boleta?.periodo || ''} · ${boleta?.empleado || ''}`} size="md"
        footer={<>
          <button className="btn btn-ghost" onClick={() => setBoleta(null)}>Cerrar</button>
          <button className="btn btn-outline" onClick={() => window.print()}><Printer size={14} /> Imprimir</button>
          <BotonWhatsapp tipo="otro" mensaje={mensajeBoleta} label="Enviar por WhatsApp" />
        </>}>
        {!boleta ? null : (
          <div className="form-stack">
            <div className="summary-box">
              <div className="split"><span className="small muted">Empleado</span><strong>{boleta.empleado}</strong></div>
              <div className="split mt-8"><span className="small muted">Cargo</span><strong>{boleta.cargo}</strong></div>
              <div className="split mt-8"><span className="small muted">Período</span><strong>{boleta.periodo}</strong></div>
            </div>
            <div className="divider" />
            <div className="info-row"><span>Sueldo base</span><strong>Bs {boleta.salario_base.toFixed(2)}</strong></div>
            <div className="info-row"><span>Comisión por ventas ({boleta.detalle?.comision_venta_pct}%)</span><strong>Bs {boleta.comision_ventas.toFixed(2)}</strong></div>
            <div className="info-row"><span>Comisión por entregas ({boleta.detalle?.entregas || 0})</span><strong>Bs {boleta.comision_distribucion.toFixed(2)}</strong></div>
            <div className="info-row"><span>Bono fijo</span><strong>Bs {boleta.bono.toFixed(2)}</strong></div>
            <div className="info-row"><span>Descuento</span><strong className="text-red">- Bs {boleta.descuento.toFixed(2)}</strong></div>
            {(boleta.detalle?.conceptos || []).map((c) => <div className="info-row" key={c.codigo}><span>{c.nombre} <small className="muted">({c.base})</small></span><strong className={c.valor < 0 ? 'text-red' : ''}>Bs {c.valor.toFixed(2)}</strong></div>)}
            <div className="divider" />
            <div className="info-row"><span><strong>Total a pagar</strong></span><strong style={{ fontSize: 18 }}>Bs {boleta.total.toFixed(2)}</strong></div>
          </div>
        )}
      </Modal>

      <SelectorEmpleadosWhatsapp
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        titulo="Enviar boletas de pago por WhatsApp"
        tipo="otro"
        tituloDocumento={`Boletas de pago ${periodo}`}
        mensaje={`Hola, aquí está tu boleta de pago de ${periodo}.`}
      />
    </>
  );
}
