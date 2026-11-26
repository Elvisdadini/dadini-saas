const express = require('express');
const rateLimit = require('express-rate-limit');
const { authRequired } = require('../auth');
const ai = require('../ai');

const router = express.Router();
router.use(authRequired);

const limiteIA = rateLimit({
  windowMs: 60_000,
  max: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiadas consultas al asistente. Espera un minuto.' },
});

router.get('/estado', (req, res) => {
  res.json({
    configurado: ai.estaConfigurado(),
    modelo: ai.modelo,
    herramientas: ai.HERRAMIENTAS,
    aviso: ai.estaConfigurado() ? null : 'Define OPENAI_API_KEY en Render para activar el asistente.',
  });
});

router.get('/alertas', (req, res) => {
  res.json(ai.alertas());
});

router.post('/chat', limiteIA, async (req, res) => {
  try {
    const resultado = await ai.chatear({
      mensaje: req.body?.mensaje,
      pagina: req.body?.pagina,
      historial: Array.isArray(req.body?.historial) ? req.body.historial : [],
    }, req);
    res.status(resultado.ok ? 200 : 503).json(resultado);
  } catch (error) {
    res.status(502).json({ ok: false, error: `El asistente no pudo responder: ${error.message}` });
  }
});

router.post('/ejecutar', limiteIA, (req, res) => {
  const resultado = ai.ejecutarAccion({
    herramienta: req.body?.herramienta,
    args: req.body?.args || {},
  }, req);
  res.status(resultado.ok ? 200 : 400).json(resultado);
});

router.post('/ocr-factura', limiteIA, async (req, res) => {
  try {
    const resultado = await ai.extraerFactura(req.body?.imagen);
    res.status(resultado.ok ? 200 : 400).json(resultado);
  } catch (error) {
    res.status(502).json({ ok: false, error: `No se pudo leer la factura: ${error.message}` });
  }
});

module.exports = router;
