import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Lock, RefreshCcw, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api';
import { Badge, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';
import { ROL_COLOR, ROL_LABEL } from '../auth';

export default function Permisos() {
  const toast = useToast();
  const [catalogo, setCatalogo] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([api.get('/permisos'), api.get('/usuarios')]);
      setCatalogo(p);
      setUsuarios(u.usuarios || []);
      setSeleccionado((actual) => u.usuarios?.find((x) => x.id === actual?.id) || u.usuarios?.[0] || null);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const funciones = useMemo(() => [...(catalogo?.modulos || []), ...(catalogo?.acciones || [])], [catalogo]);
  const grupos = useMemo(() => [...new Set(funciones.map((f) => f.grupo))], [funciones]);
  const activas = seleccionado?.permisos || [];

  const alternar = async (codigo) => {
    if (!seleccionado) return;
    if (seleccionado.rol === 'admin' || seleccionado.rol === 'dueno') {
      return toast('Los administradores tienen todas las funciones activas.', 'info');
    }
    const activo = !activas.includes(codigo);
    setBusy(codigo);
    try {
      const r = await api.patch(`/usuarios/${seleccionado.id}/permisos`, { codigo, activo });
      setUsuarios((lista) => lista.map((u) => (u.id === r.usuario.id ? r.usuario : u)));
      setSeleccionado(r.usuario);
      toast(`${codigo} ${activo ? 'activado' : 'desactivado'} para ${r.usuario.nombre}`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); }
  };

  const aplicarPlantilla = async (plantilla) => {
    if (!seleccionado) return;
    setBusy('plantilla');
    try {
      const r = await api.patch(`/usuarios/${seleccionado.id}/permisos`, { permisos: plantilla.permisos });
      setUsuarios((lista) => lista.map((u) => (u.id === r.usuario.id ? r.usuario : u)));
      setSeleccionado(r.usuario);
      toast(`Modelo ${plantilla.nombre} aplicado a ${r.usuario.nombre}`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(''); }
  };

  if (loading) return <><PageHeader eyebrow="Sistema / Seguridad" title="Roles y permisos" subtitle="Modelos de acceso y funciones activas por usuario." /><div className="panel"><SkeletonRows rows={8} /></div></>;

  return (
    <>
      <PageHeader
        eyebrow="Sistema / Seguridad"
        title="Roles y permisos"
        subtitle="Elige un modelo de permisos o activa funciones una por una. Los cambios se aplican cuando el usuario cierra sesión y vuelve a ingresar."
        actions={<button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))' }}>
        <StatCard label="Modelos disponibles" value={catalogo?.plantillas?.length || 0} icon={ShieldCheck} tone="orange" hint="Listos para aplicar" />
        <StatCard label="Funciones del sistema" value={funciones.length} icon={Lock} tone="blue" hint="Módulos y acciones" />
        <StatCard label="Usuarios" value={usuarios.length} icon={Users} tone="green" hint="Con acceso configurado" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Modelos de permisos</h3><p>Selecciona un usuario y aplica un modelo para darle acceso solo a sus funciones.</p></div></div>
        <div className="panel-body">
          <div className="field"><label>Usuario</label>
            <select className="select" value={seleccionado?.id || ''} onChange={(e) => setSeleccionado(usuarios.find((u) => u.id === Number(e.target.value)))}>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {ROL_LABEL[u.rol] || u.rol}</option>)}
            </select>
          </div>
          <div className="grid grid-3 mt-12" style={{ gap: 10 }}>
            {(catalogo?.plantillas || []).map((p) => (
              <div key={p.id} className="mini-stat" style={{ alignItems: 'flex-start' }}>
                <div className="split"><Badge tone={p.color}>{p.nombre}</Badge><span className="small muted">{p.permisos.length} funciones</span></div>
                <span className="hint mt-8" style={{ display: 'block' }}>{p.descripcion}</span>
                <button className="btn btn-soft btn-sm mt-8" disabled={busy === 'plantilla' || seleccionado?.rol === 'admin' || seleccionado?.rol === 'dueno'} onClick={() => aplicarPlantilla(p)}>Aplicar modelo</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-head">
          <div><h3>Funciones de {seleccionado?.nombre || '—'}</h3><p>Activa o desactiva cada función con un clic. {seleccionado?.plantilla_permisos && <span>Modelo actual: <strong>{seleccionado.plantilla_permisos}</strong></span>}</p></div>
          {seleccionado && <Badge tone={ROL_COLOR[seleccionado.rol] || 'gray'}>{ROL_LABEL[seleccionado.rol] || seleccionado.rol}</Badge>}
        </div>
        {(seleccionado?.rol === 'admin' || seleccionado?.rol === 'dueno') && (
          <div className="panel-body"><div className="notice notice-info"><CheckCircle2 size={15} /> Este usuario es administrador: tiene todas las funciones activas y no se pueden limitar.</div></div>
        )}
        {grupos.map((grupo) => (
          <div key={grupo} className="panel-body" style={{ borderTop: '1px solid var(--line)' }}>
            <strong className="small">{grupo}</strong>
            <div className="grid grid-3 mt-8" style={{ gap: 8 }}>
              {funciones.filter((f) => f.grupo === grupo).map((f) => {
                const activo = activas.includes(f.codigo);
                const desactivado = busy === f.codigo || seleccionado?.rol === 'admin' || seleccionado?.rol === 'dueno';
                return (
                  <label key={f.codigo} className="check" style={{ opacity: desactivado ? 0.65 : 1 }}>
                    <input type="checkbox" checked={activo} disabled={desactivado} onChange={() => alternar(f.codigo)} />
                    <span><strong>{f.etiqueta}</strong><br /><span className="hint">{f.descripcion}</span></span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
