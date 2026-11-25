const express = require('express');
const { load, save } = require('../db');
const { authRequired, allow } = require('../auth');
const { audit } = require('../utils');
const { VERSION, REGISTRO, normativaVigente, calcularImpuestos } = require('../fiscal-normativa');
const { guardarDocumento } = require('../documentos');

const router = express.Router();
router.use(authRequired);

function asegurarFiscal(db) {
  if (!db.configuracion.fiscal) {
    db.configuracion.fiscal = {
      nit: '', razon_social: '', actividad: '', sucursal: 'Casa Matriz', punto_venta: '0',
      modalidad: 'computarizada_sfv', autorizacion: '', codigo_control: '',
      fecha_autorizacion: '', facturacion_activa: true,
      dosificacion: { numero_inicial: 1, ultimo_numero: 0, limite: 100000, activa: true },
      normativa: {
        version: VERSION, actualizado_en: null, fuente: 'registro_interno',
        reglas: REGISTRO.map((r) => ({ ...r })),
      },
    };
  }
  const fiscal = db.configuracion.fiscal;
  if (!fiscal.normativa) {
    fiscal.normativa = { version: VERSION, actualizado_en: null, fuente: 'registro_interno', reglas: REGISTRO.map((r) => ({ ...r })) };
  }
  return fiscal;
}

function reglas(fiscal) {
  return Array.isArray(fiscal.normativa?.reglas) ? fiscal.normativa.reglas : [];
}

router.get('/', (req, res) => {
  const db = load();
  const fiscal = asegurarFiscal(db);
  const hoy = new Date().toISOString().slice(0, 10);
  const vigentes = normativaVigente(reglas(fiscal), hoy);
  res.json({
    fiscal,
    version: VERSION,
    vigentes,
    reglas: reglas(fiscal),
    calculo: req.query.monto !== undefined
      ? calcularImpuestos(reglas(fiscal), req.query.monto, String(req.query.fecha || hoy).slice(0, 10))
      : null,
  });
});

// Botón "Actualizar normativa SIAT": consulta el feed configurado (si existe)
// y fusiona las reglas con el registro integrado. Reseta las reglas editadas
// a mano para no pisar ajustes del usuario.
router.post('/normativa/actualizar', allow('admin', 'dueno', 'supervisor'), async (req, res) => {
  const db = load();
  const fiscal = asegurarFiscal(db);
  let entrada = REGISTRO;
  let fuente = 'registro_interno';
  let aviso = null;
  if (process.env.SIAT_NORMATIVA_URL) {
    try {
      const respuesta = await fetch(process.env.SIAT_NORMATIVA_URL, { headers: { Accept: 'application/json' } });
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      const datos = await respuesta.json();
      const lista = Array.isArray(datos) ? datos : datos.reglas;
      if (!Array.isArray(lista) || !lista.length) throw new Error('El feed no devolvió reglas.');
      entrada = lista;
      fuente = datos.fuente || 'feed_remoto';
    } catch (error) {
      aviso = `No se pudo consultar el feed remoto (${error.message}). Se aplicó el registro integrado.`;
    }
  }
  const actuales = reglas(fiscal);
  const mapa = new Map(actuales.map((r) => [r.id, r]));
  let nuevas = 0;
  let actualizadas = 0;
  entrada.forEach((regla) => {
    if (!regla || !regla.id) return;
    const previa = mapa.get(regla.id);
    if (!previa) { mapa.set(regla.id, { ...regla }); nuevas += 1; }
    else if (!previa.editado_manual) { mapa.set(regla.id, { ...previa, ...regla, editado_manual: false }); actualizadas += 1; }
  });
  fiscal.normativa = {
    version: VERSION, actualizado_en: new Date().toISOString(), fuente,
    reglas: [...mapa.values()],
  };
  audit(db, req, 'Normativa SIAT actualizada', 'Facturación', `${nuevas} nuevas · ${actualizadas} actualizadas · ${fuente}`);
  save();
  res.json({
    ok: true, nuevas, actualizadas, total: mapa.size, fuente, aviso,
    version: VERSION, actualizado_en: fiscal.normativa.actualizado_en,
    vigentes: normativaVigente([...mapa.values()], new Date().toISOString().slice(0, 10)).length,
  });
});

router.put('/normativa/:id', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const fiscal = asegurarFiscal(db);
  const regla = reglas(fiscal).find((r) => r.id === req.params.id);
  if (!regla) return res.status(404).json({ error: 'Norma no encontrada.' });
  ['valor', 'fecha_desde', 'fecha_hasta', 'activa', 'metodo', 'descripcion'].forEach((campo) => {
    if (req.body?.[campo] !== undefined) regla[campo] = req.body[campo];
  });
  regla.editado_manual = true;
  regla.actualizado_manual_en = new Date().toISOString();
  audit(db, req, 'Norma SIAT editada manualmente', 'Facturación', regla.norma || regla.id);
  save();
  return res.json({ ok: true, regla });
});

router.put('/config', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const fiscal = asegurarFiscal(db);
  const campos = ['nit', 'razon_social', 'actividad', 'sucursal', 'punto_venta', 'modalidad', 'autorizacion', 'codigo_control', 'fecha_autorizacion', 'facturacion_activa'];
  campos.forEach((c) => { if (req.body?.[c] !== undefined) fiscal[c] = req.body[c]; });
  if (req.body?.dosificacion) fiscal.dosificacion = { ...fiscal.dosificacion, ...req.body.dosificacion };
  audit(db, req, 'Configuración fiscal actualizada', 'Facturación', fiscal.nit || 'sin NIT');
  save();
  return res.json({ ok: true, fiscal });
});

router.get('/facturas', (req, res) => {
  const db = load();
  const facturas = (db.pedidos || [])
    .filter((p) => p.factura)
    .map((p) => ({
      ...p.factura,
      pedido_id: p.id,
      pedido_codigo: p.codigo,
      cliente_nombre: (db.clientes || []).find((c) => c.id === p.cliente_id)?.nombre || '—',
      total: p.total,
    }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  res.json({ facturas, total: facturas.length });
});

router.post('/facturas/:id/pdf', allow('admin', 'dueno', 'ventas', 'cobranzas'), async (req, res) => {
  const db = load();
  const pedido = (db.pedidos || []).find((p) => p.id === Number(req.params.id));
  if (!pedido?.factura) return res.status(404).json({ error: 'El pedido no tiene factura generada.' });
  try {
    const guardado = await guardarDocumento(req.body?.pdf, 'facturas', `factura-${pedido.factura.numero}`);
    pedido.factura.pdf_url = guardado.url;
    audit(db, req, 'Factura PDF guardada', 'Facturación', pedido.factura.numero);
    save();
    return res.json({ ok: true, ...guardado });
  } catch (error) { return res.status(400).json({ error: error.message }); }
});

router.post('/facturas/:id/anular', allow('admin', 'dueno'), (req, res) => {
  const db = load();
  const pedido = (db.pedidos || []).find((p) => p.id === Number(req.params.id));
  if (!pedido?.factura) return res.status(404).json({ error: 'Factura no encontrada.' });
  if (pedido.factura.estado === 'anulada') return res.status(400).json({ error: 'La factura ya está anulada.' });
  pedido.factura.estado = 'anulada';
  pedido.factura.anulada_en = new Date().toISOString();
  audit(db, req, 'Factura anulada', 'Facturación', pedido.factura.numero);
  save();
  return res.json({ ok: true, factura: pedido.factura });
});

module.exports = router;
