import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken } from './api';

const AuthContext = createContext(null);

export const ROL_LABEL = {
  admin: 'Administrador',
  dueno: 'Dueño del sistema',
  supervisor: 'Supervisor',
  ventas: 'Ventas',
  preventista: 'Preventista',
  vendedor_camion: 'Venta directa (camión)',
  almacen: 'Almacén',
  distribucion: 'Distribución',
  cobranzas: 'Cobranzas',
  contador: 'Contador / Contabilidad',
};

export const ROL_COLOR = {
  admin: 'orange',
  dueno: 'purple',
  supervisor: 'amber',
  ventas: 'blue',
  preventista: 'green',
  vendedor_camion: 'amber',
  almacen: 'green',
  distribucion: 'purple',
  cobranzas: 'amber',
  contador: 'navy',
};

export const PERMISOS = {
  dashboard: ['admin', 'ventas', 'preventista', 'vendedor_camion', 'almacen', 'distribucion', 'cobranzas'],
  ventas: ['admin', 'ventas', 'preventista', 'vendedor_camion', 'cobranzas', 'distribucion'],
  venta_nueva: ['admin', 'ventas', 'preventista', 'vendedor_camion'],
  clientes: ['admin', 'ventas', 'preventista', 'vendedor_camion', 'cobranzas'],
  mi_camion: ['vendedor_camion'],
  objetivos: ['admin', 'dueno', 'supervisor'],
  compras: ['admin', 'dueno', 'almacen', 'supervisor'],
  rentabilidad: ['admin', 'dueno', 'supervisor'],
  cobranzas: ['admin', 'ventas', 'preventista', 'cobranzas'],
  inventario: ['admin', 'almacen'],
  catalogo: ['admin', 'dueno', 'almacen', 'supervisor', 'ventas', 'preventista', 'vendedor_camion', 'cobranzas', 'distribucion'],
  distribucion: ['admin', 'distribucion', 'ventas', 'preventista'],
  cambios: ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'vendedor_camion', 'distribucion'],
  bi: ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'cobranzas'],
  crm: ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'cobranzas'],
  demanda: ['admin', 'dueno', 'almacen', 'supervisor'],
  caja: ['admin', 'dueno', 'supervisor', 'ventas', 'cobranzas'],
  visitas: ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'distribucion'],
  kardex: ['admin', 'dueno', 'almacen', 'supervisor'],
  fiscal: ['admin', 'dueno', 'supervisor', 'ventas', 'cobranzas'],
  sucursales: ['admin', 'dueno'],
  integraciones: ['admin', 'dueno'],
  importacion: ['admin', 'dueno', 'almacen', 'supervisor'],
  notificaciones: ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'cobranzas', 'distribucion'],
  whatsapp: ['admin', 'dueno', 'ventas', 'preventista', 'distribucion', 'cobranzas'],
  logistica: ['admin', 'dueno', 'supervisor', 'distribucion'],
  reportes_automaticos: ['admin', 'dueno', 'supervisor'],
  reportes: ['admin', 'dueno', 'supervisor', 'preventista'],
  mi_reporte: ['ventas', 'preventista', 'vendedor_camion', 'distribucion', 'cobranzas'],
  contabilidad: ['admin', 'dueno', 'contador'],
  administracion: ['admin', 'dueno'],
  dueno: ['dueno'],
};

export function puede(user, modulo) {
  if (!user) return false;
  // Sucursales y panel del dueño son exclusivos del dueño del sistema.
  if (modulo === 'dueno' || modulo === 'sucursales' || modulo === 'administracion/sucursales') {
    return user.rol === 'dueno';
  }
  if (user.rol === 'admin' || user.rol === 'dueno') return true;
  // Los permisos guardados en el usuario son la fuente de verdad; el mapa por
  // rol se conserva solo para cuentas creadas antes de esta versión.
  if (Array.isArray(user.permisos)) {
    if (user.permisos.includes(modulo)) return true;
    // Misma compatibilidad que el backend: el permiso de módulo otorga sus
    // sub-funciones (ej. "inventario" habilita "inventario.ver") y cualquier
    // sub-función activa habilita el módulo en el menú.
    if (modulo && modulo.includes('.')) return user.permisos.includes(modulo.split('.')[0]);
    return user.permisos.some((p) => p.startsWith(`${modulo}.`));
  }
  return (PERMISOS[modulo] || []).includes(user.rol);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [empresa, setEmpresa] = useState(null);
  const [plan, setPlan] = useState(null);
  const [branding, setBranding] = useState({});
  const [apk, setApk] = useState(null);
  const [loading, setLoading] = useState(Boolean(getToken()));
  const [desafio2fa, setDesafio2fa] = useState(null);
  const [sucursales, setSucursales] = useState([]);
  const [sucursalId, setSucursalId] = useState(Number(localStorage.getItem('dadini_sucursal') || 0));

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setEmpresa(null);
    setPlan(null);
    setBranding({});
    setApk(null);
    setDesafio2fa(null);
    localStorage.removeItem('dadini_sucursal');
    setSucursales([]);
  }, []);

  const aplicarSesion = useCallback((data) => {
    setToken(data.token);
    setUser(data.user);
    setEmpresa(data.empresa);
    setPlan(data.plan);
    setBranding(data.branding || {});
    setApk(data.apk || null);
    setDesafio2fa(null);
    const idSucursal = Number(data.user?.sucursal_id || 1);
    localStorage.setItem('dadini_sucursal', String(idSucursal));
    setSucursalId(idSucursal);
    setSucursales(data.user?.sucursales || []);
    return data.user;
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const data = await api.get('/auth/me');
      setUser(data.user);
      setEmpresa(data.empresa);
      setPlan(data.plan);
      setBranding(data.branding || {});
      setApk(data.apk || null);
      try {
        const suc = await api.get('/sucursales/mi');
        setSucursales(suc.disponibles || []);
        setSucursalId(Number(suc.sucursal?.id || 1));
      } catch { /* sucursales opcional en despliegues anteriores */ }
    } catch (error) {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener('dadini:unauthorized', onUnauthorized);
    return () => window.removeEventListener('dadini:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = useCallback(async (identificador, password, pin) => {
    const data = await api.post('/auth/login', { usuario: identificador, password, pin });
    if (data.requiere_2fa) {
      setDesafio2fa({ id: data.challenge_id });
      return null;
    }
    return aplicarSesion(data);
  }, [aplicarSesion]);

  const verificar2FA = useCallback(async (codigo) => {
    if (!desafio2fa?.id) throw new Error('Inicia sesión para continuar.');
    const data = await api.post('/auth/2fa/verificar', { challenge_id: desafio2fa.id, codigo });
    return aplicarSesion(data);
  }, [desafio2fa, aplicarSesion]);

  const cancelar2FA = useCallback(() => setDesafio2fa(null), []);

  const cambiarSucursal = useCallback((id) => {
    localStorage.setItem('dadini_sucursal', String(id));
    setSucursalId(Number(id));
    window.location.reload();
  }, []);

  const value = useMemo(
    () => ({ user, empresa, plan, branding, apk, loading, desafio2fa, login, verificar2FA, cancelar2FA, sucursales, sucursalId, cambiarSucursal, logout, refresh }),
    [user, empresa, plan, branding, apk, loading, desafio2fa, login, verificar2FA, cancelar2FA, sucursales, sucursalId, cambiarSucursal, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
