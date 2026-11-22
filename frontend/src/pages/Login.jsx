import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { useAuth } from '../auth';
import { Avatar } from '../ui';

const DEMO = [
  { nombre: 'Valeria Sejas', email: 'admin@dadini.bo', rol: 'Administrador', tone: 'orange' },
  { nombre: 'María Quispe', email: 'ventas@dadini.bo', rol: 'Ventas', tone: 'blue' },
  { nombre: 'Jorge Villarroel', email: 'almacen@dadini.bo', rol: 'Almacén', tone: 'green' },
  { nombre: 'Luis Mamani', email: 'rutas@dadini.bo', rol: 'Distribución', tone: 'purple' },
  { nombre: 'Carla Torres', email: 'cobranzas@dadini.bo', rol: 'Cobranzas', tone: 'amber' },
];

export default function LoginPage() {
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('admin@dadini.bo');
  const [password, setPassword] = useState('Dadini2026!');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  const entrar = async (mail = email, pass = password, demo = '') => {
    setError('');
    if (demo) setDemoLoading(demo); else setLoading(true);
    try {
      await login(mail, pass);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setDemoLoading('');
    }
  };

  return (
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <span className="brand-mark"><Boxes size={21} /></span>
          <div>
            <strong>DADINI</strong>
            <span>Gestión SaaS · Bolivia</span>
          </div>
        </div>

        <div className="login-hero">
          <span className="tag"><ShieldCheck size={12} /> Plataforma operativa integral</span>
          <h1>Todo tu negocio,<br />en un solo <em>lugar.</em></h1>
          <p>Ventas, distribución, inventario, cobranzas y administración conectados en tiempo real. La plataforma que acompaña el crecimiento de DADINI.</p>
          <div className="login-features">
            <div><CheckCircle2 size={16} /> Punto de venta</div>
            <div><Truck size={16} /> Rutas y entregas</div>
            <div><Wallet size={16} /> Cobranzas</div>
          </div>
          <div className="login-stats">
            <div className="login-stat"><strong>+1.500</strong><span>Pedidos gestionados</span></div>
            <div className="login-stat"><strong>14</strong><span>Productos activos</span></div>
            <div className="login-stat"><strong>3</strong><span>Almacenes conectados</span></div>
          </div>
        </div>

        <div className="login-footer">
          <span>DADINI © {new Date().getFullYear()} · Cochabamba, Bolivia</span>
          <span>Datos demo protegidos</span>
        </div>
      </section>

      <section className="login-form-wrap">
        <div className="login-form">
          <span className="eyebrow">Acceso al panel</span>
          <h2>Bienvenido de nuevo</h2>
          <p>Ingresa con tu cuenta para controlar la operación de DADINI.</p>

          {error && <div className="notice notice-danger" style={{ marginBottom: 14 }}><Lock size={15} /> {error}</div>}

          <form onSubmit={(e) => { e.preventDefault(); entrar(); }}>
            <div className="field">
              <label>Correo electrónico</label>
              <div style={{ position: 'relative' }}>
                <Mail size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted-2)' }} />
                <input className="input" style={{ paddingLeft: 34 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@dadini.bo" autoComplete="username" />
              </div>
            </div>
            <div className="field">
              <label>Contraseña</label>
              <div className="login-pass">
                <input className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label="Mostrar contraseña">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 6 }} disabled={loading || Boolean(demoLoading)}>
              {loading ? <><Loader2 size={17} className="spin" /> Ingresando…</> : <>Ingresar al panel <ArrowRight size={16} /></>}
            </button>
          </form>

          <div className="demo-box">
            <span>Acceso rápido de demostración</span>
            <div className="demo-grid">
              {DEMO.map((d) => (
                <button key={d.email} className="demo-btn" disabled={Boolean(demoLoading) || loading} onClick={() => entrar(d.email, 'Dadini2026!', d.email)}>
                  <Avatar name={d.nombre} size={23} tone={d.tone} />
                  <span>
                    <span>{d.nombre.split(' ')[0]}</span>
                    <small>{demoLoading === d.email ? 'Ingresando…' : d.rol}</small>
                  </span>
                </button>
              ))}
            </div>
            <p className="login-legal">Todas las cuentas demo usan la contraseña <strong>Dadini2026!</strong>. Los datos son de demostración y se pueden regenerar en cualquier momento.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
