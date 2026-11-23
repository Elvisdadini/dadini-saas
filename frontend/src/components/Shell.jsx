import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  BadgePercent, Bell, BarChart3, Building2, ChevronDown, ClipboardList, Crown, LayoutDashboard, LogOut, Menu, Palette, Receipt, Tag, Target, TrendingUp, Undo2,
  MapPin, Package, PackageCheck, Search, Settings, ShoppingCart, Truck, Users, Wallet, X, UserRound, Lock,
  FileText, ArrowUpRight, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { api } from '../api';
import { useAuth, puede, ROL_LABEL } from '../auth';
import { Avatar, Modal, useToast } from '../ui';
import BrandStyle from './BrandStyle';

const NAV = [
  { group: 'Principal', items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard', end: true }] },
  {
    group: 'Operación',
    items: [
      { to: '/ventas', label: 'Ventas', icon: ShoppingCart, key: 'ventas', badge: 'pendientes' },

      { to: '/ventas/agenda', label: 'Mi agenda de visitas', icon: MapPin, key: 'ventas', roles: ['preventista'] },
      { to: '/ventas/rutas', label: 'Rutas y zonas de venta', icon: MapPin, key: 'rutas_venta' },
      { to: '/ventas/objetivos', label: 'Generar objetivos', icon: Target, key: 'objetivos' },
      { to: '/mi-camion', label: 'Mi camión', icon: Truck, key: 'mi_camion', roles: ['vendedor_camion', 'admin', 'dueno'] },
      { to: '/clientes', label: 'Clientes', icon: Users, key: 'clientes' },
      { to: '/clientes/categorias', label: 'Categorías', icon: Tag, key: 'clientes' },
      { to: '/cobranzas', label: 'Cobranzas', labelVendedor: 'Mis créditos', icon: Wallet, key: 'cobranzas', alert: 'vencidas' },
    ],
  },
  { group: 'Logística', items: [
    { to: '/distribucion', label: 'Distribución', icon: Truck, key: 'distribucion', badge: 'rutas' },
    { to: '/distribucion/programados', label: 'Pedidos programados', icon: ClipboardList, key: 'distribucion' },
  ] },
  { group: 'Compras y rentabilidad', items: [
    { to: '/compras/solicitudes', label: 'Solicitudes de compra', icon: ClipboardList, key: 'compras' },
    { to: '/compras/ordenes', label: 'Órdenes y pagos', icon: Receipt, key: 'compras' },
    { to: '/compras/proveedores', label: 'Proveedores', icon: Truck, key: 'compras' },
    { to: '/compras/gastos', label: 'Gastos', icon: Wallet, key: 'compras' },
    { to: '/compras/nomina', label: 'Sueldos y boletas', icon: Users, key: 'compras' },
    { to: '/reportes/rentabilidad', label: 'Rentabilidad', icon: TrendingUp, key: 'rentabilidad' },
  ] },
  { group: 'Catálogo', items: [
    { to: '/inventario', label: 'Inventario', icon: Package, key: 'inventario' },
    { to: '/inventario/conteo', label: 'Conteo de inventario', icon: ClipboardList, key: 'inventario' },
    { to: '/inventario/preparado', label: 'Preparado de carga', icon: PackageCheck, key: 'inventario' },
    { to: '/inventario/promociones', label: 'Promociones', icon: BadgePercent, key: 'inventario' },
    { to: '/inventario/almacenes-moviles', label: 'Almacenes móviles', icon: Truck, key: 'inventario' },
    { to: '/inventario/devoluciones', label: 'Devoluciones', icon: Undo2, key: 'inventario' },
  ] },
  { group: 'Análisis', items: [{ to: '/reportes', label: 'Reportes', icon: BarChart3, key: 'reportes' }] },
  {
    group: 'Sistema',
    items: [
      { to: '/dueno', label: 'Panel del dueño', icon: Crown, key: 'dueno' },
      { to: '/administracion', label: 'Administración', icon: Settings, key: 'administracion' },
      { to: '/administracion/personalizacion', label: 'Marca y APK', icon: Palette, key: 'administracion' },
      { to: '/administracion/permisos', label: 'Roles y permisos', icon: Lock, key: 'administracion' },
    ],
  },
];

const PAGE_TITLES = {
  '/': ['Panel general', 'Resumen operativo'],
  '/ventas': ['Ventas', 'Pedidos y facturación'],
  '/ventas/nueva': ['Nueva venta', 'Punto de venta'],
  '/inventario/preparado': ['Preparado de carga', 'Cierre y carga de camión'],
  '/ventas/agenda': ['Mi agenda de visitas', 'Preventa por ruta y día'],
  '/ventas/rutas': ['Rutas y zonas de venta', 'Días de visita, vendedores y distribuidores'],
  '/ventas/objetivos': ['Generar objetivos', 'Metas mensuales'],
  '/mi-camion': ['Mi camión', 'Stock, solicitudes y devoluciones'],
  '/clientes': ['Clientes', 'Cartera comercial'],
  '/clientes/categorias': ['Categorías de clientes', 'Descuentos y precios'],
  '/cobranzas': ['Cobranzas', 'Cuentas por cobrar'],
  '/distribucion': ['Distribución', 'Rutas y entregas'],
  '/distribucion/programados': ['Pedidos programados', 'Entregas del día siguiente'],
  '/compras/solicitudes': ['Solicitudes de compra', 'Reposición de inventario'],
  '/compras/ordenes': ['Órdenes y pagos', 'Compras a proveedores'],
  '/compras/proveedores': ['Proveedores', 'Configuración de proveedores'],
  '/compras/gastos': ['Gastos', 'Tipos y movimientos'],
  '/compras/nomina': ['Sueldos y boletas', 'Planilla mensual'],
  '/reportes/rentabilidad': ['Rentabilidad', 'Dashboard financiero'],
  '/inventario': ['Inventario', 'Productos y almacenes'],
  '/inventario/conteo': ['Conteo de inventario', 'Conteo físico, responsables y congelamiento'],
  '/inventario/promociones': ['Promociones', 'Reglas de venta'],
  '/inventario/almacenes-moviles': ['Almacenes móviles', 'Carga para venta directa'],
  '/inventario/devoluciones': ['Devoluciones', 'Verificación y reingreso'],
  '/reportes': ['Reportes', 'Análisis del negocio'],
  '/dueno': ['Panel del dueño', 'Planes, precios y descuentos'],
  '/administracion': ['Administración', 'Configuración del sistema'],
  '/administracion/personalizacion': ['Marca y APK', 'Identidad visual y nube'],
  '/administracion/permisos': ['Roles y permisos', 'Modelos de acceso y funciones por usuario'],
};

export default function Shell({ children }) {
  const { user, plan, refresh, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [resumen, setResumen] = useState(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  useEffect(() => {
    setOpen(false);
    setNotifOpen(false);
    setUserOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;
    api.get('/dashboard?periodo=7d').then((data) => {
      setResumen(data);
      setNotifs(data.notificaciones || []);
    }).catch(() => {});
  }, [user, location.pathname]);

  useEffect(() => {
    const onClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target)) setUserOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = async () => {
    try {
      await api.post('/dashboard/notificaciones/leer', {});
      setNotifs([]);
    } catch (error) {
      toast(error.message, 'error');
    }
  };

  const page = PAGE_TITLES[location.pathname] || (location.pathname.startsWith('/ventas/') ? ['Detalle de venta', 'Ventas'] : location.pathname.startsWith('/distribucion/') ? ['Detalle de ruta', 'Distribución'] : ['DADINI SaaS', 'Panel']);
  const pendientes = resumen?.kpis?.pedidos_pendientes || 0;
  const rutas = resumen?.rutas?.filter((r) => r.estado === 'en_camino').length || 0;
  const vencidas = resumen?.kpis?.cobranzas_vencidas || 0;

  return (
    <div className="app">
      <BrandStyle />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <img className="brand-logo" src="/logo-dadini-icon.png" alt="DADINI" />
          <div className="brand-copy">
            <strong>DADINI</strong>
            <span>Gestión SaaS</span>
          </div>
        </div>
        <div className="sidebar-scroll">
          {NAV.map((group) => (
            <div key={group.group}>
              <span className="nav-label">{group.group}</span>
              {group.items.filter((item) => puede(user, item.key) && (!item.roles || item.roles.includes(user?.rol))).map((item) => {
                const Icon = item.icon;
                const badge = item.badge === 'pendientes' ? pendientes : item.badge === 'rutas' ? rutas : 0;
                return (
                  <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    <Icon size={17} />
                    <span>{item.labelVendedor && ['ventas', 'preventista'].includes(user?.rol) ? item.labelVendedor : item.label}</span>
                    {badge > 0 && <span className="nav-count">{badge}</span>}
                    {item.alert === 'vencidas' && vencidas > 0 && <span className="nav-count" style={{ background: 'var(--red)' }}>{vencidas}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="plan-mini">
            <div className="plan-row">
              <strong>DADINI SaaS · Acceso libre</strong>
              <span>Todos los módulos</span>
            </div>
            <div className="plan-bar"><i style={{ width: '100%' }} /></div>
            <div className="plan-row">
              <span>Uso interno sin límite</span>
              <span>Sin facturación</span>
            </div>
          </div>
          <div className="sidebar-user">
            <Avatar name={user?.nombre} size={32} tone="orange" />
            <div>
              <strong>{user?.nombre}</strong>
              <span>{ROL_LABEL[user?.rol] || user?.rol}</span>
            </div>
            <button className="logout-btn" onClick={logout} title="Cerrar sesión"><LogOut size={15} /></button>
          </div>
        </div>
      </aside>
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-toggle" onClick={() => setOpen(true)} aria-label="Abrir menú"><Menu size={20} /></button>
          <div className="topbar-title">
            <span>{page[1]}</span>
            <strong>{page[0]}</strong>
          </div>
          <GlobalSearch puede={puede} user={user} navigate={navigate} />
          <div className="topbar-actions">
            <div style={{ position: 'relative' }} ref={notifRef}>
              <button className="icon-btn" onClick={() => setNotifOpen((v) => !v)} aria-label="Notificaciones" style={{ position: 'relative' }}>
                <Bell size={18} />
                {notifs.length > 0 && <span style={{ position: 'absolute', top: 6, right: 7, width: 7, height: 7, borderRadius: '50%', background: 'var(--orange)' }} />}
              </button>
              {notifOpen && (
                <div className="dropdown" style={{ width: 315 }}>
                  <div className="dropdown-head">
                    <strong>Notificaciones</strong>
                    {notifs.length > 0 && <button onClick={markRead}>Marcar leídas</button>}
                  </div>
                  <div className="notif-list">
                    {notifs.length === 0 && <p style={{ padding: 16, fontSize: 12, color: 'var(--muted)' }}>Todo al día. No tienes alertas pendientes.</p>}
                    {notifs.map((n) => (
                      <div className="notif-item" key={n.id}>
                        <span className="notif-dot" />
                        <div>
                          <strong>{n.titulo}</strong>
                          <p>{n.detalle}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="dropdown-item" onClick={() => { navigate('/'); setNotifOpen(false); }}>Ver panel completo <ArrowUpRight size={13} style={{ marginLeft: 'auto' }} /></button>
                </div>
              )}
            </div>
            <div style={{ position: 'relative' }} ref={userRef}>
              <button className="topbar-avatar" onClick={() => setUserOpen((v) => !v)}>
                <Avatar name={user?.nombre} size={31} tone="navy" />
                <span className="avatar-copy">
                  <strong>{user?.nombre}</strong>
                  <span>{user?.cargo || ROL_LABEL[user?.rol]}</span>
                </span>
                <ChevronDown size={14} color="#8a9cb0" />
              </button>
              {userOpen && (
                <div className="dropdown">
                  <div style={{ padding: '8px 10px 10px', borderBottom: '1px solid var(--line)', marginBottom: 5 }}>
                    <strong style={{ display: 'block', fontSize: 12.5 }}>{user?.nombre}</strong>
                    <span style={{ fontSize: 10.5, color: 'var(--muted)' }}>{user?.email}</span>
                  </div>
                  <button className="dropdown-item" onClick={() => { setProfileOpen(true); setUserOpen(false); }}><UserRound size={15} /> Mi perfil</button>
                  <button className="dropdown-item" onClick={() => { navigate('/administracion'); setUserOpen(false); }}><Settings size={15} /> Configuración</button>
                  <div className="divider" style={{ margin: '4px 0' }} />
                  <button className="dropdown-item danger" onClick={logout}><LogOut size={15} /> Cerrar sesión</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>

      <ProfileModal open={profileOpen} onClose={() => setProfileOpen(false)} user={user} refresh={refresh} />
    </div>
  );
}

function GlobalSearch({ user, puede, navigate }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState({ productos: [], clientes: [] });
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  useEffect(() => {
    if (!term.trim()) { setResults({ productos: [], clientes: [] }); return; }
    const timer = window.setTimeout(async () => {
      try {
        const calls = [api.get(`/productos?search=${encodeURIComponent(term)}`).catch(() => ({ productos: [] }))];
        if (puede(user, 'clientes')) calls.push(api.get(`/clientes?search=${encodeURIComponent(term)}`).catch(() => ({ clientes: [] })));
        const [prod, cli] = await Promise.all(calls);
        setResults({ productos: (prod.productos || []).slice(0, 4), clientes: (cli?.clientes || []).slice(0, 4) });
      } catch (error) { /* silencio */ }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [term, user, puede]);

  const go = (path) => { setOpen(false); setTerm(''); navigate(path); };

  return (
    <div className="topbar-search" ref={boxRef}>
      <Search size={15} className="search-icon" />
      <input
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar pedidos, clientes o productos…"
      />
      <kbd>⌘K</kbd>
      {open && (
        <div className="search-panel">
          {!term && (
            <>
              <span className="group-label">Accesos rápidos</span>
              {puede(user, 'venta_nueva') && <button className="search-result" onClick={() => go('/ventas/nueva')}><ShoppingCart size={14} /> Nueva venta <small>POS</small></button>}
              {puede(user, 'distribucion') && <button className="search-result" onClick={() => go('/distribucion')}><Truck size={14} /> Rutas de hoy <small>Logística</small></button>}
              {puede(user, 'cobranzas') && <button className="search-result" onClick={() => go('/cobranzas')}><Wallet size={14} /> Cuentas por cobrar <small>Cobranzas</small></button>}
            </>
          )}
          {results.productos.length > 0 && (
            <>
              <span className="group-label">Productos</span>
              {results.productos.map((p) => (
                <button key={p.id} className="search-result" onClick={() => go(`/inventario?q=${encodeURIComponent(p.nombre)}`)}>
                  <span style={{ fontSize: 16 }}>{p.emoji}</span> {p.nombre} <small>{p.stock_total} {p.unidad}</small>
                </button>
              ))}
            </>
          )}
          {results.clientes.length > 0 && (
            <>
              <span className="group-label">Clientes</span>
              {results.clientes.map((c) => (
                <button key={c.id} className="search-result" onClick={() => go(`/clientes?q=${encodeURIComponent(c.nombre)}`)}>
                  <Users size={14} /> {c.nombre} <small>{c.zona}</small>
                </button>
              ))}
            </>
          )}
          {term && !results.productos.length && !results.clientes.length && <p style={{ padding: 14, fontSize: 11.5, color: 'var(--muted)' }}>Sin coincidencias para “{term}”.</p>}
        </div>
      )}
    </div>
  );
}

function ProfileModal({ open, onClose, user, refresh }) {
  const toast = useToast();
  const [tab, setTab] = useState('perfil');
  const [form, setForm] = useState({ nombre: user?.nombre || '', telefono: user?.telefono || '', cargo: user?.cargo || '' });
  const [pass, setPass] = useState({ actual: '', nueva: '', repetir: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setForm({ nombre: user?.nombre || '', telefono: user?.telefono || '', cargo: user?.cargo || '' });
  }, [open, user]);

  const saveProfile = async () => {
    setLoading(true);
    try {
      await api.put('/auth/perfil', form);
      await refresh();
      toast('Perfil actualizado correctamente');
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally { setLoading(false); }
  };

  const savePass = async () => {
    if (pass.nueva !== pass.repetir) return toast('Las contraseñas nuevas no coinciden.', 'error');
    setLoading(true);
    try {
      await api.put('/auth/password', { actual: pass.actual, nueva: pass.nueva });
      toast('Contraseña actualizada');
      setPass({ actual: '', nueva: '', repetir: '' });
      onClose();
    } catch (error) {
      toast(error.message, 'error');
    } finally { setLoading(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Mi cuenta" subtitle="Datos personales y seguridad de acceso">
      <div className="tabs mb-16">
        <button className={tab === 'perfil' ? 'active' : ''} onClick={() => setTab('perfil')}><UserRound size={14} /> Perfil</button>
        <button className={tab === 'seguridad' ? 'active' : ''} onClick={() => setTab('seguridad')}><Lock size={14} /> Seguridad</button>
      </div>
      {tab === 'perfil' ? (
        <div className="form-stack">
          <div className="inline" style={{ gap: 13 }}>
            <Avatar name={user?.nombre} size={52} tone="orange" />
            <div>
              <strong style={{ display: 'block' }}>{user?.nombre}</strong>
              <span className="small muted">{user?.email} · {ROL_LABEL[user?.rol]}</span>
            </div>
          </div>
          <div className="field"><label>Nombre completo</label><input className="input" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Teléfono</label><input className="input" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} /></div>
            <div className="field"><label>Cargo</label><input className="input" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} /></div>
          </div>
          <div className="modal-foot" style={{ padding: '4px 0 0', background: 'none', border: 0 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveProfile} disabled={loading}>Guardar cambios</button>
          </div>
        </div>
      ) : (
        <div className="form-stack">
          <div className="notice notice-info"><Lock size={15} /> Usa una contraseña de al menos 8 caracteres con letras y números.</div>
          <div className="field"><label>Contraseña actual</label><input type="password" className="input" value={pass.actual} onChange={(e) => setPass({ ...pass, actual: e.target.value })} /></div>
          <div className="field-row">
            <div className="field"><label>Nueva contraseña</label><input type="password" className="input" value={pass.nueva} onChange={(e) => setPass({ ...pass, nueva: e.target.value })} /></div>
            <div className="field"><label>Repetir contraseña</label><input type="password" className="input" value={pass.repetir} onChange={(e) => setPass({ ...pass, repetir: e.target.value })} /></div>
          </div>
          <div className="modal-foot" style={{ padding: '4px 0 0', background: 'none', border: 0 }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={savePass} disabled={loading}>Actualizar contraseña</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
