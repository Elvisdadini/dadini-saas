// Catálogo único de módulos y acciones. Lo consume el backend (req.permisos /
// requirePermiso) y el frontend (menú, botones y formularios de usuario).
const MODULOS = [
  { codigo: 'dashboard', etiqueta: 'Panel general', grupo: 'General', descripcion: 'Ver el resumen operativo' },
  { codigo: 'ventas', etiqueta: 'Ventas', grupo: 'Operación', descripcion: 'Consultar pedidos e informes de ventas' },
  { codigo: 'venta_nueva', etiqueta: 'Nueva venta (POS)', grupo: 'Operación', descripcion: 'Registrar ventas en mostrador, ruta o WhatsApp' },
  { codigo: 'rutas_venta', etiqueta: 'Rutas y zonas de venta', grupo: 'Operación', descripcion: 'Crear rutas, zonas, días de visita y vendedores' },
  { codigo: 'clientes', etiqueta: 'Clientes', grupo: 'Operación', descripcion: 'Consultar y mantener la cartera de clientes' },
  { codigo: 'mi_camion', etiqueta: 'Mi camión', grupo: 'Operación', descripcion: 'Stock, solicitudes y devoluciones del almacén móvil' },
  { codigo: 'cobranzas', etiqueta: 'Cobranzas', grupo: 'Operación', descripcion: 'Consultar cuentas por cobrar y registrar cobros' },
  { codigo: 'objetivos', etiqueta: 'Objetivos', grupo: 'Gestión', descripcion: 'Generar metas mensuales por vendedor' },
  { codigo: 'compras', etiqueta: 'Compras y gastos', grupo: 'Gestión', descripcion: 'Solicitudes, órdenes, proveedores, gastos y sueldos' },
  { codigo: 'rentabilidad', etiqueta: 'Rentabilidad', grupo: 'Gestión', descripcion: 'Consultar márgenes y costos' },
  { codigo: 'inventario', etiqueta: 'Inventario', grupo: 'Catálogo', descripcion: 'Productos, stock, promociones y almacenes móviles' },
  { codigo: 'distribucion', etiqueta: 'Distribución', grupo: 'Logística', descripcion: 'Programar rutas y controlar entregas' },
  { codigo: 'reportes', etiqueta: 'Reportes', grupo: 'Análisis', descripcion: 'Consultar reportes mensuales y exportar' },
  { codigo: 'administracion', etiqueta: 'Administración', grupo: 'Sistema', descripcion: 'Usuarios, roles, permisos y auditoría' },
  { codigo: 'planes', etiqueta: 'Plan y facturación', grupo: 'Sistema', descripcion: 'Consultar el plan contratado' },
  { codigo: 'dueno', etiqueta: 'Panel del dueño', grupo: 'Sistema', descripcion: 'Indicadores ejecutivos de la empresa' },
];

const ACCIONES = [
  { codigo: 'clientes_crear', etiqueta: 'Crear clientes', grupo: 'Operación', descripcion: 'Registrar clientes nuevos' },
  { codigo: 'clientes_editar', etiqueta: 'Editar clientes', grupo: 'Operación', descripcion: 'Modificar datos de clientes y asignaciones' },
  { codigo: 'rutas_crear', etiqueta: 'Crear rutas de venta', grupo: 'Operación', descripcion: 'Crear rutas, zonas y días de visita' },
  { codigo: 'rutas_eliminar', etiqueta: 'Eliminar rutas de venta', grupo: 'Operación', descripcion: 'Dar de baja rutas y zonas' },
  { codigo: 'pedidos_editar', etiqueta: 'Editar pedidos', grupo: 'Operación', descripcion: 'Modificar pedidos ya registrados o cancelarlos' },
  { codigo: 'pedidos_eliminar', etiqueta: 'Eliminar pedidos', grupo: 'Operación', descripcion: 'Eliminar pedidos (solo administración)' },
  { codigo: 'cobranzas_editar', etiqueta: 'Editar cobranzas', grupo: 'Operación', descripcion: 'Modificar pagos y reglas de cobranza' },
  { codigo: 'cobranzas_eliminar', etiqueta: 'Eliminar cobranzas', grupo: 'Operación', descripcion: 'Eliminar pagos registrados (solo administración)' },
  { codigo: 'reportes_editar', etiqueta: 'Editar reportes', grupo: 'Análisis', descripcion: 'Ajustar parámetros de los reportes mensuales' },
  { codigo: 'usuarios_gestionar', etiqueta: 'Gestionar usuarios', grupo: 'Sistema', descripcion: 'Crear usuarios y asignar roles y permisos' },
  { codigo: 'configuracion_editar', etiqueta: 'Editar configuración', grupo: 'Sistema', descripcion: 'Cambiar empresa, marca, APK e integraciones' },
];

const TODOS = [...MODULOS, ...ACCIONES].map((p) => p.codigo);

// Modelos listos para seleccionar al crear un usuario. Cada modelo otorga
// solamente las funciones que corresponden a ese puesto.
const PLANTILLAS = [
  {
    id: 'vendedor', nombre: 'Vendedor', rol: 'preventista', color: 'blue',
    descripcion: 'Preventa por ruta y zona. Puede crear clientes y ventas, pero no editar pedidos ni cobranzas.',
    permisos: ['dashboard', 'ventas', 'venta_nueva', 'rutas_venta', 'clientes', 'clientes_crear', 'clientes_editar', 'cobranzas', 'reportes', 'objetivos'],
  },
  {
    id: 'distribuidor', nombre: 'Distribuidor', rol: 'distribucion', color: 'purple',
    descripcion: 'Recibe las rutas de sus vendedores y gestiona entregas. No puede borrar pedidos ni cobranzas.',
    permisos: ['dashboard', 'ventas', 'rutas_venta', 'clientes', 'distribucion', 'reportes'],
  },
  {
    id: 'almacen', nombre: 'Encargado de almacén', rol: 'almacen', color: 'green',
    descripcion: 'Controla stock, preparado de carga y compras. Sin acceso a cobranzas ni a eliminación de pedidos.',
    permisos: ['dashboard', 'inventario', 'compras', 'reportes', 'rutas_venta'],
  },
  {
    id: 'supervisor', nombre: 'Supervisor', rol: 'supervisor', color: 'amber',
    descripcion: 'Supervisa ventas, objetivos y rentabilidad. Puede corregir pedidos, pero no eliminarlos.',
    permisos: ['dashboard', 'ventas', 'rutas_venta', 'clientes', 'clientes_editar', 'cobranzas', 'objetivos', 'compras', 'rentabilidad', 'distribucion', 'reportes', 'reportes_editar', 'pedidos_editar'],
  },
  {
    id: 'venta_directa', nombre: 'Ventas directa', rol: 'vendedor_camion', color: 'amber',
    descripcion: 'Venta desde el camión y almacén móvil. Crea clientes y ventas, sin editar pedidos ni cobranzas.',
    permisos: ['dashboard', 'ventas', 'venta_nueva', 'rutas_venta', 'clientes', 'clientes_crear', 'mi_camion', 'cobranzas'],
  },
  {
    id: 'cobranzas', nombre: 'Cobranzas', rol: 'cobranzas', color: 'amber',
    descripcion: 'Gestiona cuentas por cobrar. No puede borrar pedidos, pagos ni modificar reportes.',
    permisos: ['dashboard', 'ventas', 'clientes', 'cobranzas', 'cobranzas_editar', 'reportes'],
  },
];

function permisosPorPlantilla(id) {
  const plantilla = PLANTILLAS.find((p) => p.id === id);
  return plantilla ? [...plantilla.permisos] : null;
}

function permisosPorRol(rol) {
  if (rol === 'admin' || rol === 'dueno') return [...TODOS];
  const plantilla = PLANTILLAS.find((p) => p.rol === rol) || PLANTILLAS.find((p) => p.id === rol);
  return plantilla ? [...plantilla.permisos] : ['dashboard'];
}

function normalizarPermisos(lista) {
  if (!Array.isArray(lista)) return null;
  return [...new Set(lista.filter((c) => TODOS.includes(c)))];
}

function permisosUsuario(usuario) {
  if (!usuario) return [];
  if (usuario.rol === 'admin' || usuario.rol === 'dueno') return [...TODOS];
  if (Array.isArray(usuario.permisos)) return usuario.permisos;
  return permisosPorRol(usuario.rol);
}

function tienePermiso(usuario, codigo) {
  return permisosUsuario(usuario).includes(codigo);
}

// Agrega las colecciones nuevas y los permisos de los usuarios ya creados.
function asegurarEstructura(db) {
  let cambio = false;
  ['zonas', 'tipos_cliente', 'rutas_venta'].forEach((clave) => {
    if (!Array.isArray(db[clave])) { db[clave] = []; cambio = true; }
  });
  if (!db.configuracion) { db.configuracion = {}; cambio = true; }
  (db.usuarios || []).forEach((u) => {
    if (!Array.isArray(u.permisos)) { u.permisos = permisosPorRol(u.rol); cambio = true; }
  });
  return cambio;
}

module.exports = {
  MODULOS, ACCIONES, TODOS, PLANTILLAS,
  permisosPorRol, permisosPorPlantilla, normalizarPermisos, permisosUsuario, tienePermiso, asegurarEstructura,
};
