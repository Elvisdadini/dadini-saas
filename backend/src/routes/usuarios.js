const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, hash } = require('../auth');
const { nextId, audit, matches, num } = require('../utils');

const router = express.Router();
router.use(authRequired, allow());

const ROLES = ['admin', 'dueno', 'supervisor', 'ventas', 'preventista', 'vendedor_camion', 'almacen', 'distribucion', 'cobranzas'];

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
    resumen: { total: db.usuarios.length, activos: db.usuarios.filter((u) => u.activo).length, admins: db.usuarios.filter((u) => u.rol === 'admin').length },
  });
});

router.post('/', (req, res) => {
  const db = load();
  const { nombre, email, rol, cargo, telefono, password, repartidor_id, vehiculo_id, ruta_venta, dias_visita, zona_venta, categoria_cliente_id, es_venta_directa, almacen_movil_id, salario_base, comision_venta_pct, comision_distribucion_pct, bono_fijo, descuento_fijo, antiguedad_anios } = req.body || {};
  if (!nombre || !email || !rol) return res.status(400).json({ error: 'Nombre, correo y rol son obligatorios.' });
  if (!ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  if (db.usuarios.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) return res.status(400).json({ error: 'Ya existe un usuario con ese correo.' });
  const user = {
    id: nextId(db.usuarios),
    nombre,
    email: String(email).toLowerCase().trim(),
    rol,
    cargo: cargo || '',
    telefono: telefono || '',
    repartidor_id: repartidor_id ? Number(repartidor_id) : null,
    vehiculo_id: vehiculo_id ? Number(vehiculo_id) : null,
    ruta_venta: ruta_venta || null,
    dias_visita: Array.isArray(dias_visita) ? dias_visita.map(Number) : [],
    zona_venta: zona_venta || null,
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
    created_at: new Date().toISOString(),
    ultimo_acceso: null,
  };
  db.usuarios.push(user);
  audit(db, req, 'Usuario creado', 'Usuarios', `${user.nombre} · ${user.rol}`);
  save();
  const { password: _p, ...safe } = user;
  return res.status(201).json({ usuario: safe });
});

router.put('/:id', (req, res) => {
  const db = load();
  const user = db.usuarios.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado.' });
  const { nombre, email, rol, cargo, telefono, activo } = req.body || {};
  if (rol && !ROLES.includes(rol)) return res.status(400).json({ error: 'Rol inválido.' });
  if (email && db.usuarios.some((u) => u.id !== user.id && u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(400).json({ error: 'Ese correo ya está en uso.' });
  }
  if (activo === false && user.id === req.user.id) return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
  if (rol && user.id === req.user.id && rol !== 'admin') return res.status(400).json({ error: 'No puedes quitarte el rol de administrador.' });
  ['nombre', 'email', 'rol', 'cargo', 'telefono'].forEach((c) => { if (req.body?.[c] !== undefined) user[c] = req.body[c]; });
  if (req.body?.repartidor_id !== undefined) user.repartidor_id = req.body.repartidor_id ? Number(req.body.repartidor_id) : null;
  if (req.body?.vehiculo_id !== undefined) user.vehiculo_id = req.body.vehiculo_id ? Number(req.body.vehiculo_id) : null;
  if (req.body?.ruta_venta !== undefined) user.ruta_venta = req.body.ruta_venta || null;
  if (req.body?.dias_visita !== undefined) user.dias_visita = Array.isArray(req.body.dias_visita) ? req.body.dias_visita.map(Number) : [];
  if (req.body?.zona_venta !== undefined) user.zona_venta = req.body.zona_venta || null;
  if (req.body?.categoria_cliente_id !== undefined) user.categoria_cliente_id = req.body.categoria_cliente_id ? Number(req.body.categoria_cliente_id) : null;
  if (req.body?.es_venta_directa !== undefined) user.es_venta_directa = Boolean(req.body.es_venta_directa);
  if (req.body?.almacen_movil_id !== undefined) user.almacen_movil_id = req.body.almacen_movil_id ? Number(req.body.almacen_movil_id) : null;
  ['salario_base', 'comision_venta_pct', 'comision_distribucion_pct', 'bono_fijo', 'descuento_fijo', 'antiguedad_anios'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) user[campo] = num(req.body[campo]);
  });
  if (activo !== undefined) user.activo = Boolean(activo);
  audit(db, req, 'Usuario actualizado', 'Usuarios', user.nombre);
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
