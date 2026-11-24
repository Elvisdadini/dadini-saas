const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { nextId, audit } = require('../utils');
const { asegurarZona, asegurarTipoCliente, tiposClienteOrdenados, asignarCliente, sincronizarAsignaciones } = require('../asignacion');

// Resuelve una lista de zonas (por id o por nombre) y conserva las que ya
// existen. `zona` simple se mantiene por compatibilidad con el resto del sistema.
function resolverZonas(db, body, vendedor) {
  const candidatos = [];
  const ids = Array.isArray(body?.zona_ids) ? body.zona_ids
    : Array.isArray(body?.zonas_ids) ? body.zonas_ids
      : Array.isArray(body?.zonas) ? body.zonas : [];
  ids.forEach((id) => {
    const zona = (db.zonas || []).find((z) => z.id === Number(id) || z.id === id);
    if (zona) candidatos.push(zona.nombre);
  });
  (Array.isArray(body?.zonas_nombres) ? body.zonas_nombres : []).forEach((nombre) => {
    if (nombre) candidatos.push(String(nombre));
  });
  if (body?.zona) candidatos.push(String(body.zona));
  if (!candidatos.length && vendedor?.zona_venta) candidatos.push(vendedor.zona_venta);
  if (!candidatos.length) candidatos.push('Centro');

  const vistos = new Set();
  const zonas = [];
  candidatos.forEach((nombre) => {
    const zona = asegurarZona(db, nombre);
    const clave = zona.nombre.toLowerCase();
    if (vistos.has(clave)) return;
    vistos.add(clave);
    zonas.push(zona);
  });
  return zonas;
}

// Normaliza la programación por día: máximo 3 zonas por día. Se guarda en
// `zonas_por_dia` y se unifica en `zona_ids`/`zonas` para compatibilidad.
function normalizarProgramacion(db, dias, zonasPorDia) {
  const brutas = Array.isArray(dias) ? dias : [dias];
  const diasFinales = [...new Set(brutas.map(Number).filter((d) => d >= 1 && d <= 7))].sort((a, b) => a - b);
  const diasUtiles = diasFinales.length ? diasFinales : [1];
  const porDia = {};
  const todas = new Set();

  diasUtiles.forEach((dia) => {
    const valor = zonasPorDia?.[dia] ?? zonasPorDia?.[String(dia)] ?? [];
    const lista = Array.isArray(valor) ? valor : [];
    const ids = [];
    lista.forEach((item) => {
      if (ids.length >= 3) return;
      const zona = (db.zonas || []).find((z) => z.id === Number(item) || z.id === item
        || String(z.nombre || '').toLowerCase() === String(item || '').toLowerCase());
      if (zona && !ids.includes(zona.id)) ids.push(zona.id);
    });
    porDia[dia] = ids;
    ids.forEach((id) => todas.add(id));
  });

  const zonas = [...todas].map((id) => (db.zonas || []).find((z) => z.id === id)).filter(Boolean);
  return { dias: diasUtiles, porDia, zonas };
}

function tiposValidos(db, ids) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.map(Number))]
    .filter((id) => (db.tipos_cliente || []).some((t) => t.id === id && t.activo !== false));
}

const router = express.Router();
router.use(authRequired);

const GESTION = ['admin', 'dueno', 'supervisor', 'ventas', 'preventista'];

router.get('/', (req, res) => {
  const db = load();
  const todos = req.query.todos === 'true';
  const activas = (lista, campo = 'activa') => todos ? lista : lista.filter((x) => x?.[campo] !== false);
  const vendedores = db.usuarios
    .filter((u) => ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol) && u.activo)
    .map((u) => ({
      id: u.id, nombre: u.nombre, rol: u.rol, ruta_venta: u.ruta_venta || null,
      zona_venta: u.zona_venta || null, dias_visita: u.dias_visita || [],
      repartidor_id: u.repartidor_id || null, categoria_cliente_id: u.categoria_cliente_id || null,
    }));
  return res.json({
    rutas: activas([...(db.rutas_venta || [])].sort((a, b) => a.codigo.localeCompare(b.codigo))),
    zonas: activas(db.zonas || []),
    tipos_cliente: activas(db.tipos_cliente || [], 'activo'),
    tipos_cliente_ordenados: tiposClienteOrdenados(db).filter((t) => todos || t.activo !== false),
    categorias: activas(db.cliente_categorias || []),
    vendedores,
    distribuidores: (db.repartidores || []).filter((r) => r.activo),
  });
});

router.post('/', allow(...GESTION), (req, res) => {
  const db = load();
  const {
    codigo, nombre, zona, zona_ids, zonas_ids, zonas_nombres, dia_visita, dias_visita,
    zonas_por_dia, tipos_cliente_ids, vendedor_id, distribuidor_id, activa,
  } = req.body || {};
  const vendedor = db.usuarios.find((u) => u.id === Number(vendedor_id));
  if (!vendedor) return res.status(400).json({ error: 'Selecciona un vendedor válido.' });
  const programacion = normalizarProgramacion(
    db,
    dias_visita || [dia_visita || Number(vendedor.dias_visita?.[0]) || 1],
    zonas_por_dia,
  );
  const zonas = programacion.zonas.length
    ? programacion.zonas
    : resolverZonas(db, { zona, zona_ids, zonas_ids, zonas_nombres }, vendedor);
  const zonaObj = zonas[0];
  const distribuidor = distribuidor_id
    ? Number(distribuidor_id)
    : (vendedor.repartidor_id ? Number(vendedor.repartidor_id) : null);
  const codigoFinal = String(codigo || '').trim() || `R${(db.rutas_venta || []).length + 1}`;
  if ((db.rutas_venta || []).some((r) => String(r.codigo).toLowerCase() === codigoFinal.toLowerCase())) {
    return res.status(400).json({ error: 'Ya existe una ruta con ese código.' });
  }
  const dia = programacion.dias[0];
  const ruta = {
    id: nextId(db.rutas_venta),
    codigo: codigoFinal,
    nombre: String(nombre || '').trim() || `Ruta ${codigoFinal}`,
    zona: zonaObj.nombre,
    zona_id: zonaObj.id,
    zona_ids: zonas.map((z) => z.id),
    zonas: zonas.map((z) => z.nombre),
    dia_visita: dia,
    dias_visita: programacion.dias,
    zonas_por_dia: programacion.zonas.length ? programacion.porDia : { [dia]: zonas.map((z) => z.id) },
    tipos_cliente_ids: tiposValidos(db, tipos_cliente_ids),
    vendedor_id: vendedor.id,
    distribuidor_id: distribuidor,
    activa: activa !== false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  db.rutas_venta.push(ruta);
  if (!vendedor.ruta_venta) vendedor.ruta_venta = ruta.codigo;
  if (!vendedor.zona_venta) vendedor.zona_venta = ruta.zona;
  if (!vendedor.repartidor_id && distribuidor) vendedor.repartidor_id = distribuidor;
  vendedor.dias_visita = [...new Set([...(vendedor.dias_visita || []).map(Number), ...programacion.dias])].sort((a, b) => a - b);
  audit(db, req, 'Ruta de venta creada', 'Rutas de venta', `${ruta.codigo} · ${zonas.map((z) => z.nombre).join(', ')} · días ${programacion.dias.join(', ')} · ${vendedor.nombre}`);
  save();
  return res.status(201).json({ ruta, automatico: { zonas_creadas: zonas.filter((z) => z.creada).length, distribuidor_id: distribuidor } });
});

router.put('/:id', allow(...GESTION), (req, res) => {
  const db = load();
  const ruta = (db.rutas_venta || []).find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta de venta no encontrada.' });
  const {
    codigo, nombre, zona, zona_ids, zonas_ids, zonas_nombres, dia_visita, dias_visita,
    zonas_por_dia, tipos_cliente_ids, vendedor_id, distribuidor_id, activa,
  } = req.body || {};
  const vendedorActual = db.usuarios.find((u) => u.id === Number(ruta.vendedor_id));
  if (vendedor_id) {
    const vendedor = db.usuarios.find((u) => u.id === Number(vendedor_id));
    if (!vendedor) return res.status(400).json({ error: 'Vendedor no encontrado.' });
    ruta.vendedor_id = vendedor.id;
    if (distribuidor_id === undefined && vendedor.repartidor_id) ruta.distribuidor_id = Number(vendedor.repartidor_id);
  }
  if (codigo !== undefined) ruta.codigo = String(codigo || ruta.codigo).trim();
  if (nombre !== undefined) ruta.nombre = nombre;
  if (zona !== undefined || zona_ids !== undefined || zonas_ids !== undefined || zonas_nombres !== undefined) {
    const zonas = resolverZonas(db, { zona, zona_ids, zonas_ids, zonas_nombres }, vendedorActual);
    ruta.zona = zonas[0].nombre;
    ruta.zona_id = zonas[0].id;
    ruta.zona_ids = zonas.map((z) => z.id);
    ruta.zonas = zonas.map((z) => z.nombre);
  }
  if (dias_visita !== undefined || dia_visita !== undefined || zonas_por_dia !== undefined) {
    const programacion = normalizarProgramacion(
      db,
      dias_visita !== undefined ? dias_visita : (ruta.dias_visita || [dia_visita || ruta.dia_visita || 1]),
      zonas_por_dia || ruta.zonas_por_dia,
    );
    ruta.dias_visita = programacion.dias;
    ruta.dia_visita = programacion.dias[0];
    ruta.zonas_por_dia = programacion.porDia;
    if (programacion.zonas.length) {
      ruta.zona = programacion.zonas[0].nombre;
      ruta.zona_id = programacion.zonas[0].id;
      ruta.zona_ids = programacion.zonas.map((z) => z.id);
      ruta.zonas = programacion.zonas.map((z) => z.nombre);
    }
    const vendedorRuta = db.usuarios.find((u) => u.id === Number(ruta.vendedor_id));
    if (vendedorRuta) {
      vendedorRuta.dias_visita = [...new Set([...(vendedorRuta.dias_visita || []).map(Number), ...programacion.dias])].sort((a, b) => a - b);
    }
  }
  if (tipos_cliente_ids !== undefined) ruta.tipos_cliente_ids = tiposValidos(db, tipos_cliente_ids);
  if (distribuidor_id !== undefined) ruta.distribuidor_id = distribuidor_id ? Number(distribuidor_id) : null;
  if (activa !== undefined) ruta.activa = Boolean(activa);
  ruta.updated_at = new Date().toISOString();
  audit(db, req, 'Ruta de venta actualizada', 'Rutas de venta', ruta.codigo);
  save();
  return res.json({ ruta });
});

router.patch('/:id/estado', allow(...GESTION), (req, res) => {
  const db = load();
  const ruta = (db.rutas_venta || []).find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta de venta no encontrada.' });
  ruta.activa = req.body?.activa !== false;
  ruta.updated_at = new Date().toISOString();
  audit(db, req, ruta.activa ? 'Ruta de venta activada' : 'Ruta de venta desactivada', 'Rutas de venta', ruta.codigo);
  save();
  return res.json({ ruta });
});

router.delete('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const ruta = (db.rutas_venta || []).find((r) => r.id === Number(req.params.id));
  if (!ruta) return res.status(404).json({ error: 'Ruta de venta no encontrada.' });
  db.rutas_venta = db.rutas_venta.filter((r) => r.id !== ruta.id);
  audit(db, req, 'Ruta de venta eliminada', 'Rutas de venta', ruta.codigo);
  save();
  return res.json({ ok: true });
});

router.post('/zonas', allow(...GESTION), (req, res) => {
  const db = load();
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre de la zona.' });
  const zona = asegurarZona(db, nombre);
  if (!zona.creada) return res.status(400).json({ error: 'Esa zona ya existe.' });
  audit(db, req, 'Zona creada', 'Rutas de venta', zona.nombre);
  save();
  return res.status(201).json({ zona });
});

router.post('/tipos', allow(...GESTION), (req, res) => {
  const db = load();
  const nombre = String(req.body?.nombre || '').trim();
  const padreId = req.body?.padre_id ? Number(req.body.padre_id) : null;
  if (!nombre) return res.status(400).json({ error: 'Escribe el nombre del tipo de cliente.' });
  if (padreId && !(db.tipos_cliente || []).some((t) => t.id === padreId)) {
    return res.status(400).json({ error: 'El tipo padre seleccionado no existe.' });
  }
  const tipo = asegurarTipoCliente(db, nombre, padreId);
  if (!tipo.creado) return res.status(400).json({ error: 'Ese tipo de cliente ya existe.' });
  audit(db, req, 'Tipo de cliente creado', 'Rutas de venta', `${padreId ? '↳ ' : ''}${tipo.nombre}`);
  save();
  return res.status(201).json({ tipo });
});

router.patch('/zonas/:id/estado', allow(...GESTION), (req, res) => {
  const db = load();
  const zona = (db.zonas || []).find((z) => z.id === Number(req.params.id));
  if (!zona) return res.status(404).json({ error: 'Zona no encontrada.' });
  zona.activa = Boolean(req.body?.activa);
  save();
  return res.json({ zona });
});

router.delete('/zonas/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const zona = (db.zonas || []).find((z) => z.id === Number(req.params.id));
  if (!zona) return res.status(404).json({ error: 'Zona no encontrada.' });
  const clientes = (db.clientes || []).filter((c) => Number(c.zona_id) === zona.id || c.zona === zona.nombre).length;
  const rutas = (db.rutas_venta || []).filter((r) => Number(r.zona_id) === zona.id || (r.zona_ids || []).map(Number).includes(zona.id) || r.zona === zona.nombre).length;
  const vendedores = (db.usuarios || []).filter((u) => u.zona_venta === zona.nombre).length;
  const usos = [];
  if (clientes) usos.push(`${clientes} clientes`);
  if (rutas) usos.push(`${rutas} rutas`);
  if (vendedores) usos.push(`${vendedores} vendedores`);
  if (usos.length) return res.status(400).json({ error: `No se puede eliminar: la zona está en uso por ${usos.join(', ')}.` });
  db.zonas = db.zonas.filter((z) => z.id !== zona.id);
  audit(db, req, 'Zona eliminada', 'Rutas de venta', zona.nombre);
  save();
  return res.json({ ok: true });
});

router.patch('/tipos/:id/estado', allow(...GESTION), (req, res) => {
  const db = load();
  const tipo = (db.tipos_cliente || []).find((t) => t.id === Number(req.params.id));
  if (!tipo) return res.status(404).json({ error: 'Tipo de cliente no encontrado.' });
  tipo.activo = Boolean(req.body?.activo);
  save();
  return res.json({ tipo });
});

router.delete('/tipos/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const tipo = (db.tipos_cliente || []).find((t) => t.id === Number(req.params.id));
  if (!tipo) return res.status(404).json({ error: 'Tipo de cliente no encontrado.' });
  const clientes = (db.clientes || []).filter((c) => Number(c.tipo_cliente_id) === tipo.id || String(c.tipo || '').toLowerCase() === tipo.nombre.toLowerCase()).length;
  const hijos = (db.tipos_cliente || []).filter((t) => Number(t.padre_id) === tipo.id).length;
  const usos = [];
  if (clientes) usos.push(`${clientes} clientes`);
  if (hijos) usos.push(`${hijos} subtipos`);
  if (usos.length) return res.status(400).json({ error: `No se puede eliminar: el tipo está en uso por ${usos.join(', ')}.` });
  db.tipos_cliente = db.tipos_cliente.filter((t) => t.id !== tipo.id);
  audit(db, req, 'Tipo de cliente eliminado', 'Rutas de venta', tipo.nombre);
  save();
  return res.json({ ok: true });
});

// Crea o completa zonas y tipos que falten, y vuelve a derivar el
// distribuidor de cada cliente/ruta desde el vendedor asignado.
router.post('/sincronizar', allow(...GESTION), (req, res) => {
  const db = load();
  (db.clientes || []).forEach((c) => asignarCliente(db, c, db.usuarios.find((u) => u.id === c.vendedor_id), {}));
  const actualizados = sincronizarAsignaciones(db);
  audit(db, req, 'Asignaciones sincronizadas', 'Rutas de venta', `${actualizados} registros actualizados`);
  save();
  return res.json({
    ok: true,
    actualizados,
    zonas: (db.zonas || []).length,
    tipos_cliente: (db.tipos_cliente || []).length,
    rutas_venta: (db.rutas_venta || []).length,
  });
});

module.exports = router;
