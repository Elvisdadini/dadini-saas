const test = require('node:test');
const assert = require('node:assert/strict');
const rag = require('../src/rag');

function dbBase() {
  return {
    productos: [{ id: 1, sku: 'SNA004', nombre: 'Animalokos Dinos', categoria: 'Snacks', precio: 10, costo: 6, activo: true, stock_total: 20, stock_minimo: 5 }],
    usuarios: [],
    clientes: [],
    pedidos: [],
    configuracion: {
      empresa: { nombre: 'DADINI', dias_credito: 15 },
      credito: { aplicar_interes: true, tasa_interes_mensual: 3, dias_gracia: 0, sancion_fija: 0, porcentaje_sancion: 0 },
      cobranza: { cobrador_id: 5 },
      fiscal: { normativa: { reglas: [] } },
    },
  };
}

test('indexa productos, crédito y normativa, y encuentra por similitud', () => {
  const db = dbBase();
  const docs = rag.documentos(db);
  assert.ok(docs.some((d) => d.tipo === 'producto' && d.titulo.includes('SNA004')));
  assert.ok(docs.some((d) => d.tipo === 'politica_credito' && d.contenido.includes('15')));
  const encontrados = rag.buscar(db, 'precio del animalokos dinosaurio');
  assert.ok(encontrados.length > 0);
  assert.ok(encontrados[0].titulo.includes('Animalokos'));
});

test('notas manuales se persisten y se pueden buscar', () => {
  const db = dbBase();
  const nota = rag.agregar(db, { titulo: 'Política de visitas', contenido: 'Visitar clientes morosos los martes antes de las 10', tipo: 'nota' });
  assert.equal(nota.id, 1);
  assert.ok(rag.buscar(db, 'visitar morosos martes').some((d) => d.id === 1));
});
