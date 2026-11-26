const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso } = require('../auth');
const { nextId, audit, num, round2, matches } = require('../utils');
const { pedidoResumen } = require('../services');
const { esCoordenaValida } = require('../geo');
const { asignarCliente, distribuidorDeVendedor, tiposClienteOrdenados } = require('../asignacion');

const router = express.Router();
router.use(authRequired);

// Todos pueden VER clientes; solo supervisión/cobranzas o el vendedor
// asignado pueden modificarlos.
function puedeGestionar(req, cliente) {
  if (['admin', 'dueno', 'supervisor', 'cobranzas'].includes(req.user.rol)) return true;
  return Number(cliente.vendedor_id) === Number(req.user.id);
}

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
  const zonasActivas = (db.zonas || []).filter((z) => z.activa !== false);
  const zonas = [...new Set([...zonasActivas.map((z) => z.nombre), ...db.clientes.map((c) => c.zona)].filter(Boolean))].sort();
  const tiposActivos = (db.tipos_cliente || []).filter((t) => t.activo !== false);
  const rutasActivas = (db.rutas_venta || []).filter((r) => r.activa !== false);
  return res.json({
    clientes: clientes.sort((a, b) => b.comprado - a.comprado),
    zonas,
    zonasCatalogo: zonasActivas,
    tiposCliente: tiposActivos,
    tiposClienteOrdenados: tiposClienteOrdenados(db).filter((t) => t.activo !== false),
    rutasVenta: rutasActivas,
    vendedores: db.usuarios.filter((u) => u.activo && ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol)).map((u) => ({ id: u.id, nombre: u.nombre, ruta_venta: u.ruta_venta, zona_venta: u.zona_venta, repartidor_id: u.repartidor_id })),
    distribuidores: (db.repartidores || []).filter((r) => r.activo !== false),
    categorias: (db.cliente_categorias || []).filter((c) => c.activa !== false),
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

router.post('/', requirePermiso('clientes_crear'), allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas'), (req, res) => {
  const db = load();
  const { nombre, tipo, zona, direccion, telefono, whatsapp, email, limite_credito, contacto, notas, latitud, longitud, precision, ruta_venta, dia_visita, categoria_cliente_id } = req.body || {};
  if (!nombre) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
  const cliente = {
    id: nextId(db.clientes),
    codigo: `CLI-${String(nextId(db.clientes)).padStart(3, '0')}`,
    nombre: String(nombre).trim(),
    tipo: tipo || 'minorista',
    zona: zona || 'Centro',
    direccion: direccion || '',
    telefono: telefono || '',
    whatsapp: whatsapp || telefono || '',
    email: email || '',
    limite_credito: num(limite_credito, 0),
    saldo: 0,
    contacto: contacto || '',
    notas: notas || '',
    activo: true,
    created_at: new Date().toISOString(),
  };
  const vendedorCreador = db.usuarios.find((u) => u.id === req.user.id);
  const vendedorAsignado = req.body?.vendedor_id
    ? db.usuarios.find((u) => u.id === Number(req.body.vendedor_id))
    : vendedorCreador;
  const creados = asignarCliente(db, cliente, vendedorAsignado, req.body || {});
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
  audit(db, req, 'Cliente creado', 'Clientes', `${cliente.nombre} · ${creados.length ? creados.join(', ') : 'asignaciones existentes'}`);
  save();
  return res.status(201).json({ cliente, automatico: creados });
});

router.patch('/:id/bloqueo', allow('admin', 'dueno', 'cobranzas'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (!puedeGestionar(req, cliente)) return res.status(403).json({ error: 'Solo puedes gestionar los clientes que se te asignaron.' });
  const activar = req.body?.activo !== false;
  cliente.activo = activar;
  cliente.bloqueado_por_deuda = activar ? false : Boolean(req.body?.por_deuda);
  cliente.motivo_bloqueo = activar ? null : (req.body?.motivo || 'Bloqueo por administración');
  cliente.bloqueado_en = activar ? null : new Date().toISOString();
  audit(db, req, activar ? 'Cliente desbloqueado' : 'Cliente bloqueado', 'Clientes', `${cliente.nombre} · ${cliente.motivo_bloqueo || ''}`);
  save();
  return res.json({ cliente });
});

router.patch('/:id/reasignar', allow('admin', 'dueno', 'supervisor'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  const { vendedor_id, ruta_venta, zona, zona_id, reasignar_pedidos } = req.body || {};
  const vendedor = vendedor_id ? db.usuarios.find((u) => u.id === Number(vendedor_id)) : null;
  if (vendedor_id && !vendedor) return res.status(400).json({ error: 'Vendedor no encontrado.' });
  if (vendedor) {
    cliente.vendedor_id = vendedor.id;
    cliente.distribuidor_id = distribuidorDeVendedor(db, vendedor);
    if (!ruta_venta && vendedor.ruta_venta) cliente.ruta_venta = vendedor.ruta_venta;
    if (!zona && vendedor.zona_venta) cliente.zona = vendedor.zona_venta;
    if (!cliente.categoria_cliente_id && vendedor.categoria_cliente_id) cliente.categoria_cliente_id = vendedor.categoria_cliente_id;
    if (!cliente.dia_visita && vendedor.dias_visita?.length) cliente.dia_visita = vendedor.dias_visita[0];
  }
  if (ruta_venta) cliente.ruta_venta = ruta_venta;
  if (zona) cliente.zona = zona;
  const zonaDestino = zona_id
    ? (db.zonas || []).find((z) => z.id === Number(zona_id))
    : zona ? (db.zonas || []).find((z) => String(z.nombre).toLowerCase() === String(zona).toLowerCase()) : null;
  if (zonaDestino) {
    cliente.zona = zonaDestino.nombre;
    cliente.zona_id = zonaDestino.id;
  }
  const rutaDestino = (db.rutas_venta || []).find((r) => r.codigo === cliente.ruta_venta);
  cliente.ruta_venta_id = rutaDestino?.id || null;
  let pedidos = 0;
  if (reasignar_pedidos && vendedor) {
    db.pedidos.forEach((p) => {
      if (p.cliente_id !== cliente.id || p.estado === 'cancelado') return;
      p.vendedor_id = vendedor.id;
      if (p.saldo > 0 && !p.en_mora) p.responsable_cobro_id = vendedor.id;
      if (ruta_venta) p.ruta_venta = ruta_venta;
      if (cliente.distribuidor_id) p.repartidor_asignado_id = cliente.distribuidor_id;
      pedidos += 1;
    });
  }
  audit(db, req, 'Cliente reasignado', 'Clientes', `${cliente.nombre} → ${vendedor?.nombre || 'sin vendedor'} · ${pedidos} pedidos`);
  save();
  return res.json({ cliente, pedidos_reasignados: pedidos });
});

// Asignación masiva de clientes a un vendedor: hereda ruta, zona, día,
// categoría y distribuidor automáticamente desde el vendedor elegido.
router.post('/asignar-vendedor', allow('admin', 'dueno', 'supervisor', 'ventas'), (req, res) => {
  const db = load();
  const { cliente_ids, vendedor_id, ruta_venta, zona, dia_visita } = req.body || {};
  const vendedor = db.usuarios.find((u) => u.id === Number(vendedor_id));
  if (!vendedor) return res.status(400).json({ error: 'Selecciona un vendedor válido.' });
  const ids = Array.isArray(cliente_ids) ? cliente_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un cliente.' });
  const clientes = db.clientes.filter((c) => ids.includes(c.id));
  if (!clientes.length) return res.status(404).json({ error: 'No se encontraron los clientes seleccionados.' });
  const creados = [];
  clientes.forEach((cliente) => {
    creados.push(...asignarCliente(db, cliente, vendedor, { vendedor_id: vendedor.id, ruta_venta, zona, dia_visita }));
  });
  audit(db, req, 'Clientes asignados', 'Clientes', `${clientes.length} clientes → ${vendedor.nombre}`);
  save();
  return res.json({
    asignados: clientes.length,
    distribuidor_id: distribuidorDeVendedor(db, vendedor),
    automatico: [...new Set(creados)],
  });
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
      whatsapp: String(valor(fila, 'whatsapp', 'WhatsApp', 'WHATSAPP') || telefono).trim(),
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

router.put('/:id', requirePermiso('clientes_editar'), allow('ventas', 'preventista', 'vendedor_camion', 'cobranzas'), (req, res) => {
  const db = load();
  const cliente = db.clientes.find((c) => c.id === Number(req.params.id));
  if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
  if (!puedeGestionar(req, cliente)) return res.status(403).json({ error: 'Solo puedes gestionar los clientes que se te asignaron.' });
  const campos = ['nombre', 'tipo', 'zona', 'direccion', 'telefono', 'whatsapp', 'email', 'contacto', 'notas', 'activo'];
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
  if (!puedeGestionar(req, cliente)) return res.status(403).json({ error: 'Solo puedes gestionar los clientes que se te asignaron.' });
  if (cliente.saldo > 0) return res.status(400).json({ error: 'No se puede desactivar un cliente con saldo pendiente.' });
  cliente.activo = false;
  audit(db, req, 'Cliente desactivado', 'Clientes', cliente.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
