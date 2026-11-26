// Bloqueos de actividad por usuario, independientes del bloqueo de acceso.
// Un usuario puede entrar al sistema pero no vender, cobrar, entregar ni
// supervisar según lo que el administrador haya desactivado.
const ETIQUETAS = {
  vender: 'registrar ventas',
  cobrar: 'registrar cobros',
  entregar: 'registrar entregas',
  supervisar: 'supervisar operaciones',
};

function requireActividad(actividad) {
  return (req, res, next) => {
    if (req.user?.bloqueos?.[actividad]) {
      return res.status(403).json({ error: `Este usuario tiene bloqueada la opción de ${ETIQUETAS[actividad] || actividad}.` });
    }
    return next();
  };
}

module.exports = { ETIQUETAS, requireActividad };
