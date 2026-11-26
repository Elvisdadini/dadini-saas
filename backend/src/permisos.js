// Catálogo único de módulos y acciones. Lo consume el backend (req.permisos /
// requirePermiso) y el frontend (menú, botones y formularios de usuario).
const MODULOS = [
  { codigo: 'dashboard', etiqueta: 'Panel general', grupo: 'General', descripcion: 'Ver el resumen operativo' },
  { codigo: 'ventas', etiqueta: 'Ventas', grupo: 'Operación', descripcion: 'Consultar pedidos e informes de ventas' },
  { codigo: 'venta_nueva', etiqueta: 'Nueva venta (POS)', grupo: 'Operación', descripcion: 'Registrar ventas en mostrador, ruta o WhatsApp' },
  { codigo: 'rutas_venta', etiqueta: 'Rutas y zonas de venta', grupo: 'Operación', descripcion: 'Crear rutas, zonas, días de visita y vendedores' },
  { codigo: 'clientes', etiqueta: 'Clientes', grupo: 'Operación', descripcion: 'Consultar y mantener la cartera de clientes' },
  { codigo: 'datos', etiqueta: 'Alcance de información', grupo: 'General', descripcion: 'Permiso datos.ver_todos para ver registros de otros usuarios' },
  { codigo: 'mi_camion', etiqueta: 'Mi camión', grupo: 'Operación', descripcion: 'Stock, solicitudes y devoluciones del almacén móvil' },
  { codigo: 'cobranzas', etiqueta: 'Cobranzas', grupo: 'Operación', descripcion: 'Consultar cuentas por cobrar y registrar cobros' },
  { codigo: 'objetivos', etiqueta: 'Objetivos', grupo: 'Gestión', descripcion: 'Generar metas mensuales por vendedor' },
  { codigo: 'compras', etiqueta: 'Compras y gastos', grupo: 'Gestión', descripcion: 'Solicitudes, órdenes, proveedores, gastos y sueldos' },
  { codigo: 'rentabilidad', etiqueta: 'Rentabilidad', grupo: 'Gestión', descripcion: 'Consultar márgenes y costos' },
  { codigo: 'inventario', etiqueta: 'Inventario', grupo: 'Catálogo', descripcion: 'Productos, stock, promociones y almacenes móviles' },
  { codigo: 'catalogo', etiqueta: 'Catálogo', grupo: 'Catálogo', descripcion: 'Generar y compartir catálogos PDF' },
  { codigo: 'distribucion', etiqueta: 'Distribución', grupo: 'Logística', descripcion: 'Programar rutas y controlar entregas' },
  { codigo: 'cambios', etiqueta: 'Cambios de producto', grupo: 'Operación', descripcion: 'Registrar cambios con foto y razón, y confirmarlos desde distribución' },
  { codigo: 'reportes', etiqueta: 'Reportes', grupo: 'Análisis', descripcion: 'Consultar reportes mensuales y exportar' },
  { codigo: 'administracion', etiqueta: 'Administración', grupo: 'Sistema', descripcion: 'Usuarios, roles, permisos y auditoría' },
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

const { CATALOGO, CRUD, CODIGOS_DETALLADOS, expandir } = require('./permisos-detallados');

const TODOS = [...new Set([...[...MODULOS, ...ACCIONES].map((p) => p.codigo), ...CODIGOS_DETALLADOS])];

// Modelos listos para seleccionar al crear un usuario. Cada modelo otorga
// solamente las funciones que corresponden a ese puesto.
const PLANTILLAS = [
  {
    id: 'vendedor', nombre: 'Vendedor', rol: 'preventista', color: 'blue',
    descripcion: 'Preventa por ruta y zona. Crea clientes y pedidos; no edita ni elimina pedidos ni cobranzas.',
    permisos: [
      'dashboard',
      ...expandir('ventas', ['ver', 'crear'], ['ventas.registrar_pedidos', 'ventas.registrar_cobranza']),
      ...expandir('clientes', ['ver', 'crear', 'editar']),
      ...expandir('rutas_venta', ['ver']),
      ...expandir('objetivos', ['ver'], ['objetivos.ver_mios']),
      ...expandir('cobranzas', ['ver', 'crear'], ['cobranzas.registrar', 'cobranzas.mis_comprobantes']),
      ...expandir('catalogo', ['ver'], ['catalogo.ver', 'catalogo.compartir_whatsapp']),
      ...expandir('cambios', ['ver', 'crear']),
      ...expandir('reportes', ['ver'], ['reportes.consultar_exportar', 'reportes.ver_diarios_ventas', 'reportes.ver_diarios_clientes']),
    ],
  },
  {
    id: 'distribuidor', nombre: 'Distribuidor', rol: 'distribucion', color: 'purple',
    descripcion: 'Recibe rutas y gestiona entregas. No puede borrar pedidos ni cobranzas.',
    permisos: [
      'dashboard',
      ...expandir('ventas', ['ver']),
      ...expandir('clientes', ['ver']),
      ...expandir('rutas_venta', ['ver']),
      ...expandir('distribucion', ['ver', 'crear', 'editar'], ['distribucion.registrar_entregas']),
      ...expandir('cambios', ['ver', 'editar'], ['cambios.confirmar']),
      ...expandir('catalogo', ['ver'], ['catalogo.ver']),
      ...expandir('reportes', ['ver'], ['reportes.ver_diarios_entregas']),
    ],
  },
  {
    id: 'almacen', nombre: 'Encargado de almacén', rol: 'almacen', color: 'green',
    descripcion: 'Controla stock, conteo, preparado de carga y compras. Sin acceso a cobranzas.',
    permisos: [
      'dashboard',
      ...expandir('inventario', ['ver', 'crear', 'editar']),
      ...expandir('conteo_inventario', ['ver', 'crear', 'editar']),
      ...expandir('preparado_carga', ['ver', 'crear', 'editar']),
      ...expandir('almacenes_moviles', ['ver', 'crear', 'editar']),
      ...expandir('catalogo', ['ver', 'crear', 'editar'], ['catalogo.ver', 'catalogo.generar_pdf', 'catalogo.compartir_whatsapp']),
      ...expandir('gastos', ['ver', 'crear', 'editar']),
      ...expandir('proveedores', ['ver', 'crear', 'editar']),
      ...expandir('solicitudes_compra', ['ver', 'crear', 'editar']),
      ...expandir('ordenes_pago', ['ver', 'crear', 'editar']),
      ...expandir('reportes', ['ver']),
    ],
  },
  {
    id: 'supervisor', nombre: 'Supervisor', rol: 'supervisor', color: 'amber',
    descripcion: 'Supervisa ventas, objetivos, rentabilidad y reportes. Puede corregir, pero no eliminar.',
    permisos: [
      'dashboard',
      'datos.ver_todos',
      ...expandir('ventas', ['ver', 'editar']),
      ...expandir('clientes', ['ver', 'editar']),
      ...expandir('rutas_venta', ['ver', 'editar']),
      ...expandir('objetivos', ['ver', 'crear', 'editar']),
      ...expandir('cobranzas', ['ver']),
      ...expandir('distribucion', ['ver']),
      ...expandir('cambios', ['ver', 'editar', 'eliminar']),
      ...expandir('rentabilidad', ['ver']),
      ...expandir('devoluciones', ['ver'], ['devoluciones.reportes_mios']),
      ...expandir('catalogo', ['ver'], ['catalogo.ver']),
      ...expandir('reportes', ['ver', 'editar'], ['reportes.consultar_exportar', 'reportes.ver_diarios_ventas', 'reportes.ver_diarios_entregas', 'reportes.ver_diarios_clientes', 'reportes.ver_diarios_objetivos', 'reportes.editar', 'reportes.ajustar_parametros']),
    ],
  },
  {
    id: 'venta_directa', nombre: 'Ventas directa', rol: 'vendedor_camion', color: 'amber',
    descripcion: 'Venta desde el camión y almacén móvil. Crea clientes y ventas; no edita cobranzas.',
    permisos: [
      'dashboard',
      ...expandir('ventas', ['ver', 'crear'], ['ventas.registrar_pedidos']),
      ...expandir('clientes', ['ver', 'crear']),
      ...expandir('mi_camion', ['ver', 'crear'], ['mi_camion.realizar_ventas']),
      ...expandir('catalogo', ['ver'], ['catalogo.ver', 'catalogo.compartir_whatsapp']),
      ...expandir('cambios', ['ver', 'crear']),
      ...expandir('cobranzas', ['ver']),
    ],
  },
  {
    id: 'cobranzas', nombre: 'Cobranzas', rol: 'cobranzas', color: 'amber',
    descripcion: 'Gestiona cuentas por cobrar y comprobantes. No puede borrar pagos ni modificar reportes.',
    permisos: [
      'dashboard',
      ...expandir('ventas', ['ver']),
      ...expandir('clientes', ['ver']),
      ...expandir('cobranzas', ['ver', 'crear', 'editar'], ['cobranzas.registrar', 'cobranzas.mis_comprobantes']),
      ...expandir('catalogo', ['ver'], ['catalogo.ver']),
      ...expandir('reportes', ['ver'], ['reportes.consultar_exportar']),
    ],
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

// Techo de acceso por puesto. Aunque un usuario tenga permisos guardados
// amplios (heredados de otro rol o marcados por error), NUNCA puede exceder
// las funciones de su puesto. Es la misma regla para la web y para la APK,
// porque ambas consumen esta API.
const TECHO_POR_ROL = {
  ventas: ['dashboard', 'ventas', 'venta_nueva', 'clientes', 'cobranzas', 'catalogo', 'cambios',
    'rutas_venta', 'objetivos', 'bi', 'visitas', 'whatsapp', 'notificaciones', 'reportes', 'geocerca'],
  preventista: ['dashboard', 'ventas', 'venta_nueva', 'clientes', 'cobranzas', 'catalogo', 'cambios',
    'rutas_venta', 'objetivos', 'bi', 'visitas', 'whatsapp', 'notificaciones', 'reportes', 'geocerca'],
  vendedor_camion: ['dashboard', 'ventas', 'venta_nueva', 'clientes', 'mi_camion', 'cambios', 'catalogo',
    'objetivos', 'bi', 'visitas', 'whatsapp', 'notificaciones', 'geocerca'],
  distribucion: ['dashboard', 'ventas', 'clientes', 'distribucion', 'cambios', 'catalogo', 'visitas',
    'whatsapp', 'notificaciones', 'objetivos', 'bi', 'logistica', 'geocerca'],
  almacen: ['dashboard', 'inventario', 'kardex', 'compras', 'cambios', 'distribucion', 'catalogo',
    'notificaciones', 'bi', 'reportes', 'logistica', 'inventario.ver_costos'],
  supervisor: ['dashboard', 'ventas', 'clientes', 'cobranzas', 'distribucion', 'inventario', 'kardex',
    'caja', 'objetivos', 'bi', 'visitas', 'whatsapp', 'notificaciones', 'reportes', 'catalogo',
    'logistica', 'cambios', 'rutas_venta', 'geocerca', 'mi_camion', 'datos.ver_todos'],
  cobranzas: ['dashboard', 'cobranzas', 'clientes', 'ventas', 'caja', 'bi', 'notificaciones',
    'whatsapp', 'reportes', 'objetivos'],
};

function permisosUsuario(usuario) {
  if (!usuario) return [];
  if (usuario.rol === 'admin' || usuario.rol === 'dueno') return [...TODOS];
  const guardados = Array.isArray(usuario.permisos) ? usuario.permisos : permisosPorRol(usuario.rol);
  const techo = TECHO_POR_ROL[usuario.rol];
  if (!techo) return [...new Set(guardados.filter((c) => TODOS.includes(c)))];
  return [...new Set(guardados.filter((c) => TODOS.includes(c)
    && (techo.includes(c) || (c.includes('.') && techo.includes(c.split('.')[0])))))];
}

const LEGACY = {
  clientes_crear: 'clientes.crear', clientes_editar: 'clientes.editar',
  rutas_crear: 'rutas_venta.crear', rutas_eliminar: 'rutas_venta.eliminar',
  pedidos_editar: 'ventas.editar', pedidos_eliminar: 'ventas.eliminar',
  cobranzas_editar: 'cobranzas.editar', cobranzas_eliminar: 'cobranzas.eliminar',
  reportes_editar: 'reportes.editar', usuarios_gestionar: 'usuarios.gestionar',
  configuracion_editar: 'configuracion.editar', venta_nueva: 'ventas.crear',
};

function tienePermiso(usuario, codigo) {
  const permisos = permisosUsuario(usuario);
  if (permisos.includes(codigo)) return true;
  if (LEGACY[codigo] && permisos.includes(LEGACY[codigo])) return true;
  // Compatibilidad: un permiso de módulo antiguo (ej. "ventas") otorga todas
  // sus funciones detalladas (ventas.ver, ventas.crear, etc.).
  if (codigo && codigo.includes('.')) {
    const base = codigo.split('.')[0];
    if (permisos.includes(base)) return true;
  }
  return false;
}

// Agrega las colecciones nuevas y los permisos de los usuarios ya creados.
function asegurarEstructura(db) {
  let cambio = false;
  ['zonas', 'tipos_cliente', 'rutas_venta', 'producto_categorias', 'producto_marcas', 'conteos_inventario', 'qrs_pago', 'notificaciones', 'cajas', 'movimientos_caja', 'lotes', 'kardex', 'notas_fiscales', 'crm_notas', 'documentos_rag', 'api_tokens', 'webhooks', 'webhook_entregas', 'cambios_producto', 'solicitudes_vencimiento'].forEach((clave) => {
    if (!Array.isArray(db[clave])) { db[clave] = []; cambio = true; }
  });
  const ahora = new Date().toISOString();
  if (!db.producto_categorias.length) {
    const nombres = [...new Set((db.productos || []).map((p) => p.categoria).filter(Boolean))];
    nombres.forEach((nombre, i) => {
      db.producto_categorias.push({ id: i + 1, codigo: `PCAT-${String(i + 1).padStart(4, '0')}`, nombre, descripcion: `Categoría de producto ${nombre}`, activa: true, created_at: ahora });
    });
    cambio = true;
  }
  if (!db.producto_marcas.length) {
    ['DADINI', 'Kekito', 'Animalocos'].forEach((nombre, i) => {
      db.producto_marcas.push({ id: i + 1, codigo: `PMAR-${String(i + 1).padStart(4, '0')}`, nombre, descripcion: `Marca ${nombre}`, activa: true, created_at: ahora });
    });
    cambio = true;
  }
  ['cliente_categorias', 'producto_categorias', 'producto_marcas'].forEach((clave) => {
    (db[clave] || []).forEach((item) => {
      if (item.padre_id === undefined) { item.padre_id = null; cambio = true; }
    });
  });
  (db.usuarios || []).forEach((u) => {
    if (u.whatsapp === undefined) { u.whatsapp = u.telefono || null; cambio = true; }
  });
  (db.productos || []).forEach((p) => {
    if (!p.categoria_id && p.categoria) {
      const cat = db.producto_categorias.find((c) => String(c.nombre).toLowerCase() === String(p.categoria).toLowerCase());
      if (cat) { p.categoria_id = cat.id; cambio = true; }
    }
    if (p.marca === undefined) { p.marca = null; cambio = true; }
    if (p.imagen_url === undefined) { p.imagen_url = null; cambio = true; }
  });
  if (!db.configuracion) { db.configuracion = {}; cambio = true; }
  (db.usuarios || []).forEach((u) => {
    if (!Array.isArray(u.permisos)) { u.permisos = permisosPorRol(u.rol); cambio = true; }
    // Migración suave: los usuarios ya creados no tienen los códigos del
    // módulo nuevo de cambios. Se agregan los que corresponden a su rol.
    const nuevos = permisosPorRol(u.rol).filter((c) => c === 'cambios' || c.startsWith('cambios.'));
    if (u.rol === 'supervisor') nuevos.push('datos.ver_todos');
    const faltan = nuevos.filter((c) => !u.permisos.includes(c));
    if (faltan.length) { u.permisos = [...u.permisos, ...faltan]; cambio = true; }
    if (!u.usuario) {
      const base = String(u.email || u.nombre || 'usuario').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
      let candidato = base;
      let i = 1;
      while (db.usuarios.some((otro) => otro !== u && String(otro.usuario || '').toLowerCase() === candidato.toLowerCase())) {
        candidato = `${base}${i}`;
        i += 1;
      }
      u.usuario = candidato;
      cambio = true;
    }
  });
  return cambio;
}

module.exports = {
  MODULOS, ACCIONES, TODOS, PLANTILLAS, CATALOGO, CRUD, CODIGOS_DETALLADOS, expandir, TECHO_POR_ROL,
  permisosPorRol, permisosPorPlantilla, normalizarPermisos, permisosUsuario, tienePermiso, asegurarEstructura,
};
