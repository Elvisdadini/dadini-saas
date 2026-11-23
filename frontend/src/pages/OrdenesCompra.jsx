import { useCallback, useEffect, useState } from 'react';
import { CircleDollarSign, Receipt, RefreshCcw, Truck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

export default function OrdenesCompra() {
  const toast = useToast();
  const { user } = useAuth();
  const puedePagar = ['admin', 'dueno'].includes(user?.rol);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagar, setPagar] = useState(null);
  const [form, setForm] = useState({ monto: '', metodo: 'transferencia', referencia: '', notas: '', tipo_comprobante: 'factura', numero_comprobante: '' });
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try { setData(await api.get('/ordenes-compra')); } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { cargar(); }, [cargar]);

  const confirmar = async () => {
    setBusy(true);
    try {
      await api.post(`/ordenes-compra/${pagar.id}/pagar`, { ...form, monto: Number(form.monto) });
      toast('Pago a proveedor registrado');
      setPagar(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const r = data?.resumen || {};
  return (
    <>
      <PageHeader eyebrow="Compras / Proveedores" title="Órdenes y pagos" subtitle="Controla órdenes generadas, recepciones y pagos a proveedores."
        actions={<button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>} />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Total ordenado" value={`Bs ${(r.total || 0).toFixed(2)}`} icon={Receipt} tone="blue" hint="Compras del período" />
        <StatCard label="Pagado" value={`Bs ${(r.pagado || 0).toFixed(2)}`} icon={CircleDollarSign} tone="green" hint="A proveedores" />
        <StatCard label="Saldo pendiente" value={`Bs ${(r.saldo || 0).toFixed(2)}`} icon={CircleDollarSign} tone="red" hint="Por pagar" />
        <StatCard label="Órdenes por pagar" value={r.pendientes_pago || 0} icon={Truck} tone="amber" hint="Con saldo" />
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Órdenes de compra</h3><p>Generadas desde solicitudes aprobadas</p></div></div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.ordenes || []).length ? <EmptyState icon={Receipt} title="Sin órdenes" message="Aprueba una solicitud para generar una orden." /> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Orden</th><th>Solicitud</th><th>Proveedor</th><th className="num">Total</th><th className="num">Pagado</th><th className="num">Saldo</th><th>Estado</th><th>Pago</th><th /></tr></thead>
              <tbody>
                {data.ordenes.map((o) => (
                  <tr key={o.id}>
                    <td className="cell-strong">{o.codigo}</td>
                    <td>{o.solicitud_codigo}</td>
                    <td>{o.proveedor_nombre}</td>
                    <td className="num">Bs {o.total.toFixed(2)}</td>
                    <td className="num text-green">Bs {o.pagado.toFixed(2)}</td>
                    <td className="num text-red">Bs {o.saldo.toFixed(2)}</td>
                    <td><Badge tone={o.estado === 'recibida' ? 'green' : 'amber'}>{o.estado}</Badge></td>
                    <td><Badge tone={o.pago_estado === 'pagado' ? 'green' : o.pago_estado === 'parcial' ? 'blue' : 'red'}>{o.pago_estado}</Badge></td>
                    <td className="actions">{o.saldo > 0 && puedePagar && <button className="btn btn-primary btn-sm" onClick={() => { setPagar(o); setForm({ monto: o.saldo.toFixed(2), metodo: 'transferencia', referencia: '', notas: '', tipo_comprobante: 'factura', numero_comprobante: '' }); }}><CircleDollarSign size={12} /> Pagar</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Modal open={Boolean(pagar)} onClose={() => setPagar(null)} title={`Pagar ${pagar?.codigo || ''}`} subtitle={pagar?.proveedor_nombre || ''} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setPagar(null)}>Cancelar</button><button className="btn btn-primary" onClick={confirmar} disabled={busy}>Registrar pago</button></>}>
        <div className="form-stack">
          <div className="field"><label>Monto (Bs)</label><input className="input" type="number" min="0.01" step="0.01" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} /></div>
          <div className="field"><label>Método</label><select className="select" value={form.metodo} onChange={(e) => setForm({ ...form, metodo: e.target.value })}><option value="efectivo">Efectivo</option><option value="transferencia">Transferencia</option><option value="qr">QR</option></select></div>
          <div className="field"><label>Referencia</label><input className="input" value={form.referencia} onChange={(e) => setForm({ ...form, referencia: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Tipo de comprobante <span className="req">*</span></label><select className="select" value={form.tipo_comprobante} onChange={(e) => setForm({ ...form, tipo_comprobante: e.target.value })}><option value="factura">Factura</option><option value="boleta">Boleta</option><option value="recibo">Recibo</option><option value="transferencia">Transferencia</option></select></div>
            <div className="field"><label>Nro. de comprobante / factura <span className="req">*</span></label><input className="input" value={form.numero_comprobante} onChange={(e) => setForm({ ...form, numero_comprobante: e.target.value })} placeholder="Ej. F-00123" /></div>
          </div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} /></div>
        </div>
      </Modal>
    </>
  );
}
