const fs = require('fs');
const path = require('path');

const hoy = () => new Date().toISOString().slice(0, 10);

function iso(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function addDaysISO(date, days) {
  return iso(addDays(date, days));
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function parseIntSafe(value, fallback = 0) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function nextId(collection) {
  return collection.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

function nextCode(collection, field, prefix, start = 1001) {
  const max = collection.reduce((acc, item) => {
    const match = String(item[field] || '').match(/(\d+)$/);
    return match ? Math.max(acc, Number(match[1])) : acc;
  }, start - 1);
  return `${prefix}-${max + 1}`;
}

function audit(db, req, accion, entidad, detalle) {
  const usuario = req?.user?.nombre || 'Sistema';
  const entrada = {
    id: nextId(db.auditoria),
    usuario_id: req?.user?.id || null,
    usuario,
    rol: req?.user?.rol || 'sistema',
    accion,
    entidad,
    detalle,
    fecha: new Date().toISOString(),
    ip: req?.ip || 'local',
  };
  // Se sella ANTES de insertar: la cadena se calcula sobre la auditoría actual.
  const cadena = require('./auditoria-chain');
  cadena.sellar(db, entrada);
  db.auditoria.unshift(entrada);
  cadena.recortar(db, 500);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",;\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCSV(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(';');
  const body = rows.map((row) => columns.map((c) => csvEscape(c.value(row))).join(';'));
  return `\uFEFF${[header, ...body].join('\r\n')}`;
}

function daysBetween(from, to = new Date()) {
  const a = new Date(`${String(from).slice(0, 10)}T00:00:00`);
  const b = new Date(to);
  return Math.max(0, Math.floor((b - a) / 86400000));
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function matches(text, query) {
  return normalize(text).includes(normalize(query));
}

module.exports = {
  hoy,
  iso,
  addDays,
  addDaysISO,
  round2,
  num,
  parseIntSafe,
  nextId,
  nextCode,
  audit,
  ensureDir,
  toCSV,
  daysBetween,
  normalize,
  matches,
  path,
};
