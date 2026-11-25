import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ArrowLeft, CalendarDays, CheckCircle2, MessageCircle, RefreshCcw, Send, Users, Wallet } from 'lucide-react';
import { api } from '../api';
import { Badge, Fecha, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const INCLUIDOS = [
  { clave: 'ventas', etiqueta: 'Ventas del día, pedidos, unidades y utilidad' },
  { clave: 'cobranzas', etiqueta: 'Por cobrar y facturas vencidas' },
  { clave: 'stock', etiqueta: 'Productos con stock bajo' },
  { clave: 'vencimientos', etiqueta: 'Lotes vencidos o por vencer' },
  { clave: 'visitas', etiqueta: 'Visitas registradas en el día' },
];

export default function ReportesAutomaticos() {
  const toast = useToast();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState({ habilitado: false, hora: '08:00', frecuencia: 'diario', destinatarios: [], incluir: {} });
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api.get('/reportes/automatico');
      setDatos(r);
      setForm({
        habilitado: Boolean(r.config?.habilitado),
        hora: r.config?.hora || '08:00',
        frecuencia: r.config?.frecuencia || 'diario',
        destinatarios: r.config?.destinatarios || [],
        incluir: r.config?.incluir || {},
      });
      setPreview(r.vista_previa || '');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const refrescarPreview = async (incluir) => {
    try { setPreview((await api.post('/reportes/automatico/vista-previa', { incluir })).mensaje || ''); }
    catch (error) { toast(error.message, 'error'); }
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await api.put('/reportes/automatico/config', form);
      toast('Configuración guardada');
      setPreview(r.vista_previa || preview);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setGuardando(false); }
  };

  const generarAhora = async () => {
    setGuardando(true);
    try {
      const r = await api.post('/reportes/automatico/enviar', {});
      toast(`Reporte listo · ${r.envios.length} chat(s) preparado(s)${r.omitidos?.length ? ` · ${r.omitidos.length} sin WhatsApp` : ''}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setGuardando(false); }
  };

  const toggleDestinatario = (id) => {
    const ids = form.destinatarios.includes(id)
      ? form.destinatarios.filter((x) => x !== id)
      : [...form.destinatarios, id];
    setForm({ ...form, destinatarios: ids });
  };

  const toggleIncluir = (clave) => {
    const incluir = { ...form.incluir, [clave]: !form.incluir[clave] };
    setForm({ ...form, incluir });
    refrescarPreview(incluir);
  };

  const abrirTodos = () => {
    (datos?.ultimo?.envios || []).forEach((e, i) => {
      window.setTimeout(() => window.open(e.url, '_blank', 'noopener,noreferrer'), i * 250);
    });
  };

  if (busy && !datos) return <><PageHeader eyebrow="Inteligencia de negocio" title="Reportes automáticos" subtitle="Cargando…" /><div className="panel"><SkeletonRows rows={6} /></div></>;

  const ultimo = datos?.ultimo;
  const usuarios = datos?.usuarios || [];

  return (
    <>
      <PageHeader
        eyebrow="Inteligencia de negocio / Reportes"
        title="Reportes automáticos"
        subtitle="Resumen diario de ventas, cobranzas e inventario listo para enviar por WhatsApp."
        actions={<>
          <Link className="btn btn-outline" to="/reportes"><ArrowLeft size={14} /> Reportes</Link>
          <button className="btn btn-primary" onClick={guardar} disabled={guardando}><CheckCircle2 size={14} /> {guardando ? 'Guardando…' : 'Guardar configuración'}</button>
          <button className="btn btn-green" onClick={generarAhora} disabled={guardando || !form.destinatarios.length}><Send size={14} /> Generar ahora</button>
        </>}
      />

      <div className="notice notice-info mb-16"><MessageCircle size={15} />
        <div><strong>Cómo funciona.</strong> A la hora configurada el sistema arma el mensaje y prepara un chat por cada destinatario con el texto ya escrito.
          WhatsApp no permite envío automático sin la Business API: alguien debe abrir cada chat y confirmar. Todo queda registrado en el historial de mensajes.</div>
      </div>

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Estado" value={form.habilitado ? 'Activo' : 'Inactivo'} icon={AlarmClock} tone={form.habilitado ? 'green' : 'gray'} hint={form.frecuencia === 'lun_vie' ? 'Lunes a viernes' : 'Todos los días'} />
        <StatCard label="Hora de preparación" value={form.hora} icon={CalendarDays} tone="blue" hint="Hora local del servidor" />
        <StatCard label="Destinatarios" value={form.destinatarios.length} icon={Users} tone="purple" hint="Empleados con WhatsApp" />
        <StatCard label="Última preparación" value={ultimo ? <Fecha value={ultimo.fecha} time /> : '—'} icon={Wallet} tone="orange" hint={ultimo ? `${ultimo.envios.length} chat(s)` : 'Aún no se genera'} />
      </div>

      <div className="grid grid-2" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Configuración</h3><p>Programación, destinatarios y contenido</p></div></div>
          <div className="panel-body">
            <div className="form-stack">
              <label className="check"><input type="checkbox" checked={form.habilitado} onChange={(e) => setForm({ ...form, habilitado: e.target.checked })} /> Activar reporte automático diario</label>
              <div className="field-row">
                <div className="field"><label>Hora</label><input className="input" type="time" value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} /></div>
                <div className="field"><label>Frecuencia</label><select className="select" value={form.frecuencia} onChange={(e) => setForm({ ...form, frecuencia: e.target.value })}><option value="diario">Todos los días</option><option value="lun_vie">Lunes a viernes</option></select></div>
              </div>
              <div className="field"><label>Destinatarios</label>
                <div className="check-list">
                  {!usuarios.length && <span className="muted">No hay empleados activos.</span>}
                  {usuarios.map((u) => (
                    <label className="check" key={u.id}>
                      <input type="checkbox" disabled={!u.con_whatsapp} checked={form.destinatarios.includes(u.id)} onChange={() => toggleDestinatario(u.id)} />
                      <span>{u.nombre}<span className="cell-sub">{u.cargo || ''}{!u.con_whatsapp ? ' · sin WhatsApp' : ''}</span></span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="field"><label>Incluir en el mensaje</label>
                <div className="check-list">
                  {INCLUIDOS.map((item) => (
                    <label className="check" key={item.clave}>
                      <input type="checkbox" checked={Boolean(form.incluir[item.clave])} onChange={() => toggleIncluir(item.clave)} />
                      <span>{item.etiqueta}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Vista previa</h3><p>Texto que se prellenará en cada chat</p></div><Badge tone="green">WhatsApp</Badge></div>
          <div className="panel-body">
            <button className="btn btn-ghost btn-sm mb-8" onClick={() => refrescarPreview(form.incluir)}><RefreshCcw size={12} /> Actualizar vista previa</button>
            <pre className="preview-box">{preview || 'Generando vista previa…'}</pre>
            <span className="hint">El mensaje se calcula con los datos reales del día. Si no hay ventas, muestra ceros.</span>
          </div>
        </div>
      </div>

      <div className="panel mt-16">
        <div className="panel-head">
          <div><h3>Último reporte preparado</h3><p>{ultimo ? <>Preparado el <Fecha value={ultimo.fecha} time /></> : 'Todavía no se ha preparado ningún reporte'}</p></div>
          {ultimo?.envios?.length > 0 && <button className="btn btn-green" onClick={abrirTodos}><MessageCircle size={14} /> Abrir todos los chats</button>}
        </div>
        {!ultimo ? <div className="table-empty">Configura los destinatarios y pulsa <b>Generar ahora</b> para preparar el primer reporte.</div> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Destinatario</th><th>Teléfono</th><th>Mensaje</th><th /></tr></thead>
              <tbody>
                {ultimo.envios.map((e) => (
                  <tr key={e.id}>
                    <td className="cell-strong">{e.nombre}</td>
                    <td>{e.telefono}</td>
                    <td><span className="small muted">{ultimo.mensaje.slice(0, 120)}…</span></td>
                    <td className="actions"><button className="btn btn-green btn-sm" onClick={() => window.open(e.url, '_blank', 'noopener,noreferrer')}><MessageCircle size={12} /> Abrir chat</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ultimo.omitidos?.length > 0 && <div className="notice notice-warn">Sin WhatsApp: {ultimo.omitidos.join(', ')}</div>}
          </div>
        )}
      </div>
    </>
  );
}
