const test = require('node:test');
const assert = require('node:assert/strict');
const chain = require('../src/auditoria-chain');

function dbBase() {
  return {
    auditoria: [
      { id: 1, fecha: '2026-01-01T00:00:00.000Z', accion: 'Alta', modulo: 'Clientes', detalle: 'Cliente 1' },
      { id: 2, fecha: '2026-01-02T00:00:00.000Z', accion: 'Edición', modulo: 'Clientes', detalle: 'Cliente 1' },
    ],
  };
}

test('asegurar sella entradas históricas encadenadas', () => {
  const db = dbBase();
  chain.asegurar(db);
  assert.equal(db.auditoria[0].prev_hash, chain.GENESIS);
  assert.equal(db.auditoria[1].prev_hash, db.auditoria[0].hash);
  assert.equal(chain.verificar(db).ok, true);
});

test('nuevas entradas conservan la cadena', () => {
  const db = dbBase();
  chain.asegurar(db);
  const nueva = chain.sellar(db, { id: 3, fecha: '2026-01-03T00:00:00.000Z', accion: 'Baja', modulo: 'Clientes', detalle: 'Cliente 1' });
  db.auditoria.push(nueva);
  const resultado = chain.verificar(db);
  assert.equal(resultado.ok, true);
  assert.equal(resultado.total, 3);
  assert.equal(resultado.ultimo_hash, nueva.hash);
});

test('detectar edición y borrado de entradas', () => {
  const db = dbBase();
  chain.asegurar(db);
  db.auditoria[0].detalle = 'Cliente modificado';
  let resultado = chain.verificar(db);
  assert.equal(resultado.ok, false);
  assert.ok(resultado.errores.some((e) => e.id === 1));

  const db2 = dbBase();
  chain.asegurar(db2);
  db2.auditoria.splice(1, 1);
  resultado = chain.verificar(db2);
  assert.equal(resultado.ok, false, 'el borrado de la última entrada rompe el ancla guardada');
  assert.ok(resultado.errores.some((e) => e.id === 'ancla'));
});
