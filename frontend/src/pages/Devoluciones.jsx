import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, PackageCheck, RefreshCcw, Undo2, UserRound } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const ESTADO_TONE = { pendiente: 'amber', verificado: 'blue', reingresado: 'green' };

export default function Devoluciones() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ estado: 'todas', tipo: 'todas', desde: '', hasta: '' });
  const [verModal, setVerModal] = useState(null);
  const [verForm, setVerForm] = useState([]);
  const [reacModal, setReacModal] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [reacForm, setReacForm] = useState({ cliente_id: '', lineas: [] });

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams(Object.entries(filtros).filter(([, v]) => v && v !== 'todas')).toString();
      const [d, c] = await Promise.all([api.get(`/devoluciones${q ? `?${q}` : ''}`), api.get('/clientes')]);
      setData(d);
      setClientes(c.clientes || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [filtros, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrirVerificacion = (dev) => {
    setVerModal(dev);
    setVerForm((dev.lineas || []).map((l) => ({ producto_id: l.producto_id, nombre: l.nombre || `Producto ${l.producto_id}`, cantidad: l.cantidad, estado: l.estado || 'bueno' })));
  };

  const verificar = async () => {
    try {
      await api.patch(`/devoluciones/${verModal.id}/verificar`, { lineas: verForm.map((l) => ({ producto_id: l.producto_id, estado: l.estado })) });
      toast('Devolución verificada');
      setVerModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const reingresar = async (dev) => {
    try {
      await api.post(`/devoluciones/${dev.id}/reingresar`, {});
      toast(`Reingresadas ${dev.buenas} unidades en buen estado`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const abrirReacomodar = (dev) => {
    setReacModal(dev);
    setReacForm({ cliente_id: '', lineas: (dev.lineas || []).filter((l) => l.cantidad > 0).map((l) => ({ producto_id: l.producto_id, nombre: l.nombre || `Producto ${l.producto_id}`, max: l.cantidad, cantidad: 0 })) });
  };

  const reacomodar = async () => {
    if (!reacForm.cliente_id) return toast('Selecciona un cliente.', 'error');
    const lineas = reacForm.lineas.filter((l) => l.cantidad > 0).map((l) => ({ producto_id: l.producto_id, cantidad: l.cantidad }));
    if (!lineas.length) return toast('Indica cantidades a reacomodar.', 'error');
    try {
      await api.post(`/devoluciones/${reacModal.id}/reacomodar`, { cliente_id: Number(reacForm.cliente_id), lineas });
      toast('Producto reacomodado y registrado como venta');
      setReacModal(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const resumen = data?.resumen || {};

  return (
    <>
      <PageHeader
        eyebrow="Almacén / Devoluciones"
        title="Devoluciones de almacenes móviles"
        subtitle="Verifica, reingresa al almacén o reacomodar producto no entregado con otro cliente."
        actions={<>
          <Link className="btn btn-ghost" to="/inventario"><Undo2 size={14} /> Inventario</Link>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Devoluciones" value={resumen.total || 0} icon={ClipboardCheck} tone="blue" hint="Registradas" />
        <StatCard label="Pendientes" value={resumen.pendientes || 0} icon={Undo2} tone="amber" hint="Por verificar" />
        <StatCard label="Reingresadas" value={resumen.reingresadas || 0} icon={PackageCheck} tone="green" hint="Stock actualizado" />
        <StatCard label="Unidades buenas" value={resumen.unidades_buenas || 0} icon={CheckCircle2} tone="purple" hint="Devueltas al almacén" />
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Reporte diario de devoluciones</h3><p>Fecha, hora, origen y estado de cada producto devuelto</p></div></div>
        <div className="panel-body">
          <div className="filters mb-16">
            <select className="select" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}><option value="todas">Todos los estados</option><option value="pendiente">Pendiente</option><option value="verificado">Verificado</option><option value="reingresado">Reingresado</option></select>
            <select className="select" value={filtros.tipo} onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value })}><option value="todas">Todos los tipos</option><option value="distribucion">Distribución</option><option value="venta_directa">Venta directa</option></select>
            <input type="date" className="input input-sm" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} />
            <input type="date" className="input input-sm" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} />
          </div>
        </div>
        {loading ? <SkeletonRows rows={6} /> : !(data?.devoluciones || []).length ? (
          <EmptyState icon={Undo2} title="Sin devoluciones" message="Ajusta los filtros o registra una devolución desde un camión." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Fecha</th><th>Tipo</th><th>Responsable</th><th className="num">Unidades</th><th>Buenas / Reacomodadas</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.devoluciones.map((d) => (
                  <tr key={d.id}>
                    <td className="cell-strong">{d.codigo}<span className="cell-sub">{d.notas}</span></td>
                    <td><Fecha value={d.fecha} time /></td>
                    <td><Badge tone={d.tipo === 'venta_directa' ? 'orange' : 'purple'}>{d.tipo}</Badge></td>
                    <td>{d.usuario_nombre}</td>
                    <td className="num">{d.total_unidades}</td>
                    <td className="num">{d.buenas} / {d.reacomodadas}</td>
                    <td><Badge tone={ESTADO_TONE[d.estado] || 'gray'}>{d.estado}</Badge></td>
                    <td className="actions">
                      {d.estado === 'pendiente' && <button className="btn btn-soft btn-sm" onClick={() => abrirVerificacion(d)}><ClipboardCheck size={12} /> Verificar</button>}
                      {d.estado === 'verificado' && <button className="btn btn-primary btn-sm" onClick={() => reingresar(d)}><PackageCheck size={12} /> Reingresar</button>}
                      {d.estado !== 'reingresado' && <button className="btn btn-outline btn-sm" onClick={() => abrirReacomodar(d)}><UserRound size={12} /> Reacomodar</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(verModal)} onClose={() => setVerModal(null)} title={`Verificar ${verModal?.codigo || ''}`} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setVerModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={verificar}>Confirmar verificación</button></>}>
        <div className="form-stack">
          <p className="small muted">Marca como “bueno” solo el producto que puede volver al almacén.</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Cantidad</th><th>Estado</th></tr></thead>
              <tbody>
                {verForm.map((l, i) => (
                  <tr key={l.producto_id}>
                    <td className="cell-strong">{l.nombre}</td>
                    <td className="num">{l.cantidad}</td>
                    <td><select className="select" value={l.estado} onChange={(e) => { const x = [...verForm]; x[i] = { ...x[i], estado: e.target.value }; setVerForm(x); }}><option value="bueno">Bueno</option><option value="danado">Dañado</option></select></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(reacModal)} onClose={() => setReacModal(null)} title="Reacomodar producto no entregado" subtitle={reacModal?.codigo || ''} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setReacModal(null)}>Cancelar</button><button className="btn btn-primary" onClick={reacomodar}>Registrar reacomodo</button></>}>
        <div className="form-stack">
          <div className="field"><label>Cliente que recibe el producto</label><select className="select" value={reacForm.cliente_id} onChange={(e) => setReacForm({ ...reacForm, cliente_id: e.target.value })}><option value="">Seleccionar…</option>{clientes.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.zona}</option>)}</select></div>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">Disponible</th><th className="num">Reacomodar</th></tr></thead>
              <tbody>
                {reacForm.lineas.map((l, i) => (
                  <tr key={l.producto_id}>
                    <td className="cell-strong">{l.nombre}</td>
                    <td className="num">{l.max}</td>
                    <td className="num"><input className="input input-sm" style={{ width: 80 }} type="number" min="0" max={l.max} value={l.cantidad} onChange={(e) => { const x = [...reacForm.lineas]; x[i] = { ...x[i], cantidad: Number(e.target.value) }; setReacForm({ ...reacForm, lineas: x }); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="notice notice-info">Se registrará como venta con origen de devolución y quedará en reportes como producto reacomodado fuera del pedido.</div>
        </div>
      </Modal>
    </>
  );
}
