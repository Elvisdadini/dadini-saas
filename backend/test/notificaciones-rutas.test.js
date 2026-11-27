const test = require('node:test');
const assert = require('node:assert/strict');
const { rutaDe, enriquecer } = require('../src/notificaciones-rutas');

test('las notificaciones llevan al módulo que las origina', () => {
  assert.equal(rutaDe({ tipo: 'empresa', titulo: 'Empresa registrada: DIPROL' }), '/administracion/sucursales');
  assert.equal(rutaDe({ tipo: 'vencimiento', titulo: 'Solicitud de cambio de vencimiento' }), '/inventario/kardex');
  assert.equal(rutaDe({ tipo: 'qr', titulo: 'QR por vencer' }), '/ventas/nueva');
  assert.equal(rutaDe({ tipo: 'carga', titulo: 'Carga lista para confirmar' }), '/distribucion');
  assert.equal(rutaDe({ tipo: 'cobranza', titulo: 'Facturas vencidas' }), '/cobranzas');
  assert.equal(rutaDe({ tipo: 'objetivo', titulo: 'Avance de objetivo' }), '/mi-reporte');
  assert.equal(rutaDe({ ruta: '/ruta-explícita', titulo: 'Cualquiera' }), '/ruta-explícita');
  assert.equal(rutaDe({ titulo: 'Aviso general' }), '/');
});

test('enriquecer conserva el resto de campos del aviso', () => {
  const [nota] = enriquecer([{ id: 1, titulo: 'QR vencido', tipo: 'qr', leida: false }]);
  assert.equal(nota.id, 1);
  assert.equal(nota.leida, false);
  assert.equal(nota.ruta, '/ventas/nueva');
});
