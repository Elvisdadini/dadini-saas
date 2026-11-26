import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Building2, ClipboardList, Crown, PackagePlus, Sparkles, TrendingUp } from 'lucide-react';
import { Modal } from '../ui';

const CLAVE = 'dadini_onboarding_v1';

const PASOS = [
  {
    icon: TrendingUp, titulo: 'Demanda y reposición',
    detalle: 'El sistema calcula cuándo se agotará cada producto usando tus ventas históricas y el lead time.',
    ruta: '/compras/demanda', cta: 'Ver demanda',
  },
  {
    icon: BarChart3, titulo: 'Tablero por rol',
    detalle: 'Cada perfil tiene su propio panel: dueño, supervisor, vendedor y cobrador.',
    ruta: '/bi', cta: 'Abrir tablero',
  },
  {
    icon: ClipboardList, titulo: 'CRM 360 y scoring RFM',
    detalle: 'Prioriza visitas y cobranzas con clientes campeones, en riesgo y perdidos.',
    ruta: '/crm', cta: 'Ver clientes',
  },
  {
    icon: Building2, titulo: 'Sucursales',
    detalle: 'Cada cadena o sucursal opera con datos aislados. Cambia de sucursal en la barra superior.',
    ruta: '/administracion/sucursales', cta: 'Ver sucursales',
  },
  {
    icon: Sparkles, titulo: 'Asistente con memoria',
    detalle: 'Pregunta por productos, crédito o normativa SIAT; ahora conoce tus políticas. Puedes dictar por voz.',
    ruta: '/', cta: 'Probar asistente',
  },
];

export default function Onboarding() {
  const navigate = useNavigate();
  const [indice, setIndice] = useState(() => (localStorage.getItem(CLAVE) === 'listo' ? -1 : 0));
  if (indice < 0) return null;

  const cerrar = (ir) => {
    localStorage.setItem(CLAVE, 'listo');
    setIndice(-1);
    if (ir) navigate(ir);
  };
  const paso = PASOS[indice];
  const Icono = paso.icon;

  return (
    <Modal open onClose={() => cerrar(null)} title="Lo nuevo en DADINI" subtitle={`${indice + 1} de ${PASOS.length} · guía rápida`}
      footer={<>
        <button className="btn btn-ghost" onClick={() => cerrar(null)}>Omitir</button>
        {indice < PASOS.length - 1
          ? <button className="btn btn-primary" onClick={() => setIndice(indice + 1)}>Siguiente</button>
          : <button className="btn btn-primary" onClick={() => cerrar(paso.ruta)}>Empezar</button>}
      </>}
    >
      <div className="form-stack">
        <div className="notice notice-info"><Crown size={15} /> Estas funciones ya están activas en tu sistema. Recórrelas una vez para conocerlas.</div>
        <div className="summary-box">
          <div className="inline" style={{ gap: 12 }}>
            <span className="stat-icon stat-orange"><Icono size={20} /></span>
            <div><strong style={{ display: 'block', fontSize: 15 }}>{paso.titulo}</strong><span className="small muted">{paso.detalle}</span></div>
          </div>
        </div>
        <button className="btn btn-soft btn-block" onClick={() => cerrar(paso.ruta)}>{paso.cta} <PackagePlus size={14} /></button>
      </div>
    </Modal>
  );
}
