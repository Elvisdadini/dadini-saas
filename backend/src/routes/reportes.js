const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const { reporte } = require('../services');
const { toCSV } = require('../utils');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  return res.json(reporte(db, req.query.desde, req.query.hasta));
});

router.get('/export', (req, res) => {
  const db = load();
  const tipo = req.query.tipo || 'ventas';
  const data = reporte(db, req.query.desde, req.query.hasta);
  let columns;
  let rows;
  if (tipo === 'productos') {
    rows = data.productos;
    columns = [
      { label: 'Producto', value: (r) => r.nombre },
      { label: 'Categoría', value: (r) => r.categoria },
      { label: 'Unidades', value: (r) => r.cantidad },
      { label: 'Ventas Bs', value: (r) => r.total.toFixed(2) },
      { label: 'Margen Bs', value: (r) => r.margen.toFixed(2) },
    ];
  } else if (tipo === 'clientes') {
    rows = data.clientes;
    columns = [
      { label: 'Cliente', value: (r) => r.cliente },
      { label: 'Zona', value: (r) => r.zona },
      { label: 'Pedidos', value: (r) => r.pedidos },
      { label: 'Comprado Bs', value: (r) => r.total.toFixed(2) },
      { label: 'Saldo Bs', value: (r) => r.saldo.toFixed(2) },
    ];
  } else if (tipo === 'vendedores') {
    rows = data.vendedores;
    columns = [
      { label: 'Vendedor', value: (r) => r.vendedor },
      { label: 'Pedidos', value: (r) => r.pedidos },
      { label: 'Ventas Bs', value: (r) => r.total.toFixed(2) },
    ];
  } else {
    rows = data.por_dia;
    columns = [
      { label: 'Fecha', value: (r) => r.fecha },
      { label: 'Pedidos', value: (r) => r.pedidos },
      { label: 'Ventas Bs', value: (r) => r.total.toFixed(2) },
    ];
  }
  const csv = toCSV(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="dadini-${tipo}-${data.rango.desde}-${data.rango.hasta}.csv"`);
  return res.send(csv);
});

module.exports = router;
