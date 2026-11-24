import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Lock, RefreshCcw, ShieldCheck, Users } from 'lucide-react';
import { api } from '../api';
import { Badge, EmptyState, PageHeader, SkeletonRows, StatCard, Tabs, useToast } from '../ui';
import { ROL_COLOR, ROL_LABEL } from '../auth';

export default function Permisos() {
  const toast = useToast();
  const [cat, setCat] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [vista, setVista] = useState('usuario');
  const [soloActivas, setSoloActivas] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [p, u] = await Promise.all([api.get('/permisos'), api.get('/usuarios')]);
      setCat(p);
      setUsuarios(u.usuarios || []);
      setSeleccionado((actual) => (u.usuarios || []).find((x) => x.id === actual?.id) || null);
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const esAdmin = seleccionado && ['admin', 'dueno'].includes(seleccionado.rol);
  const activas = seleccionado?.permisos || [];

  const guardar = async (permisos, mensaje) => {
    if (!seleccionado) return;
    setBusy(true);
    try {
      const r = await api.patch(`/usuarios/${seleccionado.id}/permisos`, { permisos });
      setUsuarios((lista) => lista.map((u) => (u.id === r.usuario.id ? r.usuario : u)));
      setSeleccionado(r.usuario);
      if (mensaje) toast(mensaje);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const alternar = (codigo) => {
    if (esAdmin) return;
    const siguientes = activas.includes(codigo) ? activas.filter((p) => p !== codigo) : [...activas, codigo];
    guardar(siguientes, `${codigo} ${activas.includes(codigo) ? 'desactivado' : 'activado'}`);
  };

  const codigosModulo = (modulo) => [
    ...(cat?.crud || []).map((c) => `${modulo.base}.${c.codigo}`),
    ...modulo.sub.map((s) => s.codigo),
  ];

  const alternarModulo = (modulo) => {
    if (esAdmin) return;
    const codigos = codigosModulo(modulo);
    const todos = codigos.every((c) => activas.includes(c));
    const siguientes = todos ? activas.filter((p) => !codigos.includes(p)) : [...new Set([...activas, ...codigos])];
    guardar(siguientes, `${modulo.etiqueta}: ${todos ? 'permisos retirados' : 'permisos activados'}`);
  };

  const alternarGrupo = (grupo) => {
    if (esAdmin) return;
    const codigos = grupo.modulos.flatMap(codigosModulo);
    const todos = codigos.every((c) => activas.includes(c));
    const siguientes = todos ? activas.filter((p) => !codigos.includes(p)) : [...new Set([...activas, ...codigos])];
    guardar(siguientes, `${grupo.grupo}: ${todos ? 'permisos retirados' : 'permisos activados'}`);
  };

  const aplicarPlantilla = (plantilla) => guardar(plantilla.permisos, `Modelo ${plantilla.nombre} aplicado`);

  if (loading) return <><PageHeader eyebrow="Sistema / Seguridad" title="Roles y permisos" subtitle="Configuración detallada de accesos." /><div className="panel"><SkeletonRows rows={8} /></div></>;

  const grupos = cat?.catalogo || [];

  return (
    <>
      <PageHeader
        eyebrow="Sistema / Seguridad"
        title="Roles y permisos"
        subtitle="Ver, Crear, Editar y Eliminar por módulo, más cada sub-función. Los cambios se aplican al volver a ingresar."
        actions={<button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>}
      />

      <Tabs
        tabs={[{ value: 'usuario', label: 'Permisos por usuario' }, { value: 'modelos', label: 'Modelos de acceso', count: (cat?.plantillas || []).length }]}
        active={vista}
        onChange={setVista}
      />

      <div className="panel mb-16 no-print">
        <div className="panel-body">
          <div className="field"><label>Usuario a configurar</label>
            <select className="select" value={seleccionado?.id || ''} onChange={(e) => setSeleccionado(usuarios.find((u) => u.id === Number(e.target.value)))}>
              <option value="">Seleccionar…</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} · {ROL_LABEL[u.rol] || u.rol}</option>)}
            </select>
          </div>
          {seleccionado && <div className="inline mt-8"><Badge tone={ROL_COLOR[seleccionado.rol] || 'gray'}>{ROL_LABEL[seleccionado.rol] || seleccionado.rol}</Badge><span className="small muted">{activas.length} funciones activas</span>{esAdmin && <Badge tone="green">Acceso total</Badge>}</div>}
          <label className="check mt-8"><input type="checkbox" checked={soloActivas} onChange={(e) => setSoloActivas(e.target.checked)} /> Mostrar solo funciones activas</label>
        </div>
      </div>

      {vista === 'modelos' ? (
        <div className="grid grid-3" style={{ gap: 12 }}>
          {(cat?.plantillas || []).map((p) => (
            <div className="panel" key={p.id}>
              <div className="panel-head"><h3>{p.nombre}</h3><Badge tone={p.color}>{p.permisos.length}</Badge></div>
              <div className="panel-body">
                <p className="small muted">{p.descripcion}</p>
                <button className="btn btn-soft btn-sm mt-8" disabled={!seleccionado || esAdmin || busy} onClick={() => aplicarPlantilla(p)}>Aplicar a {seleccionado?.nombre || 'usuario'}</button>
              </div>
            </div>
          ))}
        </div>
      ) : !seleccionado ? (
        <EmptyState icon={Users} title="Selecciona un usuario" message="Elige un usuario para ver y ajustar sus permisos." />
      ) : esAdmin ? (
        <div className="notice notice-info"><CheckCircle2 size={15} /> {seleccionado.nombre} es administrador: tiene todas las funciones activas y no se pueden limitar.</div>
      ) : (
        <>
          {grupos.map((grupo) => {
            const codigos = grupo.modulos.flatMap(codigosModulo);
            const todos = codigos.every((c) => activas.includes(c));
            return (
              <div className="panel mb-16" key={grupo.grupo}>
                <div className="panel-head">
                  <div><h3>{grupo.grupo}</h3><p>{grupo.modulos.length} módulos · {codigos.length} funciones</p></div>
                  <button className={`btn btn-sm ${todos ? 'btn-soft' : 'btn-outline'}`} onClick={() => alternarGrupo(grupo)} disabled={busy}>{todos ? 'Quitar todo' : 'Marcar todo'}</button>
                </div>
                <div className="panel-body">
                  <div className="grid grid-2" style={{ gap: 12 }}>
                    {grupo.modulos.map((modulo) => {
                      const mods = codigosModulo(modulo);
                      const completo = mods.every((c) => activas.includes(c));
                      return (
                        <div className="card card-pad" key={modulo.base} style={{ padding: 12 }}>
                          <div className="split">
                            <strong>{modulo.etiqueta}</strong>
                            <button className={`btn btn-sm ${completo ? 'btn-soft' : 'btn-ghost'}`} onClick={() => alternarModulo(modulo)} disabled={busy}>{completo ? 'Quitar todo' : 'Marcar todo'}</button>
                          </div>
                          <div className="pill-group mt-8">
                            {(cat?.crud || []).filter((c) => !soloActivas || activas.includes(`${modulo.base}.${c.codigo}`)).map((c) => {
                              const codigo = `${modulo.base}.${c.codigo}`;
                              return <label key={codigo} className="chip"><input type="checkbox" checked={activas.includes(codigo)} onChange={() => alternar(codigo)} disabled={busy} /> {c.etiqueta}</label>;
                            })}
                          </div>
                          {modulo.sub.length > 0 && (
                            <div className="mt-8" style={{ display: 'grid', gap: 4 }}>
                              {modulo.sub.filter((s) => !soloActivas || activas.includes(s.codigo)).map((s) => (
                                <label key={s.codigo} className="check small"><input type="checkbox" checked={activas.includes(s.codigo)} onChange={() => alternar(s.codigo)} disabled={busy} /> {s.etiqueta}</label>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {busy && <div className="notice notice-info"><Lock size={14} /> Guardando permisos…</div>}
    </>
  );
}
