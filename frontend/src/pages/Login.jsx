import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, Boxes, CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Truck, Wallet } from 'lucide-react';
import { useAuth } from '../auth';

export default function LoginPage() {
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  const entrar = async () => {
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
            <div className="login-stat"><strong>100%</strong><span>Operativo</span></div>
            <div className="login-stat"><strong>14</strong><span>Productos activos</span></div>
            <div className="login-stat"><strong>3</strong><span>Almacenes conectados</span></div>
          </div>
        </div>

        <div className="login-footer">
          <span>DADINI © {new Date().getFullYear()} · Cochabamba, Bolivia</span>
          <span>Acceso corporativo</span>
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
            <button type="submit" className="btn btn-primary btn-lg btn-block" style={{ marginTop: 6 }} disabled={loading}>
              {loading ? <><Loader2 size={17} className="spin" /> Ingresando…</> : <>Ingresar al panel <ArrowRight size={16} /></>}
            </button>
          </form>

          <p className="login-legal">Solo personal autorizado de DADINI. Las actividades quedan registradas en la auditoría del sistema.</p>
        </div>
      </section>
    </div>
  );
}
