const test = require('node:test');
const assert = require('node:assert/strict');
const cambios = require('../src/cambios');

const dbBase = () => ({ clientes: [{ id: 1, nombre: 'Cliente' }], productos: [{ id: 5, nombre: 'Galletas' }], movimientos: [], cambios_producto: [] });
const vendedor = { id: 2, nombre: 'Vendedor', rol: 'ventas' };
const repartidor = { id: 4, nombre: 'Distribuidor', rol: 'distribucion' };

test('registro de cambio con foto y razón', () => {
  const db = dbBase();
  const c = cambios.crear(db, { cliente_id: 1, producto_id: 5, cantidad: 2, motivo: 'defecto', razon: 'Paquete roto', foto: 'data:image/png;base64,x' }, vendedor, 'https://foto');
  assert.equal(c.estado, 'pendiente');
  assert.equal(c.foto_url, 'https://foto');
  assert.equal(c.vendedor_id, 2);
});

test('el distribuidor solo confirma si el producto entregado coincide', () => {
  const db = dbBase();
  const c = cambios.crear(db, { cliente_id: 1, producto_id: 5, reemplazo_id: 5, cantidad: 1, motivo: 'baja_rotacion', razon: 'Poco movimiento' }, vendedor);
  assert.throws(() => cambios.confirmar(db, c.id, { producto_entregado_id: 9 }, repartidor), /no coincide/);
  const ok = cambios.confirmar(db, c.id, { producto_entregado_id: 5, nota: 'Verificado' }, repartidor);
  assert.equal(ok.estado, 'confirmado');
  assert.equal(ok.confirmado_por, 4);
  assert.equal(db.movimientos.length, 2);
});

test('listado por rol y filtros', () => {
  const db = dbBase();
  cambios.crear(db, { cliente_id: 1, producto_id: 5, cantidad: 1, motivo: 'defecto', razon: 'x' }, vendedor);
  assert.equal(cambios.listar(db, {}, vendedor).total, 1);
  assert.equal(cambios.listar(db, {}, { id: 99, rol: 'ventas' }).total, 0);
  assert.equal(cambios.listar(db, { estado: 'confirmado' }, { id: 1, rol: 'admin' }).total, 0);
});
