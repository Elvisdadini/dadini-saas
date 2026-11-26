// Ventana de trabajo del vendedor y cierre del día para almacén.
//Todo se calcula en hora de Bolivia (America/La_Paz), no en UTC del servidor.
const { load } = require('./db');

const ZONA = 'America/La_PAZ';

function partes(fecha = new Date()) {
  const objeto = fecha instanceof Date ? fecha : new Date(fecha);
  const valores = new Intl.DateTimeFormat('es-BO', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(objeto).reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return {
    fecha: `${valores.year}-${valores.month}-${valores.day}`,
    hora: `${valores.hour}:${valores.minuto || valores.minute}`,
  };
}

function fechaBolivia(fecha) { return partes(fecha).fecha; }
function horaBolivia() { return partes().hora; }

function configuracionVentas() {
  const db = load();
  if (!db.configuracion.ventas) db.configuracion.ventas = {};
  const cfg = db.configuracion.ventas;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(cfg.hora_cierre_ventas || '')) cfg.hora_cierre_ventas = '17:00';
  return { cfg, db };
}

function estadoVentas() {
  const { cfg } = configuracionVentas();
  const fecha = fechaBolivia();
  const hora = horaBolivia();
  const cerrado = cfg.fecha_cierre === fecha;
  return {
    fecha, hora, hora_limite: cfg.hora_cierre_ventas, cerrado,
    permitido: !cerrado && hora <= cfg.hora_cierre_ventas,
    motivo: cerrado
      ? `El día ${fecha} ya fue cerrado por almacén. Los pedidos se preparan para el día siguiente.`
      : `Fuera del horario de ventas (hasta ${cfg.hora_cierre_ventas}).`,
  };
}

const VENDEDORES = ['ventas', 'preventista', 'vendedor_camion'];

function requireHorarioVentas(req, res, next) {
  if (!VENDEDORES.includes(req.user?.rol)) return next();
  const estado = estadoVentas();
  if (estado.permitido) return next();
  return res.status(403).json({ error: estado.motivo, horario: estado });
}

function esPedidoDeHoy(pedido) {
  return Boolean(pedido?.created_at) && fechaBolivia(pedido.created_at) === fechaBolivia();
}

function cerrarDia(req) {
  const { cfg, db } = configuracionVentas();
  cfg.fecha_cierre = fechaBolivia();
  cfg.cerrado_en = new Date().toISOString();
  cfg.cerrado_por = req.user?.id || null;
  return db;
}

function abrirDia(req) {
  const { cfg, db } = configuracionVentas();
  cfg.fecha_cierre = null;
  cfg.cerrado_en = null;
  cfg.cerrado_por = null;
  return db;
}

module.exports = {
  ZONA, partes, fechaBolivia, horaBolivia, configuracionVentas, estadoVentas,
  requireHorarioVentas, esPedidoDeHoy, cerrarDia, abrirDia, VENDEDORES,
};
