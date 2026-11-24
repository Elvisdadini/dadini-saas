const test = require('node:test');
const assert = require('node:assert/strict');

const ai = require('../src/ai');

function dbBase() {
  return {
    productos: [
      { id: 1, sku: 'A1', nombre: 'Producto A', activo: true, stock_minimo: 10, costo: 5, precio: 10 },
      { id: 2, sku: 'A2', nombre: 'Producto B', activo: true, stock_minimo: 2, costo: 3, precio: 6 },
      { id: 3, sku: 'A3', nombre: 'Inactivo', activo: false, stock_minimo: 99, costo: 1, precio: 2 },
    ],
    stock: [
      { producto_id: 1, almacen_id: 1, cantidad: 4 },
      { producto_id: 2, almacen_id: 1, cantidad: 50 },
      { producto_id: 3, almacen_id: 1, cantidad: 0 },
    ],
    clientes: [
      { id: 1, nombre: 'Cliente 1', activo: true, zona: 'Centro', dia_visita: 1, vendedor_id: 2, telefono: '111' },
      { id: 2, nombre: 'Cliente 2', activo: true, zona: 'Sacaba', dia_visita: 2, vendedor_id: 2, telefono: '222' },
      { id: 3, nombre: 'Baja', activo: false, zona: 'Centro', dia_visita: 1 },
    ],
    pedidos: [],
    almacenes: [{ id: 1, nombre: 'Central', activo: true }],
    usuarios: [{ id: 2, nombre: 'Vendedor', rol: 'preventista', activo: true }],
    pagos: [], visitas: [], movimientos: [], rutas: [], cargas: [], repartidores: [],
    notificaciones: [], cliente_categorias: [], alumnos: [], configuracion: { empresa: { dias_credito: 15 } },
  };
}

test('stock_bajo excluye productos inactivos', () => {
  const r = ai.stockBajo(dbBase(), { limite: 10 });
  assert.equal(r.cantidad, 1);
  assert.equal(r.productos[0].sku, 'A1');
});

test('clientes_por_zona_dia filtra activos, día y zona', () => {
  const dia1 = ai.clientesPorZonaDia(dbBase(), { dia: 1 });
  assert.equal(dia1.cantidad, 1);
  assert.equal(dia1.clientes[0].nombre, 'Cliente 1');

  const centro = ai.clientesPorZonaDia(dbBase(), { zona: 'centro' });
  assert.equal(centro.cantidad, 1);
  assert.equal(centro.clientes[0].id, undefined); // el helper no expone id
});

test('cobranzas_vencidas solo cuenta saldos vencidos', () => {
  const db = dbBase();
  const ayer = new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10);
  const manana = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  db.pedidos = [
    { id: 1, cliente_id: 1, saldo: 100, estado: 'enviado', fecha_vencimiento: ayer },
    { id: 2, cliente_id: 2, saldo: 50, estado: 'enviado', fecha_vencimiento: manana },
    { id: 3, cliente_id: 1, saldo: 80, estado: 'cancelado', fecha_vencimiento: ayer },
  ];
  const r = ai.cobranzasVencidas(db, { limite: 5 });
  assert.equal(r.cantidad, 1);
  assert.equal(r.monto_total, 100);
  assert.equal(r.detalle[0].cliente, 'Cliente 1');
});

test('resumen_ventas devuelve cifras del dashboard', () => {
  const db = dbBase();
  db.pedidos = [{
    id: 1, cliente_id: 1, vendedor_id: 2, almacen_id: 1, total: 100, saldo: 0,
    estado: 'pagado', created_at: new Date().toISOString(),
    items: [{ producto_id: 1, cantidad: 2, precio: 10, costo_unitario: 5, subtotal: 20 }],
  }];
  const r = ai.resumenVentas(db, { periodo: '7d' });
  assert.equal(r.periodo, '7d');
  assert.equal(r.ventas, 100);
  assert.equal(r.ticket_promedio, 100);
});

test('el catálogo de herramientas distingue lectura y escritura', () => {
  const leer = ai.HERRAMIENTAS.find((h) => h.name === 'cobranzas_vencidas');
  const escribir = ai.HERRAMIENTAS.find((h) => h.name === 'actualizar_precio');
  assert.equal(leer.escritura, false);
  assert.equal(escribir.escritura, true);
});
