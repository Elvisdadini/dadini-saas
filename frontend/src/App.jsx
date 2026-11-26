import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth, puede } from './auth';
import Shell from './components/Shell';
import LoginPage from './pages/Login';

// Carga bajo demanda: el teléfono descarga primero solo el login y el menú,
// no todo el sistema. Esto reduce mucho el tiempo de entrada en la APK.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Ventas = lazy(() => import('./pages/Ventas'));
const VentaNueva = lazy(() => import('./pages/VentaNueva'));
const PreparadoCarga = lazy(() => import('./pages/PreparadoCarga'));
const Promociones = lazy(() => import('./pages/Promociones'));
const CategoriasClientes = lazy(() => import('./pages/CategoriasClientes'));
const AlmacenesMoviles = lazy(() => import('./pages/AlmacenesMoviles'));
const Dueno = lazy(() => import('./pages/Dueno'));
const MiCamion = lazy(() => import('./pages/MiCamion'));
const Devoluciones = lazy(() => import('./pages/Devoluciones'));
const Objetivos = lazy(() => import('./pages/Objetivos'));
const Personalizacion = lazy(() => import('./pages/Personalizacion'));
const Proveedores = lazy(() => import('./pages/Proveedores'));
const SolicitudesCompra = lazy(() => import('./pages/SolicitudesCompra'));
const OrdenesCompra = lazy(() => import('./pages/OrdenesCompra'));
const Gastos = lazy(() => import('./pages/Gastos'));
const Rentabilidad = lazy(() => import('./pages/Rentabilidad'));
const Nomina = lazy(() => import('./pages/Nomina'));
const AgendaPreventa = lazy(() => import('./pages/AgendaPreventa'));
const PedidosProgramados = lazy(() => import('./pages/PedidosProgramados'));
const PedidoDetalle = lazy(() => import('./pages/PedidoDetalle'));
const Clientes = lazy(() => import('./pages/Clientes'));
const CRM = lazy(() => import('./pages/CRM'));
const Cobranzas = lazy(() => import('./pages/Cobranzas'));
const Inventario = lazy(() => import('./pages/Inventario'));
const ActualizarPrecios = lazy(() => import('./pages/ActualizarPrecios'));
const MapaZonas = lazy(() => import('./pages/MapaZonas'));
const Caja = lazy(() => import('./pages/Caja'));
const Facturacion = lazy(() => import('./pages/Facturacion'));
const Kardex = lazy(() => import('./pages/Kardex'));
const Catalogo = lazy(() => import('./pages/Catalogo'));
const ConteoInventario = lazy(() => import('./pages/ConteoInventario'));
const Distribucion = lazy(() => import('./pages/Distribucion'));
const RutaDetalle = lazy(() => import('./pages/RutaDetalle'));
const Reportes = lazy(() => import('./pages/Reportes'));
const ReportesAutomaticos = lazy(() => import('./pages/ReportesAutomaticos'));
const Administracion = lazy(() => import('./pages/Administracion'));
const Sucursales = lazy(() => import('./pages/Sucursales'));
const Demanda = lazy(() => import('./pages/Demanda'));
const BIRol = lazy(() => import('./pages/BIRol'));
const RutasVenta = lazy(() => import('./pages/RutasVenta'));
const Permisos = lazy(() => import('./pages/Permisos'));

function Splash() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#061c33', color: '#fff', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
        <img src="/logo-dadini-icon.png" alt="DADINI" style={{ width: 52, height: 52, objectFit: 'contain' }} />
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
    <Suspense fallback={<Splash />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Shell><Outlet /></Shell>}>
            <Route index element={<Dashboard />} />
            <Route path="bi" element={<BIRol />} />
            <Route path="ventas" element={<Guard module="ventas"><Ventas /></Guard>} />
            <Route path="ventas/nueva" element={<Guard module="venta_nueva"><VentaNueva /></Guard>} />
            <Route path="ventas/preparado" element={<Navigate to="/inventario/preparado" replace />} />
            <Route path="inventario/preparado" element={<Guard module="inventario"><PreparadoCarga /></Guard>} />
            <Route path="ventas/agenda" element={<Guard module="ventas"><AgendaPreventa /></Guard>} />
            <Route path="ventas/rutas" element={<Guard module="rutas_venta"><RutasVenta /></Guard>} />
            <Route path="ventas/zonas-mapa" element={<Guard module="rutas_venta"><MapaZonas /></Guard>} />
            <Route path="ventas/objetivos" element={<Guard module="objetivos"><Objetivos /></Guard>} />
            <Route path="ventas/:id" element={<Guard module="ventas"><PedidoDetalle /></Guard>} />
            <Route path="mi-camion" element={<Guard module="mi_camion"><MiCamion /></Guard>} />
            <Route path="clientes" element={<Guard module="clientes"><Clientes /></Guard>} />
            <Route path="crm" element={<Guard module="clientes"><CRM /></Guard>} />
            <Route path="clientes/categorias" element={<Guard module="clientes"><CategoriasClientes /></Guard>} />
            <Route path="cobranzas" element={<Guard module="cobranzas"><Cobranzas /></Guard>} />
            <Route path="caja" element={<Guard module="cobranzas"><Caja /></Guard>} />
            <Route path="facturacion" element={<Guard module="configuracion"><Facturacion /></Guard>} />
            <Route path="inventario" element={<Guard module="inventario"><Inventario /></Guard>} />
            <Route path="inventario/kardex" element={<Guard module="inventario"><Kardex /></Guard>} />
            <Route path="inventario/precios" element={<Guard module="inventario"><ActualizarPrecios /></Guard>} />
            <Route path="catalogo" element={<Guard module="catalogo"><Catalogo /></Guard>} />
            <Route path="inventario/conteo" element={<Guard module="inventario"><ConteoInventario /></Guard>} />
            <Route path="inventario/promociones" element={<Guard module="inventario"><Promociones /></Guard>} />
            <Route path="inventario/almacenes-moviles" element={<Guard module="inventario"><AlmacenesMoviles /></Guard>} />
            <Route path="inventario/devoluciones" element={<Guard module="inventario"><Devoluciones /></Guard>} />
            <Route path="distribucion" element={<Guard module="distribucion"><Distribucion /></Guard>} />
            <Route path="distribucion/programados" element={<Guard module="distribucion"><PedidosProgramados /></Guard>} />
            <Route path="distribucion/:id" element={<Guard module="distribucion"><RutaDetalle /></Guard>} />
            <Route path="compras/demanda" element={<Guard module="compras"><Demanda /></Guard>} />
            <Route path="compras/solicitudes" element={<Guard module="compras"><SolicitudesCompra /></Guard>} />
            <Route path="compras/ordenes" element={<Guard module="compras"><OrdenesCompra /></Guard>} />
            <Route path="compras/proveedores" element={<Guard module="compras"><Proveedores /></Guard>} />
            <Route path="compras/gastos" element={<Guard module="compras"><Gastos /></Guard>} />
            <Route path="compras/nomina" element={<Guard module="compras"><Nomina /></Guard>} />
            <Route path="reportes/rentabilidad" element={<Guard module="rentabilidad"><Rentabilidad /></Guard>} />
            <Route path="reportes/automatico" element={<Guard module="reportes"><ReportesAutomaticos /></Guard>} />
            <Route path="reportes" element={<Guard module="reportes"><Reportes /></Guard>} />
            <Route path="dueno" element={<Guard module="dueno"><Dueno /></Guard>} />
            <Route path="administracion" element={<Guard module="administracion"><Administracion /></Guard>} />
            <Route path="administracion/sucursales" element={<Guard module="administracion"><Sucursales /></Guard>} />
            <Route path="administracion/personalizacion" element={<Guard module="administracion"><Personalizacion /></Guard>} />
            <Route path="administracion/permisos" element={<Guard module="administracion"><Permisos /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
