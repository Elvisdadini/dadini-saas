// Aislamiento de información por usuario. Los roles con el permiso
// `datos.ver_todos` (dueño, administración y supervisor) ven todo; el resto
// solo ve los registros que él mismo creó o que están asignados a él.
const { tienePermiso } = require('./permisos');

function verTodo(req) {
  if (!req?.user) return false;
  if (['admin', 'dueno'].includes(req.user.rol)) return true;
  return tienePermiso(req.user, 'datos.ver_todos');
}

function camposDe(req) {
  const rol = req.user?.rol;
  if (rol === 'distribucion') return ['repartidor_id', 'usuario_id', 'distribuidor_id'];
  if (rol === 'cobranzas') return ['responsable_cobro_id', 'usuario_id', 'cobrador_id'];
  return ['usuario_id', 'vendedor_id', 'creado_por'];
}

function esMio(fila, req, campos = camposDe(req)) {
  if (verTodo(req)) return true;
  const id = Number(req.user?.id);
  return campos.some((campo) => Number(fila?.[campo]) === id);
}

function filtrar(req, filas, campos = camposDe(req)) {
  if (verTodo(req)) return filas;
  return (filas || []).filter((fila) => esMio(fila, req, campos));
}

module.exports = { verTodo, esMio, filtrar, camposDe };
