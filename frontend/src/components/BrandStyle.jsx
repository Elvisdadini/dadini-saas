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
    if (!branding || !Object.keys(branding).length) return undefined;
    const raiz = document.documentElement;
    const aplicar = () => {
      const oscuro = raiz.dataset.theme === 'oscuro';
      Object.entries(VALORES).forEach(([clave, variable]) => {
        // El color de fondo de la marca es claro; en modo oscuro no debe
        // sobrescribir la variable --bg del tema (un estilo inline gana a CSS).
        if (oscuro && variable === '--bg') {
          raiz.style.removeProperty('--bg');
          return;
        }
        const valor = branding[clave];
        if (valor !== undefined && valor !== null && valor !== '') {
          raiz.style.setProperty(variable, clave === 'radio' ? `${valor}px` : valor);
        }
      });
    };
    aplicar();
    window.addEventListener('dadini:tema', aplicar);
    return () => window.removeEventListener('dadini:tema', aplicar);
  }, [branding]);
  return null;
}
