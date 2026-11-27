const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow, requirePermiso, soloDueno } = require('../auth');
const { audit, nextId, round2 } = require('../utils');
const tenant = require('../tenant');
const empresas = require('../empresas');
const { permisosPorRol } = require('../permisos');

const router = express.Router();
router.use(authRequired);
// Sucursales y alta de empresas son funciones EXCLUSIVAS del dueño del sistema.
router.use(soloDueno);

function publica(db, sucursal) {
  const pedidos = (db.pedidos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id) && p.estado !== 'cancelado');
  const usuarios = (db.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursal.id));
  const porRol = {};
  Object.entries(empresas.ROLES_CUPADOS).forEach(([clave, roles]) => {
    porRol[clave] = usuarios.filter((u) => roles.includes(u.rol)).length;
  });
  return {
    ...sucursal,
    clientes: (db.clientes || []).filter((c) => Number(c.sucursal_id || 1) === Number(sucursal.id)).length,
    pedidos: pedidos.length,
    ventas: round2(pedidos.reduce((s, p) => s + Number(p.total || 0), 0)),
    productos: (db.productos || []).filter((p) => Number(p.sucursal_id || 1) === Number(sucursal.id)).length,
    usuarios: usuarios.length,
    por_rol: porRol,
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

function validarLimites(db, sucursalId, usuarios, excluirId = null) {
  const sucursal = (db.sucursales || []).find((s) => Number(s.id) === Number(sucursalId));
  if (!sucursal?.limites) return;
  const conteo = empresas.conteoPorRol(db, sucursalId);
  (Array.isArray(usuarios) ? usuarios : []).forEach((u) => {
    Object.keys(empresas.ROLES_CUPADOS).forEach((clave) => {
      if (!empresas.ROLES_CUPADOS[clave].includes(u.rol)) return;
      const limite = Number(sucursal.limites[clave]);
      if (Number.isFinite(limite) && limite > 0 && conteo[clave] >= limite) {
        const error = new Error(`La empresa alcanzó el límite de ${clave} (${conteo[clave]}/${limite}).`);
        error.status = 400;
        throw error;
      }
      conteo[clave] += 1;
    });
  });
}

function configuracionDelCuerpo(body, db) {
  const modulos = Array.isArray(body?.modulos) ? body.modulos.map(String)
    : (db.sucursales || []).find((s) => Number(s.id) === Number(body?.id))?.modulos || [];
  const limites = body?.limites && typeof body.limites === 'object' ? body.limites : {};
  const vigencia = body?.vigencia && typeof body.vigencia === 'object' ? body.vigencia : {};
  const notificacion = body?.notificacion && typeof body.notificacion === 'object' ? body.notificacion : {};
  return {
    modulos: modulos.filter((m) => empresas.MODULOS_CONTRATABLES.some((x) => x.id === m)),
    limites: {
      vendedores: limites.vendedores === '' || limites.vendedores === null ? null : Number(limites.vendedores) || null,
      distribucion: limites.distribucion === '' || limites.distribucion === null ? null : Number(limites.distribucion) || null,
      cobranzas: limites.cobranzas === '' || limites.cobranzas === null ? null : Number(limites.cobranzas) || null,
    },
    vigencia: { desde: vigencia.desde || null, hasta: vigencia.hasta || null },
    notificacion: {
      activa: notificacion.activa !== false,
      dias_anticipacion: Number(notificacion.dias_anticipacion) || 30,
      modo: notificacion.modo === 'automatico' ? 'automatico' : 'manual',
      ultima_enviada_para: notificacion.ultima_enviada_para || null,
      ultima_enviada_en: notificacion.ultima_enviada_en || null,
    },
  };
}

router.get('/', (req, res) => {
  const db = tenant.dbReal() || load();
  const lista = visibles(req, db).map((s) => publica(db, s));
  return res.json({ sucursales: lista, total: lista.length, actual: req.sucursal_id || 1 });
});

router.get('/opciones', (req, res) => {
  const db = tenant.dbReal() || load();
  return res.json({
    modulos: empresas.MODULOS_CONTRATABLES,
    roles_cupados: Object.keys(empresas.ROLES_CUPADOS),
    sucursales: (db.sucursales || []).map((s) => ({ id: s.id, nombre: s.nombre, empresa: s.empresa })),
  });
});

router.get('/mi', (req, res) => {
  const db = tenant.dbReal() || load();
  const sucursal = (db.sucursales || []).find((s) => Number(s.id) === Number(req.sucursal_id || 1));
  return res.json({
    sucursal: publica(db, sucursal || { id: 1, nombre: 'Casa Matriz', codigo: 'CASA-MATRIZ' }),
    disponibles: visibles(req, db).map((s) => ({ id: s.id, nombre: s.nombre, codigo: s.codigo })),
  });
});

// Alta atómica de una empresa: sucursal + módulos + límites + vigencia +
// notificación + primer administrador + migración opcional.
router.post('/alta-empresa', requirePermiso('sucursales.crear'), (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const body = req.body || {};
  const nombre = String(body.nombre || '').trim();
  if (!nombre) return res.status(400).json({ error: 'Indica el nombre de la empresa o sucursal.' });
  if (!Array.isArray(db.empresas)) db.empresas = [];
  if ((real.sucursales || []).some((s) => String(s.codigo).toLowerCase() === String(body.codigo || '').toLowerCase() && body.codigo)) {
    return res.status(400).json({ error: 'Ese código ya existe.' });
  }
  const idSucursal = nextId(real.sucursales);
  const empresa = {
    id: nextId(real.empresas),
    nombre: String(body.empresa || nombre).trim(),
    razon_social: String(body.razon_social || body.empresa || nombre).trim(),
    creada_por: req.user.id,
    created_at: new Date().toISOString(),
  };
  real.empresas.push(empresa);
  const cfg = configuracionDelCuerpo({ ...body, id: idSucursal }, db);
  const sucursal = {
    id: idSucursal,
    codigo: String(body.codigo || '').trim().toUpperCase() || `EMP-${String(idSucursal).padStart(3, '0')}`,
    nombre, direccion: String(body.direccion || ''), activa: body.activa !== false,
    empresa: empresa.nombre, razon_social: empresa.razon_social, empresa_id: empresa.id,
    padre_id: body.padre_id ? Number(body.padre_id) : null,
    administrador_id: null,
    ...cfg,
    created_at: new Date().toISOString(),
  };
  real.sucursales.push(sucursal);

  // Primer administrador de la empresa, con permisos según módulos activados.
  const admin = body.admin || {};
  const nombreAdmin = String(admin.nombre || '').trim();
  const usuarioAdmin = String(admin.usuario || '').trim();
  const emailAdmin = String(admin.email || '').trim().toLowerCase();
  if (!nombreAdmin || !usuarioAdmin || !emailAdmin) {
    real.sucursales = real.sucursales.filter((s) => s.id !== idSucursal);
    real.empresas = real.empresas.filter((e) => e.id !== empresa.id);
    return res.status(400).json({ error: 'Indica nombre, usuario y correo del administrador de la nueva empresa.' });
  }
  if ((real.usuarios || []).some((u) => String(u.usuario || '').toLowerCase() === usuarioAdmin.toLowerCase()
    || String(u.email || '').toLowerCase() === emailAdmin)) {
    real.sucursales = real.sucursales.filter((s) => s.id !== idSucursal);
    real.empresas = real.empresas.filter((e) => e.id !== empresa.id);
    return res.status(400).json({ error: 'Ya existe un usuario con ese acceso o correo.' });
  }
  const bcrypt = require('bcryptjs');
  const adminUser = {
    id: nextId(real.usuarios),
    nombre: nombreAdmin, email: emailAdmin, usuario: usuarioAdmin, rol: 'admin',
    cargo: 'Administrador de la empresa', telefono: String(admin.telefono || ''),
    whatsapp: String(admin.whatsapp || ''),
    password: bcrypt.hashSync(String(admin.password || 'Dadini2026!'), 10),
    pin: admin.pin ? bcrypt.hashSync(String(admin.pin), 10) : null,
    activo: true, sucursal_id: idSucursal,
    permisos: permisosParaModulos(cfg.modulos),
    plantilla_permisos: null,
    bloqueos: null,
    creado_por: req.user.id,
    created_at: new Date().toISOString(),
  };
  real.usuarios.push(adminUser);
  sucursal.administrador_id = adminUser.id;

  let migrado = null;
  if (body.migrar?.origen_id && Array.isArray(body.migrar?.entidades) && body.migrar.entidades.length) {
    try {
      migrado = migrarDatos(real, Number(body.migrar.origen_id), idSucursal, body.migrar.entidades);
    } catch (error) { migrado = { error: error.message }; }
  }

  empresas.notificar(db, `Empresa registrada: ${nombre}`, `${empresa.nombre} · módulos: ${cfg.modulos.join(', ') || 'ninguno'} · administrador: ${nombreAdmin}`, req.user.id);
  audit(db, req, 'Empresa registrada por el dueño', 'Sucursales', `${sucursal.codigo} · ${empresa.nombre}`);
  save();
  const { password, pin, ...seguro } = adminUser;
  return res.status(201).json({ ok: true, empresa, sucursal: publica(real, sucursal), administrador: seguro, migrado });
});

router.post('/', requirePermiso('sucursales.crear'), (req, res) => {
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
    ...configuracionDelCuerpo(req.body, db),
    created_at: new Date().toISOString(),
  };
  if ((db.sucursales || []).some((s) => s.codigo === sucursal.codigo)) return res.status(400).json({ error: 'Ese código ya existe.' });
  db.sucursales.push(sucursal);
  audit(db, req, 'Sucursal creada', 'Sucursales', `${sucursal.codigo} · ${nombre}`);
  save();
  return res.status(201).json({ ok: true, sucursal: publica(tenant.dbReal() || db, sucursal) });
});

router.put('/:id', requirePermiso('sucursales.editar'), (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  ['nombre', 'codigo', 'direccion', 'empresa', 'razon_social', 'activa'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) sucursal[campo] = campo === 'activa' ? req.body[campo] === true || req.body[campo] === 'true' : String(req.body[campo]).trim();
  });
  if (req.body?.padre_id !== undefined) sucursal.padre_id = req.body.padre_id ? Number(req.body.padre_id) : null;
  Object.assign(sucursal, configuracionDelCuerpo({ ...req.body, id: sucursal.id }, db));
  audit(db, req, 'Sucursal actualizada', 'Sucursales', sucursal.nombre);
  save();
  return res.json({ ok: true, sucursal: publica(real, sucursal) });
});

router.post('/:id/usuarios', requirePermiso('sucursales.editar'), (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  const ids = Array.isArray(req.body?.usuario_ids) ? req.body.usuario_ids.map(Number) : [];
  if (!ids.length) return res.status(400).json({ error: 'Selecciona al menos un usuario.' });
  const usuarios = (real.usuarios || []).filter((u) => ids.includes(Number(u.id)));
  const ya = (real.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === Number(sucursal.id) && !ids.includes(Number(u.id)));
  validarLimites(real, sucursal.id, [...ya, ...usuarios]);
  const asignados = [];
  usuarios.forEach((u) => { u.sucursal_id = sucursal.id; asignados.push(u.nombre); });
  audit(db, req, 'Usuarios asignados a sucursal', 'Sucursales', `${sucursal.nombre} · ${asignados.length} usuarios`);
  save();
  return res.json({ ok: true, asignados });
});

router.post('/:id/activar', (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  sucursal.activa = req.path.endsWith('/activar');
  audit(db, req, sucursal.activa ? 'Empresa activada' : 'Empresa desactivada', 'Sucursales', sucursal.nombre);
  save();
  return res.json({ ok: true, sucursal: publica(real, sucursal) });
});

router.post('/:id/desactivar', (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  sucursal.activa = false;
  audit(db, req, 'Empresa desactivada', 'Sucursales', sucursal.nombre);
  save();
  return res.json({ ok: true, sucursal: publica(real, sucursal) });
});

router.delete('/:id', (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const id = Number(req.params.id);
  const sucursal = (real.sucursales || []).find((s) => s.id === id);
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  if (id === 1 || Number(req.user.sucursal_id || 1) === id) {
    return res.status(400).json({ error: 'No puedes eliminar la casa matriz ni la empresa en la que estás trabajando.' });
  }
  const usuarios = (real.usuarios || []).filter((u) => Number(u.sucursal_id || 1) === id);
  real.usuarios = (real.usuarios || []).filter((u) => Number(u.sucursal_id || 1) !== id);
  // Se eliminan los datos propios de la empresa; los globales no se tocan.
  const tenantModule = require('../tenant');
  const { ENTIDADES } = require('../store');
  ENTIDADES.filter((e) => !tenantModule.GLOBALES?.has?.(e) && e !== 'sucursales' && e !== 'empresas').forEach((clave) => {
    if (Array.isArray(real[clave])) real[clave] = real[clave].filter((f) => Number(f.sucursal_id || 1) !== id);
  });
  real.sucursales = real.sucursales.filter((s) => s.id !== id);
  if (sucursal.empresa_id) real.empresas = (real.empresas || []).filter((e) => e.id !== Number(sucursal.empresa_id));
  audit(db, req, 'Empresa eliminada', 'Sucursales', `${sucursal.nombre} · ${usuarios.length} usuarios`);
  save();
  return res.json({ ok: true, eliminada: sucursal.nombre, usuarios_eliminados: usuarios.length });
});

router.post('/:id/notificar', (req, res) => {
  const db = load();
  const real = tenant.dbReal() || db;
  const sucursal = (real.sucursales || []).find((s) => s.id === Number(req.params.id));
  if (!sucursal) return res.status(404).json({ error: 'Sucursal no encontrada.' });
  const titulo = req.body?.titulo || `Aviso de ${sucursal.nombre}`;
  const detalle = String(req.body?.detalle || `Vigencia: ${sucursal.vigencia?.hasta || 'sin definir'} · Módulos: ${(sucursal.modulos || []).join(', ')}`);
  const enviada = empresas.notificar(db, titulo, detalle, req.user.id);
  if (enviada) {
    sucursal.notificacion = { ...(sucursal.notificacion || {}), ultima_enviada_en: new Date().toISOString() };
    audit(db, req, 'Notificación manual de empresa', 'Sucursales', sucursal.nombre);
    save();
  }
  return res.json({ ok: true, enviada, aviso: enviada ? null : 'Ya existe una notificación con ese título.' });
});

// Migración selectiva de datos entre sucursales/empresas del sistema.
const IMPORTABLES = {
  almacenes: [], producto_categorias: [], producto_marcas: [],
  productos: { categoria_id: 'producto_categorias', marca_id: 'producto_marcas' },
  cliente_categorias: [], zonas: [], tipos_cliente: [],
  rutas_venta: { zona_id: 'zonas' },
  clientes: { zona_id: 'zonas', ruta_venta_id: 'rutas_venta', categoria_cliente_id: 'cliente_categorias' },
  proveedores: [], stock: { producto_id: 'productos', almacen_id: 'almacenes' },
  promociones: [], cajas: [],
  // Atajos de la UI: se resuelven dentro de las coleccionesanteriores.
  listas_precios: [], productos_imagenes: [], mapeo_geocercas: [],
};

const ATAJOS = new Set(['listas_precios', 'productos_imagenes', 'mapeo_geocercas']);

function filasImportables(db, clave, origen) {
  if (clave === 'listas_precios') {
    return (db.cliente_categorias || []).filter((c) => Number(c.sucursal_id || 1) === origen)
      .flatMap((c) => (c.precios || []).map((p) => ({ ...p, categoria_id: c.id })));
  }
  if (clave === 'productos_imagenes') {
    return (db.productos || []).filter((p) => Number(p.sucursal_id || 1) === origen && p.imagen_url);
  }
  if (clave === 'mapeo_geocercas') {
    return (db.zonas || []).filter((z) => Number(z.sucursal_id || 1) === origen && (z.geocerca || z.geocerca_activa));
  }
  return (db[clave] || []).filter((f) => Number(f.sucursal_id || 1) === origen);
}

function requeridosDe(seleccion) {
  const requeridos = new Set(seleccion.filter((k) => !ATAJOS.has(k)));
  if (seleccion.includes('listas_precios')) requeridos.add('cliente_categorias');
  if (seleccion.includes('productos_imagenes')) requeridos.add('productos');
  if (seleccion.includes('mapeo_geocercas')) requeridos.add('zonas');
  return requeridos;
}

function postProcesar(clave, copia, mapas) {
  if (clave === 'cliente_categorias' && Array.isArray(copia.precios)) {
    copia.precios = copia.precios.map((p) => ({ ...p, producto_id: mapas.productos?.get(Number(p.producto_id)) || p.producto_id }));
  }
  if (clave === 'productos' && Array.isArray(copia.categorias_clientes)) {
    copia.categorias_clientes = copia.categorias_clientes.map((id) => mapas.cliente_categorias?.get(Number(id)) || id);
  }
  if (clave === 'rutas_venta') {
    ['zona_ids', 'tipos_cliente_ids'].forEach((campo) => {
      if (Array.isArray(copia[campo])) copia[campo] = copia[campo].map((id) => mapas.zonas?.get(Number(id)) || mapas.tipos_cliente?.get(Number(id)) || id);
    });
    if (copia.zonas_por_dia && typeof copia.zonas_por_dia === 'object') {
      Object.entries(copia.zonas_por_dia).forEach(([dia, ids]) => {
        copia.zonas_por_dia[dia] = Array.isArray(ids) ? ids.map((id) => mapas.zonas?.get(Number(id)) || id) : ids;
      });
    }
  }
}

function migrarDatos(db, origen, destino, seleccion) {
  const mapas = {};
  const resultado = {};
  const orden = Object.keys(IMPORTABLES).filter((k) => seleccion.includes(k) || requeridosDe(seleccion).has(k));
  orden.forEach((clave) => {
    if (ATAJOS.has(clave)) return;
    const filasOrigen = filasImportables(db, clave, origen);
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
      postProcesar(clave, copia, mapas);
      return copia;
    });
    mapas[clave] = mapa;
    if (copias.length) {
      if (!Array.isArray(db[clave])) db[clave] = [];
      db[clave].push(...copias);
    }
    resultado[clave] = copias.length;
  });
  // Segunda pasada para referencias que apuntan a colecciones migradas después.
  Object.keys(mapas).forEach((clave) => {
    if (!['cliente_categorias', 'productos', 'rutas_venta'].includes(clave)) return;
    (db[clave] || []).filter((f) => Number(f.sucursal_id || 1) === destino).slice(-mapas[clave].size)
      .forEach((copia) => postProcesar(clave, copia, mapas));
  });
  ['listas_precios', 'productos_imagenes', 'mapeo_geocercas'].forEach((clave) => {
    if (seleccion.includes(clave)) resultado[clave] = filasImportables(db, clave, origen).length;
  });
  return resultado;
}

router.get('/importables', (req, res) => {
  const db = tenant.dbReal() || load();
  const origen = Number(req.query.origen_id) || Number(req.user.sucursal_id || 1);
  const opciones = Object.keys(IMPORTABLES).map((clave) => ({
    clave, filas: filasImportables(db, clave, origen).length,
  }));
  res.json({ origen_id: origen, entidades: opciones });
});

router.post('/:id/importar', requirePermiso('sucursales.migrar'), (req, res) => {
  const db = tenant.dbReal() || load();
  const destino = Number(req.params.id);
  const origen = Number(req.body?.origen_id);
  const destinoObj = (db.sucursales || []).find((s) => s.id === destino);
  if (!destinoObj) return res.status(404).json({ error: 'Sucursal destino no encontrada.' });
  if (!origen || origen === destino) return res.status(400).json({ error: 'Selecciona una sucursal de origen distinta.' });
  const seleccion = Array.isArray(req.body?.entidades) ? req.body.entidades.map(String) : [];
  if (!seleccion.length) return res.status(400).json({ error: 'Selecciona al menos un tipo de datos a migrar.' });
  const resultado = migrarDatos(db, origen, destino, seleccion);
  audit(db, req, 'Datos migrados entre sucursales', 'Sucursales', `${origen} → ${destino} · ${JSON.stringify(resultado)}`);
  save();
  return res.json({ ok: true, destino_id: destino, origen_id: origen, migrado: resultado });
});

module.exports = router;
