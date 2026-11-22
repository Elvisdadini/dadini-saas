import { useEffect } from 'react';
import { useAuth } from '../auth';

const VALORES = {
  color_primario: '--navy-900',
  color_secundario: '--orange',
  color_acento: '--green',
  color_fondo: '--bg',
  tipografia: '--font',
  radio: '--radius',
};

export default function BrandStyle() {
  const { branding } = useAuth();
  useEffect(() => {
    if (!branding || !Object.keys(branding).length) return;
    const raiz = document.documentElement;
    Object.entries(VALORES).forEach(([clave, variable]) => {
      const valor = branding[clave];
      if (valor !== undefined && valor !== null && valor !== '') {
        raiz.style.setProperty(variable, clave === 'radio' ? `${valor}px` : valor);
      }
    });
  }, [branding]);
  return null;
}
