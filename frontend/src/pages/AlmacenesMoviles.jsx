import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Boxes, Plus, RefreshCcw, Truck } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIO = { vendedor_id: '', vehiculo_id: '', nombre: '', almacen_origen_id: 1, lineas: [{ producto_id: '', cantidad: '' }], notas: '' };

export default function AlmacenesMoviles() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [catalogos, setCatalogos] = useState({ vendedores: [], vehiculos: [], almacenes: [], productos: [] });
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [recargar, setRecargar] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [solicitudes, setSolicitudes] = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [a, v, veh, alm, prod, sol] = await Promise.all([
        api.get('/almacenes-moviles'), api.get('/usuarios'), api.get('/vehiculos'), api.get('/almacenes'), api.get('/productos'), api.get('/solicitudes-carga'),
      ]);
      setSolicitudes((sol.solicitudes || []).filter((s) => s.estado === 'pendiente'));
      setData(a);
      setCatalogos({
        vendedores: (v.usuarios || []).filter((u) => ['ventas', 'preventista'].includes(u.rol)),
        vehiculos: veh.vehiculos || [],
        almacenes: alm.almacenes || [],
        productos: prod.productos || [],
      });
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const abrir = (almacen = null) => {
    setRecargar(almacen);
    setForm(almacen
      ? { vendedor_id: String(almacen.vendedor_id), vehiculo_id: String(almacen.vehiculo_id || ''), nombre: almacen.nombre, almacen_origen_id: 1, lineas: [{ producto_id: '', cantidad: '' }], notas: '' }
      : VACIO);
    setResultado(null);
    setModal(true);
  };

  const guardar = async () => {
    if (!form.vendedor_id) return toast('Selecciona un vendedor.', 'error');
    const lineas = form.lineas.map((l) => ({ producto_id: Number(l.producto_id), cantidad: Number(l.cantidad) })).filter((l) => l.producto_id && l.cantidad > 0);
    if (!lineas.length) return toast('Agrega al menos un producto con cantidad.', 'error');
    setBusy(true);
    try {
      const r = recargar
        ? await api.post(`/almacenes-moviles/${recargar.id}/cargar`, { lineas, almacen_origen_id: Number(form.almacen_origen_id) })
        : await api.post('/almacenes-moviles', { ...form, vendedor_id: Number(form.vendedor_id), vehiculo_id: Number(form.vehiculo_id), almacen_origen_id: Number(form.almacen_origen_id), lineas });
      setResultado(r);
      toast(recargar ? 'Almacén móvil recargado' : 'Almacén móvil creado');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const aprobarSolicitud = async (solicitud) => {
    try {
      const r = await api.patch(`/solicitudes-carga/${solicitud.id}/aprobar`, {});
      toast(`Solicitud aprobada · cargada en ${r.almacen_movil_codigo}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Inventario / Venta directa"
        title="Almacenes móviles"
        subtitle="Carga productos a un camión para que el vendedor realice venta directa sin afectar el stock del almacén."
        actions={<>
          <Link className="btn btn-ghost" to="/inventario"><ArrowLeft size={14} /> Inventario</Link>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={() => abrir()}><Plus size={15} /> Cargar camión</button>
        </>}
      />
      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Almacenes móviles" value={data?.resumen?.total || 0} icon={Truck} tone="blue" hint="Cámaras registradas" />
        <StatCard label="Activos" value={data?.resumen?.activos || 0} icon={Boxes} tone="green" hint="Vendiendo" />
        <StatCard label="Unidades cargadas" value={data?.resumen?.unidades || 0} icon={Boxes} tone="orange" hint="Stock en camiones" />
      </div>
      <div className="panel">
        <div className="panel-head"><div><h3>Camiones cargados</h3><p>El stock se descuenta aquí con cada venta directa</p></div></div>
        {loading ? <SkeletonRows rows={5} /> : !(data?.almacenes || []).length ? (
          <EmptyState icon={Truck} title="Sin almacenes móviles" message="Carga el primer camión para venta directa." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Vendedor</th><th>Vehículo</th><th>Ruta / Zona</th><th className="num">Productos</th><th className="num">Unidades</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {data.almacenes.map((a) => (
                  <tr key={a.id}>
                    <td className="cell-strong">{a.codigo}</td>
                    <td>{a.vendedor_nombre}</td>
                    <td>{a.vehiculo_placa}</td>
                    <td>{a.ruta_venta || '—'} / {a.zona || '—'}</td>
                    <td className="num">{a.total_productos}</td>
                    <td className="num cell-strong">{a.total_unidades}</td>
                    <td><Badge tone={a.estado === 'activo' ? 'green' : 'gray'}>{a.estado}</Badge></td>
                    <td className="actions"><button className="btn btn-soft btn-sm" onClick={() => abrir(a)}>Recargar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Solicitudes de carga pendientes</h3><p>Los vendedores de camión solicitan producto desde su móvil</p></div><span className="badge badge-amber">{solicitudes.length}</span></div>
        {solicitudes.length === 0 ? <div className="table-empty">No hay solicitudes pendientes.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Código</th><th>Vendedor</th><th className="num">Unidades</th><th>Fecha</th><th /></tr></thead>
              <tbody>
                {solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td className="cell-strong">{s.codigo}</td>
                    <td>{s.vendedor_nombre}</td>
                    <td className="num">{s.total_unidades}</td>
                    <td><Fecha value={s.fecha} short /></td>
                    <td className="actions"><button className="btn btn-primary btn-sm" onClick={() => aprobarSolicitud(s)}>Aprobar y cargar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={recargar ? `Recargar ${recargar.codigo}` : 'Cargar camión para venta directa'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardar} disabled={busy}>{busy ? 'Guardando…' : 'Confirmar carga'}</button></>}>
        <div className="form-stack">
          {!recargar && (
            <>
              <div className="field"><label>Vendedor</label><select className="select" value={form.vendedor_id} onChange={(e) => setForm({ ...form, vendedor_id: e.target.value })}><option value="">Seleccionar…</option>{catalogos.vendedores.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {u.ruta_venta || 'sin ruta'}</option>)}</select></div>
              <div className="field-row">
                <div className="field"><label>Vehículo</label><select className="select" value={form.vehiculo_id} onChange={(e) => setForm({ ...form, vehiculo_id: e.target.value })}><option value="">Seleccionar…</option>{catalogos.vehiculos.map((v) => <option key={v.id} value={v.id}>{v.placa} · {v.modelo}</option>)}</select></div>
                <div className="field"><label>Nombre del almacén móvil</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. Camión venta directa · María" /></div>
              </div>
            </>
          )}
          <div className="field"><label>Almacén origen</label><select className="select" value={form.almacen_origen_id} onChange={(e) => setForm({ ...form, almacen_origen_id: e.target.value })}>{catalogos.almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panel-head"><h3>Productos a cargar</h3><button className="btn btn-soft btn-sm" onClick={() => setForm({ ...form, lineas: [...form.lineas, { producto_id: '', cantidad: '' }] })}><Plus size={12} /> Agregar producto</button></div>
            {form.lineas.map((l, i) => (
              <div className="field-row" key={i}>
                <div className="field"><label>Producto</label><select className="select" value={l.producto_id} onChange={(e) => { const x = [...form.lineas]; x[i] = { ...x[i], producto_id: e.target.value }; setForm({ ...form, lineas: x }); }}><option value="">Seleccionar…</option>{catalogos.productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div className="field"><label>Cantidad</label><input type="number" min="1" className="input" value={l.cantidad} onChange={(e) => { const x = [...form.lineas]; x[i] = { ...x[i], cantidad: e.target.value }; setForm({ ...form, lineas: x }); }} /></div>
              </div>
            ))}
          </div>
          {resultado && (
            <div className="notice notice-info">
              {resultado.movimientos.map((m, i) => <div key={i}>{m.nombre}: {m.cargado}/{m.solicitado} {m.error ? `· ${m.error}` : 'cargados'}</div>)}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
