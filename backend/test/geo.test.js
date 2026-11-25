const test = require('node:test');
const assert = require('node:assert/strict');
const { puntoDentroPoligono, esCoordenaValida } = require('../src/geo');

const cuadrante = [
  { latitud: -17.40, longitud: -66.17 },
  { latitud: -17.40, longitud: -66.14 },
  { latitud: -17.37, longitud: -66.14 },
  { latitud: -17.37, longitud: -66.17 },
];

test('puntoDentroPoligono detecta puntos dentro y fuera', () => {
  assert.equal(puntoDentroPoligono({ latitud: -17.385, longitud: -66.155 }, cuadrante), true);
  assert.equal(puntoDentroPoligono({ latitud: -17.50, longitud: -66.20 }, cuadrante), false);
});

test('puntoDentroPoligono rechaza geometrías inválidas', () => {
  assert.equal(puntoDentroPoligono({ latitud: -17.385, longitud: -66.155 }, []), false);
  assert.equal(puntoDentroPoligono(null, cuadrante), false);
});

test('esCoordenaValida rechaza nulos y cadenas vacías', () => {
  assert.equal(esCoordenaValida(null, null), false);
  assert.equal(esCoordenaValida('', ''), false);
  assert.equal(esCoordenaValida(-17.39, -66.15), true);
});
