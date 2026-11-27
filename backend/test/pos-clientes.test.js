const test = require('node:test');
const assert = require('node:assert/strict');
const { matches } = require('../src/utils');
const { CODIGOS_DETALLADOS } = require('../src/permisos-detallados');

test('la búsqueda de clientes reconoce CI, NIT y razón social', () => {
  const fila = 'María Pérez INVERSIONES MARIA SRL 1234567 300456789 CLI-004 59177777777 Centro';
  assert.equal(matches(fila, '1234567'), true);
  assert.equal(matches(fila, '300456789'), true);
  assert.equal(matches(fila, 'INVERSIONES MARIA'), true);
  assert.equal(matches(fila, 'CLI-004'), true);
});

test('los permisos de cliente permiten registrar desde el POS', () => {
  assert.equal(CODIGOS_DETALLADOS.includes('clientes.crear'), true);
  assert.equal(CODIGOS_DETALLADOS.includes('ventas.crear'), true);
});
