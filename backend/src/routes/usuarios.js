const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, hash } = require('../auth');
const { nextId, audit, matches, num } = require('../utils');
const { vehiculoDeRepartidor, vehiculoLibre } = require('../asignacion-vehiculo');
const { MODULOS, ACCIONES, PLANTILLAS, permisosPorRol, permisosPorPlantilla, normalizarPermisos } = require('../permisos');

const router = express.Router();
router.use(authRequired, allow());

const ROLES = ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'vendedor_camion', 'almacen', 'distribucion', 'cobranzas'];

// Asigna automáticamente el distribuidor con menos vendedores para equilibrar
// la carga entre repartidores activos.
function distribuidorAutomatico(db) {
  const activos = (db.repartidores || []).filter((r) => r.activo !== false);
  if (!activos.length) return null;
  return activos
    .map((r) => ({ repartidor: r, usuarios: db.usuarios.filter((u) => u.repartidor_id === r.id).length }))
    .sort((a, b) => a.usuarios - b.usuarios || a.repartidor.id - b.repartidor.id)[0].repartidor;
}

function generarUsuario(db, nombre) {
  const base = String(nombre || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '') || 'usuario';
  let candidato = base;
  let i = 1;
  while (db.usuarios.some((u) => String(u.usuario || '').toLowerCase() === candidato.toLowerCase())) {
    candidato = `${base}${i}`;
    i += 1;
  }
  return candidato;
}

router.get('/', (req, res) => {
  const db = load();
  const { search, rol } = req.query;
  let usuarios = db.usuarios.map(({ password, ...u }) => ({
    ...u,
    pedidos: db.pedidos.filter((p) => p.vendedor_id === u.id).length,
    ventas: db.pedidos.filter((p) => p.vendedor_id === u.id && p.estado !== 'cancelado').reduce((s, p) => s + p.total, 0),
  }));
  if (rol && rol !== 'todos') usuarios = usuarios.filter((u) => u.rol === rol);
  if (search) usuarios = usuarios.filter((u) => matches(`${u.nombre} ${u.email} ${u.cargo}`, search));
  return res.json({
    usuarios: usuarios.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    roles: ROLES,
    plantillas: PLANTILLAS,
    modulos: MODULOS,
    acciones: ACCIONES,
    resumen: { total: db.usuarios.length, activos: db.usuarios.filter((u) => u.activo).length, admins: db.usuarios.filter((u) => u.rol === 'admin').length },
  });
});

router.post('/', (req, res) => {
  const db = load();
  const { nombre, email, usuario, rol, cargo, telefono, whatsapp, password, pin, repartidor_id, vehiculo_id, ruta_venta, dias_visita, zona_venta, geocerca_activa, geocerca_radio_m, categoria_cliente_id, es_venta_directa, almacen_movil_id, salario_base, comision_venta_pct, comision_distribucion_pct, bono_fijo, descuento_fijo, antiguedad_anios, permisos, plantilla, bloqueos } = req.body || {};
  if (!nombre || !rol) return res.status(400).json({ error: 'Nombre y rol son obligatorios.' });
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  const nombreUsuario = String(usuario || '').trim() || generarUsuario(db, nombre);
  if (db.usuarios.some((u) => String(u.usuario || '').toLowerCase() === nombreUsuario.toLowerCase())) return res.status(400).json({ error: 'Ya existe un usuario con ese nombre de acceso.' });
  const correo = String(email || '').trim().toLowerCase() || `${nombreUsuario}@dadini.bo`;
  if (db.usuarios.some((u) => u.email.toLowerCase() === correo)) return res.status(400).json({ error: 'Ya existe un usuario con ese correo.' });
  if (pin && !/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
  const repartidor = repartidor_id ? (db.repartidores || []).find((r) => r.id === Number(repartidor_id)) : null;
  if (repartidor_id && !repartidor) return res.status(400).json({ error: 'El distribuidor seleccionado no existe.' });
  const esVendedor = ['ventas', 'preventista', 'vendedor_camion'].includes(rol);
  const asignado = repartidor || (esVendedor ? distribuidorAutomatico(db) : null);
  const vehiculoFinal = vehiculo_id
    ? Number(vehiculo_id)
    : rol === 'distribucion'
      ? (vehiculoLibre(db)?.id || null)
      : (vehiculoDeRepartidor(db, asignado?.id)?.id || null);
  const user = {
    id: nextId(db.usuarios),
    nombre,
    email: correo,
    usuario: nombreUsuario,
    rol,
    cargo: cargo || '',
    telefono: telefono || '',
    whatsapp: whatsapp || telefono || '',
    repartidor_id: asignado?.id || null,
    vehiculo_id: vehiculoFinal,
    ruta_venta: ruta_venta || null,
    dias_visita: Array.isArray(dias_visita) ? dias_visita.map(Number) : [],
    zona_venta: zona_venta || asignado?.zona || null,
    geocerca: {
      activa: geocerca_activa === true || geocerca_activa === 'true',
      radio_m: Math.max(1, Number(geocerca_radio_m) || 50),
    },
    geocerca_activa: geocerca_activa === true || geocerca_activa === 'true',
    geocerca_radio_m: Math.max(1, Number(geocerca_radio_m) || 50),
    categoria_cliente_id: categoria_cliente_id ? Number(categoria_cliente_id) : null,
    es_venta_directa: Boolean(es_venta_directa),
    almacen_movil_id: almacen_movil_id ? Number(almacen_movil_id) : null,
    salario_base: num(salario_base, 0),
    comision_venta_pct: num(comision_venta_pct, 0),
    comision_distribucion_pct: num(comision_distribucion_pct, 0),
    bono_fijo: num(bono_fijo, 0),
    descuento_fijo: num(descuento_fijo, 0),
    antiguedad_anios: num(antiguedad_anios, 0),
    motivo_bloqueo: null,
    bloqueado_en: null,
    activo: true,
    password: hash(password || 'Dadini2026!'),
    pin: pin ? hash(String(pin)) : null,
    created_at: new Date().toISOString(),
    ultimo_acceso: null,
    plantilla_permisos: plantilla || null,
    permisos: normalizarPermisos(permisos) || permisosPorPlantilla(plantilla) || permisosPorRol(rol),
    bloqueos: bloqueos && typeof bloqueos === 'object' ? { vender: false, cobrar: false, entregar: false, supervisar: false, ...bloqueos } : null,
  };
  db.usuarios.push(user);
  audit(db, req, 'Usuario creado', 'Usuarios', `${user.nombre} · ${user.rol}${asignado ? ` · distribuidor ${asignado.nombre}` : ''}`);
  save();
  const { password: _p, ...safe } = user;
  return res.status(201).json({ usuario: safe });
});

router.put('/:id', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { nombre, email, usuario, rol, cargo, telefono, whatsapp, activo, pin } = req.body || {};
  if (rol && !ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  if (email && db.usuarios.some((u) => u.id !== user.id && u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(400).json({ error: 'Ese correo ya está en uso.' });
  }
  if (usuario && db.usuarios.some((u) => u.id !== user.id && String(u.usuario || '').toLowerCase() === String(usuario).trim().toLowerCase())) {
    return res.status(400).json({ error: 'Ese nombre de acceso ya está en uso.' });
  }
  if (pin && !/^\d{4,8}$/.test(String(pin))) return res.status(400).json({ error: 'El PIN debe tener entre 4 y 8 dígitos.' });
  if (activo === false && user.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  if (rol && user.id === req.user.id && rol !== 'admin') return res.status(400).json({ error: 'No puedes quitarte el rol de administrador.' });
  ['nombre', 'email', 'rol', 'cargo', 'telefono', 'whatsapp'].forEach((c) => { if (req.body?.[c] !== undefined) user[c] = req.body[c]; });
  if (usuario !== undefined) user.usuario = String(usuario).trim() || user.usuario;
  if (req.body?.bloqueos && typeof req.body.bloqueos === 'object') user.bloqueos = { ...(user.bloqueos || {}), ...req.body.bloqueos };
  if (pin !== undefined) user.pin = pin ? hash(String(pin)) : null;
  if (req.body?.repartidor_id !== undefined) user.repartidor_id = req.body.repartidor_id ? Number(req.body.repartidor_id) : null;
  if (req.body?.vehiculo_id !== undefined) user.vehiculo_id = req.body.vehiculo_id ? Number(req.body.vehiculo_id) : null;
  // Al asignar un distribuidor se toma su camión; si el usuario ES distribuidor
  // y no tiene camión, se le asigna el primero disponible.
  if (req.body?.repartidor_id !== undefined && req.body?.vehiculo_id === undefined) {
    user.vehiculo_id = vehiculoDeRepartidor(db, user.repartidor_id)?.id || user.vehiculo_id || null;
  }
  if (user.rol === 'distribucion' && !user.vehiculo_id) user.vehiculo_id = vehiculoLibre(db)?.id || null;
  if (req.body?.ruta_venta !== undefined) user.ruta_venta = req.body.ruta_venta || null;
  if (req.body?.dias_visita !== undefined) user.dias_visita = Array.isArray(req.body.dias_visita) ? req.body.dias_visita.map(Number) : [];
  if (req.body?.zona_venta !== undefined) user.zona_venta = req.body.zona_venta || null;
  if (req.body?.geocerca_activa !== undefined || req.body?.geocerca_radio_m !== undefined) {
    const activa = req.body?.geocerca_activa !== undefined
      ? (req.body.geocerca_activa === true || req.body.geocerca_activa === 'true')
      : Boolean(user.geocerca?.activa || user.geocerca_activa);
    const radio = Math.max(1, Number(req.body?.geocerca_radio_m ?? user.geocerca?.radio_m ?? user.geocerca_radio_m) || 50);
    user.geocerca = { activa, radio_m: radio };
    user.geocerca_activa = activa;
    user.geocerca_radio_m = radio;
  }
  if (req.body?.categoria_cliente_id !== undefined) user.categoria_cliente_id = req.body.categoria_cliente_id ? Number(req.body.categoria_cliente_id) : null;
  if (req.body?.es_venta_directa !== undefined) user.es_venta_directa = Boolean(req.body.es_venta_directa);
  if (req.body?.almacen_movil_id !== undefined) user.almacen_movil_id = req.body.almacen_movil_id ? Number(req.body.almacen_movil_id) : null;
  ['salario_base', 'comision_venta_pct', 'comision_distribucion_pct', 'bono_fijo', 'descuento_fijo', 'antiguedad_anios'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) user[campo] = num(req.body[campo]);
  });
  if (req.body?.plantilla !== undefined) {
    user.plantilla_permisos = req.body.plantilla || null;
    if (req.body.permisos === undefined) user.permisos = permisosPorPlantilla(req.body.plantilla) || permisosPorRol(user.rol);
  }
  const permisosNormalizados = normalizarPermisos(req.body?.permisos);
  if (permisosNormalizados) user.permisos = permisosNormalizados;
  if (user.rol === 'admin' || user.rol === 'dueno') user.permisos = permisosPorRol(user.rol);
  if (activo !== undefined) user.activo = Boolean(activo);
  audit(db, req, 'Usuario actualizado', 'Usuarios', `${user.nombre} · ${(user.permisos || []).length} permisos`);
  save();
  const { password, ...safe } = user;
  return res.json({ usuario: safe });
});

router.patch('/:id/bloqueo', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (user.id === req.user.id && req.body?.activo === false) return res.status(400).json({ error: 'No puedes bloquear tu propia cuenta.' });
  user.activo = req.body?.activo !== false;
  user.motivo_bloqueo = user.activo ? null : (req.body?.motivo || 'Bloqueo por administración');
  user.bloqueado_en = user.activo ? null : new Date().toISOString();
  audit(db, req, user.activo ? 'Usuario desbloqueado' : 'Usuario bloqueado', 'Usuarios', user.nombre);
  save();
  const { password, ...safe } = user;
  return res.json({ usuario: safe });
});

router.post('/:id/password', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const nueva = req.body?.password || 'Dadini2026!';
  if (String(nueva).length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres.' });
  user.password = hash(String(nueva));
  audit(db, req, 'Contraseña restablecida', 'Usuarios', `Se restableció el acceso de ${user.nombre}`);
  save();
  return res.json({ ok: true, temporal: nueva });
});

// Activación rápida de una función para un usuario. El cambio se aplica a su
// próximo inicio de sesión (o al recargar /auth/me).
router.patch('/:id/permisos', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (user.rol === 'admin' || user.rol === 'dueno') return res.status(400).json({ error: 'Los administradores tienen todos los permisos.' });
  let permisos = Array.isArray(req.body?.permisos) ? normalizarPermisos(req.body.permisos) : null;
  if (!permisos) {
    permisos = Array.isArray(user.permisos) ? [...user.permisos] : permisosPorRol(user.rol);
    const codigo = req.body?.codigo;
    if (!codigo) return res.status(400).json({ error: 'Indica la función a activar.' });
    const activo = req.body?.activo !== false;
    if (activo && !permisos.includes(codigo)) permisos.push(codigo);
    if (!activo) permisos = permisos.filter((p) => p !== codigo);
  }
  user.permisos = permisos;
  user.plantilla_permisos = 'personalizado';
  audit(db, req, 'Permisos actualizados', 'Usuarios', `${user.nombre} · ${permisos.length} funciones activas`);
  save();
  const { password, ...safe } = user;
  return res.json({ usuario: safe, permisos });
});

router.delete('/:id', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  if (user.id === req.user.id) return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
  if (user.rol === 'admin' && db.usuarios.filter((u) => u.rol === 'admin' && u.activo).length <= 1) {
    return res.status(400).json({ error: 'Debe existir al menos un administrador activo.' });
  }
  user.activo = false;
  audit(db, req, 'Usuario desactivado', 'Usuarios', user.nombre);
  save();
  return res.json({ ok: true });
});

module.exports = router;
