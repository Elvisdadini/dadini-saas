const test = require('node:test');
const assert = require('node:assert/strict');
const tenant = require('../src/tenant');

function dbBase() {
  return {
    sucursales: [{ id: 1, codigo: 'CASA-MATRIZ', nombre: 'Casa Matriz', activa: true }],
    usuarios: [{ id: 1, nombre: 'Admin', sucursal_id: 1 }],
    clientes: [
      { id: 1, nombre: 'Cliente Matriz', sucursal_id: 1 },
      { id: 2, nombre: 'Cliente Sucursal 2', sucursal_id: 2 },
      { id: 3, nombre: 'Cliente sin tag' },
    ],
    pedidos: [{ id: 1, cliente_id: 1, codigo: 'VTA-1001', sucursal_id: 1 }],
    auditoria: [{ id: 1, accion: 'Alta', sucursal_id: 1 }],
  };
}

test('asegurar crea Casa Matriz y etiqueta filas existentes', () => {
  const db = dbBase();
  tenant.asegurar(db);
  assert.equal(db.sucursales.length, 1);
  assert.equal(db.clientes[2].sucursal_id, 1);
  assert.equal(db.usuarios[0].sucursal_id, 1);
});

test('la vista filtra solo la sucursal activa', () => {
  const db = dbBase();
  tenant.asegurar(db);
  tenant.registrar(db);
  const vista = tenant.vistaDe(db, 2);
  assert.equal(vista.clientes.length, 1);
  assert.equal(vista.clientes[0].nombre, 'Cliente Sucursal 2');
  assert.equal(vista.pedidos.length, 0);
  // Auditoría y usuarios son globales
  assert.equal(vista.auditoria, db.auditoria);
  assert.equal(vista.usuarios, db.usuarios);
});

test('integrar conserva los datos de otras sucursales', () => {
  const db = dbBase();
  tenant.asegurar(db);
  tenant.registrar(db);
  const vista = tenant.vistaDe(db, 2);
  vista.clientes.push({ id: 3, nombre: 'Nuevo Sucursal 2' });
  tenant.integrar(vista, 2);
  assert.equal(db.clientes.length, 4);
  const nombres = db.clientes.map((c) => c.nombre);
  assert.ok(nombres.includes('Cliente Matriz'));
  assert.ok(nombres.includes('Nuevo Sucursal 2'));
  assert.equal(db.clientes.find((c) => c.nombre === 'Nuevo Sucursal 2').sucursal_id, 2);
});

test('los IDs y códigos se generan sobre la base completa', () => {
  const db = dbBase();
  tenant.asegurar(db);
  tenant.registrar(db);
  const vista = tenant.vistaDe(db, 2);
  assert.equal(tenant.maxId('clientes'), 4);
  assert.equal(tenant.maxCodigo('pedidos', 'codigo', 'VTA', 1001), 'VTA-1002');
  assert.ok(vista.clientes.length < db.clientes.length);
});
