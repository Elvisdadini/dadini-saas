const test = require('node:test');
const assert = require('node:assert/strict');
const crm = require('../src/crm');

function hace(dias) {
  return new Date(Date.now() - dias * 86400000).toISOString();
}

function dbBase() {
  const pedidos = [];
  for (let i = 0; i < 12; i += 1) {
    pedidos.push({
      id: i + 1, cliente_id: 1, codigo: `VTA-${1001 + i}`, total: 500,
      saldo: 0, estado: 'entregado', estado_pago: 'pagado',
      created_at: hace(i + 1), items: [{ producto_id: 10, nombre: 'Producto', cantidad: 1, subtotal: 500 }],
    });
  }
  pedidos.push({
    id: 99, cliente_id: 2, codigo: 'VTA-2001', total: 100, saldo: 100,
    estado: 'entregado', estado_pago: 'pendiente', created_at: hace(150),
    items: [{ producto_id: 10, nombre: 'Producto', cantidad: 1, subtotal: 100 }],
  });
  return {
    clientes: [
      { id: 1, codigo: 'CLI-001', nombre: 'Cliente Frecuente', zona: 'Centro', activo: true, saldo: 0 },
      { id: 2, codigo: 'CLI-002', nombre: 'Cliente Inactivo', zona: ' Norte ', activo: true, saldo: 100, limite_credito: 500 },
      { id: 3, codigo: 'CLI-003', nombre: 'Cliente Nuevo', zona: 'Centro', activo: true, saldo: 0 },
    ],
    usuarios: [{ id: 2, nombre: 'Vendedor', activo: true }],
    productos: [{ id: 10, nombre: 'Producto', activo: true }],
    pedidos,
    visitas: [{ id: 1, cliente_id: 1, tipo: 'venta', resultado: 'pedido', estado: 'completada', fecha: hace(2), usuario_id: 2 }],
    pagos: [{ id: 1, cliente_id: 1, pedido_id: 1, monto: 500, fecha: hace(1), metodo: 'efectivo' }],
    configuracion: { empresa: { dias_credito: 15 }, credito: { dias_gracia: 0 } },
  };
}

test('RFM clasifica campeones, perdidos y sin actividad', () => {
  const r = crm.listar(dbBase());
  assert.equal(r.resumen.total, 3);
  const frecuente = r.clientes.find((c) => c.id === 1);
  const inactivo = r.clientes.find((c) => c.id === 2);
  const nuevo = r.clientes.find((c) => c.id === 3);
  assert.equal(frecuente.segmento, 'Campeones');
  assert.equal(frecuente.score_r, 5);
  assert.equal(frecuente.score_f, 5);
  assert.equal(frecuente.frecuencia, 12);
  assert.equal(inactivo.segmento, 'Perdidos');
  assert.equal(inactivo.score_r, 1);
  assert.equal(nuevo.segmento, 'Sin actividad');
  assert.equal(nuevo.score, 0);
  assert.equal(r.resumen.por_segmento.Campeones, 1);
  assert.equal(r.resumen.por_segmento.Perdidos, 1);
});

test('filtros por segmento, riesgo y búsqueda', () => {
  const db = dbBase();
  assert.equal(crm.listar(db, { segmento: 'Campeones' }).clientes.length, 1);
  assert.equal(crm.listar(db, { riesgo: 'mora' }).clientes.length, 1);
  assert.equal(crm.listar(db, { search: 'inactivo' }).clientes.length, 1);
  assert.equal(crm.listar(db, { activo: 'todos' }).clientes.length, 3);
});

test('detalle 360 reúne pedidos, visitas, pagos y línea de tiempo', () => {
  const d = crm.detalle(dbBase(), 1);
  assert.equal(d.pedidos.length, 12);
  assert.equal(d.visitas.length, 1);
  assert.equal(d.pagos.length, 1);
  assert.ok(d.timeline.length >= 14);
  assert.equal(d.productos_favoritos[0].cantidad, 12);
  assert.equal(d.resumen.pedidos, 12);
});

test('notas de seguimiento se persisten y se listan en el detalle', () => {
  const db = dbBase();
  const nota = crm.agregarNota(db, 1, { texto: 'Llamar el lunes', tipo: 'llamada' }, 2);
  assert.equal(nota.id, 1);
  assert.equal(crm.detalle(db, 1).notas.length, 1);
  assert.throws(() => crm.agregarNota(db, 1, { texto: '  ' }, 2), /Escribe el contenido/);
});
