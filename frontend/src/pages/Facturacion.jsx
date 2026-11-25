import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Calculator, CheckCircle2, Download, FileText, Pencil, RefreshCcw, ShieldCheck, XCircle } from 'lucide-react';
import { api } from '../api';
import { Badge, Confirm, EmptyState, Fecha, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import { Money, Num } from '../ui';

const CONFIG_VACIA = {
  nit: '', razon_social: '', actividad: '', sucursal: 'Casa Matriz', punto_venta: '0',
  modalidad: 'computarizada_sfv', autorizacion: '', codigo_control: '', fecha_autorizacion: '',
  facturacion_activa: true,
};

export default function Facturacion() {
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [facturas, setFacturas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [config, setConfig] = useState(CONFIG_VACIA);
  const [editarNorma, setEditarNorma] = useState(null);
  const [normaForm, setNormaForm] = useState({});
  const [monto, setMonto] = useState('100');
  const [calculo, setCalculo] = useState(null);
  const [verFactura, setVerFactura] = useState(null);
  const [anular, setAnular] = useState(null);
  const [pdfBusy, setPdfBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [d, f] = await Promise.all([api.get('/fiscal'), api.get('/fiscal/facturas')]);
      setDatos(d);
      setFacturas(f.facturas || []);
      setConfig({
        nit: d.fiscal?.nit || '', razon_social: d.fiscal?.razon_social || '',
        actividad: d.fiscal?.actividad || '', sucursal: d.fiscal?.sucursal || 'Casa Matriz',
        punto_venta: d.fiscal?.punto_venta || '0', modalidad: d.fiscal?.modalidad || 'computarizada_sfv',
        autorizacion: d.fiscal?.autorizacion || '', codigo_control: d.fiscal?.codigo_control || '',
        fecha_autorizacion: d.fiscal?.fecha_autorizacion || '', facturacion_activa: d.fiscal?.facturacion_activa !== false,
      });
      if (monto) calcular(monto);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { cargar(); }, [cargar]);

  const calcular = async (valor) => {
    if (!valor) { setCalculo(null); return; }
    try { setCalculo(await api.get(`/fiscal?monto=${encodeURIComponent(valor)}`)); }
    catch (error) { toast(error.message, 'error'); }
  };

  const actualizarNormativa = async () => {
    setActualizando(true);
    try {
      const r = await api.post('/fiscal/normativa/actualizar', {});
      toast(`Normativa actualizada · ${r.nuevas} nuevas, ${r.actualizadas} actualizadas · ${r.vigentes} vigentes`, 'info');
      if (r.aviso) toast(r.aviso, 'error');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setActualizando(false); }
  };

  const guardarConfig = async () => {
    setActualizando(true);
    try {
      await api.put('/fiscal/config', config);
      toast('Configuración fiscal guardada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setActualizando(false); }
  };

  const guardarNorma = async () => {
    try {
      await api.put(`/fiscal/normativa/${editarNorma.id}`, {
        valor: Number(normaForm.valor), activa: normaForm.activa,
        fecha_desde: normaForm.fecha_desde || null, fecha_hasta: normaForm.fecha_hasta || null,
        descripcion: normaForm.descripcion,
      });
      toast('Norma actualizada manualmente (no será sobrescrita por la actualización automática)');
      setEditarNorma(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const confirmarAnulacion = async () => {
    try {
      await api.post(`/fiscal/facturas/${anular.id}/anular`, {});
      toast('Factura anulada');
      setAnular(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const generarPdf = async (factura) => {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
      const cfg = datos?.fiscal || {};
      doc.setFillColor(6, 28, 51);
      doc.rect(0, 0, 612, 70, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text(cfg.razon_social || 'DADINI', 30, 30);
      doc.setFontSize(9); doc.setFont('helvetica', 'normal');
      doc.text(`NIT: ${cfg.nit || '-'}  ·  Actividad: ${cfg.actividad || '-'}`, 30, 48);
      doc.text(`${cfg.sucursal || 'Casa Matriz'}  ·  Punto de venta ${cfg.punto_venta || '0'}`, 30, 62);

      doc.setTextColor(15, 31, 54); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
      doc.text('FACTURA', 30, 100);
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      doc.text(`Número: ${factura.numero}`, 30, 118);
      doc.text(`Fecha: ${factura.fecha}`, 30, 132);
      doc.text(`Modalidad: ${factura.modalidad}`, 30, 146);
      doc.text(`Autorización: ${factura.autorizacion || '-'}`, 30, 160);
      doc.text(`Señor(es): ${factura.comprador?.nombre || 'S/N'}`, 30, 182);
      doc.text(`NIT/CI: ${factura.comprador?.nit || '0'}`, 30, 196);

      let y = 225;
      doc.setFillColor(238, 242, 248); doc.rect(30, y - 14, 552, 20, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('DESCRIPCION', 36, y); doc.text('CANT.', 360, y); doc.text('P. UNIT.', 420, y); doc.text('SUBTOTAL', 500, y);
      y += 20;
      doc.setFont('helvetica', 'normal');
      (factura.items || factura.lineas || []).forEach((it) => {
        doc.text(String(it.nombre || '').slice(0, 55), 36, y);
        doc.text(String(it.cantidad ?? ''), 360, y);
        doc.text((Number(it.precio || 0)).toFixed(2), 420, y);
        doc.text((Number(it.subtotal || 0)).toFixed(2), 500, y);
        y += 16;
        if (y > 690) { doc.addPage(); y = 60; }
      });
      y += 10;
      doc.setFont('helvetica', 'bold');
      doc.text(`Subtotal Bs ${Number(factura.subtotal || 0).toFixed(2)}`, 380, y); y += 16;
      doc.text(`IVA ${factura.iva_porcentaje || 13}% (${factura.metodo_iva || 'por_dentro'}) Bs ${Number(factura.iva || 0).toFixed(2)}`, 380, y); y += 16;
      doc.text(`IT ${factura.it_porcentaje || 3}% Bs ${Number(factura.it || 0).toFixed(2)}`, 380, y); y += 16;
      doc.setFontSize(12);
      doc.text(`TOTAL Bs ${Number(factura.total || 0).toFixed(2)}`, 380, y); y += 24;
      doc.setFontSize(8); doc.setTextColor(110, 120, 135);
      doc.text('Representación gráfica de un documento fiscal digital. SIN VALOR LEGAL sin autorización del SIN.', 30, y);
      doc.text(`Normativa aplicada: ${factura.normativa_version || '-'}`, 30, y + 12);

      const pdf = doc.output('datauristring');
      const r = await api.post(`/fiscal/facturas/${factura.pedido_id}/pdf`, { pdf });
      toast('Factura PDF guardada');
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setPdfBusy(false); }
  };

  if (loading && !datos) return <><PageHeader eyebrow="Sistema / Facturación" title="Facturación SIAT" subtitle="Cargando…" /><div className="panel"><SkeletonRows rows={6} /></div></>;

  const vigentes = datos?.vigentes || [];
  const normas = datos?.reglas || [];
  const calc = calculo?.calculo;

  return (
    <>
      <PageHeader
        eyebrow="Sistema / Facturación"
        title="Facturación SIAT"
        subtitle="Normativa vigente por fecha, facturas por venta y configuración fiscal.actualización automática de normas"
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={actualizarNormativa} disabled={actualizando}><ShieldCheck size={14} /> {actualizando ? 'Actualizando…' : 'Actualizar normativa SIAT'}</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Normas vigentes" value={vigentes.length} icon={CheckCircle2} tone="green" hint={`Versión ${datos?.version || '-'}`} />
        <StatCard label="Facturas emitidas" value={facturas.length} icon={FileText} tone="blue" />
        <StatCard label="IVA vigente" value={`${(vigentes.find((r) => r.tipo === 'iva')?.valor) || 13}%`} icon={Calculator} tone="orange" />
        <StatCard label="IT vigente" value={`${(vigentes.find((r) => r.tipo === 'it')?.valor) || 3}%`} icon={ShieldCheck} tone="purple" />
      </div>

      <div className="grid grid-2" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Calcular impuestos</h3><p>Según la normativa vigente a la fecha</p></div></div>
          <div className="panel-body">
            <div className="field"><label>Monto (Bs)</label><input className="input" type="number" step="0.01" value={monto} onChange={(e) => { setMonto(e.target.value); calcular(e.target.value); }} /></div>
            {calc && (
              <div className="grid grid-2 mt-12" style={{ gap: 8 }}>
                <div className="mini-stat"><span>Método IVA</span><strong>{calc.metodo === 'por_fuera' ? 'Por fuera' : 'Por dentro'}</strong></div>
                <div className="mini-stat"><span>Neto</span><strong><Money value={calc.neto} /></strong></div>
                <div className="mini-stat"><span>IVA {calc.iva_porcentaje}%</span><strong><Money value={calc.iva} /></strong></div>
                <div className="mini-stat"><span>IT {calc.it_porcentaje}%</span><strong><Money value={calc.it} /></strong></div>
                <div className="mini-stat" style={{ gridColumn: '1 / -1' }}><span>Total</span><strong><Money value={calc.total} /></strong></div>
              </div>
            )}
            {vigentes.some((r) => r.pendiente_decreto) && (
              <div className="notice notice-warn mt-12"><AlertTriangle size={14} /> Hay normas aprobadas pero pendientes de Decreto Supremo; no se aplican hasta confirmación oficial.</div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Datos del contribuyente</h3><p>Se imprimen en cada factura</p></div></div>
          <div className="panel-body">
            <div className="form-stack">
              <div className="field-row">
                <div className="field"><label>NIT</label><input className="input" value={config.nit} onChange={(e) => setConfig({ ...config, nit: e.target.value })} /></div>
                <div className="field"><label>Razón social</label><input className="input" value={config.razon_social} onChange={(e) => setConfig({ ...config, razon_social: e.target.value })} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Actividad</label><input className="input" value={config.actividad} onChange={(e) => setConfig({ ...config, actividad: e.target.value })} /></div>
                <div className="field"><label>Modalidad</label><select className="select" value={config.modalidad} onChange={(e) => setConfig({ ...config, modalidad: e.target.value })}><option value="computarizada_sfv">Computarizada SFV</option><option value="electronica_linea">Electrónica en línea</option><option value="computarizada_linea">Computarizada en línea</option><option value="portal_web">Portal Web en línea</option><option value="manual">Manual</option></select></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Sucursal</label><input className="input" value={config.sucursal} onChange={(e) => setConfig({ ...config, sucursal: e.target.value })} /></div>
                <div className="field"><label>Punto de venta</label><input className="input" value={config.punto_venta} onChange={(e) => setConfig({ ...config, punto_venta: e.target.value })} /></div>
              </div>
              <div className="field-row">
                <div className="field"><label>Autorización / Código de control</label><input className="input" value={config.autorizacion} onChange={(e) => setConfig({ ...config, autorizacion: e.target.value })} /></div>
                <div className="field"><label>Código de control</label><input className="input" value={config.codigo_control} onChange={(e) => setConfig({ ...config, codigo_control: e.target.value })} /></div>
              </div>
              <label className="check"><input type="checkbox" checked={config.facturacion_activa} onChange={(e) => setConfig({ ...config, facturacion_activa: e.target.checked })} /> Generar factura automáticamente en cada venta</label>
              <button className="btn btn-primary btn-block" onClick={guardarConfig} disabled={actualizando}>Guardar configuración fiscal</button>
              <span className="hint">Último correlativo: {datos?.fiscal?.dosificacion?.ultimo_numero || 0}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head"><div><h3>Normativa SIAT</h3><p>Vigencias con fecha: aumentos, reducciones y normas temporales se aplican solos</p></div><Badge tone="blue">{normas.length} normas</Badge></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Norma</th><th>Tipo</th><th>Valor</th><th>Desde</th><th>Hasta</th><th>Estado</th><th /></tr></thead>
            <tbody>
              {normas.map((n) => (
                <tr key={n.id}>
                  <td className="cell-strong">{n.norma}<span className="cell-sub">{n.fuente}</span></td>
                  <td>{n.tipo}</td>
                  <td className="num">{n.valor !== undefined ? n.valor : '—'}{n.tipo === 'iva' || n.tipo === 'it' ? '%' : ''}</td>
                  <td>{n.fecha_desde || <span className="muted">Pendiente</span>}</td>
                  <td>{n.fecha_hasta || '—'}</td>
                  <td><Badge tone={n.activa && !n.pendiente_decreto ? 'green' : n.pendiente_decreto ? 'amber' : 'gray'}>{n.pendiente_decreto ? 'Pendiente DS' : n.activa ? 'Activa' : 'Inactiva'}</Badge></td>
                  <td className="actions"><button className="icon-btn" title="Editar norma" onClick={() => { setEditarNorma(n); setNormaForm({ valor: n.valor, activa: n.activa, fecha_desde: n.fecha_desde || '', fecha_hasta: n.fecha_hasta || '', descripcion: n.descripcion }); }}><Pencil size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head"><div><h3>Facturas emitidas</h3><p>Generadas automáticamente con cada venta</p></div></div>
        {!facturas.length ? <div className="table-empty">Aún no hay facturas. Registra una venta para generar la primera.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Número</th><th>Cliente</th><th>Fecha</th><th className="num">Total</th><th>IVA</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {facturas.map((f, i) => (
                  <tr key={`${f.numero}-${i}`}>
                    <td className="cell-strong">{f.numero}<span className="cell-sub">{f.pedido_codigo}</span></td>
                    <td>{f.cliente_nombre}</td>
                    <td><Fecha value={f.fecha} /></td>
                    <td className="num"><Money value={f.total} /></td>
                    <td>{f.iva_porcentaje}% · <Money value={f.iva} /></td>
                    <td><Badge tone={f.estado === 'anulada' ? 'red' : 'green'}>{f.estado}</Badge></td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" onClick={() => setVerFactura(f)}>Ver</button>
                      <button className="icon-btn" title="Descargar PDF" disabled={pdfBusy || f.estado === 'anulada'} onClick={() => generarPdf(f)}><Download size={14} /></button>
                      {f.estado !== 'anulada' && <button className="icon-btn danger" title="Anular factura" onClick={() => setAnular(f)}><XCircle size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={Boolean(verFactura)} onClose={() => setVerFactura(null)} title={`Factura ${verFactura?.numero || ''}`} size="lg"
        footer={<><button className="btn btn-ghost" onClick={() => setVerFactura(null)}>Cerrar</button><button className="btn btn-primary" onClick={() => generarPdf(verFactura)} disabled={pdfBusy}>Descargar PDF</button></>}
      >
        {verFactura && (
          <div className="form-stack">
            <div className="summary-box">
              <div className="split"><span className="small muted">NIT</span><strong>{verFactura.nit}</strong></div>
              <div className="split mt-8"><span className="small muted">Comprador</span><strong>{verFactura.comprador?.nombre} · NIT {verFactura.comprador?.nit}</strong></div>
              <div className="split mt-8"><span className="small muted">Subtotal</span><strong><Money value={verFactura.subtotal} /></strong></div>
              <div className="split mt-8"><span className="small muted">IVA {verFactura.iva_porcentaje}% ({verFactura.metodo_iva})</span><strong><Money value={verFactura.iva} /></strong></div>
              <div className="split mt-8"><span className="small muted">IT {verFactura.it_porcentaje}%</span><strong><Money value={verFactura.it} /></strong></div>
              <div className="split mt-8"><span className="small muted">Total</span><strong><Money value={verFactura.total} /></strong></div>
            </div>
            <div className="notice notice-info"><ShieldCheck size={14} /> Normativa {verFactura.normativa_version} · {verFactura.normas_aplicadas?.join(', ')}</div>
          </div>
        )}
      </Modal>

      <Modal open={Boolean(editarNorma)} onClose={() => setEditarNorma(null)} title="Editar norma SIAT" subtitle={editarNorma?.norma}
        footer={<><button className="btn btn-ghost" onClick={() => setEditarNorma(null)}>Cancelar</button><button className="btn btn-primary" onClick={guardarNorma}>Guardar norma</button></>}
      >
        <div className="form-stack">
          <div className="field"><label>Valor</label><input className="input" type="number" step="0.01" value={normaForm.valor || 0} onChange={(e) => setNormaForm({ ...normaForm, valor: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Desde</label><input className="input" type="date" value={normaForm.fecha_desde || ''} onChange={(e) => setNormaForm({ ...normaForm, fecha_desde: e.target.value })} /></div>
            <div className="field"><label>Hasta (temporal)</label><input className="input" type="date" value={normaForm.fecha_hasta || ''} onChange={(e) => setNormaForm({ ...normaForm, fecha_hasta: e.target.value })} /></div>
          </div>
          <label className="check"><input type="checkbox" checked={Boolean(normaForm.activa)} onChange={(e) => setNormaForm({ ...normaForm, activa: e.target.checked })} /> Norma activa</label>
          <div className="field"><label>Descripción</label><textarea className="textarea" value={normaForm.descripcion || ''} onChange={(e) => setNormaForm({ ...normaForm, descripcion: e.target.value })} /></div>
          <span className="hint">Una norma editada a mano no se sobrescribe con la actualización automática. El rango de fechas permite reducciones temporales de impuestos.</span>
        </div>
      </Modal>

      <Confirm open={Boolean(anular)} onClose={() => setAnular(null)} onConfirm={confirmarAnulacion} title="Anular factura" message={`¿Anular ${anular?.numero || ''}? La factura quedará marcada como anulada.`} danger />
    </>
  );
}
