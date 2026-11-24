import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, FileSpreadsheet, RefreshCcw, Save, Search, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { descargarExcel, descargarPlantilla, leerExcel } from '../excel';
import { Badge, EmptyState, Modal, PageHeader, SkeletonRows, useToast } from '../ui';

const COLUMNAS = ['sku', 'nombre', 'precio', 'costo'];
const num = (v) => {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

export default function ActualizarPrecios() {
  const toast = useToast();
  const archivoRef = useRef(null);
  const [productos, setProductos] = useState([]);
  const [cambios, setCambios] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [soloCambiados, setSoloCambiados] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get('/productos');
      setProductos(r.productos || []);
      setCambios({});
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return productos.filter((p) => {
      if (soloCambiados && !cambios[p.id]) return false;
      if (!q) return true;
      return `${p.nombre} ${p.sku} ${p.categoria || ''}`.toLowerCase().includes(q);
    });
  }, [productos, busqueda, soloCambiados, cambios]);

  const totalCambios = Object.keys(cambios).length;

  const ponerCambio = (producto, campo, valor) => {
    setCambios((prev) => {
      const actual = prev[producto.id] || {
        id: producto.id, sku: producto.sku, nombre: producto.nombre,
        precio: producto.precio, costo: producto.costo,
      };
      const siguiente = { ...actual, [campo]: valor };
      const sinCambio = num(siguiente.precio) === num(producto.precio)
        && num(siguiente.costo) === num(producto.costo);
      const copia = { ...prev };
      if (sinCambio) delete copia[producto.id];
      else copia[producto.id] = siguiente;
      return copia;
    });
  };

  const exportar = async () => {
    try {
      await descargarExcel(productos.map((p) => ({
        sku: p.sku, nombre: p.nombre, precio: p.precio, costo: p.costo ?? 0,
      })), 'precios-dadini.xlsx', COLUMNAS);
      toast('Precios actuales descargados. Edítalos y súbelos de nuevo.', 'info');
    } catch (error) { toast(error.message, 'error'); }
  };

  const leerArchivo = async (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    try {
      const filas = await leerExcel(archivo);
      if (!filas.length) return toast('El Excel no contiene filas.', 'error');
      const porSku = new Map(productos.map((p) => [String(p.sku || '').trim().toUpperCase(), p]));
      const porNombre = new Map(productos.map((p) => [String(p.nombre || '').trim().toUpperCase(), p]));
      const nuevos = {};
      let noEncontrados = 0;
      filas.forEach((f) => {
        const sku = String(f.sku ?? f.SKU ?? '').trim().toUpperCase();
        const nombre = String(f.nombre ?? f.Nombre ?? '').trim().toUpperCase();
        const p = porSku.get(sku) || porNombre.get(nombre);
        if (!p) { noEncontrados += 1; return; }
        const precio = f.precio ?? f.Precio ?? '';
        const costo = f.costo ?? f.Costo ?? '';
        if (precio === '' && costo === '') return;
        nuevos[p.id] = {
          id: p.id, sku: p.sku, nombre: p.nombre,
          precio: precio === '' ? p.precio : precio,
          costo: costo === '' ? (p.costo ?? 0) : costo,
        };
      });
      setCambios(nuevos);
      setResultado(null);
      toast(`${Object.keys(nuevos).length} precios listos para aplicar${noEncontrados ? ` · ${noEncontrados} filas sin producto` : ''}`, noEncontrados ? 'info' : 'info');
    } catch (error) {
      toast(`No se pudo leer el Excel: ${error.message}`, 'error');
    } finally {
      if (archivoRef.current) archivoRef.current.value = '';
    }
  };

  const aplicar = async () => {
    if (!totalCambios) return;
    setBusy(true);
    try {
      const r = await api.post('/productos/precios-masivos', {
        productos: Object.values(cambios).map((c) => ({
          id: c.id, sku: c.sku, precio: num(c.precio), costo: num(c.costo),
        })),
      });
      setResultado(r);
      toast(`${r.actualizados} precios actualizados${r.errores.length ? ` · ${r.errores.length} errores` : ''}`, r.errores.length ? 'error' : 'info');
      if (r.actualizados) await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const acciones = (
    <>
      <input ref={archivoRef} type="file" accept=".xlsx,.xls" onChange={leerArchivo} style={{ display: 'none' }} />
      <button className="btn btn-ghost" onClick={() => archivoRef.current?.click()}><FileSpreadsheet size={14} /> Subir Excel</button>
      <button className="btn btn-outline" onClick={exportar}><ArrowDownToLine size={14} /> Descargar precios</button>
      <button className="btn btn-outline" onClick={() => descargarPlantilla(COLUMNAS, 'plantilla-precios.xlsx')}><FileSpreadsheet size={14} /> Plantilla</button>
      <button className="btn btn-primary" onClick={aplicar} disabled={busy || !totalCambios}>
        <Save size={14} /> {busy ? 'Aplicando…' : `Aplicar ${totalCambios} cambios`}
      </button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Actualizar precios"
        subtitle="Modifica precios y costos de todos los productos a la vez, sin entrar uno por uno"
        actions={acciones}
      />

      <div className="panel">
        <div className="filters" style={{ padding: 16, paddingBottom: 0 }}>
          <div className="search-box">
            <Search size={15} />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, SKU o categoría…" />
          </div>
          <label className="check">
            <input type="checkbox" checked={soloCambiados} onChange={(e) => setSoloCambiados(e.target.checked)} />
            Solo cambios pendientes {totalCambios ? <Badge tone="orange">{totalCambios}</Badge> : null}
          </label>
          <button className="icon-btn" onClick={cargar} title="Recargar productos"><RefreshCcw size={15} /></button>
        </div>

        <div className="notice notice-info" style={{ margin: '12px 16px' }}>
          Edita el <b>Precio</b> o el <b>Costo</b> directamente en la tabla, o sube un Excel con las columnas
          <code> sku, nombre, precio, costo </code>. Los cambios no se guardan hasta presionar <b>Aplicar</b>.
        </div>

        {loading ? <SkeletonRows rows={8} /> : filtrados.length === 0 ? (
          <EmptyState title="No hay productos" message="No se encontraron productos con ese filtro." />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>SKU</th><th>Producto</th><th>Categoría</th>
                  <th>Precio actual</th><th>Precio nuevo</th><th>Costo actual</th><th>Costo nuevo</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((p) => {
                  const c = cambios[p.id];
                  return (
                    <tr key={p.id} className={c ? 'fila-cambio' : ''}>
                      <td><code>{p.sku}</code></td>
                      <td><strong>{p.nombre}</strong></td>
                      <td>{p.categoria || '—'}</td>
                      <td>{Number(p.precio || 0).toFixed(2)}</td>
                      <td>
                        <input
                          className="input-precio" type="number" step="0.01" min="0"
                          value={c?.precio ?? p.precio ?? 0}
                          onChange={(e) => ponerCambio(p, 'precio', e.target.value)}
                        />
                      </td>
                      <td>{Number(p.costo || 0).toFixed(2)}</td>
                      <td>
                        <input
                          className="input-precio" type="number" step="0.01" min="0"
                          value={c?.costo ?? p.costo ?? 0}
                          onChange={(e) => ponerCambio(p, 'costo', e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!resultado}
        onClose={() => setResultado(null)}
        title="Resultado de la actualización"
        subtitle="Detalle de cada producto procesado"
        footer={<button className="btn btn-primary" onClick={() => setResultado(null)}>Entendido</button>}
      >
        {resultado && (
          <>
            <div className="notice notice-success"><CheckCircle2 size={14} /> {resultado.actualizados} precios actualizados y guardados.</div>
            {!!resultado.errores?.length && (
              <div className="sync-errores">
                <strong>Errores ({resultado.errores.length})</strong>
                {resultado.errores.map((e, i) => (
                  <div key={i} className="sync-error-item"><b>Fila {e.fila} {e.sku || ''}</b><span>{e.error}</span></div>
                ))}
              </div>
            )}
            {!!resultado.omitidos?.length && (
              <p style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 10 }}>
                {resultado.omitidos.length} filas sin cambios: {resultado.omitidos.map((o) => o.sku).filter(Boolean).join(', ')}
              </p>
            )}
            {!!resultado.detalles?.length && (
              <details className="sync-detalles">
                <summary>Ver todos los cambios aplicados</summary>
                {resultado.detalles.map((d) => (
                  <p key={d.id}>{d.sku} · {d.nombre}: {Number(d.precio_anterior).toFixed(2)} → <b>{Number(d.precio_nuevo).toFixed(2)}</b></p>
                ))}
              </details>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
