const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit, num, round2, matches } = require('../utils');
const { pedidoResumen } = require('../services');
const { esCoordenaValida } = require('../geo');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  const db = load();
  const { search, tipo, zona, con_saldo, ruta_venta, dia_visita, agenda, categoria_cliente_id, vendedor_id, solo_mios } = req.query;
  let clientes = db.clientes.map((c) => {
    const pedidos = db.pedidos.filter((p) => p.cliente_id === c.id && p.estado !== 'cancelado');
    return {
      ...c,
      pedidos: pedidos.length,
      comprado: round2(pedidos.reduce((s, p) => s + p.total, 0)),
      ultima_compra: pedidos.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null,
    };
  });
  if (tipo && tipo !== 'todos') clientes = clientes.filter((c) => c.tipo === tipo);
  if (zona && zona !== 'todas') clientes = clientes.filter((c) => c.zona === zona);
  if (con_saldo === 'true') clientes = clientes.filter((c) => c.saldo > 0);
  if (search) clientes = clientes.filter((c) => matches(`${c.nombre} ${c.codigo} ${c.contacto} ${c.zona} ${c.telefono}`, search));
  let rutaFiltro = ruta_venta;
  let diaFiltro = dia_visita;
  if (agenda === 'true') {
    rutaFiltro = req.user.ruta_venta || rutaFiltro;
    const diaSemana = new Date().getDay() || 7;
    diaFiltro = diaSemana > 5 ? 1 : diaSemana;
  }
  if (rutaFiltro && rutaFiltro !== 'todas') clientes = clientes.filter((c) => c.ruta_venta === rutaFiltro);
  if (diaFiltro && diaFiltro !== 'todos') clientes = clientes.filter((c) => c.dia_visita === Number(diaFiltro));
  if (categoria_cliente_id && categoria_cliente_id !== 'todas') clientes = clientes.filter((c) => c.categoria_cliente_id === Number(categoria_cliente_id));
  if (vendedor_id) clientes = clientes.filter((c) => c.vendedor_id === Number(vendedor_id));
  if (solo_mios === 'true') {
    if (req.user.zona_venta) clientes = clientes.filter((c) => c.zona === req.user.zona_venta || c.ruta_venta === req.user.ruta_venta);
    else if (req.user.ruta_venta) clientes = clientes.filter((c) => c.ruta_venta === req.user.ruta_venta);
  }
  const zonas = [...new Set(db.clientes.map((c) => c.zona))].sort();
  return res.json({
    clientes: clientes.sort((a, b) => b.comprado - a.comprado),
    zonas,
    categorias: db.cliente_categorias || [],
    resumen: {
      total: db.clientes.filter((c) => c.activo).length,
      mayoristas: db.clientes.filter((c) => c.tipo === 'mayorista' && c.activo).length,
      con_saldo: db.clientes.filter((c) => c.saldo > 0).length,
      por_cobrar: round2(db.clientes.reduce((s, c) => s + c.saldo, 0)),
    },
    agenda: [1, 2, 3, 4, 5, 6, 7].map((dia) => ({
      dia,
      total: db.clientes.filter((c) => c.activo && (!rutaFiltro || rutaFiltro === 'todas' || c.ruta_venta === rutaFiltro) && c.dia_visita === dia).length,
    })),
  });
});

router.get('/:id', (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const pedidos = db.pedidos
    .filter((p) => p.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .map((p) => pedidoResumen(db, p));
  const visitas = db.visitas
    .filter((v) => v.cliente_id === cliente.id)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, 10);
  return res.json({ cliente, pedidos, visitas });
});

router.post('/', allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas'), (req, res) => {
  const db = load();
  const { nombre, tipo, zona, direccion, telefono, email, limite_credito, contacto, notas, latitud, longitud, precision, ruta_venta, dia_visita, categoria_cliente_id } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  const cliente = {
    id: nextId(db.clientes),
    codigo: `CLI-${String(nextId(db.clientes)).padStart(3, '0')}`,
    nombre: String(nombre).trim(),
    tipo: tipo || 'minorista',
    zona: zona || 'Centro',
    direccion: direccion || '',
    telefono: telefono || '',
    email: email || '',
    limite_credito: num(limite_credito, 0),
    saldo: 0,
    contacto: contacto || '',
    notas: notas || '',
    activo: true,
    created_at: new Date().toISOString(),
  };
  const vendedorCreador = db.usuarios.find((u) => u.id === req.user.id);
  cliente.ruta_venta = ruta_venta || vendedorCreador?.ruta_venta || null;
  cliente.dia_visita = dia_visita ? Number(dia_visita) : null;
  cliente.zona = zona || vendedorCreador?.zona_venta || 'Centro';
  cliente.categoria_cliente_id = categoria_cliente_id ? Number(categoria_cliente_id) : (vendedorCreador?.categoria_cliente_id || null);
  cliente.vendedor_id = req.user.id;
  if (esCoordenaValida(latitud, longitud)) {
    cliente.latitud = Number(latitud);
    cliente.longitud = Number(longitud);
    cliente.precision = Number(precision) || null;
    cliente.coordenadas_verificadas = true;
    cliente.geolocalizacion_creada_en = cliente.created_at;
    db.visitas.unshift({
      id: nextId(db.visitas),
      cliente_id: cliente.id,
      tipo: 'alta_cliente',
      modulo: 'Ventas',
      latitud: cliente.latitud,
      longitud: cliente.longitud,
      precision: cliente.precision,
      estado: 'completada',
      pedido_id: null,
      ruta_id: null,
      ruta_venta: cliente.ruta_venta,
      dia_visita: cliente.dia_visita,
      usuario_id: req.user.id,
      notas: `Geolocalización capturada al crear ${cliente.nombre}`,
      fecha: cliente.created_at,
      created_at: cliente.created_at,
    });
  }
  db.clientes.push(cliente);
  audit(db, req, 'Cliente creado', 'Clientes', cliente.nombre);
  save();
  return res.status(201).json({ cliente });
});

router.patch('/:id/bloqueo', allow('admin', 'dueno', 'cobranzas'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const activar = req.body?.activo !== false;
  cliente.activo = activar;
  cliente.bloqueado_por_deuda = activar ? false : Boolean(req.body?.por_deuda);
  cliente.motivo_bloqueo = activar ? null : (req.body?.motivo || 'Bloqueo por administración');
  cliente.bloqueado_en = activar ? null : new Date().toISOString();
  audit(db, req, activar ? 'Cliente desbloqueado' : 'Cliente bloqueado', 'Clientes', `${cliente.nombre} · ${cliente.motivo_bloqueo || ''}`);
  save();
  return res.json({ cliente });
});

router.patch('/:id/reasignar', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const { vendedor_id, ruta_venta, zona, reasignar_pedidos } = req.body || {};
  const vendedor = vendedor_id ? db.usuarios.find((u) => u.id === Number(vendedor_id)) : null;
  if (vendedor_id && !vendedor) return res.status(400).json({ error: 'Vendedor no encontrado.' });
  if (vendedor) cliente.vendedor_id = vendedor.id;
  if (ruta_venta) cliente.ruta_venta = ruta_venta;
  if (zona) cliente.zona = zona;
  let pedidos = 0;
  if (reasignar_pedidos && vendedor) {
    db.pedidos.forEach((p) => {
      if (p.cliente_id !== cliente.id || p.estado === 'cancelado') return;
      p.vendedor_id = vendedor.id;
      if (p.saldo > 0 && !p.en_mora) p.responsable_cobro_id = vendedor.id;
      if (ruta_venta) p.ruta_venta = ruta_venta;
      pedidos += 1;
    });
  }
  audit(db, req, 'Cliente reasignado', 'Clientes', `${cliente.nombre} → ${vendedor?.nombre || 'sin vendedor'} · ${pedidos} pedidos`);
  save();
  return res.json({ cliente, pedidos_reasignados: pedidos });
});

router.post('/importar', allow('admin', 'ventas', 'preventista'), (req, res) => {
  const db = load();
  const filas = Array.isArray(req.body?.clientes) ? req.body.clientes : [];
  if (!filas.length) return res.status(400).json({ error: 'El archivo no contiene filas para importar.' });
  const creados = [];
  const errores = [];
  const valor = (fila, ...claves) => {
    for (const clave of claves) if (fila[clave] !== undefined && fila[clave] !== '') return fila[clave];
    return undefined;
  };
  filas.forEach((fila, index) => {
    const nombre = String(valor(fila, 'nombre', 'Nombre', 'NOMBRE', 'cliente', 'Cliente') || '').trim();
    if (!nombre) {
      errores.push({ fila: index + 2, error: 'El nombre es obligatorio.' });
      return;
    }
    const codigo = String(valor(fila, 'codigo', 'codigo_cliente', 'CODIGO') || '').trim()
      || `CLI-${String(nextId(db.clientes) + creados.length).padStart(3, '0')}`;
    if (db.clientes.some((c) => c.codigo === codigo) || creados.some((c) => c.codigo === codigo)) {
      errores.push({ fila: index + 2, error: `El código ${codigo} ya existe.` });
      return;
    }
    const telefono = String(valor(fila, 'telefono', 'Teléfono', 'TELEFONO', 'celular') || '').trim();
    const latitud = num(valor(fila, 'latitud', 'Latitud', 'lat', 'LAT'));
    const longitud = num(valor(fila, 'longitud', 'Longitud', 'lon', 'LNG', 'lng'));
    const diaRaw = valor(fila, 'dia_visita', 'dia', 'Día', 'DIA');
    const dia = diaRaw === undefined || diaRaw === '' ? null : Number(diaRaw);
    const cliente = {
      id: nextId(db.clientes) + creados.length,
      codigo,
      nombre,
      tipo: String(valor(fila, 'tipo', 'Tipo', 'TIPO') || 'minorista').toLowerCase().includes('mayor') ? 'mayorista' : 'minorista',
      zona: String(valor(fila, 'zona', 'Zona', 'ZONA') || req.user.zona_venta || 'Centro').trim(),
      direccion: String(valor(fila, 'direccion', 'Dirección', 'DIRECCION', 'dirección') || '').trim(),
      telefono,
      email: String(valor(fila, 'email', 'Email', 'EMAIL', 'correo') || '').trim(),
      limite_credito: num(valor(fila, 'limite_credito', 'limiteCredito', 'LIMITE_CREDITO'), 0),
      saldo: 0,
      contacto: String(valor(fila, 'contacto', 'Contacto', 'CONTACTO') || '').trim(),
      notas: String(valor(fila, 'notas', 'Notas', 'NOTAS') || '').trim(),
      activo: true,
      created_at: new Date().toISOString(),
      latitud: esCoordenaValida(latitud, longitud) ? latitud : null,
      longitud: esCoordenaValida(latitud, longitud) ? longitud : null,
      precision: null,
      coordenadas_verificadas: esCoordenaValida(latitud, longitud),
      geolocalizacion_creada_en: new Date().toISOString(),
      ruta_venta: valor(fila, 'ruta_venta', 'ruta', 'RUTA') || req.user.ruta_venta || null,
      dia_visita: dia >= 1 && dia <= 7 ? dia : null,
      categoria_cliente_id: valor(fila, 'categoria_cliente_id', 'categoria', 'CATEGORIA') ? Number(valor(fila, 'categoria_cliente_id', 'categoria', 'CATEGORIA')) : (req.user.categoria_cliente_id || null),
      vendedor_id: req.user.id,
    };
    creados.push(cliente);
  });
  creados.forEach((cliente) => {
    db.clientes.push(cliente);
    if (esCoordenaValida(cliente.latitud, cliente.longitud)) {
      db.visitas.unshift({
        id: nextId(db.visitas), cliente_id: cliente.id, tipo: 'alta_cliente', modulo: 'Ventas',
        latitud: cliente.latitud, longitud: cliente.longitud, precision: null, estado: 'completada',
        pedido_id: null, ruta_id: null, ruta_venta: cliente.ruta_venta, dia_visita: cliente.dia_visita,
        usuario_id: req.user.id, notas: `Geolocalización importada al crear ${cliente.nombre}`,
        fecha: cliente.created_at, created_at: cliente.created_at,
      });
    }
  });
  audit(db, req, 'Clientes importados', 'Clientes', `${creados.length} clientes · ${errores.length} errores`);
  save();
  return res.status(201).json({ creados: creados.length, errores, total: filas.length, clientes: creados.map((c) => ({ id: c.id, codigo: c.codigo, nombre: c.nombre })) });
});

router.put('/:id', allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const campos = ['nombre', 'tipo', 'zona', 'direccion', 'telefono', 'email', 'contacto', 'notas', 'activo'];
  campos.forEach((c) => { if (req.body?.[c] !== undefined) cliente[c] = req.body[c]; });
  if (req.body?.limite_credito !== undefined) cliente.limite_credito = num(req.body.limite_credito);
  if (req.body?.ruta_venta !== undefined) cliente.ruta_venta = req.body.ruta_venta || null;
  if (req.body?.dia_visita !== undefined) cliente.dia_visita = req.body.dia_visita ? Number(req.body.dia_visita) : null;
  if (req.body?.categoria_cliente_id !== undefined) cliente.categoria_cliente_id = req.body.categoria_cliente_id ? Number(req.body.categoria_cliente_id) : null;
  if (esCoordenaValida(req.body?.latitud, req.body?.longitud)) {
    cliente.latitud = Number(req.body.latitud);
    cliente.longitud = Number(req.body.longitud);
    cliente.precision = Number(req.body.precision) || null;
    cliente.coordenadas_verificadas = true;
    cliente.geolocalizacion_creada_en = new Date().toISOString();
  }
  audit(db, req, 'Cliente actualizado', 'Clientes', cliente.nombre);
  save();
  return res.json({ cliente });
});

router.delete('/:id', allow(), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (cliente.saldo > 0) return res.status(400).json({ error: 'No se puede desactivar un cliente con saldo pendiente.' });
  cliente.activo = false;
  audit(db, req, 'Cliente desactivado', 'Clientes', cliente.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
