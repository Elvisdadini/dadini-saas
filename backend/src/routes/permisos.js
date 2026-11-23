const express = require('express');
const { authRequired } = require('../auth');
const { MODULOS, ACCIONES, TODOS, PLANTILLAS, CATALOGO, CRUD, CODIGOS_DETALLADOS, permisosUsuario } = require('../permisos');

const router = express.Router();
router.use(authRequired);

router.get('/', (req, res) => {
  return res.json({ modulos: MODULOS, acciones: ACCIONES, todos: TODOS, plantillas: PLANTILLAS, catalogo: CATALOGO, crud: CRUD, codigosDetallados: CODIGOS_DETALLADOS });
});

router.get('/mios', (req, res) => {
  return res.json({ permisos: permisosUsuario(req.user), rol: req.user.rol });
});

module.exports = router;
