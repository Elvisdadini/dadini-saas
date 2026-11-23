const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, audit, num, round2, matches } = require('../utils');
const { productoResumen, stockEn, stockDe } = require('../services');

const router = express.Router();
router.use(authRequired);

function setStock(db, productoId, almacenId, cantidad) {
  let row = db.stock.find((s) => s.producto_id === productoId && s.almacen_id === almacenId);
  if (!row) {
    row = { id: nextId(db.stock), producto_id: productoId, almacen_id: almacenId, cantidad: 0 };
    db.stock.push(row);
  }
  row.cantidad = Math.max(0, Math.round(cantidad));
  return row;
}

router.get('/', (req, res) => {
  const db = load();
  const { search, categoria, bajo_stock, todos } = req.query;
  let productos = db.productos.map((p) => productoResumen(db, p));
  if (!todos) productos = productos.filter((p) => p.activo);
  if (categoria && categoria !== 'todas') productos = productos.filter((p) => p.categoria === categoria);
  if (bajo_stock === 'true') productos = productos.filter((p) => p.bajo_stock);
  if (search) productos = productos.filter((p) => matches(`${p.nombre} ${p.sku} ${p.categoria} ${p.marca || ''}`, search));
  const categorias = (db.producto_categorias || []).length
    ? db.producto_categorias.filter((c) => c.activa !== false).map((c) => c.nombre)
    : [...new Set(db.productos.filter((p) => p.activo).map((p) => p.categoria))];
  const marcas = (db.producto_marcas || []).filter((m) => m.activa !== false).map((m) => m.nombre);
  return res.json({
    productos: productos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    categorias,
    marcas,
    catalogo: { categorias: db.producto_categorias || [], marcas: db.producto_marcas || [] },
    resumen: {
      total: db.productos.filter((p) => p.activo).length,
      unidades: round2(db.stock.reduce((s, x) => s + x.cantidad, 0)),
      valor_inventario: round2(db.productos.reduce((s, p) => s + stockDe(db, p.id) * p.costo, 0)),
      bajo_stock: db.productos.filter((p) => p.activo && stockDe(db, p.id) <= p.stock_minimo).length,
    },
  });
});

router.get('/movimientos', (req, res) => {
  const db = load();
  const { producto_id, tipo, almacen_id, desde, hasta, limit } = req.query;
  let movimientos = db.movimientos.map((m) => {
    const producto = db.productos.find((p) => p.id === m.producto_id);
    const almacen = db.almacenes.find((a) => a.id === m.almacen_id);
    const usuario = db.usuarios.find((u) => u.id === m.usuario_id);
    return {
      ...m,
      producto_nombre: producto?.nombre || '—',
      producto_emoji: producto?.emoji || '📦',
      almacen_nombre: almacen?.nombre || '—',
      usuario_nombre: usuario?.nombre || 'Sistema',
    };
  });
  if (producto_id) movimientos = movimientos.filter((m) => m.producto_id === Number(producto_id));
  if (tipo && tipo !== 'todos') movimientos = movimientos.filter((m) => m.tipo === tipo);
  if (almacen_id) movimientos = movimientos.filter((m) => m.almacen_id === Number(almacen_id));
  if (desde) movimientos = movimientos.filter((m) => m.fecha.slice(0, 10) >= desde);
  if (hasta) movimientos = movimientos.filter((m) => m.fecha.slice(0, 10) <= hasta);
  movimientos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  return res.json({ movimientos: movimientos.slice(0, Number(limit) || 200) });
});

router.post('/', requirePermiso('inventario.crear'), allow('almacen'), (req, res) => {
  const db = load();
  const { nombre, categoria, categoria_id, marca, marca_id, precio, costo, emoji, color, unidad, unidades_por_caja, unidades_por_paquete, presentacion, vender_por, stock_minimo, stock_inicial, sku, categorias_clientes, peso_kg, imagen_url } = req.body || {};
  const categoriaCatalogo = categoria_id ? (db.producto_categorias || []).find((c) => c.id === Number(categoria_id)) : null;
  const marcaCatalogo = marca_id ? (db.producto_marcas || []).find((m) => m.id === Number(marca_id)) : null;
  const categoriaFinal = categoriaCatalogo?.nombre || categoria;
  if (!nombre || !precio || !categoriaFinal) return res.status(400).json({ error: 'Nombre, categoría y precio son obligatorios.' });
  const codigo = sku || `DAD-${String(nextId(db.productos)).padStart(3, '0')}`;
  if (db.productos.some((p) => p.sku === codigo)) return res.status(400).json({ error: 'El SKU ya existe.' });
  const producto = {
    id: nextId(db.productos),
    sku: codigo,
    nombre: String(nombre).toUpperCase().trim(),
    categoria: categoriaFinal,
    categoria_id: categoriaCatalogo?.id || null,
    marca: marcaCatalogo?.nombre || marca || null,
    marca_id: marcaCatalogo?.id || null,
    imagen_url: imagen_url || null,
    precio: round2(num(precio)),
    costo: round2(num(costo)),
    emoji: emoji || '📦',
    color: color || '#FF6500',
    unidad: unidad || 'unidad',
    unidades_por_caja: Math.max(1, Math.round(num(unidades_por_caja, unidad === 'caja' ? 1 : 24))),
    unidades_por_paquete: Math.max(1, Math.round(num(unidades_por_paquete, 12))),
    presentacion: presentacion || unidad || 'unidad',
    vender_por: Array.isArray(vender_por) ? vender_por : ['unidad', 'caja', 'paquete'],
    categorias_clientes: Array.isArray(categorias_clientes) ? categorias_clientes.map(Number) : [],
    peso_kg: num(peso_kg, 0.25),
    stock_minimo: num(stock_minimo, 10),
    activo: true,
    created_at: new Date().toISOString(),
  };
  db.productos.push(producto);
  const inicial = num(stock_inicial, 0);
  setStock(db, producto.id, 1, inicial);
  if (inicial > 0) {
    db.movimientos.unshift({
      id: nextId(db.movimientos),
      producto_id: producto.id,
      almacen_id: 1,
      tipo: 'entrada',
      cantidad: inicial,
      motivo: 'Stock inicial',
      referencia: 'ALTA',
      usuario_id: req.user.id,
      fecha: new Date().toISOString(),
    });
  }
  audit(db, req, 'Producto creado', 'Inventario', `${producto.nombre} (${producto.sku})`);
  save();
  return res.status(201).json({ producto: productoResumen(db, producto) });
});

router.post('/importar', allow('almacen', 'admin'), (req, res) => {
  const db = load();
  const filas = Array.isArray(req.body?.productos) ? req.body.productos : [];
  if (!filas.length) return res.status(400).json({ error: 'El archivo no contiene filas para importar.' });
  const creados = [];
  const errores = [];
  filas.forEach((fila, index) => {
    const nombre = String(fila.nombre || fila.Nombre || fila.NOMBRE || '').trim().toUpperCase();
    const categoria = String(fila.categoria || fila.Categoria || fila.CATEGORIA || 'General').trim();
    const sku = String(fila.sku || fila.SKU || fila.codigo || '').trim();
    const precio = num(fila.precio ?? fila.Precio ?? fila.PRECIO);
    if (!nombre || !precio) {
      errores.push({ fila: index + 2, error: 'Nombre y precio son obligatorios.' });
      return;
    }
    const codigo = sku || `DAD-${String(nextId(db.productos) + creados.length).padStart(3, '0')}`;
    if (db.productos.some((p) => p.sku === codigo) || creados.some((p) => p.sku === codigo)) {
      errores.push({ fila: index + 2, error: `El SKU ${codigo} ya existe.` });
      return;
    }
    const producto = {
      id: nextId(db.productos) + creados.length,
      sku: codigo,
      nombre,
      categoria,
      precio: round2(precio),
      costo: round2(num(fila.costo ?? fila.Costo ?? fila.COSTO)),
      emoji: String(fila.emoji || '📦').slice(0, 4),
      color: String(fila.color || '#FF6500'),
      unidad: String(fila.unidad || fila.Unidad || (categoria === 'Surtidos' ? 'caja' : 'unidad')),
      unidades_por_caja: Math.max(1, Math.round(num(fila.unidades_por_caja ?? fila.unidadesPorCaja, 24))),
      categorias_clientes: Array.isArray(fila.categorias_clientes) ? fila.categorias_clientes.map(Number)
        : String(fila.categorias_clientes || '').split(',').map((x) => Number(x.trim())).filter(Boolean),
      peso_kg: num(fila.peso_kg ?? fila.pesoKg, 0.25),
      unidades_por_paquete: Math.max(1, Math.round(num(fila.unidades_por_paquete ?? fila.unidadesPorPaquete, 12))),
      presentacion: fila.presentacion || unidad || 'unidad',
      vender_por: Array.isArray(fila.vender_por) ? fila.vender_por : String(fila.vender_por || '').split(',').map((x) => x.trim()).filter(Boolean),
      stock_minimo: num(fila.stock_minimo ?? fila.stockMinimo, 10),
      activo: fila.activo === undefined ? true : Boolean(fila.activo),
      created_at: new Date().toISOString(),
    };
    creados.push(producto);
  });
  creados.forEach((producto) => {
    db.productos.push(producto);
    const inicial = num(filaStock(producto, filas));
    if (inicial > 0) {
      setStock(db, producto.id, 1, inicial);
      db.movimientos.unshift({
        id: nextId(db.movimientos), producto_id: producto.id, almacen_id: 1,
        tipo: 'entrada', cantidad: inicial, motivo: 'Importación Excel',
        referencia: producto.sku, usuario_id: req.user.id, fecha: new Date().toISOString(),
      });
    }
  });
  audit(db, req, 'Productos importados', 'Inventario', `${creados.length} productos · ${errores.length} errores`);
  save();
  return res.status(201).json({ creados: creados.length, errores, total: filas.length, productos: creados.map((p) => ({ id: p.id, sku: p.sku, nombre: p.nombre })) });
});

function filaStock(producto, filas) {
  const fila = filas.find((f) => String(f.sku || f.SKU || f.codigo || '').trim() === producto.sku
    || String(f.nombre || f.Nombre || f.NOMBRE || '').trim().toUpperCase() === producto.nombre);
  return fila ? (fila.stock_inicial ?? fila.stockInicial ?? fila.stock ?? fila.Stock ?? 0) : 0;
}

router.put('/:id', requirePermiso('inventario.editar'), allow('almacen'), (req, res) => {
  const db = load();
  const producto = db.productos.find((p) => p.id === Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { nombre, categoria, categoria_id, marca, marca_id, precio, costo, emoji, color, unidad, unidades_por_caja, unidades_por_paquete, presentacion, vender_por, stock_minimo, activo, categorias_clientes, peso_kg, imagen_url } = req.body || {};
  if (nombre) producto.nombre = String(nombre).toUpperCase().trim();
  if (categoria_id) {
    const cat = (db.producto_categorias || []).find((c) => c.id === Number(categoria_id));
    if (cat) { producto.categoria = cat.nombre; producto.categoria_id = cat.id; }
  } else if (categoria) producto.categoria = categoria;
  if (marca_id) {
    const mar = (db.producto_marcas || []).find((m) => m.id === Number(marca_id));
    if (mar) { producto.marca = mar.nombre; producto.marca_id = mar.id; }
  } else if (marca !== undefined) producto.marca = marca;
  if (imagen_url !== undefined) producto.imagen_url = imagen_url || null;
  if (precio !== undefined) producto.precio = round2(num(precio));
  if (costo !== undefined) producto.costo = round2(num(costo));
  if (emoji) producto.emoji = emoji;
  if (color) producto.color = color;
  if (unidad) producto.unidad = unidad;
  if (unidades_por_caja !== undefined) producto.unidades_por_caja = Math.max(1, Math.round(num(unidades_por_caja, 1)));
  if (unidades_por_paquete !== undefined) producto.unidades_por_paquete = Math.max(1, Math.round(num(unidades_por_paquete, 1)));
  if (presentacion !== undefined) producto.presentacion = presentacion;
  if (vender_por !== undefined) producto.vender_por = Array.isArray(vender_por) ? vender_por : ['unidad'];
  if (categorias_clientes !== undefined) producto.categorias_clientes = Array.isArray(categorias_clientes) ? categorias_clientes.map(Number) : [];
  if (peso_kg !== undefined) producto.peso_kg = num(peso_kg, 0.25);
  if (stock_minimo !== undefined) producto.stock_minimo = num(stock_minimo);
  if (activo !== undefined) producto.activo = Boolean(activo);
  audit(db, req, 'Producto actualizado', 'Inventario', `${producto.nombre}`);
  save();
  return res.json({ producto: productoResumen(db, producto) });
});

router.delete('/:id', requirePermiso('inventario.eliminar'), allow(), (req, res) => {
  const db = load();
  const producto = db.productos.find((p) => p.id === Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  producto.activo = false;
  audit(db, req, 'Producto desactivado', 'Inventario', producto.nombre);
  save();
  return res.json({ ok: true });
});

router.post('/:id/ajuste', allow('almacen'), (req, res) => {
  const db = load();
  const producto = db.productos.find((p) => p.id === Number(req.params.id));
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  const { almacen_id, cantidad, motivo, tipo } = req.body || {};
  const almacenId = Number(almacen_id);
  if (!db.almacenes.some((a) => a.id === almacenId)) return res.status(400).json({ error: 'Almacén inválido.' });
  const delta = Math.round(num(cantidad));
  if (!delta) return res.status(400).json({ error: 'Indica una cantidad distinta de cero.' });
  const actual = stockEn(db, producto.id, almacenId);
  if (actual + delta < 0) return res.status(400).json({ error: `Stock insuficiente. Disponible: ${actual}.` });
  setStock(db, producto.id, almacenId, actual + delta);
  db.movimientos.unshift({
    id: nextId(db.movimientos),
    producto_id: producto.id,
    almacen_id: almacenId,
    tipo: tipo || (delta > 0 ? 'entrada' : 'salida'),
    cantidad: Math.abs(delta),
    motivo: motivo || 'Ajuste manual',
    referencia: 'AJUSTE',
    usuario_id: req.user.id,
    fecha: new Date().toISOString(),
  });
  audit(db, req, 'Ajuste de inventario', 'Inventario', `${producto.nombre}: ${delta > 0 ? '+' : ''}${delta} en almacén ${almacenId}`);
  save();
  return res.json({ producto: productoResumen(db, producto) });
});

router.post('/transferencia', allow('almacen'), (req, res) => {
  const db = load();
  const { producto_id, origen_id, destino_id, cantidad } = req.body || {};
  const producto = db.productos.find((p) => p.id === Number(producto_id));
  if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });
  if (Number(origen_id) === Number(destino_id)) return res.status(400).json({ error: 'El origen y destino deben ser distintos.' });
  const qty = Math.round(num(cantidad));
  if (qty <= 0) return res.status(400).json({ error: 'La cantidad debe ser mayor a cero.' });
  const disponible = stockEn(db, producto.id, Number(origen_id));
  if (disponible < qty) return res.status(400).json({ error: `Stock insuficiente en origen. Disponible: ${disponible}.` });
  setStock(db, producto.id, Number(origen_id), disponible - qty);
  setStock(db, producto.id, Number(destino_id), stockEn(db, producto.id, Number(destino_id)) + qty);
  db.movimientos.unshift(
    { id: nextId(db.movimientos), producto_id: producto.id, almacen_id: Number(origen_id), tipo: 'transferencia_salida', cantidad: qty, motivo: 'Transferencia entre almacenes', referencia: `ALM-${destino_id}`, usuario_id: req.user.id, fecha: new Date().toISOString() },
    { id: nextId(db.movimientos) + 1, producto_id: producto.id, almacen_id: Number(destino_id), tipo: 'transferencia_entrada', cantidad: qty, motivo: 'Transferencia entre almacenes', referencia: `ALM-${origen_id}`, usuario_id: req.user.id, fecha: new Date().toISOString() },
  );
  audit(db, req, 'Transferencia de inventario', 'Inventario', `${producto.nombre}: ${qty} unidades (${origen_id} → ${destino_id})`);
  save();
  return res.json({ producto: productoResumen(db, producto) });
});

module.exports = router;
