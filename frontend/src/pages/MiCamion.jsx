import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, Plus, RefreshCcw, ShoppingCart, Truck, Undo2 } from 'lucide-react';
import { api } from '../api';
import { optimizarImagen } from '../imagen';
import Mapa from '../components/Mapa';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const VACIO = { almacen_origen_id: 1, lineas: [{ producto_id: '', cantidad: '' }], notas: '' };

export default function MiCamion() {
  const toast = useToast();
  const navigate = useNavigate();
  const [camion, setCamion] = useState(null);
  const [productos, setProductos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [solicitudes, setSolicitudes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [devModal, setDevModal] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [devForm, setDevForm] = useState({ lineas: [], notas: '', foto: null });
  const [busy, setBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, p, a, s] = await Promise.all([
        api.get('/almacenes-moviles/mio'), api.get('/productos'), api.get('/almacenes'), api.get('/solicitudes-carga'),
      ]);
      setCamion(m.almacen);
      setProductos(p.productos || []);
      setAlmacenes(a.almacenes || []);
      setSolicitudes((s.solicitudes || []).filter((x) => x.estado === 'pendiente'));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const pedir = async () => {
    const lineas = form.lineas.map((l) => ({ producto_id: Number(l.producto_id), cantidad: Number(l.cantidad) })).filter((l) => l.producto_id && l.cantidad > 0);
    if (!lineas.length) return toast('Agrega productos a la solicitud.', 'error');
    setBusy(true);
    try {
      await api.post('/solicitudes-carga', { ...form, almacen_origen_id: Number(form.almacen_origen_id), lineas });
      toast('Solicitud de carga enviada al almacén');
      setModal(false);
      setForm(VACIO);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirDevolucion = () => {
    setDevForm({ lineas: (camion?.lineas || []).filter((l) => l.cantidad > 0).map((l) => ({ producto_id: l.producto_id, nombre: l.nombre, cantidad: l.cantidad, devolver: 0 })), notas: '', foto: null });
    setDevModal(true);
  };

  const confirmarDevolucion = async () => {
    const lineas = devForm.lineas.filter((l) => l.devolver > 0).map((l) => ({ producto_id: l.producto_id, cantidad: l.devolver, motivo: 'Producto no vendido en camión' }));
    if (!lineas.length) return toast('Indica cuántas unidades devolver.', 'error');
    try {
      await api.post('/devoluciones', {
        tipo: 'venta_directa', origen_tipo: 'almacen_movil', origen_id: camion.id,
        lineas, notas: devForm.notas || 'Devolución de venta directa', foto: devForm.foto,
      });
      toast('Devolución registrada. Almacén debe verificarla y reingresarla.');
      setDevModal(false);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  if (loading) return <><PageHeader title="Mi camión" subtitle="Cargando…" /><div className="panel"><SkeletonRows rows={6} /></div></>;

  return (
    <>
      <PageHeader
        eyebrow="Venta directa"
        title="Mi camión"
        subtitle={camion ? `${camion.codigo} · ${camion.vehiculo_placa} · ${camion.ruta_venta || 'sin ruta'}` : 'Aún no tienes un camión asignado'}
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-outline" onClick={() => setModal(true)}><Plus size={14} /> Solicitar producto</button>
          {camion && <button className="btn btn-primary" onClick={() => navigate('/ventas/nueva')}><ShoppingCart size={14} /> Vender</button>}
        </>}
      />

      {!camion ? (
        <EmptyState icon={Truck} title="Sin camión asignado" message="Solicita producto al almacén y quedará habilitado para venta directa." action={<button className="btn btn-primary btn-sm" onClick={() => setModal(true)}>Solicitar carga</button>} />
      ) : (
        <>
          <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
            <StatCard label="Unidades en camión" value={camion.total_unidades} icon={Boxes} tone="orange" hint="Stock disponible" />
            <StatCard label="Productos" value={camion.total_productos} icon={Boxes} tone="blue" hint="Referencias cargadas" />
            <StatCard label="Solicitudes pendientes" value={solicitudes.length} icon={Truck} tone="green" hint="Esperando almacén" />
          </div>

          <div className="panel mb-16">
            <div className="panel-head"><div><h3>Producto cargado</h3><p>Solo este inventario aparece en tu punto de venta</p></div>
              <button className="btn btn-soft btn-sm" onClick={abrirDevolucion}><Undo2 size={13} /> Generar devolución</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>Producto</th><th>SKU</th><th className="num">Unidades</th></tr></thead>
                <tbody>
                  {camion.lineas.filter((l) => l.cantidad > 0).map((l) => (
                    <tr key={l.producto_id}><td className="cell-strong">{l.emoji} {l.nombre}</td><td>{l.sku}</td><td className="num cell-strong">{l.cantidad}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h3>Ubicación del camión</h3><p>Seguimiento en tiempo real</p></div></div>
            <div className="panel-body"><Mapa altura={240} puntos={[{ id: 'camion', latitud: -17.3938, longitud: -66.1571, nombre: camion.codigo, descripcion: `${camion.vehiculo_placa} · ${camion.total_unidades} unidades`, tipo: 'visita', estado: 'en_camino' }]} /></div>
          </div>
        </>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Solicitar producto al almacén" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={pedir} disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitud'}</button></>}>
        <div className="form-stack">
          <div className="field"><label>Almacén origen</label><select className="select" value={form.almacen_origen_id} onChange={(e) => setForm({ ...form, almacen_origen_id: e.target.value })}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panel-head"><h3>Productos solicitados</h3><button className="btn btn-soft btn-sm" onClick={() => setForm({ ...form, lineas: [...form.lineas, { producto_id: '', cantidad: '' }] })}><Plus size={12} /> Agregar</button></div>
            {form.lineas.map((l, i) => (
              <div className="field-row" key={i}>
                <div className="field"><label>Producto</label><select className="select" value={l.producto_id} onChange={(e) => { const x = [...form.lineas]; x[i] = { ...x[i], producto_id: e.target.value }; setForm({ ...form, lineas: x }); }}><option value="">Seleccionar…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                <div className="field"><label>Cantidad</label><input type="number" min="1" className="input" value={l.cantidad} onChange={(e) => { const x = [...form.lineas]; x[i] = { ...x[i], cantidad: e.target.value }; setForm({ ...form, lineas: x }); }} /></div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <Modal open={devModal} onClose={() => setDevModal(false)} title="Generar devolución de producto no vendido" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setDevModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={confirmarDevolucion}>Registrar devolución</button></>}>
        <div className="form-stack">
          <p className="small muted">El almacén verificará el estado y reingresará las unidades en buen estado automáticamente.</p>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Producto</th><th className="num">En camión</th><th className="num">Devolver</th></tr></thead>
              <tbody>
                {devForm.lineas.map((l, i) => (
                  <tr key={l.producto_id}>
                    <td className="cell-strong">{l.nombre}</td>
                    <td className="num">{l.cantidad}</td>
                    <td className="num"><input className="input input-sm" style={{ width: 80 }} type="number" min="0" max={l.cantidad} value={l.devolver} onChange={(e) => { const x = [...devForm.lineas]; x[i] = { ...x[i], devolver: Number(e.target.value) }; setDevForm({ ...devForm, lineas: x }); }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="field"><label>Notas</label><textarea className="textarea" value={devForm.notas} onChange={(e) => setDevForm({ ...devForm, notas: e.target.value })} placeholder="Ej. producto en mal estado, cambio solicitado por el vendedor…" /></div>
          <div className="field">
            <label>Foto de comprobante (mal estado o cambio)</label>
            <input type="file" accept="image/*" className="input" onChange={async (e) => {
              const archivo = e.target.files?.[0];
              if (!archivo) return;
              try { setDevForm({ ...devForm, foto: await optimizarImagen(archivo) }); }
              catch (error) { toast(error.message, 'error'); }
              e.target.value = '';
            }} />
            {devForm.foto && <img src={devForm.foto} alt="Comprobante" style={{ width: 90, height: 70, objectFit: 'cover', borderRadius: 7, marginTop: 8 }} />}
            <span className="hint">Se guarda como evidencia de la devolución.</span>
          </div>
        </div>
      </Modal>
    </>
  );
}
