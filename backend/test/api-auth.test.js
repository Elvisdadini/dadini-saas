const test = require('node:test');
const assert = require('node:assert/strict');
const apiAuth = require('../src/api-auth');

test('las keys tienen prefijo y hash estable', () => {
  const key = apiAuth.generarKey();
  assert.ok(key.startsWith(apiAuth.PREFIJO));
  assert.equal(apiAuth.hashKey(key), apiAuth.hashKey(key));
  assert.equal(apiAuth.coincide(apiAuth.hashKey(key), apiAuth.hashKey(key)), true);
  assert.equal(apiAuth.coincide(apiAuth.hashKey(key), apiAuth.hashKey('otra')), false);
});
