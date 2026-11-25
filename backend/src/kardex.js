// Kardex por lote con salida FEFO (First Expired, First Out).
// db.stock sigue siendo el agregado oficial; lotes y kardex son el detalle.
const { nextId } = require('./utils');

function asegurar(db) {
  if (!Array.isArray(db.lotes)) db.lotes = [];
  if (!Array.isArray(db.kardex)) db.kardex = [];
}

function claveMovil(almacenMovilId) {
  return almacenMovilId ? Number(almacenMovilId) : null;
}

// El stock del camión vive en almacen.lineas, NO en db.stock. Se devuelve la
// fila correcta según el destino para no descontar dos veces.
function filaStock(db, productoId, almacenId, movilId = null) {
  if (movilId) {
    const movil = (db.almacenes_moviles || []).find((a) => Number(a.id) === Number(movilId));
    if (!movil) return null;
    if (!Array.isArray(movil.lineas)) movil.lineas = [];
    let linea = movil.lineas.find((l) => Number(l.producto_id) === Number(productoId));
    if (!linea) { linea = { producto_id: Number(productoId), cantidad: 0 }; movil.lineas.push(linea); }
    return linea;
  }
  let fila = (db.stock || []).find((s) => Number(s.producto_id) === Number(productoId) && Number(s.almacen_id) === Number(almacenId));
  if (!fila) {
    fila = { id: nextId(db.stock), producto_id: Number(productoId), almacen_id: Number(almacenId), cantidad: 0 };
    db.stock.push(fila);
  }
  return fila;
}

function lotesDe(db, productoId, almacenId, almacenMovilId = null) {
  const movilId = claveMovil(almacenMovilId);
  return (db.lotes || []).filter((l) => Number(l.producto_id) === Number(productoId)
    && (movilId ? claveMovil(l.almacen_movil_id) === movilId
      : Number(l.almacen_id) === Number(almacenId) && !l.almacen_movil_id));
}

function ordenFeFo(a, b) {
  const fa = a.fecha_vencimiento ? Date.parse(a.fecha_vencimiento) : Infinity;
  const fb = b.fecha_vencimiento ? Date.parse(b.fecha_vencimiento) : Infinity;
  return fa - fb || Number(a.id) - Number(b.id);
}

// Reconcilia el detalle de lotes con el stock agregado. Permite que rutas
// antiguas que escriben db.stock directamente no rompan el kardex.
function sincronizar(db) {
  asegurar(db);
  (db.stock || []).forEach((s) => {
    const productoId = Number(s.producto_id);
    const almacenId = Number(s.almacen_id);
    const lotes = lotesDe(db, productoId, almacenId);
    const detalle = lotes.reduce((sum, l) => sum + Number(l.cantidad || 0), 0);
    const agregado = Number(s.cantidad || 0);
    const diferencia = agregado - detalle;
    if (Math.abs(diferencia) < 0.001) return;
    if (diferencia > 0) {
      db.lotes.push({
        id: nextId(db.lotes), producto_id: productoId, almacen_id: almacenId,
        almacen_movil_id: null, lote: 'AJUSTE', fecha_vencimiento: null,
        cantidad: diferencia, creado_en: new Date().toISOString(), origen: 'reconciliacion',
      });
    } else {
      let restante = -diferencia;
      lotes.slice().sort(ordenFeFo).forEach((l) => {
        if (restante <= 0) return;
        const quitar = Math.min(restante, Number(l.cantidad || 0));
        l.cantidad = Number(l.cantidad || 0) - quitar;
        restante -= quitar;
      });
    }
  });
  (db.almacenes_moviles || []).forEach((movil) => {
    (movil.lineas || []).forEach((linea) => {
      const productoId = Number(linea.producto_id);
      const lotes = lotesDe(db, productoId, 0, movil.id);
      const detalle = lotes.reduce((s, l) => s + Number(l.cantidad || 0), 0);
      const diferencia = Number(linea.cantidad || 0) - detalle;
      if (Math.abs(diferencia) < 0.001) return;
      if (diferencia > 0) {
        db.lotes.push({
          id: nextId(db.lotes), producto_id: productoId, almacen_id: 0,
          almacen_movil_id: Number(movil.id), lote: 'CAMION', fecha_vencimiento: null,
          cantidad: diferencia, creado_en: new Date().toISOString(), origen: 'reconciliacion_movil',
        });
      } else {
        let restante = -diferencia;
        lotes.slice().sort(ordenFeFo).forEach((l) => {
          if (restante <= 0) return;
          const quitar = Math.min(restante, Number(l.cantidad));
          l.cantidad = Number(l.cantidad) - quitar;
          restante -= quitar;
        });
      }
    });
  });
}

function registrarEntrada(db, datos) {
  asegurar(db);
  sincronizar(db);
  const cantidad = Math.round(Number(datos.cantidad) || 0);
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
  const productoId = Number(datos.producto_id);
  const almacenId = Number(datos.almacen_id);
  const movilId = claveMovil(datos.almacen_movil_id);
  const loteNombre = String(datos.lote || 'SIN-LOTE').trim().toUpperCase();
  const vencimiento = String(datos.fecha_vencimiento || '').slice(0, 10) || null;

  const fila = filaStock(db, productoId, almacenId, movilId);
  if (!fila) throw new Error('El almacén móvil seleccionado no existe.');
  fila.cantidad = Number(fila.cantidad || 0) + cantidad;

  let lote = lotesDe(db, productoId, almacenId, movilId).find((l) => String(l.lote || '').toUpperCase() === loteNombre
    && (l.fecha_vencimiento || null) === vencimiento);
  if (!lote) {
    lote = {
      id: nextId(db.lotes), producto_id: productoId, almacen_id: almacenId,
      almacen_movil_id: movilId, lote: loteNombre, fecha_vencimiento: vencimiento,
      cantidad: 0, creado_en: new Date().toISOString(), origen: datos.origen || 'entrada',
    };
    db.lotes.push(lote);
  }
  lote.cantidad = Number(lote.cantidad || 0) + cantidad;
  db.kardex.push({
    id: nextId(db.kardex), producto_id: productoId, almacen_id: almacenId,
    almacen_movil_id: movilId, lote_id: lote.id, lote: lote.lote,
    fecha_vencimiento: vencimiento, tipo: datos.tipo || 'entrada', cantidad,
    saldo: Number(fila.cantidad), motivo: datos.motivo || '', referencia: datos.referencia || null,
    usuario_id: datos.usuario_id || null, fecha: datos.fecha || new Date().toISOString(),
  });
  return { lote, stock: fila.cantidad };
}

function consumir(db, datos) {
  asegurar(db);
  sincronizar(db);
  const cantidad = Math.round(Number(datos.cantidad) || 0);
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
  const productoId = Number(datos.producto_id);
  const almacenId = Number(datos.almacen_id);
  const movilId = claveMovil(datos.almacen_movil_id);
  const hoy = new Date().toISOString().slice(0, 10);
  const candidatos = lotesDe(db, productoId, almacenId, movilId)
    .filter((l) => Number(l.cantidad) > 0)
    .filter((l) => datos.permitir_vencidos || !l.fecha_vencimiento || l.fecha_vencimiento >= hoy)
    .sort(ordenFeFo);
  const disponible = candidatos.reduce((s, l) => s + Number(l.cantidad), 0);
  if (disponible < cantidad) {
    throw new Error(`Stock insuficiente en ${datos.almacen_nombre || `almacén ${almacenId}`}. Disponible: ${disponible}, requerido: ${cantidad}.`);
  }

  let restante = cantidad;
  const usados = [];
  candidatos.forEach((lote) => {
    if (restante <= 0) return;
    const tomar = Math.min(restante, Number(lote.cantidad));
    lote.cantidad = Number(lote.cantidad) - tomar;
    restante -= tomar;
    usados.push({ lote_id: lote.id, lote: lote.lote, fecha_vencimiento: lote.fecha_vencimiento, cantidad: tomar });
  });

  const fila = filaStock(db, productoId, almacenId, movilId);
  if (fila) fila.cantidad = Math.max(0, Number(fila.cantidad || 0) - cantidad);
  const fecha = datos.fecha || new Date().toISOString();
  usados.forEach((u) => {
    db.kardex.push({
      id: nextId(db.kardex), producto_id: productoId, almacen_id: almacenId,
      almacen_movil_id: movilId, lote_id: u.lote_id, lote: u.lote,
      fecha_vencimiento: u.fecha_vencimiento, tipo: datos.tipo || 'salida', cantidad: u.cantidad,
      saldo: fila ? fila.cantidad : 0, motivo: datos.motivo || '', referencia: datos.referencia || null,
      usuario_id: datos.usuario_id || null, fecha,
    });
  });
  return { consumido: cantidad, lotes: usados, stock: fila ? fila.cantidad : 0 };
}

function transferir(db, datos) {
  const cantidad = Math.round(Number(datos.cantidad) || 0);
  if (!(cantidad > 0)) throw new Error('La cantidad debe ser mayor a cero.');
  const origen = {
    producto_id: datos.producto_id, almacen_id: datos.origen_id,
    almacen_movil_id: datos.origen_movil_id || null,
    cantidad, motivo: datos.motivo || 'Transferencia entre almacenes',
    referencia: datos.referencia || null, usuario_id: datos.usuario_id,
    tipo: 'transferencia_salida',
  };
  const resultado = consumir(db, origen);
  resultado.lotes.forEach((l) => {
    registrarEntrada(db, {
      producto_id: datos.producto_id,
      almacen_id: datos.destino_id,
      almacen_movil_id: datos.destino_movil_id || null,
      cantidad: l.cantidad, lote: l.lote, fecha_vencimiento: l.fecha_vencimiento,
      tipo: 'transferencia_entrada', motivo: origen.motivo,
      referencia: origen.referencia, origen: 'transferencia', usuario_id: datos.usuario_id,
    });
  });
  return resultado;
}

function vencimientos(db, dias = 60) {
  asegurar(db);
  const hoy = new Date().toISOString().slice(0, 10);
  const limite = new Date(Date.now() + dias * 86400000).toISOString().slice(0, 10);
  return (db.lotes || [])
    .filter((l) => l.fecha_vencimiento && Number(l.cantidad) > 0)
    .map((l) => {
      const restante = Math.round((Date.parse(l.fecha_vencimiento) - Date.parse(hoy)) / 86400000);
      return {
        ...l, dias_para_vencer: restante,
        estado: l.fecha_vencimiento < hoy ? 'vencido' : l.fecha_vencimiento <= limite ? 'proximo' : 'vigente',
      };
    })
    .sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)));
}

module.exports = { asegurar, sincronizar, lotesDe, registrarEntrada, consumir, transferir, vencimientos };
