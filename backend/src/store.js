const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const ESQUEMA = 'dadini_saas';
const ENTIDADES = [
  'usuarios', 'almacenes', 'productos', 'stock', 'clientes', 'pedidos',
  'pagos', 'movimientos', 'rutas', 'repartidores', 'vehiculos',
  'auditoria', 'notificaciones', 'visitas', 'cargas', 'mensajes_whatsapp', 'promociones',
  'cliente_categorias', 'zonas', 'tipos_cliente', 'rutas_venta', 'sucursales', 'cajas', 'movimientos_caja', 'lotes', 'kardex', 'notas_fiscales', 'crm_notas', 'documentos_rag', 'almacenes_moviles', 'solicitudes_carga', 'devoluciones_movil',
  'objetivos_mensuales', 'confirmaciones_carga',
  'proveedores', 'tipos_gasto', 'solicitudes_compra', 'ordenes_compra', 'gastos', 'pagos_proveedor',
  'boletas_pago', 'conceptos_nomina', 'producto_categorias', 'producto_marcas', 'conteos_inventario', 'qrs_pago',
];

let modo = 'json';
let pool = null;
let jsonDir = null;

function configPg() {
  const { DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD } = process.env;
  if (!DB_HOST || !DB_NAME || !DB_USER || DB_PASSWORD === undefined) return null;
  return {
    host: DB_HOST,
    port: Number(DB_PORT || 5432),
    database: DB_NAME,
    user: DB_USER,
    password: DB_PASSWORD,
    connectionTimeoutMillis: 5000,
  };
}

async function asegurarEsquema() {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS ${ESQUEMA}`);
  await pool.query(`CREATE TABLE IF NOT EXISTS ${ESQUEMA}.meta (clave text PRIMARY KEY, valor jsonb NOT NULL)`);
  for (const entidad of ENTIDADES) {
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${ESQUEMA}.${entidad} (
         id bigint PRIMARY KEY,
         datos jsonb NOT NULL,
         actualizado_en timestamptz NOT NULL DEFAULT now()
       )`,
    );
  }
}

async function init(opciones = {}) {
  jsonDir = opciones.jsonDir || path.join(__dirname, '..', 'data');
  const cfg = configPg();
  if (cfg) {
    try {
      pool = new Pool(cfg);
      await pool.query('SELECT 1');
      await asegurarEsquema();
      modo = 'postgres';
      return modo;
    } catch (error) {
      console.warn(`[store] PostgreSQL no disponible (${error.message}). Se usa persistencia JSON local.`);
      try { await pool.end(); } catch (ignore) { /* noop */ }
      pool = null;
    }
  }
  modo = 'json';
  fs.mkdirSync(jsonDir, { recursive: true });
  return modo;
}

function archivoJson() {
  return path.join(jsonDir || path.join(__dirname, '..', 'data'), 'dadini.json');
}

async function leer() {
  if (modo === 'json') {
    const archivo = archivoJson();
    if (!fs.existsSync(archivo)) return null;
    try {
      return JSON.parse(fs.readFileSync(archivo, 'utf8'));
    } catch (error) {
      console.warn('[store] No se pudo leer el JSON local:', error.message);
      return null;
    }
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const resultado = {};
    for (const entidad of ENTIDADES) {
      const res = await cliente.query(`SELECT datos FROM ${ESQUEMA}.${entidad} ORDER BY id`);
      resultado[entidad] = res.rows.map((fila) => fila.datos);
    }
    const meta = await cliente.query(`SELECT clave, valor FROM ${ESQUEMA}.meta`);
    meta.rows.forEach((fila) => { resultado[fila.clave] = fila.valor; });
    resultado.sincronizacion = resultado.sincronizacion || {
      ultimo_envio: null, ultimo_error: null, intentos: 0, estado: 'sin_configurar', empresa_id: 'dadini-principal',
    };
    await cliente.query('COMMIT');
    return Object.keys(resultado).some((clave) => Array.isArray(resultado[clave]) && resultado[clave].length)
      ? resultado
      : null;
  } catch (error) {
    try { await cliente.query('ROLLBACK'); } catch (ignore) { /* noop */ }
    throw error;
  } finally {
    cliente.release();
  }
}

async function guardar(db) {
  if (modo === 'json') {
    const archivo = archivoJson();
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    const temporal = `${archivo}.tmp`;
    fs.writeFileSync(temporal, JSON.stringify(db, null, 2), 'utf8');
    fs.renameSync(temporal, archivo);
    return;
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    for (const entidad of ENTIDADES) {
      await cliente.query(`TRUNCATE TABLE ${ESQUEMA}.${entidad}`);
      const filas = db[entidad] || [];
      if (filas.length) {
        await cliente.query(
          `INSERT INTO ${ESQUEMA}.${entidad} (id, datos)
           SELECT * FROM unnest($1::bigint[], $2::jsonb[])`,
          [filas.map((fila) => fila.id), filas.map((fila) => JSON.stringify(fila))],
        );
      }
    }
    const meta = {
      version: db.version,
      generado_en: db.generado_en,
      configuracion: db.configuracion,
      sincronizacion: db.sincronizacion,
    };
    const claves = Object.keys(meta);
    await cliente.query(`TRUNCATE TABLE ${ESQUEMA}.meta`);
    await cliente.query(
      `INSERT INTO ${ESQUEMA}.meta (clave, valor)
       SELECT * FROM unnest($1::text[], $2::jsonb[])`,
      [claves, claves.map((clave) => JSON.stringify(meta[clave]))],
    );
    await cliente.query('COMMIT');
  } catch (error) {
    try { await cliente.query('ROLLBACK'); } catch (ignore) { /* noop */ }
    throw error;
  } finally {
    cliente.release();
  }
}

function base() {
  if (modo === 'postgres') {
    return `PostgreSQL ${process.env.DB_HOST}:${process.env.DB_PORT || 5432}/${process.env.DB_NAME} · esquema ${ESQUEMA}`;
  }
  return archivoJson();
}

async function cerrar() {
  if (pool) await pool.end();
}

module.exports = {
  init, leer, guardar, base, cerrar,
  modo: () => modo,
  esquema: ESQUEMA,
  ENTIDADES,
};
