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
  reportes: ['admin', 'dueno', 'supervisor', 'preventista'],
  administracion: ['admin', 'dueno'],
  dueno: ['dueno'],
};

export function puede(user, modulo) {
  if (!user) return false;
  if (user.rol === 'admin' || user.rol === 'dueno') return true;
  // Los permisos guardados en el usuario son la fuente de verdad; el mapa por
  // rol se conserva solo para cuentas creadas antes de esta versión.
  if (Array.isArray(user.permisos)) {
    if (user.permisos.includes(modulo)) return true;
    // Misma compatibilidad que el backend: el permiso de módulo otorga sus
    // sub-funciones (ej. "inventario" habilita "inventario.ver").
    if (modulo && modulo.includes('.')) return user.permisos.includes(modulo.split('.')[0]);
    return false;
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

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setEmpresa(null);
    setPlan(null);
    setBranding({});
    setApk(null);
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
    setToken(data.token);
    setUser(data.user);
    setEmpresa(data.empresa);
    setPlan(data.plan);
    setBranding(data.branding || {});
    setApk(data.apk || null);
    return data.user;
  }, []);

  const value = useMemo(
    () => ({ user, empresa, plan, branding, apk, loading, login, logout, refresh }),
    [user, empresa, plan, branding, apk, loading, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
