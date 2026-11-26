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
      { codigo: 'ventas.aplicar_descuento', etiqueta: 'Aplicar descuentos en Bs o porcentaje' },

    ] },
    { base: 'clientes', etiqueta: 'Clientes', sub: [] },
    { base: 'datos', etiqueta: 'Alcance de información', sub: [
      { codigo: 'datos.ver_todos', etiqueta: 'Ver los registros de todos los usuarios' },
    ] },
    { base: 'cambios', etiqueta: 'Cambios de producto', sub: [
      { codigo: 'cambios.confirmar', etiqueta: 'Verificar y confirmar el cambio desde distribución' },
    ] },
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
  { grupo: 'Geocerca', modulos: [
    { base: 'geocerca', etiqueta: 'Geocerca', sub: [
      { codigo: 'geocerca.excepcion_ventas', etiqueta: 'Registrar ventas sin validar geocerca' },
      { codigo: 'geocerca.excepcion_cobranzas', etiqueta: 'Registrar cobranzas sin validar geocerca' },
    ] },
  ] },
  { grupo: 'Logística', modulos: [
    { base: 'distribucion', etiqueta: 'Distribución', sub: [
      { codigo: 'distribucion.registrar_entregas', etiqueta: 'Registrar y Administrar Entregas' },
    ] },
  ] },
  { grupo: 'Gestión', modulos: [
    { base: 'caja', etiqueta: 'Caja y arqueo', sub: [
      { codigo: 'caja.apertura', etiqueta: 'Abrir caja' },
      { codigo: 'caja.cierre', etiqueta: 'Cerrar caja y arqueo' },
    ] },
    { base: 'visitas', etiqueta: 'Visitas y agenda', sub: [
      { codigo: 'visitas.registrar', etiqueta: 'Registrar visitas' },
    ] },
    { base: 'kardex', etiqueta: 'Kardex, lotes y vencimientos', sub: [
      { codigo: 'kardex.solicitar_cambio', etiqueta: 'Solicitar cambio de fecha de vencimiento' },
      { codigo: 'kardex.aprobar_cambio', etiqueta: 'Aprobar cambios de vencimiento' },
    ] },
    { base: 'fiscal', etiqueta: 'Facturación SIAT', sub: [
      { codigo: 'fiscal.emitir', etiqueta: 'Emitir facturas y notas fiscales' },
      { codigo: 'fiscal.anular', etiqueta: 'Anular facturas y notas' },
      { codigo: 'fiscal.enviar_sin', etiqueta: 'Enviar XML al SIN' },
      { codigo: 'fiscal.configurar', etiqueta: 'Configurar NIT, dosificación, normativa y credenciales SIAT' },
    ] },
    { base: 'finanzas', etiqueta: 'Finanzas de la empresa', sub: [
      { codigo: 'finanzas.ver_margenes', etiqueta: 'Ver utilidad, márgenes y rentabilidad (solo administración)' },
    ] },
    { base: 'contabilidad', etiqueta: 'Contabilidad y libros', sub: [
      { codigo: 'contabilidad.libros', etiqueta: 'Consultar libros contables y exportarlos' },
      { codigo: 'contabilidad.impuestos', etiqueta: 'Revisar impuestos, IVA/IT y normativa SIAT' },
      { codigo: 'contabilidad.validar_caja', etiqueta: 'Validar arqueos y cierres de caja' },
      { codigo: 'contabilidad.validar_cobranzas', etiqueta: 'Validar cobranzas y depósitos' },
      { codigo: 'contabilidad.validar_pagos', etiqueta: 'Validar pagos y órdenes de pago' },
      { codigo: 'contabilidad.validar_gastos', etiqueta: 'Validar gastos registrados' },
    ] },
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
    { base: 'inventario', etiqueta: 'Productos stock', sub: [
      { codigo: 'inventario.ver_costos', etiqueta: 'Ver costos, valorización y margen de productos' },
    ] },
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
    { base: 'mi_reporte', etiqueta: 'Mi reporte (solo mis resultados)', sub: [
      { codigo: 'mi_reporte.ver_ventas', etiqueta: 'Ver mis ventas diarias y del mes' },
      { codigo: 'mi_reporte.ver_objetivo', etiqueta: 'Ver mi avance hacia el objetivo' },
      { codigo: 'mi_reporte.ver_entregas', etiqueta: 'Ver mis entregas' },
      { codigo: 'mi_reporte.ver_cobranzas', etiqueta: 'Ver mis cobranzas' },
      { codigo: 'mi_reporte.ver_devoluciones', etiqueta: 'Ver mis devoluciones' },
    ] },
    { base: 'bi', etiqueta: 'Tableros e indicadores', sub: [
      { codigo: 'bi.explorar', etiqueta: 'Explorar ventas por vendedor, cliente, producto y visitas' },
    ] },
    { base: 'crm', etiqueta: 'CRM 360 y RFM', sub: [
      { codigo: 'crm.exportar', etiqueta: 'Exportar ranking RFM' },
    ] },
    { base: 'demanda', etiqueta: 'Demanda y reposición', sub: [
      { codigo: 'demanda.generar_solicitud', etiqueta: 'Generar solicitudes desde la predicción' },
    ] },
    { base: 'reportes_automaticos', etiqueta: 'Reportes automáticos', sub: [] },
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
    { base: 'sucursales', etiqueta: 'Sucursales y sub sucursales', sub: [
      { codigo: 'sucursales.migrar', etiqueta: 'Migrar datos entre sucursales' },
      { codigo: 'sucursales.ver_global', etiqueta: 'Ver el reporte global de todas las sucursales' },
    ] },
    { base: 'integraciones', etiqueta: 'API pública y webhooks', sub: [
      { codigo: 'integraciones.api_keys', etiqueta: 'Crear y revocar API keys' },
      { codigo: 'integraciones.webhooks', etiqueta: 'Configurar webhooks' },
    ] },
    { base: 'importacion', etiqueta: 'Importación de datos', sub: [] },
    { base: 'notificaciones', etiqueta: 'Notificaciones push', sub: [] },
    { base: 'whatsapp', etiqueta: 'WhatsApp y mensajes', sub: [] },
    { base: 'logistica', etiqueta: 'Repartidores y vehículos', sub: [] },
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
