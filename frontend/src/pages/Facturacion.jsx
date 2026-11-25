import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CalendarX2, Calculator, CheckCircle2, Download, FileText, Pencil, Plus, RefreshCcw, Send, ShieldCheck, XCircle } from 'lucide-react';
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
  const [siatForm, setSiatForm] = useState({});
  const [guardandoSiat, setGuardandoSiat] = useState(false);
  const [notas, setNotas] = useState([]);
  const [emitirNota, setEmitirNota] = useState(null);
  const [notaForm, setNotaForm] = useState({ tipo: 'credito', monto: '', motivo: '' });
  const [anularNota, setAnularNota] = useState(null);
  const [fueraPlazo, setFueraPlazo] = useState(null);
  const [fueraPlazoForm, setFueraPlazoForm] = useState({ motivo: '', documento: '' });
  const [notaBusy, setNotaBusy] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [d, f, n] = await Promise.all([api.get('/fiscal'), api.get('/fiscal/facturas'), api.get('/fiscal/notas')]);
      setDatos(d);
      setFacturas(f.facturas || []);
      setNotas(n.notas || []);
      setConfig({
        nit: d.fiscal?.nit || '', razon_social: d.fiscal?.razon_social || '',
        actividad: d.fiscal?.actividad || '', sucursal: d.fiscal?.sucursal || 'Casa Matriz',
        punto_venta: d.fiscal?.punto_venta || '0', modalidad: d.fiscal?.modalidad || 'computarizada_sfv',
        autorizacion: d.fiscal?.autorizacion || '', codigo_control: d.fiscal?.codigo_control || '',
        fecha_autorizacion: d.fiscal?.fecha_autorizacion || '', facturacion_activa: d.fiscal?.facturacion_activa !== false,
      });
      setSiatForm({
        habilitado: d.siat?.habilitado || false,
        ambiente: d.siat?.ambiente || 'piloto',
        url: d.siat?.url || '',
        modalidad: d.siat?.modalidad || d.fiscal?.modalidad || 'computarizada_sfv',
        codigo_sistema: d.siat?.codigo_sistema || '',
        codigo_autorizacion: d.siat?.codigo_autorizacion || '',
        nit: d.siat?.nit || d.fiscal?.nit || '',
        actividad: d.siat?.actividad || d.fiscal?.actividad || '',
        token: '', certificado: '', clave_privada: '', usuario: '', contrasena: '',
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

  const guardarSiat = async () => {
    setGuardandoSiat(true);
    try {
      const r = await api.put('/fiscal/siat', siatForm);
      toast(`Credenciales SIAT guardadas${r.guardados?.length ? ` · ${r.guardados.join(', ')}` : ''}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setGuardandoSiat(false); }
  };

  const generarXmlFactura = async (factura) => {
    setPdfBusy(true);
    try {
      const r = await api.post(`/fiscal/facturas/${factura.pedido_id}/xml`, {});
      toast('XML de la factura generado y guardado');
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setPdfBusy(false); }
  };

  const enviarAlSin = async (factura) => {
    setPdfBusy(true);
    try {
      const r = await api.post(`/fiscal/facturas/${factura.pedido_id}/enviar`, {});
      toast(`Factura enviada al SIN · HTTP ${r.status}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setPdfBusy(false); }
  };

  const abrirNota = (factura) => {
    setEmitirNota(factura);
    setNotaForm({ tipo: 'credito', monto: '', motivo: '' });
  };

  const guardarNota = async () => {
    setNotaBusy(true);
    try {
      await api.post('/fiscal/notas', {
        pedido_id: emitirNota.pedido_id,
        tipo: notaForm.tipo,
        monto: Number(notaForm.monto),
        motivo: notaForm.motivo,
      });
      toast('Nota fiscal emitida y saldo actualizado');
      setEmitirNota(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setNotaBusy(false); }
  };

  const generarXmlNota = async (nota) => {
    setNotaBusy(true);
    try {
      const r = await api.post(`/fiscal/notas/${nota.id}/xml`, {});
      toast('XML de la nota generado y guardado');
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setNotaBusy(false); }
  };

  const enviarNotaSin = async (nota) => {
    setNotaBusy(true);
    try {
      const r = await api.post(`/fiscal/notas/${nota.id}/enviar`, {});
      toast(`Nota enviada al SIN · HTTP ${r.status}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setNotaBusy(false); }
  };

  const confirmarAnulacionNota = async () => {
    try {
      await api.post(`/fiscal/notas/${anularNota.id}/anular`, {});
      toast('Nota anulada');
      setAnularNota(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  const abrirFueraPlazo = (factura) => {
    setFueraPlazo(factura);
    setFueraPlazoForm({ motivo: '', documento: '' });
  };

  const confirmarFueraPlazo = async () => {
    setNotaBusy(true);
    try {
      await api.post(`/fiscal/facturas/${fueraPlazo.pedido_id}/anular-fuera-plazo`, fueraPlazoForm);
      toast('Solicitud de anulación registrada. El SIN resuelve en hasta 6 meses (RND 102600000025).');
      setFueraPlazo(null);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setNotaBusy(false); }
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
        <div className="panel-head">
          <div><h3>Credenciales SIAT / envío XML</h3><p>Guarda los datos cuando los tengas. Los secretos se cifran y nunca se muestran de nuevo.</p></div>
          <Badge tone={datos?.siat?.listo_para_enviar ? 'green' : 'gray'}>{datos?.siat?.listo_para_enviar ? 'Listo para enviar' : 'Sin credenciales'}</Badge>
        </div>
        <div className="panel-body">
          {!datos?.siat?.cifrado_disponible && (
            <div className="notice notice-warn"><AlertTriangle size={14} /> Define <b>SIAT_SECRET_KEY</b> en Render para poder guardar token, certificado, clave privada y contraseña de forma cifrada.</div>
          )}
          <div className="form-stack">
            <label className="check"><input type="checkbox" checked={Boolean(siatForm.habilitado)} onChange={(e) => setSiatForm({ ...siatForm, habilitado: e.target.checked })} /> Habilitar envío de XML al SIN</label>
            <div className="field-row">
              <div className="field"><label>Ambiente</label><select className="select" value={siatForm.ambiente || 'piloto'} onChange={(e) => setSiatForm({ ...siatForm, ambiente: e.target.value })}><option value="piloto">Piloto / pruebas</option><option value="produccion">Producción</option></select></div>
              <div className="field"><label>Modalidad</label><select className="select" value={siatForm.modalidad || 'computarizada_sfv'} onChange={(e) => setSiatForm({ ...siatForm, modalidad: e.target.value })}><option value="electronica_linea">Electrónica en línea</option><option value="computarizada_linea">Computarizada en línea</option><option value="computarizada_sfv">Computarizada SFV</option><option value="portal_web">Portal Web</option><option value="manual">Manual</option></select></div>
            </div>
            <div className="field"><label>URL del servicio SIAT (endpoint)</label><input className="input" value={siatForm.url || ''} onChange={(e) => setSiatForm({ ...siatForm, url: e.target.value })} placeholder="https://.../facturacion/... (piloto o producción)" /></div>
            <div className="field-row">
              <div className="field"><label>Código del sistema</label><input className="input" value={siatForm.codigo_sistema || ''} onChange={(e) => setSiatForm({ ...siatForm, codigo_sistema: e.target.value })} placeholder="Asignado por el SIN" /></div>
              <div className="field"><label>Código de autorización</label><input className="input" value={siatForm.codigo_autorizacion || ''} onChange={(e) => setSiatForm({ ...siatForm, codigo_autorizacion: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>NIT (SIAT)</label><input className="input" value={siatForm.nit || ''} onChange={(e) => setSiatForm({ ...siatForm, nit: e.target.value })} /></div>
              <div className="field"><label>Código de actividad</label><input className="input" value={siatForm.actividad || ''} onChange={(e) => setSiatForm({ ...siatForm, actividad: e.target.value })} /></div>
            </div>
            <div className="notice notice-info"><ShieldCheck size={14} /> Los campos de credenciales se guardan cifrados. Los espacios en blanco significan "mantener el valor actual". Estado: token {datos?.siat?.secretos?.token ? '✓ configurado' : '—'}, certificado {datos?.siat?.secretos?.certificado ? '✓' : '—'}, clave privada {datos?.siat?.secretos?.clave_privada ? '✓' : '—'}, usuario {datos?.siat?.secretos?.usuario ? '✓' : '—'}.</div>
            <div className="field-row">
              <div className="field"><label>Token</label><input className="input" type="password" value={siatForm.token || ''} onChange={(e) => setSiatForm({ ...siatForm, token: e.target.value })} placeholder={datos?.siat?.secretos?.token ? '•••• configurado' : 'Cuando lo tengas'} /></div>
              <div className="field"><label>Usuario</label><input className="input" value={siatForm.usuario || ''} onChange={(e) => setSiatForm({ ...siatForm, usuario: e.target.value })} placeholder={datos?.siat?.secretos?.usuario ? '•••• configurado' : 'Cuando lo tengas'} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Contraseña</label><input className="input" type="password" value={siatForm.contrasena || ''} onChange={(e) => setSiatForm({ ...siatForm, contrasena: e.target.value })} placeholder={datos?.siat?.secretos?.contrasena ? '•••• configurado' : 'Cuando lo tengas'} /></div>
              <div className="field"><label>Certificado (PEM)</label><textarea className="textarea" value={siatForm.certificado || ''} onChange={(e) => setSiatForm({ ...siatForm, certificado: e.target.value })} placeholder={datos?.siat?.secretos?.certificado ? '•••• configurado' : 'Cuando lo tengas'} /></div>
            </div>
            <div className="field"><label>Clave privada (PEM)</label><textarea className="textarea" value={siatForm.clave_privada || ''} onChange={(e) => setSiatForm({ ...siatForm, clave_privada: e.target.value })} placeholder={datos?.siat?.secretos?.clave_privada ? '•••• configurado' : 'Cuando lo tengas'} /></div>
            <button className="btn btn-primary btn-block" onClick={guardarSiat} disabled={guardandoSiat}>{guardandoSiat ? 'Guardando…' : 'Guardar credenciales SIAT'}</button>
            {datos?.siat?.ultimo_envio && <span className="hint">Último envío: {new Date(datos.siat.ultimo_envio).toLocaleString('es-BO')} · HTTP {datos.siat.ultimo_resultado?.status}</span>}
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
                      <button className="btn btn-soft btn-sm" title="Generar XML" disabled={pdfBusy || f.estado === 'anulada'} onClick={() => generarXmlFactura(f)}>XML</button>
                      <button className="btn btn-outline btn-sm" title="Enviar al SIN" disabled={pdfBusy || f.estado === 'anulada'} onClick={() => enviarAlSin(f)}>Enviar al SIN</button>
                      {f.estado !== 'anulada' && <button className="btn btn-soft btn-sm" title="Emitir nota de crédito o débito" onClick={() => abrirNota(f)}><Plus size={12} /> Nota</button>}
                      {f.solicitud_anulacion
                        ? <Badge tone="amber">Anulación {f.solicitud_anulacion.estado}</Badge>
                        : <button className="btn btn-ghost btn-sm" title="Solicitar anulación fuera de plazo (RND 102600000025)" onClick={() => abrirFueraPlazo(f)}><CalendarX2 size={12} /> Fuera de plazo</button>}
                      {f.estado !== 'anulada' && <button className="icon-btn danger" title="Anular factura" onClick={() => setAnular(f)}><XCircle size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <div><h3>Notas de crédito y débito</h3><p>Ligadas a una factura. RND 102600000025: anulación fuera de plazo hasta el día 9 del mes siguiente.</p></div>
          <Badge tone="blue">{notas.length} notas</Badge>
        </div>
        {!notas.length ? <div className="table-empty">Aún no hay notas. Usa el botón <b>Nota</b> en una factura para emitir la primera.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Número</th><th>Factura</th><th>Cliente</th><th>Tipo</th><th className="num">Monto</th><th>Motivo</th><th>Estado</th><th /></tr></thead>
              <tbody>
                {notas.map((n) => (
                  <tr key={n.id}>
                    <td className="cell-strong">{n.numero}<span className="cell-sub"><Fecha value={n.fecha} /></span></td>
                    <td>{n.factura_numero}<span className="cell-sub">{n.pedido_codigo || ''}</span></td>
                    <td>{n.cliente_nombre}</td>
                    <td><Badge tone={n.tipo === 'credito' ? 'blue' : 'orange'}>{n.tipo === 'credito' ? 'Crédito' : 'Débito'}</Badge></td>
                    <td className="num"><Money value={n.monto} /></td>
                    <td>{n.motivo || '—'}{n.error_envio && <span className="cell-sub">{n.error_envio}</span>}</td>
                    <td><Badge tone={n.estado === 'anulada' ? 'red' : n.estado === 'enviada' ? 'green' : n.estado === 'error_envio' ? 'red' : 'gray'}>{n.estado}</Badge></td>
                    <td className="actions">
                      <button className="btn btn-soft btn-sm" title="Generar XML" disabled={notaBusy || n.estado === 'anulada'} onClick={() => generarXmlNota(n)}>XML</button>
                      <button className="btn btn-outline btn-sm" title="Enviar al SIN" disabled={notaBusy || n.estado === 'anulada'} onClick={() => enviarNotaSin(n)}><Send size={12} /> SIN</button>
                      {n.estado !== 'anulada' && <button className="icon-btn danger" title="Anular nota" onClick={() => setAnularNota(n)}><XCircle size={14} /></button>}
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

      <Modal open={Boolean(emitirNota)} onClose={() => setEmitirNota(null)} title="Emitir nota fiscal" subtitle={`Factura ${emitirNota?.numero || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setEmitirNota(null)}>Cancelar</button><button className="btn btn-primary" disabled={notaBusy} onClick={guardarNota}>{notaBusy ? 'Guardando…' : 'Emitir nota'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-info"><FileText size={14} /> La nota queda ligada a la factura {emitirNota?.numero || ''} y corrige el saldo del cliente.</div>
          <div className="field"><label>Tipo</label>
            <select className="select" value={notaForm.tipo} onChange={(e) => setNotaForm({ ...notaForm, tipo: e.target.value })}>
              <option value="credito">Nota de crédito (reduce saldo / devolución)</option>
              <option value="debito">Nota de débito (aumenta saldo / cargo adicional)</option>
            </select>
          </div>
          <div className="field"><label>Monto (Bs)</label><input className="input" type="number" min="0.01" step="0.01" value={notaForm.monto} onChange={(e) => setNotaForm({ ...notaForm, monto: e.target.value })} /></div>
          <div className="field"><label>Motivo</label><textarea className="textarea" value={notaForm.motivo} onChange={(e) => setNotaForm({ ...notaForm, motivo: e.target.value })} placeholder="Ej. Devolución parcial de mercadería" /></div>
        </div>
      </Modal>

      <Modal open={Boolean(fueraPlazo)} onClose={() => setFueraPlazo(null)} title="Anulación fuera de plazo" subtitle={`Factura ${fueraPlazo?.numero || ''}`}
        footer={<><button className="btn btn-ghost" onClick={() => setFueraPlazo(null)}>Cancelar</button><button className="btn btn-primary" disabled={notaBusy} onClick={confirmarFueraPlazo}>{notaBusy ? 'Guardando…' : 'Registrar solicitud'}</button></>}
      >
        <div className="form-stack">
          <div className="notice notice-warn"><AlertTriangle size={14} /> Según la RND 102600000025, pasados los plazos se solicita la anulación al SIN (resolución en hasta 6 meses). Aquí solo se registra la solicitud y su estado.</div>
          <div className="field"><label>Motivo de la solicitud</label><textarea className="textarea" value={fueraPlazoForm.motivo} onChange={(e) => setFueraPlazoForm({ ...fueraPlazoForm, motivo: e.target.value })} placeholder="Explica por qué se solicita la anulación" /></div>
          <div className="field"><label>Documento de respaldo (URL o número, opcional)</label><input className="input" value={fueraPlazoForm.documento} onChange={(e) => setFueraPlazoForm({ ...fueraPlazoForm, documento: e.target.value })} /></div>
        </div>
      </Modal>

      <Confirm open={Boolean(anular)} onClose={() => setAnular(null)} onConfirm={confirmarAnulacion} title="Anular factura" message={`¿Anular ${anular?.numero || ''}? La factura quedará marcada como anulada.`} danger />
      <Confirm open={Boolean(anularNota)} onClose={() => setAnularNota(null)} onConfirm={confirmarAnulacionNota} title="Anular nota" message={`¿Anular la nota ${anularNota?.numero || ''}? Se conservará para auditoría.`} danger />
    </>
  );
}
