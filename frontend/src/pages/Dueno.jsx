import { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent, Check, Crown, Pencil, Plus, RefreshCcw, Save, ShieldCheck, Trash2, UserPlus, Users,
} from 'lucide-react';
import { api } from '../api';
import { Badge, Modal, PageHeader, SkeletonRows, StatCard, useToast } from '../ui';

const PLAN_VACIO = { nombre: '', precio: '', precio_anual: '', usuarios_incluidos: 5, almacenes_incluidos: 3, descuento_porcentaje: 0, activo: true, caracteristicas: '' };
const DESCUENTO_VACIO = { nombre: '', porcentaje: '', activo: true };

export default function Dueno() {
  const toast = useToast();
  const [config, setConfig] = useState(null);
  const [planes, setPlanes] = useState([]);
  const [descuentos, setDescuentos] = useState([]);
  const [cobranza, setCobranza] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [planModal, setPlanModal] = useState(false);
  const [planEdit, setPlanEdit] = useState(null);
  const [planForm, setPlanForm] = useState(PLAN_VACIO);
  const [descModal, setDescModal] = useState(false);
  const [descEdit, setDescEdit] = useState(null);
  const [descForm, setDescForm] = useState(DESCUENTO_VACIO);
  const [ownerModal, setOwnerModal] = useState(false);
  const [ownerForm, setOwnerForm] = useState({ nombre: '', email: '', password: 'Dadini2026!' });
  const [duenos, setDuenos] = useState([]);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [c, u] = await Promise.all([api.get('/configuracion/panel-dueno'), api.get('/usuarios')]);
      const cfg = c.configuracion;
      setConfig(cfg);
      setPlanes(cfg.planes || []);
      setDescuentos(cfg.descuentos_globales || []);
      setCobranza(cfg.cobranza || {});
      setDuenos((u.usuarios || []).filter((x) => x.rol === 'dueno'));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardarTodo = async () => {
    setSaving(true);
    try {
      await api.put('/configuracion/panel-dueno', { planes, descuentos_globales: descuentos, cobranza });
      toast('Configuración del dueño guardada');
      await cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setSaving(false); }
  };

  const abrirPlan = (plan = null) => {
    setPlanEdit(plan);
    setPlanForm(plan ? { ...plan, caracteristicas: (plan.caracteristicas || []).join(', ') } : PLAN_VACIO);
    setPlanModal(true);
  };

  const guardarPlan = () => {
    if (!planForm.nombre) return toast('El nombre del plan es obligatorio.', 'error');
    const item = {
      ...planForm,
      id: planEdit?.id || Math.max(0, ...planes.map((p) => p.id || 0)) + 1,
      codigo: planEdit?.codigo || `PLAN-${String(Math.max(0, ...planes.map((p) => p.id || 0)) + 1).padStart(3, '0')}`,
      precio: Number(planForm.precio) || 0,
      precio_anual: Number(planForm.precio_anual) || 0,
      usuarios_incluidos: Number(planForm.usuarios_incluidos) || 1,
      almacenes_incluidos: Number(planForm.almacenes_incluidos) || 1,
      descuento_porcentaje: Number(planForm.descuento_porcentaje) || 0,
      caracteristicas: String(planForm.caracteristicas).split(',').map((x) => x.trim()).filter(Boolean),
    };
    setPlanes(planEdit ? planes.map((p) => (p.id === item.id ? item : p)) : [...planes, item]);
    setPlanModal(false);
  };

  const abrirDesc = (d = null) => {
    setDescEdit(d);
    setDescForm(d ? { ...d } : DESCUENTO_VACIO);
    setDescModal(true);
  };

  const guardarDesc = () => {
    if (!descForm.nombre) return toast('El nombre del descuento es obligatorio.', 'error');
    const item = {
      ...descForm,
      id: descEdit?.id || Math.max(0, ...descuentos.map((d) => d.id || 0)) + 1,
      codigo: descEdit?.codigo || `DESC-${String(Math.max(0, ...descuentos.map((d) => d.id || 0)) + 1).padStart(3, '0')}`,
      porcentaje: Number(descForm.porcentaje) || 0,
    };
    setDescuentos(descEdit ? descuentos.map((d) => (d.id === item.id ? item : d)) : [...descuentos, item]);
    setDescModal(false);
  };

  const crearDueno = async () => {
    if (!ownerForm.nombre || !ownerForm.email) return toast('Nombre y correo son obligatorios.', 'error');
    try {
      await api.post('/usuarios', { ...ownerForm, rol: 'dueno', cargo: 'Dueño del sistema' });
      toast('Usuario dueño creado con acceso total');
      setOwnerModal(false);
      setOwnerForm({ nombre: '', email: '', password: 'Dadini2026!' });
      await cargar();
    } catch (error) { toast(error.message, 'error'); }
  };

  return (
    <>
      <PageHeader
        eyebrow="Panel del dueño"
        title="Control total del sistema"
        subtitle="Precios de planes, descuentos, bloqueos por deuda y usuarios con acceso completo."
        actions={<>
          <button className="btn btn-outline" onClick={cargar}><RefreshCcw size={14} /> Actualizar</button>
          <button className="btn btn-primary" onClick={guardarTodo} disabled={saving}><Save size={14} /> {saving ? 'Guardando…' : 'Guardar cambios'}</button>
        </>}
      />

      <div className="stat-grid mb-16" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <StatCard label="Planes" value={planes.length} icon={Crown} tone="purple" hint="Configurados" />
        <StatCard label="Descuentos globales" value={descuentos.length} icon={BadgePercent} tone="orange" hint="Activos/desactivados" />
        <StatCard label="Usuarios dueños" value={duenos.length} icon={ShieldCheck} tone="green" hint="Acceso total" />
        <StatCard label="Bloqueo por mora" value={cobranza.bloquear_clientes_con_mora ? 'Activo' : 'Inactivo'} icon={Users} tone="blue" hint="Clientes con deuda" />
      </div>

      <div className="panel mb-16">
        <div className="panel-head"><div><h3>Planes y precios</h3><p>El plan contratado define límites; estos valores son administrables por el dueño</p></div>
          <button className="btn btn-soft btn-sm" onClick={() => abrirPlan()}><Plus size={13} /> Nuevo plan</button>
        </div>
        {loading ? <SkeletonRows rows={4} /> : (
          <div className="grid grid-3" style={{ gap: 12, padding: 14 }}>
            {planes.map((p) => (
              <div className="card card-pad" key={p.id} style={{ padding: 14 }}>
                <div className="inline" style={{ justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: 15 }}>{p.nombre}</strong>
                  <Badge tone={p.activo ? 'green' : 'gray'}>{p.activo ? 'Activo' : 'Inactivo'}</Badge>
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>Bs {p.precio}<span className="small muted">/mes</span></div>
                <div className="small muted">Bs {p.precio_anual}/año · {p.usuarios_incluidos} usuarios · {p.almacenes_incluidos} almacenes</div>
                <div className="inline mt-8">{p.caracteristicas?.map((c) => <Badge key={c} tone="gray">{c}</Badge>)}</div>
                <button className="btn btn-outline btn-sm mt-8" onClick={() => abrirPlan(p)}><Pencil size={12} /> Editar</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-2 mb-16" style={{ gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><div><h3>Descuentos globales</h3><p>Se pueden aplicar a planes o suscripciones</p></div>
            <button className="btn btn-soft btn-sm" onClick={() => abrirDesc()}><Plus size={13} /> Agregar</button>
          </div>
          <div className="panel-body">
            {descuentos.map((d) => (
              <div className="info-row" key={d.id}>
                <span><BadgePercent size={12} /> {d.nombre} <Badge tone={d.activo ? 'green' : 'gray'}>{d.porcentaje}%</Badge></span>
                <span className="inline">
                  <button className="icon-btn" onClick={() => abrirDesc(d)}><Pencil size={13} /></button>
                  <button className="icon-btn" onClick={() => setDescuentos(descuentos.filter((x) => x.id !== d.id))}><Trash2 size={13} color="var(--red)" /></button>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><div><h3>Bloqueos y accesos</h3><p>Reglas automáticas y usuarios con acceso total</p></div>
            <button className="btn btn-soft btn-sm" onClick={() => setOwnerModal(true)}><UserPlus size={13} /> Crear dueño</button>
          </div>
          <div className="panel-body form-stack">
            <label className="check"><input type="checkbox" checked={!!cobranza.bloquear_clientes_con_mora} onChange={(e) => setCobranza({ ...cobranza, bloquear_clientes_con_mora: e.target.checked })} /> Bloquear automáticamente clientes con cuentas vencidas</label>
            <label className="check"><input type="checkbox" checked={!!cobranza.bloquear_usuarios_con_deuda} onChange={(e) => setCobranza({ ...cobranza, bloquear_usuarios_con_deuda: e.target.checked })} /> Bloquear usuarios con deuda pendiente</label>
            <div className="divider" />
            <strong className="small">Usuarios dueños</strong>
            {duenos.map((u) => <div className="info-row" key={u.id}><span>{u.nombre} · {u.email}</span><Badge tone="purple">Acceso total</Badge></div>)}
          </div>
        </div>
      </div>

      <Modal open={planModal} onClose={() => setPlanModal(false)} title={planEdit ? 'Editar plan' : 'Nuevo plan'} size="md"
        footer={<><button className="btn btn-ghost" onClick={() => setPlanModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarPlan}><Check size={14} /> Guardar plan</button></>}>
        <div className="form-stack">
          <div className="field"><label>Nombre</label><input className="input" value={planForm.nombre} onChange={(e) => setPlanForm({ ...planForm, nombre: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Precio mensual (Bs)</label><input type="number" className="input" value={planForm.precio} onChange={(e) => setPlanForm({ ...planForm, precio: e.target.value })} /></div>
            <div className="field"><label>Precio anual (Bs)</label><input type="number" className="input" value={planForm.precio_anual} onChange={(e) => setPlanForm({ ...planForm, precio_anual: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Usuarios incluidos</label><input type="number" className="input" value={planForm.usuarios_incluidos} onChange={(e) => setPlanForm({ ...planForm, usuarios_incluidos: e.target.value })} /></div>
            <div className="field"><label>Almacenes incluidos</label><input type="number" className="input" value={planForm.almacenes_incluidos} onChange={(e) => setPlanForm({ ...planForm, almacenes_incluidos: e.target.value })} /></div>
          </div>
          <div className="field"><label>Descuento del plan (%)</label><input type="number" className="input" value={planForm.descuento_porcentaje} onChange={(e) => setPlanForm({ ...planForm, descuento_porcentaje: e.target.value })} /></div>
          <div className="field"><label>Características (separadas por coma)</label><input className="input" value={planForm.caracteristicas} onChange={(e) => setPlanForm({ ...planForm, caracteristicas: e.target.value })} /></div>
          <label className="check"><input type="checkbox" checked={planForm.activo !== false} onChange={(e) => setPlanForm({ ...planForm, activo: e.target.checked })} /> Plan activo</label>
        </div>
      </Modal>

      <Modal open={descModal} onClose={() => setDescModal(false)} title={descEdit ? 'Editar descuento' : 'Nuevo descuento'} size="sm"
        footer={<><button className="btn btn-ghost" onClick={() => setDescModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={guardarDesc}>Guardar</button></>}>
        <div className="form-stack">
          <div className="field"><label>Nombre</label><input className="input" value={descForm.nombre} onChange={(e) => setDescForm({ ...descForm, nombre: e.target.value })} /></div>
          <div className="field"><label>Porcentaje</label><input type="number" className="input" value={descForm.porcentaje} onChange={(e) => setDescForm({ ...descForm, porcentaje: e.target.value })} /></div>
          <label className="check"><input type="checkbox" checked={descForm.activo} onChange={(e) => setDescForm({ ...descForm, activo: e.target.checked })} /> Activo</label>
        </div>
      </Modal>

      <Modal open={ownerModal} onClose={() => setOwnerModal(false)} title="Crear usuario dueño" subtitle="Tendrá acceso a todos los módulos y configuraciones" size="sm"
        footer={<><button className="btn btn-ghost" onClick={() => setOwnerModal(false)}>Cancelar</button><button className="btn btn-primary" onClick={crearDueno}>Crear dueño</button></>}>
        <div className="form-stack">
          <div className="field"><label>Nombre</label><input className="input" value={ownerForm.nombre} onChange={(e) => setOwnerForm({ ...ownerForm, nombre: e.target.value })} /></div>
          <div className="field"><label>Correo</label><input className="input" type="email" value={ownerForm.email} onChange={(e) => setOwnerForm({ ...ownerForm, email: e.target.value })} /></div>
          <div className="field"><label>Contraseña</label><input className="input" value={ownerForm.password} onChange={(e) => setOwnerForm({ ...ownerForm, password: e.target.value })} /></div>
        </div>
      </Modal>
    </>
  );
}
