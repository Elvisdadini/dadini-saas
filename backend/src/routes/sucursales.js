const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit, nextId, round2 } = require('../utils');
const tenant = require('../tenant');

const router = express.Router();
router.use(authRequired);

function publica(db, sucursal) {
  const pedidos = (db.pedidos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id) && p.estado !== 'cancelado');
  return {
    ...sucursal,
    clientes: (db.clientes || []).filter((c) => Number(c.sucursal_id || 1) === Number(sucursal.id)).length,
    pedidos: pedidos.length,
    ventas: round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0)),
    productos: (db.productos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id)).length,
    usuarios: (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursal.id)).length,
    cartera: round2(pedidos.reduce((s, p) => s + Number(p.saldo || 0), 0)),
  };
}

function visibles(req, db) {
  const lista = db.sucursales || [];
  if (req.user.rol === 'dueno') return lista;
  const propias = lista.filter((s) => Number(s.id) === Number(req.user.sucursal_id || 1));
  const hijas = lista.filter((s) => Number(s.padre_id) === Number(req.user.sucursal_id || 1));
  return [...propias, ...hijas];
}

router.get('/', (req, res) => {
  const db = tenant.dbReal() || load();
  const lista = visibles(req, db).map((s) => publica(db, s));
  return res.json({ sucursales: lista, total: lista.length, actual: req.sucursal_id || 1 });
});

router.get('/mi', (req, res) => {
  const db = tenant.dbReal() || load();
  const sucursal = (db.sucursales || []).find((s) => Number(s.id) === Number(req.sucursal_id || 1));
  return res.json({
    sucursal: publica(db, sucursal || { id: 1, nombre: 'Casa Matriz', codigo: 'CASA-MATRIZ' }),
    disponibles: visibles(req, db).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })),
  });
});

router.post('/', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const nombre = String(req.body?.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Indica el nombre de la sucursal.' });
  const sucursal = {
    id: nextId(db.sucursales),
    codigo: String(req.body?.codigo || '').trim().toUpperCase() || `SUC-${String(nextId(db.sucursales)).padStart(3, '0')}`,
    nombre, direccion: String(req.body?.direccion || ''), activa: req.body?.activa !== false,
    empresa: String(req.body?.empresa || '').trim() || db.configuracion?.empresa?.nombre || 'DADINI',
    padre_id: req.body?.padre_id ? Number(req.body.padre_id) : null,
    administrador_id: req.body?.administrador_id ? Number(req.body.administrador_id) : null,
    created_at: new Date().toISOString(),
  };
  if ((db.sucursales || []).some((s) => s.codigo === sucursal.codigo)) return res.status(400).json({ error: 'Ese código ya existe.' });
  db.sucursales.push(sucursal);
  audit(db, req, 'Sucursal creada', 'Sucursales', `${sucursal.codigo} · ${nombre}`);
  save();
  return res.status(201).json({ ok: true, sucursal: publica(tenant.dbReal() || db, sucursal) });
});

router.put('/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const sucursal = (db.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  ['nombre', 'codigo', 'direccion', 'activa'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) sucursal[campo] = campo === 'activa' ? req.body[campo] === true || req.body[campo] === 'true' : String(req.body[campo]).trim();
  });
  audit(db, req, 'Sucursal actualizada', 'Sucursales', sucursal.nombre);
  save();
  return res.json({ ok: true, sucursal });
});

router.post('/:id/usuarios', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  const ids = Array.isArray(req.body?.usuario_ids) ? req.body.usuario_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un usuario.' });
  const asignados = [];
  (real.usuarios || []).forEach((u) => {
    if (ids.includes(Number(u.id))) { u.sucursal_id = sucursal.id; asignados.push(u.nombre); }
  });
  audit(db, req, 'Usuarios asignados a sucursal', 'Sucursales', `${sucursal.nombre} · ${asignados.length} usuarios`);
  save();
  return res.json({ ok: true, asignados });
});

// Migración selectiva de datos entre sucursales/empresas del sistema.
const IMPORTABLES = {
  almacenes: [], producto_categorias: [], producto_marcas: [], productos: { categoria_id: 'producto_categorias', marca_id: 'producto_marcas' },
  cliente_categorias: [], zonas: [], tipos_cliente: [], rutas_venta: { zona_id: 'zonas' },
  clientes: { zona_id: 'zonas', ruta_venta_id: 'rutas_venta', categoria_cliente_id: 'cliente_categorias' },
  proveedores: [], stock: { producto_id: 'productos', almacen_id: 'almacenes' },
  promociones: [], cajas: [],
};

router.get('/importables', allow('admin', 'dueno'), (req, res) => {
  const db = tenant.dbReal() || load();
  const origen = Number(req.query.origen_id) || Number(req.user.sucursal_id || 1);
  const opciones = Object.keys(IMPORTABLES).map((clave) => ({
    clave,
    filas: (db[clave] || []).filter((f) => Number(f.sucursal_id || 1) === origen).length,
  }));
  res.json({ origen_id: origen, entidades: opciones });
});

router.post('/:id/importar', (req, res) => {
  if (req.user.rol !== 'dueno') return res.status(403).json({ error: 'Solo el dueño del sistema puede migrar datos entre sucursales.' });
  const db = tenant.dbReal() || load();
  const destino = Number(req.params.id);
  const origen = Number(req.body?.origen_id);
  const destinoObj = (db.sucursales || []).find((s) => s.id === destino);
  if (!destinoObj) return res.status(404).json({ error: 'Sucursal destino no encontrada.' });
  if (!origen || origen === destino) return res.status(400).json({ error: 'Selecciona una sucursal de origen distinta.' });
  const seleccion = Array.isArray(req.body?.entidades) ? req.body.entidades.map(String) : [];
  if (!seleccion.length) return res.status(400).json({ error: 'Selecciona al menos un tipo de datos a migrar.' });
  const mapas = {};
  const resultado = {};
  const orden = Object.keys(IMPORTABLES).filter((k) => seleccion.includes(k));
  orden.forEach((clave) => {
    const filasOrigen = (db[clave] || []).filter((f) => Number(f.sucursal_id || 1) === origen);
    let siguiente = (db[clave] || []).reduce((m, f) => Math.max(m, Number(f.id) || 0), 0) + 1;
    const mapa = new Map();
    const copias = filasOrigen.map((fila) => {
      const copia = JSON.parse(JSON.stringify(fila));
      const anterior = Number(fila.id);
      const nuevo = siguiente++;
      mapa.set(anterior, nuevo);
      copia.id = nuevo;
      copia.sucursal_id = destino;
      Object.entries(IMPORTABLES[clave] || {}).forEach(([campo, entidad]) => {
        const ref = mapas[entidad];
        if (ref && copia[campo] !== undefined && copia[campo] !== null) {
          copia[campo] = ref.get(Number(copia[campo])) || copia[campo];
        }
      });
      return copia;
    });
    mapas[clave] = mapa;
    if (copias.length) {
      if (!Array.isArray(db[clave])) db[clave] = [];
      db[clave].push(...copias);
    }
    resultado[clave] = copias.length;
  });
  audit(db, req, 'Datos migrados entre sucursales', 'Sucursales', `${origen} → ${destino} · ${JSON.stringify(resultado)}`);
  save();
  return res.json({ ok: true, destino_id: destino, origen_id: origen, migrado: resultado });
});

module.exports = router;
