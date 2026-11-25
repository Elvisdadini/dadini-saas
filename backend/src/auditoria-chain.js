// Auditoría inmutable: cada entrada lleva el hash de la anterior (hash chain).
// Cualquier edición o borrado rompe la cadena y es detectable con /verificar.
const crypto = require('crypto');

const GENESIS = '0'.repeat(64);

function canonica(entrada) {
  const { hash, prev_hash, verificado_en, sellada_en, ...resto } = entrada || {};
  const ordenado = {};
  Object.keys(resto).sort().forEach((clave) => { ordenado[clave] = resto[clave]; });
  return JSON.stringify(ordenado);
}

function hashDe(entrada, prevHash) {
  return crypto.createHash('sha256').update(`${prevHash}\n${canonica(entrada)}`).digest('hex');
}

function porId(db) {
  return (db.auditoria || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
}

function anclaDe(db) {
  return require('./tenant').dbReal()?.auditoria_cadena || db.auditoria_cadena;
}

function actualizarAncla(db, hash, total) {
  const destino = require('./tenant').dbReal() || db;
  destino.auditoria_cadena = {
    ...(destino.auditoria_cadena || {}),
    ultimo_hash: hash,
    total,
    actualizado_en: new Date().toISOString(),
  };
}

// Al recortar la auditoría a N registros, el registro más antiguo restante
// apunta al hash del último eliminado. Ese hash pasa a ser el nuevo génesis.
function recortar(db, max = 500) {
  if (!Array.isArray(db.auditoria) || db.auditoria.length <= max) return;
  const eliminadas = db.auditoria.splice(max);
  const masAntigua = eliminadas[eliminadas.length - 1];
  const ancla = db.auditoria_cadena || {};
  actualizarAncla(db, ancla.ultimo_hash || GENESIS, db.auditoria.length);
  db.auditoria_cadena.genesis_hash = masAntigua?.hash || GENESIS;
  db.auditoria_cadena.omitidas = (ancla.omitidas || 0) + eliminadas.length;
}

function asegurar(db) {
  if (!Array.isArray(db.auditoria)) db.auditoria = [];
  let anterior = anclaDe(db)?.genesis_hash || GENESIS;
  porId(db).forEach((entrada) => {
    if (!entrada.hash) {
      entrada.prev_hash = anterior;
      entrada.hash = hashDe(entrada, anterior);
      entrada.sellada_en = new Date().toISOString();
    }
    anterior = entrada.hash;
  });
  if (!anclaDe(db)) actualizarAncla(db, anterior, db.auditoria.length);
  return anterior;
}

// Se llama justo antes de insertar una nueva entrada de auditoría.
function sellar(db, entrada) {
  const anterior = asegurar(db);
  entrada.prev_hash = anterior;
  entrada.hash = hashDe(entrada, anterior);
  entrada.sellada_en = new Date().toISOString();
  if (!db.auditoria.some((e) => e.id === entrada.id)) {
    actualizarAncla(db, entrada.hash, db.auditoria.length + 1);
  }
  return entrada;
}

function verificar(db) {
  let anterior = anclaDe(db)?.genesis_hash || GENESIS;
  const errores = [];
  const entradas = porId(db);
  entradas.forEach((entrada) => {
    const esperado = hashDe(entrada, anterior);
    if (!entrada.hash || entrada.hash !== esperado || entrada.prev_hash !== anterior) {
      errores.push({ id: entrada.id, esperado, encontrado: entrada.hash || null, prev_hash: entrada.prev_hash || null });
    }
    anterior = entrada.hash || esperado;
  });
  const ancla = anclaDe(db);
  if (ancla && (ancla.total !== entradas.length || (entradas.length && ancla.ultimo_hash !== anterior))) {
    errores.push({
      id: 'ancla',
      esperado: ancla.ultimo_hash,
      encontrado: anterior,
      total_esperado: ancla.total,
      total_encontrado: entradas.length,
    });
  }
  return {
    ok: errores.length === 0,
    total: entradas.length,
    errores,
    ultimo_hash: anterior,
    verificado_en: new Date().toISOString(),
  };
}

module.exports = { GENESIS, asegurar, sellar, verificar, recortar, hashDe };
