import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, puede } from './auth';
import Shell from './components/Shell';
import LoginPage from './pages/Login';
import Dashboard from './pages/Dashboard';
import Ventas from './pages/Ventas';
import VentaNueva from './pages/VentaNueva';
import PreparadoCarga from './pages/PreparadoCarga';
import Promociones from './pages/Promociones';
import CategoriasClientes from './pages/CategoriasClientes';
import AlmacenesMoviles from './pages/AlmacenesMoviles';
import Dueno from './pages/Dueno';
import MiCamion from './pages/MiCamion';
import Devoluciones from './pages/Devoluciones';
import Objetivos from './pages/Objetivos';
import Personalizacion from './pages/Personalizacion';
import Proveedores from './pages/Proveedores';
import SolicitudesCompra from './pages/SolicitudesCompra';
import OrdenesCompra from './pages/OrdenesCompra';
import Gastos from './pages/Gastos';
import Rentabilidad from './pages/Rentabilidad';
import Nomina from './pages/Nomina';
import AgendaPreventa from './pages/AgendaPreventa';
import PedidosProgramados from './pages/PedidosProgramados';
import PedidoDetalle from './pages/PedidoDetalle';
import Clientes from './pages/Clientes';
import Cobranzas from './pages/Cobranzas';
import Inventario from './pages/Inventario';
import Distribucion from './pages/Distribucion';
import RutaDetalle from './pages/RutaDetalle';
import Reportes from './pages/Reportes';
import Administracion from './pages/Administracion';
import Planes from './pages/Planes';

function Splash() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#061c33', color: '#fff', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 52, height: 52, borderRadius: 15, background: 'linear-gradient(145deg,#ff8a2b,#ff6500)', display: 'grid', placeItems: 'center', fontWeight: 800, letterSpacing: '0.05em' }}>D</span>
        <Loader2 size={20} className="spin" style={{ color: '#ff6500' }} />
        <span style={{ fontSize: 12, color: '#93a9be' }}>Cargando DADINI SaaS…</span>
      </div>
    </div>
  );
}

function RequireAuth() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Splash />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  return <Outlet />;
}

function Guard({ module, children }) {
  const { user } = useAuth();
  if (!puede(user, module)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<Shell><Outlet /></Shell>}>
          <Route index element={<Dashboard />} />
          <Route path="ventas" element={<Guard module="ventas"><Ventas /></Guard>} />
          <Route path="ventas/nueva" element={<Guard module="venta_nueva"><VentaNueva /></Guard>} />
          <Route path="ventas/preparado" element={<Navigate to="/inventario/preparado" replace />} />
          <Route path="inventario/preparado" element={<Guard module="inventario"><PreparadoCarga /></Guard>} />
          <Route path="ventas/agenda" element={<Guard module="ventas"><AgendaPreventa /></Guard>} />
          <Route path="ventas/objetivos" element={<Guard module="objetivos"><Objetivos /></Guard>} />
          <Route path="ventas/:id" element={<Guard module="ventas"><PedidoDetalle /></Guard>} />
          <Route path="mi-camion" element={<Guard module="mi_camion"><MiCamion /></Guard>} />
          <Route path="clientes" element={<Guard module="clientes"><Clientes /></Guard>} />
          <Route path="clientes/categorias" element={<Guard module="clientes"><CategoriasClientes /></Guard>} />
          <Route path="cobranzas" element={<Guard module="cobranzas"><Cobranzas /></Guard>} />
          <Route path="inventario" element={<Guard module="inventario"><Inventario /></Guard>} />
          <Route path="inventario/promociones" element={<Guard module="inventario"><Promociones /></Guard>} />
          <Route path="inventario/almacenes-moviles" element={<Guard module="inventario"><AlmacenesMoviles /></Guard>} />
          <Route path="inventario/devoluciones" element={<Guard module="inventario"><Devoluciones /></Guard>} />
          <Route path="distribucion" element={<Guard module="distribucion"><Distribucion /></Guard>} />
          <Route path="distribucion/programados" element={<Guard module="distribucion"><PedidosProgramados /></Guard>} />
          <Route path="distribucion/:id" element={<Guard module="distribucion"><RutaDetalle /></Guard>} />
          <Route path="compras/solicitudes" element={<Guard module="compras"><SolicitudesCompra /></Guard>} />
          <Route path="compras/ordenes" element={<Guard module="compras"><OrdenesCompra /></Guard>} />
          <Route path="compras/proveedores" element={<Guard module="compras"><Proveedores /></Guard>} />
          <Route path="compras/gastos" element={<Guard module="compras"><Gastos /></Guard>} />
          <Route path="compras/nomina" element={<Guard module="compras"><Nomina /></Guard>} />
          <Route path="reportes/rentabilidad" element={<Guard module="rentabilidad"><Rentabilidad /></Guard>} />
          <Route path="reportes" element={<Guard module="reportes"><Reportes /></Guard>} />
          <Route path="dueno" element={<Guard module="dueno"><Dueno /></Guard>} />
          <Route path="administracion" element={<Guard module="administracion"><Administracion /></Guard>} />
          <Route path="administracion/personalizacion" element={<Guard module="administracion"><Personalizacion /></Guard>} />
          <Route path="planes" element={<Guard module="planes"><Planes /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
