const test = require('node:test');
const assert = require('node:assert/strict');

const { buildIndices } = require('../src/indexes');
const services = require('../src/services');
const { vencimientoDe, diasCredito } = require('../src/credito');

function dbBase() {
  return {
    clientes: [{ id: 1, nombre: 'Cliente A', activo: true, zona: 'Centro' }],
    usuarios: [
      { id: 2, nombre: 'Vendedor', rol: 'ventas', activo: true },
      { id: 9, nombre: 'Cobrador', rol: 'cobranzas', activo: true },
    ],
    almacenes: [{ id: 3, nombre: 'Central', activo: true }],
    rutas: [{ id: 4, codigo: 'RUT-004' }],
    cargas: [{ id: 5, codigo: 'CAR-005' }],
    productos: [
      { id: 10, sku: 'SKU-10', codigo: 'COD-10', nombre: 'Laptop', precio: 100, activo: true, stock_minimo: 2, unidades_por_caja: 4, peso_kg: 1.5 },
      { id: 11, sku: 'SKU-11', nombre: 'Mouse', precio: 10, activo: true, stock_minimo: 2 },
    ],
    repartidores: [{ id: 6, nombre: 'Repartidor' }],
    vehiculos: [{ id: 7, placa: 'ABC123' }],
    stock: [
      { producto_id: 10, almacen_id: 3, cantidad: 8 },
      { producto_id: 10, almacen_id: 8, cantidad: 2 },
      { producto_id: 11, almacen_id: 3, cantidad: 1 },
    ],
    pagos: [{ id: 1, pedido_id: 100, monto: 50, fecha: '2026-01-02' }],
    pedidos: [],
    configuracion: { empresa: { dias_credito: 15 }, credito: { aplicar_interes: true } },
  };
}

test('buildIndices crea mapas por id y stock agregado', () => {
  const db = dbBase();
  const idx = buildIndices(db);
  assert.equal(idx.clientes.get(1).nombre, 'Cliente A');
  assert.equal(idx.stockPorProducto.get(10), 10);
  assert.equal(idx.stockPorClave.get('10:3'), 8);
  assert.equal(idx.productosPorSku.get('sku-10').id, 10);
  assert.equal(idx.nombresProductos.get('laptop').id, 10);
  assert.equal(idx.cobradorId, 9);
});

test('stockDe / stockEn usan índices y coinciden con el cálculo directo', () => {
  const db = dbBase();
  const idx = buildIndices(db);
  assert.equal(services.stockDe(db, 10, idx), 10);
  assert.equal(services.stockDe(db, 10), 10);
  assert.equal(services.stockEn(db, 10, 8, idx), 2);
  assert.equal(services.stockEn(db, 10, 8), 2);
});

test('pedidoResumen enriquece sin N+1 y conserva el detalle', () => {
  const db = dbBase();
  const idx = buildIndices(db);
  const pedido = {
    id: 100, cliente_id: 1, vendedor_id: 2, almacen_id: 3, ruta_id: 4, carga_id: 5,
    total: 100, saldo: 50, estado: 'enviado', created_at: '2026-01-01T10:00:00.000Z',
    items: [{ producto_id: 10, cantidad: 2 }],
  };
  db.pedidos.push(pedido);
  const simple = services.pedidoResumen(db, pedido, false, idx);
  assert.equal(simple.cliente_nombre, 'Cliente A');
  assert.equal(simple.vendedor_nombre, 'Vendedor');
  assert.equal(simple.ruta_codigo, 'RUT-004');
  assert.equal(simple.carga_codigo, 'CAR-005');
  assert.equal(simple.responsable_cobro_nombre, 'Cobrador');
  assert.equal(simple.items_count, 2);

  const detalle = services.pedidoResumen(db, pedido, true, idx);
  assert.equal(detalle.pagos.length, 1);
  assert.equal(detalle.cliente.id, 1);
});

test('dashboard genera serie y KPI coherentes con índices', () => {
  const db = dbBase();
  const hoy = new Date().toISOString().slice(0, 10);
  db.pedidos.push({
    id: 101, cliente_id: 1, vendedor_id: 2, almacen_id: 3, total: 100, saldo: 0,
    estado: 'pagado', created_at: `${hoy}T10:00:00.000Z`,
    items: [{ producto_id: 10, cantidad: 1, precio: 100, costo_unitario: 40, subtotal: 100 }],
  });
  const d = services.dashboard(db, '7d');
  assert.equal(d.kpis.ventas_hoy, 100);
  assert.equal(d.serie.length, 7);
  assert.equal(d.serie[d.serie.length - 1].total, 100);
  assert.equal(d.kpis.stock_bajo, 1);
});

test('reporte agrupa por producto y calcula margen', () => {
  const db = dbBase();
  const hoy = new Date().toISOString().slice(0, 10);
  db.pedidos.push({
    id: 102, cliente_id: 1, vendedor_id: 2, almacen_id: 3, total: 200, saldo: 0,
    estado: 'pagado', created_at: `${hoy}T10:00:00.000Z`,
    items: [{ producto_id: 10, nombre: 'Laptop', cantidad: 2, precio: 100, costo_unitario: 60, subtotal: 200 }],
  });
  const r = services.reporte(db, hoy, hoy);
  assert.equal(r.resumen.total, 200);
  assert.equal(r.resumen.margen, 80);
  assert.equal(r.productos[0].nombre, 'Laptop');
  assert.equal(r.vendedores[0].vendedor, 'Vendedor');
});

test('crédito respeta fecha_vencimiento explícita y días configurados', () => {
  const db = dbBase();
  const pedido = { created_at: '2026-01-01T00:00:00.000Z', dias_credito: 30 };
  assert.equal(diasCredito(db, pedido), 30);
  assert.equal(vencimientoDe(db, pedido), '2026-01-31');
  assert.equal(vencimientoDe(db, { ...pedido, fecha_vencimiento: '2026-02-15' }), '2026-02-15');
});
