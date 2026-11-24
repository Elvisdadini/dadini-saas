import { useCallback, useEffect, useState } from 'react';
import { Download, FileText, Printer, Share2 } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import SelectorEmpleadosWhatsapp from '../components/SelectorEmpleadosWhatsapp';

const LIMITE_IMG = 16; // 4 x 4 por hoja carta
const LIMITE_TEXTO = 35; // 5 x 7 por hoja

function aJpeg(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const escala = Math.min(1, 600 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.round(img.width * escala));
        canvas.height = Math.max(1, Math.round(img.height * escala));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.62));
      } catch (e) { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function Catalogo() {
  const toast = useToast();
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [opciones, setOpciones] = useState({ con_precios: true, con_nombres: true, con_detalles: true, con_imagenes: true, categoria: 'todas' });
  const [resultado, setResultado] = useState(null);
  const [vistaOpen, setVistaOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [selectorUrl, setSelectorUrl] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, h] = await Promise.all([api.get('/productos'), api.get('/catalogo-pdf')]);
      setProductos(p.productos || []);
      setCategorias(p.categorias || []);
      setHistorial(h.catalogos || []);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const seleccionados = productos.filter((p) => opciones.categoria === 'todas' || p.categoria === opciones.categoria);
  const porHoja = opciones.con_imagenes ? LIMITE_IMG : LIMITE_TEXTO;
  const paginas = Math.max(1, Math.ceil(seleccionados.length / porHoja));

  const generar = async () => {
    if (!seleccionados.length) return toast('No hay productos para el catálogo.', 'error');
    setBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
      const ancho = 612; const alto = 792; const margen = 24;
      const cols = opciones.con_imagenes ? 4 : 5;
      const filas = opciones.con_imagenes ? 4 : 7;
      const gap = 8;
      const cw = (ancho - margen * 2 - gap * (cols - 1)) / cols;
      const ch = (alto - 74 - margen - gap * (filas - 1)) / filas;

      for (let pagina = 0; pagina < paginas; pagina++) {
        if (pagina > 0) doc.addPage();
        doc.setFillColor(6, 28, 51);
        doc.rect(0, 0, ancho, 54, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text('DADINI · Catálogo de productos', margen, 26);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Cochabamba, Bolivia · ${new Date().toLocaleDateString('es-BO')} · Página ${pagina + 1} de ${paginas}`, margen, 42);

        const bloque = seleccionados.slice(pagina * porHoja, (pagina + 1) * porHoja);
        const imagenes = opciones.con_imagenes ? await Promise.all(bloque.map((p) => (p.imagen_url ? aJpeg(p.imagen_url) : null))) : [];

        bloque.forEach((p, i) => {
          const col = i % cols; const fila = Math.floor(i / cols);
          const x = margen + col * (cw + gap);
          const y = 66 + fila * (ch + gap);
          doc.setDrawColor(220, 226, 234);
          doc.setFillColor(255, 255, 255);
          doc.roundedRect(x, y, cw, ch, 4, 4, 'FD');
          let cursor = y + 6;
          const img = imagenes[i];
          if (img) {
            const ih = opciones.con_imagenes ? Math.min(ch * 0.56, 96) : 0;
            const iw = Math.min(cw - 12, ih * 1.4);
            try { doc.addImage(img, 'JPEG', x + (cw - iw) / 2, cursor, iw, ih, undefined, 'FAST'); } catch (e) { /* sin imagen */ }
            cursor += ih + 6;
          }
          doc.setTextColor(15, 31, 54);
          if (opciones.con_nombres) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(opciones.con_imagenes ? 8.5 : 8);
            const nombre = String(p.nombre || '').toUpperCase();
            const lineas = doc.splitTextToSize(nombre, cw - 10).slice(0, opciones.con_imagenes ? 2 : 3);
            doc.text(lineas, x + 5, cursor + 9);
            cursor += lineas.length * 10 + 2;
          }
          if (opciones.con_detalles) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(90, 104, 124);
            const det = [];
            if (p.peso_kg) det.push(`Peso ${p.peso_kg} kg/u`);
            if (p.unidades_por_caja) det.push(`${p.unidades_por_caja} u./caja`);
            if (p.presentacion) det.push(`Venta ${p.presentacion}`);
            doc.text(doc.splitTextToSize(det.join(' · '), cw - 10).slice(0, 2), x + 5, Math.min(cursor + 8, y + ch - 16));
          }
          if (opciones.con_precios) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(opciones.con_imagenes ? 11 : 9);
            doc.setTextColor(255, 101, 0);
            doc.text(`Bs ${Number(p.precio || 0).toFixed(2)}`, x + 5, y + ch - 7);
          }
        });
      }
      const pdf = doc.output('datauristring');
      const r = await api.post('/catalogo-pdf/guardar', { pdf, nombre: 'catalogo-dadini' });
      setResultado(r);
      toast(`Catálogo generado · ${paginas} página(s) · ${Math.round(r.bytes / 1024)} KB`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const compartir = (url) => {
    const texto = `Hola, aquí tienes el catálogo de productos DADINI: ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
  };

  if (loading) return <><PageHeader eyebrow="Catálogo / Documentos" title="Generar catálogo" subtitle="Preparando productos…" /><div className="panel"><SkeletonRows rows={6} /></div></>;

  return (
    <>
      <PageHeader
        eyebrow="Catálogo / Documentos"
        title="Generar catálogo"
        subtitle="Documento PDF tamaño carta, ligero y con varias imágenes por hoja, listo para compartir por WhatsApp."
        actions={<button className="btn btn-primary" onClick={generar} disabled={busy || !seleccionados.length}><FileText size={14} /> {busy ? 'Generando…' : 'Generar catálogo PDF'}</button>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Productos" value={seleccionados.length} icon={FileText} tone="blue" />
        <StatCard label="Hojas estimadas" value={paginas} icon={Printer} tone="orange" hint={`${porHoja} productos por hoja`} />
        <StatCard label="Catálogos generados" value={historial.length} icon={Download} tone="green" />
        <StatCard label="Con imagen" value={productos.filter((p) => p.imagen_url).length} icon={FileText} tone="purple" />
      </div>

      <div className="grid grid-2" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Opciones del documento</h3><p>Activa o desactiva lo que debe aparecer en el PDF</p></div></div>
          <div className="panel-body">
            <div className="grid grid-2" style={{ gap: 8 }}>
              {[
                ['con_imagenes', 'Incluir imágenes'],
                ['con_nombres', 'Con nombres'],
                ['con_precios', 'Con precios'],
                ['con_detalles', 'Con detalles (peso, u./caja, venta)'],
              ].map(([clave, etiqueta]) => (
                <label key={clave} className="check"><input type="checkbox" checked={opciones[clave]} onChange={(e) => setOpciones({ ...opciones, [clave]: e.target.checked })} /> {etiqueta}</label>
              ))}
            </div>
            <div className="field mt-12"><label>Categoría</label><select className="select" value={opciones.categoria} onChange={(e) => setOpciones({ ...opciones, categoria: e.target.value })}><option value="todas">Todas</option>{categorias.map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div className="notice notice-info mt-12">Tamaño carta · imágenes JPEG comprimidas para que el archivo sea liviano y quepan más productos por hoja.</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Resultado</h3><p>Último catálogo generado</p></div></div>
          <div className="panel-body">
            {!resultado ? <EmptyState icon={FileText} title="Sin catálogo generado" message="Ajusta las opciones y pulsa Generar catálogo PDF." /> : (
              <div className="form-stack">
                <div className="notice notice-info"><Badge tone="green">Listo</Badge> {Math.round(resultado.bytes / 1024)} KB · {paginas} hoja(s)</div>
                <div className="inline">
                  <button className="btn btn-outline" onClick={() => setVistaOpen(true)}><FileText size={14} /> Visualizar catálogo</button>
                  <button className="btn btn-green" onClick={() => { setSelectorUrl(resultado.url); setSelectorOpen(true); }}><Share2 size={14} /> Enviar por WhatsApp</button>
                  <a className="btn btn-soft" href={resultado.url} download target="_blank" rel="noreferrer"><Download size={14} /> Descargar</a>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head"><div><h3>Catálogos generados</h3><p>Historial de documentos para reenviar</p></div></div>
        {historial.length === 0 ? <div className="table-empty">Aún no hay catálogos.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Archivo</th><th className="num">Tamaño</th><th>Fecha</th><th /></tr></thead>
              <tbody>{historial.map((h) => <tr key={h.nombre}><td className="cell-strong">{h.nombre}</td><td className="num">{Math.round(h.bytes / 1024)} KB</td><td><Fecha value={h.creado} /></td><td className="actions"><button className="btn btn-soft btn-sm" onClick={() => setVistaOpen(h.url)}>Ver</button><button className="btn btn-green btn-sm" onClick={() => { setSelectorUrl(h.url); setSelectorOpen(true); }}>Compartir</button></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </div>

      <SelectorEmpleadosWhatsapp
        open={selectorOpen}
        onClose={() => setSelectorOpen(false)}
        titulo="Enviar catálogo por WhatsApp"
        tipo="otro"
        tituloDocumento="Catálogo de productos DADINI"
        urlAdjunto={selectorUrl}
        mensaje="Hola, aquí tienes el catálogo de productos DADINI actualizado."
      />

      <Modal open={Boolean(vistaOpen)} onClose={() => setVistaOpen(false)} title="Vista del catálogo" size="xl">
        {vistaOpen && typeof vistaOpen === 'string'
          ? <iframe src={vistaOpen} title="Catálogo PDF" style={{ width: '100%', height: 620, border: 0 }} />
          : <iframe src={resultado?.url} title="Catálogo PDF" style={{ width: '100%', height: 620, border: 0 }} />}
      </Modal>
    </>
  );
}
