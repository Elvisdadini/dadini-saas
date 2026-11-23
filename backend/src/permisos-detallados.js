// Catálogo detallado de permisos según el documento de accesos:
// cada módulo tiene Ver / Crear / Editar / Eliminar y sub-funciones específicas.
const CRUD = [
  { codigo: 'ver', etiqueta: 'Ver' },
  { codigo: 'crear', etiqueta: 'Crear' },
  { codigo: 'editar', etiqueta: 'Editar' },
  { codigo: 'eliminar', etiqueta: 'Eliminar' },
];

const CATALOGO = [
  { grupo: 'Operación', modulos: [
    { base: 'ventas', etiqueta: 'Ventas', sub: [
      { codigo: 'ventas.registrar_pedidos', etiqueta: 'Registrar Pedidos' },
      { codigo: 'ventas.registrar_cobranza', etiqueta: 'Registrar cobranza' },
    ] },
    { base: 'clientes', etiqueta: 'Clientes', sub: [] },
    { base: 'rutas_venta', etiqueta: 'Rutas y zonas de Venta', sub: [] },
    { base: 'objetivos', etiqueta: 'Generar objetivos', sub: [
      { codigo: 'objetivos.ver_mios', etiqueta: 'Visualizar los detalles de tus objetivos' },
    ] },
    { base: 'mi_camion', etiqueta: 'Mi camión', sub: [
      { codigo: 'mi_camion.realizar_ventas', etiqueta: 'Realizar Ventas' },
    ] },
    { base: 'categorias', etiqueta: 'Categorías', sub: [] },
    { base: 'cobranzas', etiqueta: 'Cobranzas', sub: [
      { codigo: 'cobranzas.registrar', etiqueta: 'Registrar cobranza' },
      { codigo: 'cobranzas.mis_comprobantes', etiqueta: 'Lista de mis cobranzas y comprobantes enviados' },
    ] },
  ] },
  { grupo: 'Logística', modulos: [
    { base: 'distribucion', etiqueta: 'Distribución', sub: [
      { codigo: 'distribucion.registrar_entregas', etiqueta: 'Registrar y Administrar Entregas' },
    ] },
  ] },
  { grupo: 'Gestión', modulos: [
    { base: 'sueldos', etiqueta: 'Sueldos y boletas', sub: [] },
    { base: 'ordenes_pago', etiqueta: 'Órdenes de pagos', sub: [] },
    { base: 'rentabilidad', etiqueta: 'Rentabilidad', sub: [] },
    { base: 'solicitudes_compra', etiqueta: 'Solicitud de Compra', sub: [] },
    { base: 'proveedores', etiqueta: 'Proveedores', sub: [] },
    { base: 'gastos', etiqueta: 'Gastos', sub: [] },
  ] },
  { grupo: 'Catálogo', modulos: [
    { base: 'catalogo', etiqueta: 'Catálogo', sub: [
      { codigo: 'catalogo.generar_pdf', etiqueta: 'Generar catálogo PDF para exportar o enviar por WhatsApp' },
      { codigo: 'catalogo.ver', etiqueta: 'Visualizar el catálogo' },
      { codigo: 'catalogo.compartir_whatsapp', etiqueta: 'Compartir catálogo por WhatsApp' },
    ] },
  ] },
  { grupo: 'Inventario', modulos: [
    { base: 'inventario', etiqueta: 'Productos stock', sub: [] },
    { base: 'conteo_inventario', etiqueta: 'Conteo de inventario', sub: [] },
    { base: 'almacenes_moviles', etiqueta: 'Almacenes móviles', sub: [] },
    { base: 'preparado_carga', etiqueta: 'Preparado de carga', sub: [] },
    { base: 'promociones', etiqueta: 'Promociones', sub: [
      { codigo: 'promociones.reportes_diarios', etiqueta: 'Visualizar reportes diarios y reglas de promociones' },
    ] },
    { base: 'devoluciones', etiqueta: 'Devoluciones', sub: [
      { codigo: 'devoluciones.reportes_mios', etiqueta: 'Visualizar reportes diarios de mis devoluciones' },
    ] },
  ] },
  { grupo: 'Análisis', modulos: [
    { base: 'reportes', etiqueta: 'Reportes', sub: [
      { codigo: 'reportes.consultar_exportar', etiqueta: 'Consultar reportes diarios mensuales y exportar' },
      { codigo: 'reportes.ver_diarios_ventas', etiqueta: 'Visualizar reportes diarios de ventas' },
      { codigo: 'reportes.ver_diarios_entregas', etiqueta: 'Visualizar reportes diarios de entregas' },
      { codigo: 'reportes.ver_diarios_clientes', etiqueta: 'Visualizar reportes diarios de clientes atendidos' },
      { codigo: 'reportes.ver_diarios_objetivos', etiqueta: 'Visualizar reportes diarios de objetivos y avance' },
      { codigo: 'reportes.editar', etiqueta: 'Editar reportes' },
      { codigo: 'reportes.ajustar_parametros', etiqueta: 'Ajustar parámetros de los reportes mensuales' },
    ] },
  ] },
  { grupo: 'Sistema', modulos: [
    { base: 'administracion', etiqueta: 'Usuarios, roles, permisos y auditoría', sub: [] },
    { base: 'panel_dueno', etiqueta: 'Panel del dueño · indicadores ejecutivos', sub: [] },
    { base: 'usuarios', etiqueta: 'Gestionar usuarios', sub: [
      { codigo: 'usuarios.gestionar', etiqueta: 'Crear usuarios y asignar roles y permisos' },
    ] },
    { base: 'configuracion', etiqueta: 'Editar configuración', sub: [
      { codigo: 'configuracion.editar', etiqueta: 'Cambiar empresa, marca, APK e integraciones' },
    ] },
  ] },
];

const CODIGOS_DETALLADOS = CATALOGO.flatMap((g) => g.modulos.flatMap((m) => [
  ...CRUD.map((c) => `${m.base}.${c.codigo}`),
  ...m.sub.map((s) => s.codigo),
]));

function expandir(base, cruds = ['ver'], sub = []) {
  return [base, ...cruds.map((c) => `${base}.${c}`), ...sub];
}

module.exports = { CRUD, CATALOGO, CODIGOS_DETALLADOS, expandir };
