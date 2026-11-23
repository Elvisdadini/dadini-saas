import { useCallback, useEffect, useState } from 'react';
import { Cloud, Download, ImagePlus, Palette, RefreshCcw, Save, Share2, Smartphone, UploadCloud } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Badge, Modal, PageHeader, StatCard, useToast } from '../ui';

const VACIA = {
  logo: '', nombre: 'DADINI', color_primario: '#061C33', color_secundario: '#FF6500',
  color_acento: '#16A34A', color_fondo: '#F4F6FA', tipografia: 'Inter', radio: 14, densidad: 'comfortable',
};

export default function Personalizacion() {
  const toast = useToast();
  const { refresh } = useAuth();
  const [config, setConfig] = useState(null);
  const [branding, setBranding] = useState(VACIA);
  const [apk, setApk] = useState(null);
  const [apkArchivo, setApkArchivo] = useState(null);
  const [apkVersion, setApkVersion] = useState('1.0.0');
  const [apkNotas, setApkNotas] = useState('');
  const [sync, setSync] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sqlModal, setSqlModal] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const [c, s] = await Promise.all([api.get('/configuracion'), api.get('/sincronizacion/estado')]);
      setConfig(c.configuracion);
      setBranding({ ...VACIA, ...(c.configuracion.branding || {}) });
      setApk(c.configuracion.apk || null);
      setSync(s);
    } catch (error) { toast(error.message, 'error'); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const subirLogo = (evento) => {
    const archivo = evento.target.files?.[0];
    if (!archivo) return;
    const lector = new FileReader();
    lector.onload = () => setBranding((b) => ({ ...b, logo: String(lector.result) }));
    lector.readAsDataURL(archivo);
  };

  const guardar = async () => {
    setBusy(true);
    try {
      await api.put('/configuracion', { branding });
      await refresh();
      toast('Identidad visual actualizada en toda la plataforma');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const subirApk = async () => {
    if (!apkArchivo) return toast('Selecciona un archivo .apk', 'error');
    setBusy(true);
    try {
      const datos = new FormData();
      datos.append('apk', apkArchivo);
      datos.append('version', apkVersion);
      datos.append('notas', apkNotas);
      const respuesta = await fetch('/api/configuracion/apk', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('dadini_token')}` },
        body: datos,
      });
      const cuerpo = await respuesta.json();
      if (!respuesta.ok) throw new Error(cuerpo.error || 'No se pudo subir el APK');
      setApk(cuerpo.apk);
      await refresh();
      setApkArchivo(null);
      toast('APK cargada y lista para compartir');
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const eliminarApk = async () => {
    try {
      await api.del('/configuracion/apk');
      setApk(null);
      await refresh();
      toast('APK eliminada');
    } catch (error) { toast(error.message, 'error'); }
  };

  const compartirApk = () => {
    if (!apk?.url) return;
    const url = apk.url.startsWith('http') ? apk.url : `${window.location.origin}${apk.url}`;
    const texto = `Hola, descarga la app DADINI v${apk.version}: ${url}${apk.notas ? `\n${apk.notas}` : ''}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
  };

  const sincronizarAhora = async () => {
    try {
      const r = await api.post('/sincronizacion/sincronizar', {});
      toast(r.ok ? 'Datos enviados a Supabase' : `No se pudo sincronizar: ${r.error}`);
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Administración / Marca y sistema"
        title="Personalización y APK"
        subtitle="Identidad visual, aplicación móvil y replicación en la nube. Solo administración."
        actions={<button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Marca" value={branding.nombre} icon={Palette} tone="purple" hint="Aplicada en toda la app" />
        <StatCard label="APK publicada" value={apk ? apk.version : '—'} icon={Smartphone} tone="orange" hint={apk ? `${(apk.tamano_bytes / 1048576).toFixed(1)} MB` : 'Sin cargar'} />
        <StatCard label="Nube" value={sync?.configurado ? 'Supabase activa' : 'Solo local'} icon={Cloud} tone={sync?.configurado ? 'green' : 'blue'} hint={sync?.registro?.estado || 'sin_configurar'} />
      </div>

      <div className="grid grid-2 mb-16" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Identidad visual</h3><p>Colores, tipografía, logo y radios coherentes en toda la plataforma</p></div><Palette size={16} /></div>
          <div className="panel-body form-stack">
            <div className="inline">
              {branding.logo ? <img src={branding.logo} alt="Logo" style={{ width: 84, height: 84, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)' }} /> : <div className="logo-empty"><ImagePlus size={22} /></div>}
              <div><label className="btn btn-soft btn-sm"><ImagePlus size={13} /> Subir logo<input type="file" accept="image/*" hidden onChange={subirLogo} /></label><span className="hint">PNG o SVG con fondo transparente.</span></div>
            </div>
            <div className="field"><label>Nombre de la marca</label><input className="input" value={branding.nombre} onChange={(e) => setBranding({ ...branding, nombre: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label>Color primario</label><input type="color" className="input" value={branding.color_primario} onChange={(e) => setBranding({ ...branding, color_primario: e.target.value })} /></div>
              <div className="field"><label>Color secundario</label><input type="color" className="input" value={branding.color_secundario} onChange={(e) => setBranding({ ...branding, color_secundario: e.target.value })} /></div>
              <div className="field"><label>Color de acento</label><input type="color" className="input" value={branding.color_acento} onChange={(e) => setBranding({ ...branding, color_acento: e.target.value })} /></div>
            </div>
            <div className="field-row">
              <div className="field"><label>Fondo</label><input type="color" className="input" value={branding.color_fondo} onChange={(e) => setBranding({ ...branding, color_fondo: e.target.value })} /></div>
              <div className="field"><label>Tipografía</label><select className="select" value={branding.tipografia} onChange={(e) => setBranding({ ...branding, tipografia: e.target.value })}><option>Inter</option><option>System UI</option><option>Georgia</option></select></div>
              <div className="field"><label>Radio (px)</label><input type="number" min="0" max="32" className="input" value={branding.radio} onChange={(e) => setBranding({ ...branding, radio: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary" onClick={guardar} disabled={busy}><Save size={14} /> {busy ? 'Guardando…' : 'Guardar identidad visual'}</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Aplicación móvil (APK)</h3><p>Sube la APK y compártela por WhatsApp desde el panel</p></div><Smartphone size={16} /></div>
          <div className="panel-body form-stack">
            <div className="split" style={{ alignItems: 'center', gap: 12 }}>
              <img src="/logo-dadini.png" alt="Logo DADINI" style={{ width: 104, height: 92, objectFit: 'contain', background: '#fff', borderRadius: 8 }} />
              <span className="small muted">Logo oficial sin marca de agua: incluido en la web y en la APK (ícono y pantalla de inicio).</span>
            </div>
            {apk ? (
              <div className="summary-box">
                <div className="split"><span className="small muted">Archivo</span><strong>{apk.nombre}</strong></div>
                <div className="split mt-8"><span className="small muted">Versión</span><Badge tone="orange">{apk.version}</Badge></div>
                <div className="split mt-8"><span className="small muted">Tamaño</span><strong>{(apk.tamano_bytes / 1048576).toFixed(1)} MB</strong></div>
                <div className="split mt-8"><span className="small muted">Subida</span><strong>{new Date(apk.subido_en).toLocaleString('es-BO')}</strong></div>
              </div>
            ) : <div className="notice notice-warn">No hay APK publicada.</div>}
            <div className="field-row">
              <div className="field"><label>Nueva APK (.apk)</label><input type="file" accept=".apk" className="input" onChange={(e) => setApkArchivo(e.target.files?.[0])} /></div>
              <div className="field"><label>Versión</label><input className="input" value={apkVersion} onChange={(e) => setApkVersion(e.target.value)} /></div>
            </div>
            <div className="field"><label>Notas de la versión</label><textarea className="textarea" value={apkNotas} onChange={(e) => setApkNotas(e.target.value)} /></div>
            <div className="inline">
              <button className="btn btn-primary" onClick={subirApk} disabled={busy || !apkArchivo}><UploadCloud size={14} /> Subir APK</button>
              {apk && <button className="btn btn-green" onClick={compartirApk}><Share2 size={14} /> Compartir por WhatsApp</button>}
              {apk && <a className="btn btn-outline" href={apk.url} download><Download size={14} /> Descargar</a>}
              {apk && <button className="btn btn-ghost" onClick={eliminarApk}>Eliminar</button>}
            </div>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head"><div><h3>Replicación en la nube (Supabase)</h3><p>Disco G: como fuente principal + réplica en la nube para todas las empresas afiliadas</p></div><Cloud size={16} /></div>
        <div className="panel-body">
          <div className="grid grid-4 mb-16" style={{ gap: 10 }}>
            <div className="mini-stat"><span>Estado</span><strong>{sync?.registro?.estado || '—'}</strong></div>
            <div className="mini-stat"><span>Tabla</span><strong style={{ fontSize: 12 }}>{sync?.tabla || '—'}</strong></div>
            <div className="mini-stat"><span>Intentos</span><strong>{sync?.registro?.intentos || 0}</strong></div>
            <div className="mini-stat"><span>Último envío</span><strong style={{ fontSize: 12 }}>{sync?.registro?.ultimo_envio ? new Date(sync.registro.ultimo_envio).toLocaleString('es-BO') : '—'}</strong></div>
          </div>
          {sync?.registro?.ultimo_error && <div className="notice notice-danger">{sync.registro.ultimo_error}</div>}
          <div className="inline">
            <button className="btn btn-primary btn-sm" onClick={sincronizarAhora} disabled={!sync?.configurado}><RefreshCcw size={13} /> Sincronizar ahora</button>
            <button className="btn btn-outline btn-sm" onClick={() => setSqlModal(true)}>Ver SQL de la tabla</button>
          </div>
        </div>
      </div>

      <Modal open={sqlModal} onClose={() => setSqlModal(false)} title="Tabla de réplica en Supabase" size="lg">
        <pre className="sql-block">{sync?.sql || 'Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY para habilitar la réplica.'}</pre>
      </Modal>
    </>
  );
}
