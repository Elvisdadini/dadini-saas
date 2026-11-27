// Datos de la empresa del usuario en sesión para la barra lateral.
const express = require('express');
const { load } = require('../db');
const { authRequired } = require('../auth');
const empresas = require('../empresas');
const tenant = require('../tenant');

const router = express.Router();
router.use(authRequired);

function diasRestantes(hasta) {
  if (!hasta) return null;
  const hoy = new Date(`${empresas.fechaBolivia()}T00:00:00Z`);
  const fin = new Date(`${String(hasta).slice(0, 10)}T00:00:00Z`);
  return Math.max(0, Math.round((fin - hoy) / 86400000));
}

router.get('/', (req, res) => {
  const real = tenant.dbReal() || load();
  const id = Number(req.user.sucursal_id || 1);
  const sucursal = (real.sucursales || []).find((s) => s.id === id) || {
    id: 1, nombre: 'Casa Matriz', codigo: 'CASA-MATRIZ', activa: true,
  };
  const porRol = empresas.conteoPorRol(real, id);
  const limites = sucursal.limites || {};
  const restantes = {};
  Object.keys(empresas.ROLES_CUPADOS).forEach((clave) => {
    const limite = Number(limites[clave]);
    if (Number.isFinite(limite) && limite > 0) restantes[clave] = Math.max(0, limite - porRol[clave]);
  });
  const limiteTotal = Number(limites.usuarios);
  if (Number.isFinite(limiteTotal) && limiteTotal > 0) restantes.usuarios = Math.max(0, limiteTotal - porRol.total);
  return res.json({
    empresa: sucursal.empresa || sucursal.nombre,
    nombre: sucursal.nombre,
    codigo: sucursal.codigo,
    activa: sucursal.activa !== false,
    modulos: sucursal.modulos || [],
    usuarios: { total: porRol.total, por_rol: porRol, limites, restantes },
    vigencia: sucursal.vigencia || { desde: null, hasta: null },
    dias_restantes: diasRestantes(sucursal.vigencia?.hasta),
    notificacion: sucursal.notificacion || null,
  });
});

module.exports = router;
