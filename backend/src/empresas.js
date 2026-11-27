// Reglas de empresas del sistema: módulos contratados, cupos por rol,
// vigencia y notificaciones de vencimiento.
const { TODOS } = require('./permisos');

// Los módulos que se contratan agrupan varios códigos del catálogo.
const GRUPOS_MODULOS = {
  operacion: ['dashboard', 'ventas', 'venta_nueva', 'clientes', 'cambios', 'objetivos',
    'bi', 'mi_reporte', 'catalogo', 'notificaciones', 'whatsapp', 'visitas', 'geocerca'],
  logistica: ['distribucion', 'logistica', 'rutas_venta', 'mi_camion', 'almacenes_moviles', 'preparado_carga'],
  administracion: ['administracion', 'usuarios', 'configuracion', 'importacion', 'integraciones', 'notificaciones'],
  contabilidad: ['contabilidad', 'caja', 'cobranzas', 'finanzas', 'rentabilidad', 'gastos',
    'ordenes_pago', 'nomina', 'compras', 'proveedores', 'solicitudes_compra', 'tipos_gasto'],
  inventario: ['inventario', 'kardex', 'conteo_inventario', 'almacenes', 'productos_imagenes'],
  crm: ['crm', 'clientes', 'reportes', 'reportes_automaticos'],
  fiscal: ['fiscal'],
};

const MODULOS_CONTRATABLES = [
  { id: 'operacion', etiqueta: 'Operación y ventas' },
  { id: 'logistica', etiqueta: 'Logística y distribución' },
  { id: 'administracion', etiqueta: 'Administración' },
  { id: 'contabilidad', etiqueta: 'Contabilidad' },
  { id: 'inventario', etiqueta: 'Inventario y almacenes' },
  { id: 'crm', etiqueta: 'CRM y reportes' },
  { id: 'fiscal', etiqueta: 'Facturación SIAT' },
];

function basesDe(modulos) {
  const bases = new Set(['dashboard']);
  (Array.isArray(modulos) ? modulos : []).forEach((modulo) => {
    (GRUPOS_MODULOS[modulo] || [modulo]).forEach((base) => bases.add(base));
  });
  bases.delete('dueno');
  bases.delete('sucursales');
  return bases;
}

function permisosParaModulos(modulos) {
  const bases = basesDe(modulos);
  return TODOS.filter((codigo) => bases.has(codigo) || bases.has(codigo.split('.')[0]));
}

const ROLES_CUPADOS = {
  vendedores: ['ventas', 'preventista', 'vendedor_camion'],
  distribucion: ['distribucion'],
  almacen: ['almacen'],
  contador: ['contador'],
  cobranzas: ['cobranzas'],
  administradores: ['admin'],
};

// Cupo inicial que se activa al registrar una empresa: 1 de cada rol clave
// y 10 usuarios en total. Si el dueño asigna 5 usuarios más llega a 10 y
// ningún administrador puede crear otro sin autorización del dueño.
const limitesPorDefecto = {
  vendedores: 1, distribucion: 1, almacen: 1, contador: 1,
  cobranzas: 1, administradores: 1, usuarios: 10,
};

function conteoPorRol(db, sucursalId) {
  const usuarios = (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursalId));
  const conteo = {};
  Object.entries(ROLES_CUPADOS).forEach(([clave, roles]) => {
    conteo[clave] = usuarios.filter((u) => roles.includes(u.rol)).length;
  });
  conteo.total = usuarios.length;
  return conteo;
}

function validarCupo(db, sucursalId, rol, excluirId = null) {
  const sucursal = (db.sucursales || []).find((s) => Number(s.id) === Number(sucursalId));
  if (!sucursal?.limites) return { ok: true };
  const totalUsuarios = (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursalId)
    && Number(u.id) !== Number(excluirId)).length;
  const limiteTotal = Number(sucursal.limites.usuarios);
  if (Number.isFinite(limiteTotal) && limiteTotal > 0 && totalUsuarios >= limiteTotal) {
    return { ok: false, error: `La empresa alcanzó el límite total de usuarios (${totalUsuarios}/${limiteTotal}). Solicita al dueño que amplíe el cupo.` };
  }
  const clave = Object.keys(ROLES_CUPADOS).find((k) => ROLES_CUPADOS[k].includes(rol));
  if (!clave) return { ok: true, actual: totalUsuarios };
  const limite = Number(sucursal.limites[clave]);
  if (!Number.isFinite(limite) || limite <= 0) return { ok: true, actual: totalUsuarios };
  const actual = (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursalId)
    && ROLES_CUPADOS[clave].includes(u.rol) && Number(u.id) !== Number(excluirId)).length;
  if (actual >= limite) {
    return { ok: false, error: `La empresa alcanzó el límite de ${clave} (${actual}/${limite}). Amplía el cupo desde Sucursales.` };
  }
  return { ok: true, actual, limite };
}

function notificar(db, titulo, detalle, usuarioId = null) {
  if (!Array.isArray(db.notificaciones)) db.notificaciones = [];
  const existe = db.notificaciones.some((n) => n.titulo === titulo);
  if (existe) return false;
  db.notificaciones.unshift({
    id: (db.notificaciones.reduce((m, n) => Math.max(m, Number(n.id) || 0), 0) + 1),
    tipo: 'empresa', titulo, detalle, leida: false,
    fecha: new Date().toISOString(), usuario_id: usuarioId,
  });
  return true;
}

function fechaBolivia() {
  const partes = new Intl.DateTimeFormat('es-BO', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return `${partes.year}-${partes.month}-${partes.day}`;
}

// Aviso 1 mes (o los días configurados) antes del vencimiento.
function notificarVencimientos(db, { forzar = false } = {}) {
  const hoy = fechaBolivia();
  const sucursales = db.sucursales || [];
  const duenos = (db.usuarios || []).filter((u) => u.rol === 'dueno' && u.activo);
  let enviadas = 0;
  sucursales.forEach((s) => {
    const cfg = s.notificacion || {};
    const hasta = s.vigencia?.hasta;
    if (!hasta || cfg.activa === false) return;
    if (!forzar && cfg.modo !== 'automatico') return;
    if (cfg.ultima_enviada_para === hasta) return;
    const dias = Number(cfg.dias_anticipacion) || 30;
    const limite = new Date(`${hoy}T00:00:00Z`);
    limite.setUTCDate(limite.getUTCDate() + dias);
    const limiteISO = limite.toISOString().slice(0, 10);
    if (hoy > hasta || hoy < limiteISO) return;
    const titulo = `Vencimiento de ${s.nombre}`;
    const detalle = `La empresa ${s.empresa || s.nombre} vence el ${hasta}. Renueva los módulos o ajusta la vigencia.`;
    if (notificar(db, titulo, detalle, duenos[0]?.id || null)) {
      cfg.ultima_enviada_para = hasta;
      cfg.ultima_enviada_en = new Date().toISOString();
      enviadas += 1;
    }
  });
  return enviadas;
}

module.exports = {
  GRUPOS_MODULOS, MODULOS_CONTRATABLES, ROLES_CUPADOS, limitesPorDefecto, basesDe, permisosParaModulos,
  conteoPorRol, validarCupo, notificar, notificarVencimientos, fechaBolivia,
};
