const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SIAT_SECRET_KEY = process.env.SIAT_SECRET_KEY || 'clave-de-prueba';
const webhooks = require('../src/webhooks');

test('firma HMAC y verificación timing-safe', () => {
  const cuerpo = JSON.stringify({ evento: 'pedido.creado', id: 1 });
  const firma = webhooks.firmar(cuerpo, 'secreto');
  assert.ok(firma.startsWith('sha256='));
  assert.equal(webhooks.verificar(cuerpo, firma, 'secreto'), true);
  assert.equal(webhooks.verificar(cuerpo, firma, 'otro'), false);
  assert.equal(webhooks.verificar(`${cuerpo} `, firma, 'secreto'), false);
});

test('crear webhook guarda solo el secreto cifrado', () => {
  const db = { webhooks: [], webhook_entregas: [] };
  const creado = webhooks.crear(db, { nombre: 'Contabilidad', url: 'https://ejemplo.com/hook', eventos: ['pedido.creado'], secreto: 'abc123' });
  assert.equal(creado.secreto, 'abc123');
  assert.ok(db.webhooks[0].secreto_cifrado.startsWith('gcm:'));
  assert.equal(JSON.stringify(webhooks.publico(db, db.webhooks[0])).includes('abc123'), false);
  assert.throws(() => webhooks.crear(db, { url: 'http://inseguro' }), /HTTPS/);
});
