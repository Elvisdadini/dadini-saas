const test = require('node:test');
const assert = require('node:assert/strict');
const demanda = require('../src/demanda');

function hace(dias) {
  return new Date(Date.now() - dias * 86400000).toISOString();
}

function dbBase() {
  return {
    productos: [
      { id: 1, sku: 'A', nombre: 'Galletas', categoria: 'Galletas', costo: 5, stock_minimo: 10, activo: true },
      { id: 2, sku: 'B', nombre: 'Snacks', categoria: 'Snacks', costo: 8, stock_minimo: 10, activo: true },
    ],
    pedidos: Array.from({ length: 10 }, (_, i) => ({
      id: i + 1, estado: 'entregado', created_at: hace(i),
      items: [{ producto_id: 1, cantidad: 10, subtotal: 100 }],
    })),
    stock: [{ id: 1, producto_id: 1, almacen_id: 1, cantidad: 20 }],
    almacenes: [{ id: 1, nombre: 'Central' }],
    lotes: [],
    proveedores: [{ id: 3, nombre: 'Proveedor Galletas', activo: true, categorias: ['Galletas'] }],
    configuracion: { reposicion: { dias_historial: 10, lead_time_dias: 3, stock_seguridad_dias: 1 } },
  };
}

test('calcula demanda diaria, cobertura y urgencia', () => {
  const r = demanda.sugerencias(dbBase());
  assert.equal(r.resumen.productos, 2);
  const galletas = r.sugerencias.find((s) => s.producto_id === 1);
  assert.equal(galletas.demanda_diaria, 10);
  assert.equal(galletas.vendible, 20);
  assert.equal(galletas.dias_cobertura, 2);
  assert.equal(galletas.proveedor_id, 3);
  assert.equal(galletas.sugerido > 0, true);
  const snacks = r.sugerencias.find((s) => s.producto_id === 2);
  assert.equal(snacks.demanda_diaria, 0);
  assert.equal(snacks.urgencia, 'baja');
});

test('descuenta lotes vencidos del stock vendible', () => {
  const db = dbBase();
  db.lotes = [{ id: 1, producto_id: 1, almacen_id: 1, cantidad: 5, fecha_vencimiento: '2020-01-01' }];
  const r = demanda.sugerencias(db);
  const galletas = r.sugerencias.find((s) => s.producto_id === 1);
  assert.equal(galletas.vencido, 5);
  assert.equal(galletas.vendible, 15);
});

test('detalle por producto devuelve serie y stock por almacén', () => {
  const d = demanda.detalle(dbBase(), 1);
  assert.equal(d.serie.length, 10);
  assert.equal(d.stock_por_almacen[0].cantidad, 20);
  assert.equal(d.analisis.demanda_total, 100);
});
