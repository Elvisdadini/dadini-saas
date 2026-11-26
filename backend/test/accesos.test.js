const test = require('node:test');
const assert = require('node:assert/strict');
const { TODOS, permisosUsuario, tienePermiso } = require('../src/permisos');
const { limpiar } = require('../src/auth');
const horario = require('../src/horario');

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
