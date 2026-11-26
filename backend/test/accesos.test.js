const test = require('node:test');
const assert = require('node:assert/strict');
const { TODOS, CODIGOS_DETALLADOS, TECHO_POR_ROL, permisosUsuario, tienePermiso } = require('../src/permisos');
const { limpiar } = require('../src/auth');
const horario = require('../src/horario');

test('todas las rutas cargan sin errores de inicialización', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.join(__dirname, '..', 'src', 'routes');
  fs.readdirSync(dir).filter((f) => f.endsWith('.js')).forEach((f) => {
    assert.doesNotThrow(() => require(path.join(dir, f)), `No se pudo cargar ${f}`);
  });
});

test('Mi reporte existe para vendedores, distribución y cobranzas, y no para almacén ni supervisión', () => {
  assert.equal(TODOS.includes('mi_reporte'), true, 'mi_reporte debe ser un módulo válido');
  const esperados = ['mi_reporte.ver', 'mi_reporte.crear', 'mi_reporte.editar', 'mi_reporte.eliminar',
    'mi_reporte.ver_ventas', 'mi_reporte.ver_objetivo', 'mi_reporte.ver_entregas',
    'mi_reporte.ver_cobranzas', 'mi_reporte.ver_devoluciones'];
  esperados.forEach((c) => assert.equal(CODIGOS_DETALLADOS.includes(c), true, `${c} debe estar en el catálogo`));
  ['ventas', 'preventista', 'vendedor_camion', 'distribucion', 'cobranzas'].forEach((rol) => {
    assert.equal(TECHO_POR_ROL[rol].includes('mi_reporte'), true, `${rol} debe tener Mi reporte`);
  });
  ['almacen', 'supervisor'].forEach((rol) => {
    assert.equal(TECHO_POR_ROL[rol].includes('mi_reporte'), false, `${rol} no debe tener Mi reporte`);
  });
  const almacen = permisosUsuario({ rol: 'almacen', permisos: [...TODOS] });
  assert.equal(almacen.includes('mi_reporte'), false);
  const vendedor = permisosUsuario({ rol: 'preventista', permisos: [...TODOS] });
  assert.equal(vendedor.includes('mi_reporte'), true);
  assert.equal(tienePermiso({ rol: 'preventista', permisos: vendedor }, 'mi_reporte.ver_ventas'), true);
});

test('catálogo: vendedores, distribuidores y cobranzas no pueden generar PDF', () => {
  ['ventas', 'preventista', 'vendedor_camion', 'distribucion', 'cobranzas'].forEach((rol) => {
    const p = permisosUsuario({ rol, permisos: [...TODOS] });
    assert.equal(tienePermiso({ rol, permisos: p }, 'catalogo.generar_pdf'), false, `${rol} no debe generar catálogo`);
    assert.equal(p.includes('catalogo.ver'), true, `${rol} debe ver catálogo`);
    assert.equal(p.includes('catalogo.compartir_whatsapp'), true, `${rol} debe compartir catálogo`);
  });
  const admin = permisosUsuario({ rol: 'admin', permisos: [...TODOS] });
  assert.equal(tienePermiso({ rol: 'admin', permisos: admin }, 'catalogo.generar_pdf'), true);
});

test('contador: cierre de caja, validaciones, libros e impuestos', () => {
  assert.equal(TECHO_POR_ROL.contador.includes('contabilidad'), true);
  assert.equal(TECHO_POR_ROL.cobranzas.includes('contabilidad'), false);
  assert.equal(TECHO_POR_ROL.supervisor.includes('contabilidad'), false);
  const p = permisosUsuario({ rol: 'contador', permisos: [...TODOS] });
  ['caja.cierre', 'contabilidad.validar_caja', 'contabilidad.validar_pagos',
    'contabilidad.validar_gastos', 'contabilidad.libros', 'contabilidad.impuestos',
    'finanzas.ver_margenes'].forEach((c) => {
    assert.equal(tienePermiso({ rol: 'contador', permisos: p }, c), true, `contador debe tener ${c}`);
  });
  const cobrador = permisosUsuario({ rol: 'cobranzas', permisos: [...TODOS] });
  assert.equal(tienePermiso({ rol: 'cobranzas', permisos: cobrador }, 'contabilidad.validar_caja'), false);
});

test('techo por rol: un preventista con todos los códigos no puede exceder su puesto', () => {
  const permisos = permisosUsuario({ rol: 'preventista', permisos: [...TODOS] });
  for (const codigo of ['rentabilidad', 'finanzas.ver_margenes', 'inventario.ver_costos',
    'administracion', 'sucursales', 'dueno', 'datos.ver_todos']) {
    assert.equal(permisos.includes(codigo), false, `${codigo} no debe estar disponible para preventista`);
  }
  assert.equal(permisos.includes('ventas.crear'), true);
  assert.equal(permisos.includes('clientes.ver'), true);
});

test('techo por rol: distribuidor no ve costos ni márgenes', () => {
  const permisos = permisosUsuario({ rol: 'distribucion', permisos: [...TODOS] });
  assert.equal(tienePermiso({ rol: 'distribucion', permisos }, 'finanzas.ver_margenes'), false);
  assert.equal(tienePermiso({ rol: 'distribucion', permisos }, 'inventario.ver_costos'), false);
  assert.equal(tienePermiso({ rol: 'distribucion', permisos }, 'datos.ver_todos'), false);
  assert.equal(tienePermiso({ rol: 'distribucion', permisos }, 'distribucion.registrar_entregas'), true);
});

test('techo por rol: supervisor ve todo su equipo pero no utilidad de la empresa', () => {
  const permisos = permisosUsuario({ rol: 'supervisor', permisos: [...TODOS] });
  assert.equal(permisos.includes('datos.ver_todos'), true);
  assert.equal(permisos.includes('finanzas.ver_margenes'), false);
});

test('el filtro global elimina costos y márgenes de cualquier respuesta', () => {
  const bloqueados = new Set(['margen', 'utilidad', 'costo', 'costo_unitario', 'valor_inventario']);
  const resultado = limpiar({
    ventas: 100, margen: 20, utilidad: 15,
    items: [{ nombre: 'A', precio: 10, costo_unitario: 6 }],
    resumen: { valor_inventario: 500, unidades: 8 },
  }, bloqueados);
  assert.equal(resultado.ventas, 100);
  assert.equal('margen' in resultado, false);
  assert.equal('utilidad' in resultado, false);
  assert.equal('costo_unitario' in resultado.items[0], false);
  assert.equal('valor_inventario' in resultado.resumen, false);
  assert.equal(resultado.items[0].precio, 10);
  assert.equal(resultado.resumen.unidades, 8);
});

test('hora y fecha se calculan en Bolivia, no en UTC', () => {
  const p = horario.partes(new Date('2026-11-27T02:30:00.000Z'));
  assert.equal(p.fecha, '2026-11-26');
  assert.equal(p.hora, '22:30');
  assert.match(horario.horaBolivia(), /^\d{2}:\d{2}$/);
  assert.match(horario.fechaBolivia(), /^\d{4}-\d{2}-\d{2}$/);
});

test('un pedido de ayer no es del día presente', () => {
  const ayer = new Date(Date.now() - 86400000).toISOString();
  const hoy = new Date().toISOString();
  assert.equal(horario.esPedidoDeHoy({ created_at: ayer }), false);
  assert.equal(horario.esPedidoDeHoy({ created_at: hoy }), true);
});
