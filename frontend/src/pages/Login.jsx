import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock, ShieldCheck, Truck, UserRound, Wallet } from 'lucide-react';
import { useAuth } from '../auth';

const CLAVE_USUARIO = 'dadini_usuario';

export default function LoginPage() {
  const { user, login, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identificador, setIdentificador] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [show, setShow] = useState(false);
  const [usarPin, setUsarPin] = useState(false);
  const [recordar, setRecordar] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const guardado = localStorage.getItem(CLAVE_USUARIO);
    if (guardado) { setIdentificador(guardado); setRecordar(true); }
  }, []);

  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true });
  }, [user, authLoading, navigate]);

  const entrar = async () => {
    setError('');
    if (!identificador.trim()) return setError('Ingresa tu usuario.');
    setLoading(true);
    try {
      if (usarPin) await login(identificador.trim(), undefined, pin.trim());
      else await login(identificador.trim(), password, undefined);
      if (recordar) localStorage.setItem(CLAVE_USUARIO, identificador.trim());
      else localStorage.removeItem(CLAVE_USUARIO);
      const from = location.state?.from;
      navigate(from && from !== '/login' ? from : '/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const cambiarUsuario = () => {
    localStorage.removeItem(CLAVE_USUARIO);
    setRecordar(false);
    setIdentificador('');
    setPassword('');
    setPin('');
  };

  return (
    <div className="login-page">
      <section className="login-showcase">
        <div className="login-brand">
          <img className="brand-logo" src="/logo-dadini-icon.png" alt="DADINI" />
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
          <p>Ingresa con tu usuario y contraseña, o solo con tu PIN.</p>

          {error && <div className="notice notice-danger" style={{ marginBottom: 14 }}><Lock size={15} /> {error}</div>}

          <form onSubmit={(e) => { e.preventDefault(); entrar(); }}>
            {recordar && identificador ? (
              <div className="notice notice-info" style={{ marginBottom: 14 }}>
                <UserRound size={15} />
                <span>Usuario recordado: <strong>{identificador}</strong></span>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={cambiarUsuario}>Cambiar</button>
              </div>
            ) : (
              <div className="field">
                <label>Usuario</label>
                <div style={{ position: 'relative' }}>
                  <UserRound size={15} style={{ position: 'absolute', left: 11, top: 11, color: 'var(--muted-2)' }} />
                  <input className="input" style={{ paddingLeft: 34 }} value={identificador} onChange={(e) => setIdentificador(e.target.value)} placeholder="Ej. admin" autoComplete="username" />
                </div>
              </div>
            )}
            <div className="field">
              <label>{usarPin ? 'PIN' : 'Contraseña'}</label>
              <div className="login-pass">
                <input className="input" type={show ? 'text' : 'password'} value={usarPin ? pin : password} onChange={(e) => usarPin ? setPin(e.target.value) : setPassword(e.target.value)} placeholder={usarPin ? '••••' : '••••••••'} autoComplete="current-password" />
                <button type="button" className="icon-btn" onClick={() => setShow((v) => !v)} aria-label="Mostrar contraseña">{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>
            <div className="login-options">
              <label className="check"><input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Mantener usuario en este dispositivo</label>
              <label className="check"><input type="checkbox" checked={usarPin} onChange={(e) => setUsarPin(e.target.checked)} /> Ingresar con PIN</label>
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
