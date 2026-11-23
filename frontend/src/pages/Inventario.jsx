import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { descargarPlantilla, leerExcel } from '../excel';
import {
  ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, BadgePercent, Boxes, Building2, ClipboardList,
  FileSpreadsheet, ImagePlus, Package, PackageCheck, Pencil, Plus, Search, SlidersHorizontal, Trash2, Truck, Undo2, Upload, UploadCloud, Warehouse,
} from 'lucide-react';
import { api, qs } from '../api';
import { optimizarImagen, pesoDeDataUrl, skuDeArchivo } from '../imagen';
import { useAuth } from '../auth';
import {
  Badge, EmptyState, Fecha, Modal, Money, Num, PageHeader, SkeletonRows, StatCard, Tabs, useToast,
} from '../ui';

const PRODUCTO_VACIO = { nombre: '', categoria: '', categoria_id: '', marca: '', marca_id: '', imagen_url: '', precio: '', costo: '', unidad: 'unidad', unidades_por_caja: 24, unidades_por_paquete: 12, presentacion: 'unidad', vender_por: ['unidad', 'caja', 'paquete'], categorias_clientes: [], peso_kg: 0.25, stock_minimo: 10, stock_inicial: 0, emoji: '📦', color: '#FF6500', activo: true };
const ALMACEN_VACIO = { nombre: '', direccion: '', zona: '', ciudad: 'Cochabamba', encargado: '', telefono: '' };

export default function Inventario() {
  const { user } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState('productos');
  const [productos, setProductos] = useState([]);
  const [almacenes, setAlmacenes] = useState([]);
  const [resumen, setResumen] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [catalogo, setCatalogo] = useState({ categorias: [], marcas: [] });
  const [catNueva, setCatNueva] = useState('');
  const [marcaNueva, setMarcaNueva] = useState('');
  const [categoriasClientes, setCategoriasClientes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('todas');
  const [bajo, setBajo] = useState(false);
  const [movTipo, setMovTipo] = useState('todos');
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importResult, setImportResult] = useState(null);
  const [importando, setImportando] = useState(false);
  const [productModal, setProductModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(PRODUCTO_VACIO);
  const [adjust, setAdjust] = useState(null);
  const [adj, setAdj] = useState({ almacen_id: 1, tipo: 'entrada', cantidad: 1, motivo: 'Reposición de stock' });
  const [transfer, setTransfer] = useState(null);
  const [trf, setTrf] = useState({ origen_id: 1, destino_id: 2, cantidad: 1 });
  const [whModal, setWhModal] = useState(false);
  const [whEdit, setWhEdit] = useState(null);
  const [whForm, setWhForm] = useState(ALMACEN_VACIO);
  const [busy, setBusy] = useState(false);
  const [imagenPendiente, setImagenPendiente] = useState(null);
  const [loteOpen, setLoteOpen] = useState(false);
  const [loteArchivos, setLoteArchivos] = useState([]);
  const [loteProgreso, setLoteProgreso] = useState(0);
  const [loteResultado, setLoteResultado] = useState(null);

  const puedeEditar = ['admin', 'almacen'].includes(user?.rol);
  const esAdmin = user?.rol === 'admin';

  const cargar = async () => {
    setLoading(true);
    try {
      const [p, a, catCli, catProds] = await Promise.all([
        api.get(`/productos${qs({ search, categoria, bajo_stock: bajo ? 'true' : '' })}`),
        api.get('/almacenes'),
        api.get('/categorias'),
        api.get('/producto-catalogo'),
      ]);
      setProductos(p.productos);
      setCategorias(p.categorias);
      setCatalogo(catProds);
      setResumen(p.resumen);
      setAlmacenes(a.almacenes);
      setCategoriasClientes(catCli.categorias || []);
      if (tab === 'movimientos') {
        const m = await api.get(`/productos/movimientos${qs({ tipo: movTipo })}`);
        setMovimientos(m.movimientos);
      }
    } catch (error) {
      toast(error.message, 'error');
    } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [search, categoria, bajo, tab, movTipo]);

  const abrirProducto = (p = null) => {
    setEditing(p);
    setImagenPendiente(p?.imagen_url || null);
    setForm(p ? { nombre: p.nombre, categoria: p.categoria, categoria_id: p.categoria_id || '', marca: p.marca || '', marca_id: p.marca_id || '', imagen_url: p.imagen_url || '', precio: p.precio, costo: p.costo, unidad: p.unidad, unidades_por_caja: p.unidades_por_caja || (p.unidad === 'caja' ? 1 : 24), categorias_clientes: p.categorias_clientes || [], peso_kg: p.peso_kg || 0.25, unidades_por_paquete: p.unidades_por_paquete || 12, presentacion: p.presentacion || p.unidad || 'unidad', vender_por: p.vender_por || ['unidad', 'caja', 'paquete'], stock_minimo: p.stock_minimo, stock_inicial: 0, emoji: p.emoji, color: p.color, activo: p.activo } : PRODUCTO_VACIO);
    setProductModal(true);
  };

  const guardarProducto = async () => {
    if (!form.nombre || !form.precio) return toast('Nombre y precio son obligatorios.', 'error');
    setBusy(true);
    try {
      let producto;
      if (editing) producto = (await api.put(`/productos/${editing.id}`, form)).producto;
      else producto = (await api.post('/productos', form)).producto;
      if (imagenPendiente && imagenPendiente.startsWith('data:')) {
        const subida = await api.post('/productos-imagenes/upload', { sku: producto.sku, imagen: imagenPendiente });
        await api.put(`/productos/${producto.id}`, { imagen_url: subida.url });
        toast(`Imagen subida · ${pesoDeDataUrl(imagenPendiente)} KB (WebP)`);
      }
      toast(editing ? 'Producto actualizado' : 'Producto creado');
      setProductModal(false);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const seleccionarImagen = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      const datos = await optimizarImagen(archivo);
      setImagenPendiente(datos);
      toast(`Imagen optimizada: ${pesoDeDataUrl(datos)} KB · WebP`, 'info');
    } catch (error) { toast(error.message, 'error'); }
  };

  const subirLote = async () => {
    if (!loteArchivos.length) return toast('Selecciona imágenes.', 'error');
    setBusy(true);
    setLoteProgreso(0);
    setLoteResultado(null);
    try {
      const optimizadas = [];
      for (const archivo of loteArchivos) {
        try {
          optimizadas.push({ sku: skuDeArchivo(archivo.name), imagen: await optimizarImagen(archivo) });
        } catch (e) { /* se omite la que no se puede leer */ }
      }
      let cargadas = 0;
      const errores = [];
      for (let i = 0; i < optimizadas.length; i += 40) {
        const lote = optimizadas.slice(i, i + 40);
        const r = await api.post('/productos-imagenes/lote', { imagenes: lote });
        cargadas += r.cargadas || 0;
        errores.push(...(r.errores || []));
        setLoteProgreso(Math.round(((i + lote.length) / optimizadas.length) * 100));
      }
      setLoteResultado({ cargadas, errores });
      toast(`${cargadas} imágenes cargadas${errores.length ? ` · ${errores.length} errores` : ''}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const crearCatalogo = async (tipo) => {
    const nombre = (tipo === 'categorias' ? catNueva : marcaNueva).trim();
    if (!nombre) return toast('Escribe un nombre.', 'error');
    try {
      await api.post(`/producto-catalogo/${tipo}`, { nombre });
      toast(tipo === 'categorias' ? 'Categoría creada' : 'Marca creada');
      if (tipo === 'categorias') setCatNueva(''); else setMarcaNueva('');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const eliminarCatalogo = async (tipo, item) => {
    if (!window.confirm(`¿Eliminar ${item.nombre}?`)) return;
    try {
      await api.del(`/producto-catalogo/${tipo}/${item.id}`);
      toast('Registro eliminado');
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const abrirAjuste = (p) => {
    setAdjust(p);
    setAdj({ almacen_id: almacenes[0]?.id || 1, tipo: 'entrada', cantidad: 1, motivo: 'Reposición de stock' });
  };

  const guardarAjuste = async () => {
    const cantidad = Number(adj.cantidad);
    if (!cantidad) return toast('Ingresa una cantidad.', 'error');
    setBusy(true);
    try {
      await api.post(`/productos/${adjust.id}/ajuste`, {
        almacen_id: adj.almacen_id,
        cantidad: adj.tipo === 'salida' ? -Math.abs(cantidad) : Math.abs(cantidad),
        tipo: adj.tipo,
        motivo: adj.motivo,
      });
      toast('Inventario ajustado correctamente');
      setAdjust(null);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirTransferencia = (p) => {
    setTransfer(p);
    setTrf({ origen_id: almacenes[0]?.id || 1, destino_id: almacenes[1]?.id || 1, cantidad: 1 });
  };

  const guardarTransferencia = async () => {
    setBusy(true);
    try {
      await api.post('/productos/transferencia', { producto_id: transfer.id, ...trf, cantidad: Number(trf.cantidad) });
      toast('Transferencia realizada');
      setTransfer(null);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirAlmacen = (a = null) => {
    setWhEdit(a);
    setWhForm(a ? { nombre: a.nombre, direccion: a.direccion, zona: a.zona, ciudad: a.ciudad, encargado: a.encargado, telefono: a.telefono } : ALMACEN_VACIO);
    setWhModal(true);
  };

  const guardarAlmacen = async () => {
    setBusy(true);
    try {
      if (whEdit) await api.put(`/almacenes/${whEdit.id}`, whForm);
      else await api.post('/almacenes', whForm);
      toast(whEdit ? 'Almacén actualizado' : 'Almacén creado');
      setWhModal(false);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const stockAlmacen = (p, almacenId) => p?.stock_por_almacen?.find((s) => s.almacen_id === almacenId)?.cantidad || 0;

  const columnasProductos = ['nombre', 'sku', 'categoria', 'precio', 'costo', 'unidad', 'unidades_por_caja', 'peso_kg', 'stock_minimo', 'stock_inicial', 'emoji', 'color'];

  const procesarExcel = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      const filas = await leerExcel(archivo);
      setImportRows(filas);
      setImportResult(null);
      if (!filas.length) toast('El archivo no contiene filas.', 'error');
    } catch (error) {
      toast('No se pudo leer el archivo Excel.', 'error');
    }
  };

  const confirmarImportacion = async () => {
    if (!importRows.length) return toast('Carga un archivo primero.', 'error');
    setImportando(true);
    try {
      const r = await api.post('/productos/importar', { productos: importRows });
      setImportResult(r);
      toast(`${r.creados} productos importados${r.errores.length ? ` · ${r.errores.length} errores` : ''}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setImportando(false); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catálogo e inventario"
        title="Inventario"
        subtitle="Controla existencias por almacén, movimientos, transferencias y alertas de reposición."
        actions={(
          <>
            <Link className="btn btn-ghost" to="/inventario/promociones"><BadgePercent size={14} /> Promociones</Link>
            <Link className="btn btn-ghost" to="/inventario/almacenes-moviles"><Truck size={14} /> Almacenes móviles</Link>
            <Link className="btn btn-ghost" to="/inventario/devoluciones"><Undo2 size={14} /> Devoluciones</Link>
            <Link className="btn btn-ghost" to="/inventario/preparado"><PackageCheck size={14} /> Preparar carga</Link>
            {puedeEditar && <button className="btn btn-outline" onClick={() => { setLoteArchivos([]); setLoteResultado(null); setLoteOpen(true); }}><UploadCloud size={14} /> Cargar imágenes</button>}
            {puedeEditar && <button className="btn btn-outline" onClick={() => setImportOpen(true)}><Upload size={14} /> Importar Excel</button>}
            {puedeEditar && <button className="btn btn-primary" onClick={() => abrirProducto()}><Plus size={15} /> Nuevo producto</button>}
          </>
        )}
      />

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Productos activos" value={resumen.total || 0} icon={Package} tone="blue" hint={`${categorias.length} categorías`} />
        <StatCard label="Unidades en stock" value={<Num value={resumen.unidades || 0} />} icon={Boxes} tone="green" hint={`${almacenes.length} almacenes`} />
        <StatCard label="Valor del inventario" value={<Money value={resumen.valor_inventario} />} icon={Building2} tone="purple" hint="Valorizado al costo" />
        <StatCard label="Stock bajo" value={resumen.bajo_stock || 0} icon={SlidersHorizontal} tone="amber" hint="Productos a reponer" />
      </div>

      <div className="panel">
        <Tabs tabs={[{ value: 'productos', label: 'Productos', count: productos.length }, { value: 'catalogo', label: 'Categorías y marcas', count: (catalogo.categorias || []).length + (catalogo.marcas || []).length }, { value: 'movimientos', label: 'Movimientos' }, { value: 'almacenes', label: 'Almacenes', count: almacenes.length }]} active={tab} onChange={setTab} />

        {tab === 'productos' && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar por nombre, SKU o categoría…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
                <select className="select" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                  <option value="todas">Todas las categorías</option>
                  {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <label className="check"><input type="checkbox" checked={bajo} onChange={(e) => setBajo(e.target.checked)} /> Solo stock bajo</label>
              </div>
            </div>
            {loading ? <SkeletonRows rows={8} /> : productos.length === 0 ? <EmptyState icon={Package} title="Sin productos" message="No hay productos con esos filtros." /> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Producto</th><th>Categoría</th><th className="num">Precio</th><th className="num">Costo</th><th className="num">Margen</th><th>Stock por almacén</th><th className="num">Total</th><th /></tr></thead>
                  <tbody>
                    {productos.map((p) => (
                      <tr key={p.id}>
                        <td><div className="inline" style={{ gap: 8 }}><span className="product-thumb" style={{ width: 32, height: 32, fontSize: 16 }}>{p.emoji}</span><div><span className="cell-strong">{p.nombre}</span><span className="cell-sub">{p.sku} · {p.unidad}</span></div></div></td>
                        <td><Badge tone="gray">{p.categoria}</Badge></td>
                        <td className="num"><Money value={p.precio} /></td>
                        <td className="num muted"><Money value={p.costo} /></td>
                        <td className="num"><span className="text-green">{p.precio ? Math.round(((p.precio - p.costo) / p.precio) * 100) : 0}%</span></td>
                        <td>
                          <div className="inline" style={{ gap: 5 }}>
                            {p.stock_por_almacen.map((s) => (
                              <span key={s.almacen_id} className="badge badge-gray" title={s.almacen}>{s.almacen.split(' ').slice(-1)[0]}: {s.cantidad}</span>
                            ))}
                          </div>
                        </td>
                        <td className="num"><span className={`stock-pill ${p.bajo_stock ? 'low' : 'ok'}`}>{p.stock_total} {p.unidad}{p.bajo_stock ? ' ⚠' : ''}</span></td>
                        <td className="actions">
                          {puedeEditar && <button className="icon-btn" title="Ajustar stock" onClick={() => abrirAjuste(p)}><ArrowDownToLine size={14} /></button>}
                          {puedeEditar && <button className="icon-btn" title="Transferir" onClick={() => abrirTransferencia(p)}><ArrowLeftRight size={14} /></button>}
                          {puedeEditar && <button className="icon-btn" title="Editar" onClick={() => abrirProducto(p)}><Pencil size={14} /></button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'catalogo' && (
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div className="panel">
              <div className="panel-head"><div><h3>Categorías de productos</h3><p>Se usan para clasificar y filtrar el inventario.</p></div><Badge tone="blue">{(catalogo.categorias || []).length}</Badge></div>
              <div className="panel-body">
                <div className="filters">
                  <input className="input" value={catNueva} onChange={(e) => setCatNueva(e.target.value)} placeholder="Ej. Bebidas" />
                  <button className="btn btn-primary btn-sm" onClick={() => crearCatalogo('categorias')}><Plus size={13} /> Agregar</button>
                </div>
                <table className="data-table mt-12">
                  <thead><tr><th>Código</th><th>Categoría</th><th>Productos</th><th /></tr></thead>
                  <tbody>
                    {(catalogo.categorias || []).map((c) => (
                      <tr key={c.id}><td className="cell-strong">{c.codigo}</td><td>{c.nombre}</td><td className="num">{c.productos}</td><td className="actions"><button className="icon-btn" onClick={() => eliminarCatalogo('categorias', c)}><Trash2 size={14} /></button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="panel">
              <div className="panel-head"><div><h3>Marcas de productos</h3><p>Cada producto puede llevar una marca registrada.</p></div><Badge tone="orange">{(catalogo.marcas || []).length}</Badge></div>
              <div className="panel-body">
                <div className="filters">
                  <input className="input" value={marcaNueva} onChange={(e) => setMarcaNueva(e.target.value)} placeholder="Ej. DADINI" />
                  <button className="btn btn-primary btn-sm" onClick={() => crearCatalogo('marcas')}><Plus size={13} /> Agregar</button>
                </div>
                <table className="data-table mt-12">
                  <thead><tr><th>Código</th><th>Marca</th><th>Productos</th><th /></tr></thead>
                  <tbody>
                    {(catalogo.marcas || []).map((m) => (
                      <tr key={m.id}><td className="cell-strong">{m.codigo}</td><td>{m.nombre}</td><td className="num">{m.productos}</td><td className="actions"><button className="icon-btn" onClick={() => eliminarCatalogo('marcas', m)}><Trash2 size={14} /></button></td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'movimientos' && (
          <>
            <div className="panel-body" style={{ paddingBottom: 12 }}>
              <div className="filters">
                <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar movimientos…" value={search} onChange={(e) => setSearch(e.target.value)} disabled /></div>
                <select className="select" value={movTipo} onChange={(e) => setMovTipo(e.target.value)}>
                  <option value="todos">Todos los tipos</option><option value="entrada">Entradas</option><option value="salida">Salidas</option><option value="transferencia_entrada">Transferencias entrada</option><option value="transferencia_salida">Transferencias salida</option>
                </select>
                <span className="small muted" style={{ marginLeft: 'auto' }}>{movimientos.length} movimientos recientes</span>
              </div>
            </div>
            {loading ? <SkeletonRows rows={8} /> : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Fecha</th><th>Producto</th><th>Almacén</th><th>Tipo</th><th className="num">Cantidad</th><th>Motivo</th><th>Referencia</th><th>Usuario</th></tr></thead>
                  <tbody>
                    {movimientos.filter((m) => !search || m.producto_nombre.toLowerCase().includes(search.toLowerCase())).map((m) => (
                      <tr key={m.id}>
                        <td className="nowrap"><Fecha value={m.fecha} time /></td>
                        <td><span style={{ marginRight: 5 }}>{m.producto_emoji}</span>{m.producto_nombre}</td>
                        <td>{m.almacen_nombre}</td>
                        <td><Badge tone={m.tipo.includes('entrada') ? 'green' : m.tipo.includes('salida') ? 'red' : 'amber'}>{m.tipo.replace('_', ' ')}</Badge></td>
                        <td className="num cell-strong">{(m.tipo.includes('entrada') ? '+' : '-') + m.cantidad}</td>
                        <td>{m.motivo}</td>
                        <td><span className="badge badge-gray">{m.referencia}</span></td>
                        <td>{m.usuario_nombre}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {movimientos.length === 0 && !loading && <EmptyState icon={ClipboardList} title="Sin movimientos" message="No hay movimientos de inventario registrados." />}
          </>
        )}

        {tab === 'almacenes' && (
          <div className="panel-body">
            <div className="grid grid-3">
              {almacenes.map((a) => (
                <div className="card warehouse-card" key={a.id}>
                  <div className="wh-head">
                    <div className="inline"><span className="wh-icon"><Warehouse size={17} /></span><div><h3>{a.nombre}</h3><span className="small muted">{a.zona} · {a.ciudad}</span></div></div>
                    {esAdmin && <button className="icon-btn" onClick={() => abrirAlmacen(a)}><Pencil size={14} /></button>}
                  </div>
                  <div className="small muted mt-8">{a.direccion}</div>
                  <div className="small muted mt-8">Encargado: {a.encargado || '—'} · {a.telefono || 'Sin teléfono'}</div>
                  <div className="wh-stats">
                    <div><span>Productos</span><strong>{a.productos}</strong></div>
                    <div><span>Unidades</span><strong><Num value={a.unidades} /></strong></div>
                    <div><span>Valor</span><strong><Money value={a.valor} /></strong></div>
                  </div>
                </div>
              ))}
              {esAdmin && <button className="card card-pad" style={{ display: 'grid', placeItems: 'center', minHeight: 160, borderStyle: 'dashed', color: 'var(--muted)' }} onClick={() => abrirAlmacen()}><span><Plus size={20} style={{ display: 'block', margin: '0 auto 5px' }} />Agregar almacén</span></button>}
            </div>
          </div>
        )}
      </div>

      <Modal open={productModal} onClose={() => setProductModal(false)} title={editing ? 'Editar producto' : 'Nuevo producto'} subtitle={editing ? `${editing.sku} · stock total ${editing.stock_total} ${editing.unidad}` : 'Se creará con stock en el almacén central.'} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setProductModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarProducto} disabled={busy}>{busy ? 'Guardando…' : 'Guardar producto'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Nombre del producto <span className="req">*</span></label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej. KEKITO CHOCOLATE" /></div>
          <div className="field"><label>Imagen del producto</label>
            <div className="inline">
              {imagenPendiente ? <img src={imagenPendiente} alt="Vista previa" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--line)' }} /> : <div className="logo-empty"><ImagePlus size={22} /></div>}
              <div><label className="btn btn-soft btn-sm"><ImagePlus size={13} /> Elegir imagen<input type="file" accept="image/*" hidden onChange={seleccionarImagen} /></label><span className="hint">Se optimiza a WebP 800 px · máx. 200 KB. Se guarda en Supabase Storage.</span></div>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Categoría</label><select className="select" value={form.categoria_id || ''} onChange={(e) => { const c = (catalogo.categorias || []).find((x) => x.id === Number(e.target.value)); setForm({ ...form, categoria_id: e.target.value, categoria: c?.nombre || form.categoria }); }}><option value="">Seleccionar…</option>{(catalogo.categorias || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></div>
            <div className="field"><label>Marca</label><select className="select" value={form.marca_id || ''} onChange={(e) => { const m = (catalogo.marcas || []).find((x) => x.id === Number(e.target.value)); setForm({ ...form, marca_id: e.target.value, marca: m?.nombre || '' }); }}><option value="">Sin marca</option>{(catalogo.marcas || []).map((m) => <option key={m.id} value={m.id}>{m.nombre}</option>)}</select></div>
            <div className="field"><label>Unidad</label><select className="select" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}><option value="unidad">Unidad</option><option value="caja">Caja</option><option value="paquete">Paquete</option></select></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Unidades por caja (para preparado de carga)</label><input className="input" type="number" min="1" value={form.unidades_por_caja} onChange={(e) => setForm({ ...form, unidades_por_caja: e.target.value })} /><span className="hint">Convierte unidades en cajas.</span></div>
            <div className="field"><label>Peso por unidad (kg)</label><input className="input" type="number" min="0" step="0.01" value={form.peso_kg} onChange={(e) => setForm({ ...form, peso_kg: e.target.value })} /><span className="hint">Para el reporte de carga por distribuidor.</span></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Unidades por paquete / display</label><input className="input" type="number" min="1" value={form.unidades_por_paquete} onChange={(e) => setForm({ ...form, unidades_por_paquete: e.target.value })} /></div>
            <div className="field"><label>Presentación principal</label><select className="select" value={form.presentacion} onChange={(e) => setForm({ ...form, presentacion: e.target.value })}><option value="unidad">Unidad</option><option value="caja">Caja</option><option value="paquete">Paquete / display</option></select></div>
          </div>
          <div className="field"><label>Se puede vender por</label><div className="pill-group">{['unidad', 'caja', 'paquete'].map((v) => <button key={v} className={`chip ${(form.vender_por || []).includes(v) ? 'active' : ''}`} onClick={() => setForm({ ...form, vender_por: (form.vender_por || []).includes(v) ? form.vender_por.filter((x) => x !== v) : [...(form.vender_por || []), v] })}>{v}</button>)}</div></div>
          <div className="field"><label>Categorías de clientes que pueden comprarlo</label>
            <select multiple className="select" style={{ minHeight: 80 }} value={(form.categorias_clientes || []).map(String)} onChange={(e) => setForm({ ...form, categorias_clientes: [...e.target.selectedOptions].map((o) => Number(o.value)) })}>
              {categoriasClientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <span className="hint">Sin selección = disponible para todas las categorías.</span>
          </div>
          <div className="field-row-3">
            <div className="field"><label>Precio venta (Bs) <span className="req">*</span></label><input className="input" type="number" min="0" step="0.1" value={form.precio} onChange={(e) => setForm({ ...form, precio: e.target.value })} /></div>
            <div className="field"><label>Costo (Bs)</label><input className="input" type="number" min="0" step="0.1" value={form.costo} onChange={(e) => setForm({ ...form, costo: e.target.value })} /></div>
            <div className="field"><label>Stock mínimo</label><input className="input" type="number" min="0" value={form.stock_minimo} onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })} /></div>
          </div>
          {Number(form.precio) > 0 && (
            <div className={`notice ${((form.precio - form.costo) / form.precio * 100) >= 20 ? 'notice-info' : 'notice-warn'}`}>
              <BadgePercent size={14} /> Margen bruto: <strong>{(((form.precio - form.costo) / form.precio) * 100).toFixed(1)}%</strong>
              {' · '}Ganancia por unidad: <strong>Bs {(Number(form.precio) - Number(form.costo)).toFixed(2)}</strong>
              <br /><span className="small muted">Este margen es el disponible para promociones, comisiones, bonos y gastos.</span>
            </div>
          )}
          <div className="field-row">
            <div className="field"><label>Emoji / icono</label><input className="input" value={form.emoji} onChange={(e) => setForm({ ...form, emoji: e.target.value })} maxLength={4} /></div>
            <div className="field"><label>Color de marca</label><input className="input" type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ padding: 4 }} /></div>
          </div>
          {!editing && <div className="field"><label>Stock inicial (almacén central)</label><input className="input" type="number" min="0" value={form.stock_inicial} onChange={(e) => setForm({ ...form, stock_inicial: e.target.value })} /></div>}
          {editing && <label className="check"><input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} /> Producto activo</label>}
        </div>
      </Modal>

      <Modal open={Boolean(adjust)} onClose={() => setAdjust(null)} title="Ajustar stock" subtitle={adjust ? `${adjust.nombre} · stock total ${adjust.stock_total} ${adjust.unidad}` : ''}
        footer={<><button className="btn btn-ghost" onClick={() => setAdjust(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAjuste} disabled={busy}>{busy ? 'Ajustando…' : 'Aplicar ajuste'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Almacén</label><select className="select" value={adj.almacen_id} onChange={(e) => setAdj({ ...adj, almacen_id: Number(e.target.value) })}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre} · disponible {stockAlmacen(adjust, a.id)}</option>)}</select></div>
          <div className="field"><label>Movimiento</label><div className="pill-group">
            <button className={`chip ${adj.tipo === 'entrada' ? 'active' : ''}`} onClick={() => setAdj({ ...adj, tipo: 'entrada' })}><ArrowDownToLine size={12} /> Entrada</button>
            <button className={`chip ${adj.tipo === 'salida' ? 'active' : ''}`} onClick={() => setAdj({ ...adj, tipo: 'salida' })}><ArrowUpFromLine size={12} /> Salida</button>
          </div></div>
          <div className="field"><label>Cantidad</label><input className="input" type="number" min="1" value={adj.cantidad} onChange={(e) => setAdj({ ...adj, cantidad: e.target.value })} /></div>
          <div className="field"><label>Motivo</label><select className="select" value={adj.motivo} onChange={(e) => setAdj({ ...adj, motivo: e.target.value })}><option>Reposición de stock</option><option>Merma o daño</option><option>Devolución</option><option>Conteo físico</option><option>Ajuste administrativo</option></select></div>
        </div>
      </Modal>

      <Modal open={Boolean(transfer)} onClose={() => setTransfer(null)} title="Transferir entre almacenes" subtitle={transfer?.nombre}
        footer={<><button className="btn btn-ghost" onClick={() => setTransfer(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarTransferencia} disabled={busy}>{busy ? 'Transfiriendo…' : 'Transferir'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Almacén de origen</label><select className="select" value={trf.origen_id} onChange={(e) => setTrf({ ...trf, origen_id: Number(e.target.value) })}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {stockAlmacen(transfer, a.id)} disponibles</option>)}</select></div>
          <div className="field"><label>Almacén de destino</label><select className="select" value={trf.destino_id} onChange={(e) => setTrf({ ...trf, destino_id: Number(e.target.value) })}>{almacenes.map((a) => <option key={a.id} value={a.id}>{a.nombre} · {stockAlmacen(transfer, a.id)}</option>)}</select></div>
          <div className="field"><label>Cantidad a transferir</label><input className="input" type="number" min="1" value={trf.cantidad} onChange={(e) => setTrf({ ...trf, cantidad: e.target.value })} /></div>
        </div>
      </Modal>

      <Modal open={whModal} onClose={() => setWhModal(false)} title={whEdit ? 'Editar almacén' : 'Nuevo almacén'} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setWhModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarAlmacen} disabled={busy}>{busy ? 'Guardando…' : 'Guardar almacén'}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Nombre <span className="req">*</span></label><input className="input" value={whForm.nombre} onChange={(e) => setWhForm({ ...whForm, nombre: e.target.value })} /></div>
          <div className="field"><label>Dirección <span className="req">*</span></label><input className="input" value={whForm.direccion} onChange={(e) => setWhForm({ ...whForm, direccion: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Zona</label><input className="input" value={whForm.zona} onChange={(e) => setWhForm({ ...whForm, zona: e.target.value })} /></div>
            <div className="field"><label>Ciudad</label><input className="input" value={whForm.ciudad} onChange={(e) => setWhForm({ ...whForm, ciudad: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Encargado</label><input className="input" value={whForm.encargado} onChange={(e) => setWhForm({ ...whForm, encargado: e.target.value })} /></div>
            <div className="field"><label>Teléfono</label><input className="input" value={whForm.telefono} onChange={(e) => setWhForm({ ...whForm, telefono: e.target.value })} /></div>
          </div>
        </div>
      </Modal>

      <Modal open={loteOpen} onClose={() => setLoteOpen(false)} title="Cargar imágenes de productos" subtitle="Nombra cada archivo con el SKU, por ejemplo DAD-001.webp" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setLoteOpen(false)}>Cerrar</button><button className="btn btn-primary" onClick={subirLote} disabled={busy || !loteArchivos.length}>{busy ? `Subiendo… ${loteProgreso}%` : `Subir ${loteArchivos.length} imágenes`}</button></>}>
        <div className="form-stack">
          <div className="notice notice-info"><UploadCloud size={15} /> Cada imagen se redimensiona a 800 px y se convierte a WebP antes de subirla. Peso ideal 30–60 KB, máximo 200 KB. Se envían en lotes de 40 para no saturar la conexión.</div>
          <div className="field"><label>Seleccionar imágenes (varias)</label><input type="file" accept="image/*" multiple className="input" onChange={(e) => { setLoteArchivos([...(e.target.files || [])]); setLoteResultado(null); }} /></div>
          {loteArchivos.length > 0 && <div className="small muted">{loteArchivos.length} archivos · ej. {skuDeArchivo(loteArchivos[0].name)}</div>}
          {busy && <div className="progress"><span className="progress-fill" style={{ width: `${loteProgreso}%` }} /></div>}
          {loteResultado && <div className="notice notice-info">Cargadas: {loteResultado.cargadas}{loteResultado.errores.length > 0 ? ` · Errores: ${loteResultado.errores.join('; ')}` : ''}</div>}
        </div>
      </Modal>

      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Importar productos desde Excel" subtitle="Columnas: nombre, sku, categoria, precio, costo, unidad, unidades_por_caja, stock_minimo, stock_inicial, emoji, color" size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setImportOpen(false)}>Cerrar</button><button className="btn btn-outline" onClick={() => descargarPlantilla(columnasProductos, 'plantilla-productos.xlsx')}><FileSpreadsheet size={14} /> Descargar plantilla</button><button className="btn btn-primary" onClick={confirmarImportacion} disabled={importando || !importRows.length}>{importando ? 'Importando…' : `Importar ${importRows.length} filas`}</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Archivo .xlsx o .xls</label><input className="input" type="file" accept=".xlsx,.xls" onChange={procesarExcel} /></div>
          {importRows.length > 0 && (
            <>
              <div className="notice notice-info"><FileSpreadsheet size={14} /> {importRows.length} filas listas para importar. Columnas detectadas: {Object.keys(importRows[0]).join(', ')}</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>#</th><th>Nombre</th><th>SKU</th><th>Precio</th><th>Stock inicial</th></tr></thead>
                  <tbody>
                    {importRows.slice(0, 12).map((f, i) => (
                      <tr key={i}><td>{i + 2}</td><td className="cell-strong">{f.nombre || f.Nombre || f.NOMBRE || '—'}</td><td>{f.sku || f.SKU || '—'}</td><td>{f.precio ?? f.Precio ?? '—'}</td><td>{f.stock_inicial ?? f.stockInicial ?? f.stock ?? 0}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {importResult && (
            <div className={`notice ${importResult.errores.length ? 'notice-warn' : 'notice-info'}`}>
              {importResult.creados} creados · {importResult.errores.length} errores de {importResult.total} filas.
              {importResult.errores.slice(0, 5).map((e) => <div key={e.fila}>Fila {e.fila}: {e.error}</div>)}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
