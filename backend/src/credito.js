const { round2, num, daysBetween } = require('./utils');

const CONFIG_PREDETERMINADA = {
  aplicar_interes: true,
  tasa_interes_mensual: 3,
  dias_gracia: 0,
  sancion_fija: 0,
  porcentaje_sancion: 0,
};

function config(db) {
  return { ...CONFIG_PREDETERMINADA, ...(db?.configuracion?.credito || {}) };
}

function diasCredito(db, pedido) {
  return Number(pedido?.dias_credito) || Number(db?.configuracion?.empresa?.dias_credito) || 15;
}

function vencimientoDe(db, pedido) {
  if (pedido?.fecha_vencimiento) return String(pedido.fecha_vencimiento).slice(0, 10);
  const inicio = new Date(pedido.created_at);
  inicio.setDate(inicio.getDate() + diasCredito(db, pedido));
  return inicio.toISOString().slice(0, 10);
}

function interesDe(db, pedido) {
  const cfg = config(db);
  const base = {
    dias_credito: diasCredito(db, pedido),
    vencimiento: vencimientoDe(db, pedido),
    dias_vencido: 0,
    tasa_mensual: cfg.tasa_interes_mensual,
    generado: 0,
    pagado: round2(pedido?.interes_pagado || 0),
    pendiente: 0,
    total_a_cobrar: round2(pedido?.saldo || 0),
  };
  if (!cfg.aplicar_interes || pedido?.estado === 'cancelado' || !(pedido?.saldo > 0)) return base;

  const vencido = daysBetween(base.vencimiento);
  const diasCobrables = Math.max(0, vencido - Number(cfg.dias_gracia || 0));
  base.dias_vencido = vencido;
  if (!diasCobrables) return base;

  const tasaDiaria = num(cfg.tasa_interes_mensual, 0) / 100 / 30;
  const sancion = num(cfg.sancion_fija, 0) + (pedido.saldo * num(cfg.porcentaje_sancion, 0)) / 100;
  base.generado = round2(pedido.saldo * tasaDiaria * diasCobrables + sancion);
  base.pendiente = round2(Math.max(0, base.generado - base.pagado));
  base.total_a_cobrar = round2(pedido.saldo + base.pendiente);
  return base;
}

function normalizarConfig(value) {
  const salida = {};
  const camposBooleanos = ['aplicar_interes'];
  const camposNumericos = ['tasa_interes_mensual', 'dias_gracia', 'sancion_fija', 'porcentaje_sancion'];
  camposBooleanos.forEach((c) => { if (value?.[c] !== undefined) salida[c] = Boolean(value[c]); });
  camposNumericos.forEach((c) => { if (value?.[c] !== undefined) salida[c] = num(value[c]); });
  return salida;
}

module.exports = { CONFIG_PREDETERMINADA, config, diasCredito, vencimientoDe, interesDe, normalizarConfig };
