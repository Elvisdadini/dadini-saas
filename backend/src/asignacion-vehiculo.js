// Utilidades para derivar el vehículo desde el distribuidor asignado.
function vehiculoDeRepartidor(db, repartidorId) {
  if (!repartidorId) return null;
  const distribuidor = db.usuarios.find((u) => u.rol === 'distribucion' && u.repartidor_id === Number(repartidorId));
  if (!distribuidor?.vehiculo_id) return null;
  return db.vehiculos.find((v) => v.id === distribuidor.vehiculo_id) || null;
}

function vehiculoLibre(db) {
  const ocupados = new Set(db.usuarios
    .filter((u) => u.rol === 'distribucion' && u.activo && u.vehiculo_id)
    .map((u) => u.vehiculo_id));
  const activos = db.vehiculos.filter((v) => v.activo !== false && v.estado === 'operativo');
  return activos.find((v) => !ocupados.has(v.id)) || activos[0] || null;
}

function distribuidorDeUsuario(db, usuarioId) {
  return db.usuarios.find((u) => u.id === Number(usuarioId)) || null;
}

module.exports = { vehiculoDeRepartidor, vehiculoLibre, distribuidorDeUsuario };
