const { round2, num } = require('./utils');
const { stockEn } = require('./services');

function activas(db, fecha = new Date().toISOString().slice(0, 10), categoriaClienteId = null) {
  return (db.promociones || [])
    .filter((p) => p.activa)
    .filter((p) => !p.fecha_inicio || p.fecha_inicio <= fecha)
    .filter((p) => !p.fecha_fin || p.fecha_fin >= fecha)
    .filter((p) => !categoriaClienteId || !(p.categorias_clientes || []).length || p.categorias_clientes.map(Number).includes(Number(categoriaClienteId)))
    .sort((a, b) => num(b.prioridad) - num(a.prioridad));
}

function agregarDescuento(mapa, productoId, nombre, monto, promo) {
  if (!(monto > 0)) return;
  const clave = String(productoId);
  const prev = mapa.get(clave) || { producto_id: productoId, nombre, monto: 0, promociones: [] };
  prev.monto = round2(prev.monto + monto);
  prev.promociones.push(`${promo.codigo} · ${promo.nombre}`);
  mapa.set(clave, prev);
}

function evaluar(db, items, almacenId, fecha, categoriaClienteId = null, stockDisponible = null) {
  const carrito = (items || []).map((i) => {
    const producto = db.productos.find((p) => p.id === Number(i.producto_id));
    const cantidad = Math.max(0, Math.round(num(i.cantidad)));
    const precio = num(i.precio) || num(producto?.precio) || 0;
    return {
      producto_id: Number(i.producto_id),
      nombre: producto?.nombre || 'Producto',
      emoji: producto?.emoji || '📦',
      categoria: producto?.categoria || '',
      categorias_clientes: Array.isArray(producto?.categorias_clientes) ? producto.categorias_clientes.map(Number) : [],
      cantidad,
      precio,
      subtotal: round2(cantidad * precio),
      costo_unitario: num(producto?.costo),
    };
  }).filter((i) => i.cantidad > 0);

  const descuentosMap = new Map();
  const bonificaciones = [];
  const aplicadas = [];
  const advertencias = [];
  const requisiteStock = new Map();
  carrito.forEach((i) => requisiteStock.set(i.producto_id, (requisiteStock.get(i.producto_id) || 0) + i.cantidad));

  activas(db, fecha, categoriaClienteId).forEach((promo) => {
    const porIds = Array.isArray(promo.productos_ids) && promo.productos_ids.length
      ? carrito.filter((i) => promo.productos_ids.map(Number).includes(i.producto_id))
      : [];
    const porCategorias = Array.isArray(promo.categorias) && promo.categorias.length
      ? carrito.filter((i) => promo.categorias.includes(i.categoria))
      : [];
    let todos = [...new Map([...porIds, ...porCategorias].map((i) => [i.producto_id, i])).values()];
    if (categoriaClienteId) {
      todos = todos.filter((i) => !i.categorias_clientes.length || i.categorias_clientes.includes(Number(categoriaClienteId)));
    }
    if (!todos.length) return;

    const totalUnidades = todos.reduce((s, i) => s + i.cantidad, 0);
    const subtotalAfectado = round2(todos.reduce((s, i) => s + i.subtotal, 0));

    if (promo.tipo === 'volumen') {
      const regla = (promo.reglas || []).find((r) => totalUnidades >= num(r.min) && (r.max === null || r.max === undefined || totalUnidades <= num(r.max)));
      if (!regla) return;
      const monto = num(regla.descuento_fijo) > 0
        ? Math.min(subtotalAfectado, num(regla.descuento_fijo))
        : round2(subtotalAfectado * num(regla.descuento_porcentaje) / 100);
      todos.forEach((i) => agregarDescuento(
        descuentosMap, i.producto_id, i.nombre,
        round2(monto * (i.subtotal / (subtotalAfectado || 1))), promo,
      ));
      aplicadas.push({ id: promo.id, codigo: promo.codigo, nombre: promo.nombre, tipo: promo.tipo, detalle: `${totalUnidades} uds. · ${num(regla.descuento_porcentaje) || num(regla.descuento_fijo)} ${num(regla.descuento_fijo) > 0 ? 'Bs' : '%'}` });
      return;
    }

    if (promo.tipo === '2x1') {
      const paga = Math.max(1, num(promo.dos_por_uno?.paga, 2));
      const gratis = Math.max(1, num(promo.dos_por_uno?.gratis, 1));
      todos.forEach((i) => {
        const libres = Math.floor(i.cantidad / paga) * gratis;
        if (!libres) return;
        bonificaciones.push({
          producto_id: i.producto_id, nombre: i.nombre, emoji: i.emoji, cantidad: libres,
          precio: 0, costo_unitario: i.costo_unitario,
          promocion_id: promo.id, promocion_codigo: promo.codigo,
          motivo: `2x1 (${paga}x${gratis})`,
        });
        requisiteStock.set(i.producto_id, (requisiteStock.get(i.producto_id) || 0) + libres);
      });
      aplicadas.push({ id: promo.id, codigo: promo.codigo, nombre: promo.nombre, tipo: promo.tipo, detalle: `${paga}x${gratis}` });
      return;
    }

    if (promo.tipo === 'bonificacion') {
      const b = promo.bonificacion || {};
      const requiere = Math.max(1, num(b.requiere_cantidad, 1));
      const veces = Math.floor(totalUnidades / requiere);
      if (!veces) return;
      const producto = db.productos.find((p) => p.id === Number(b.producto_id));
      if (!producto) return;
      const cantidad = veces * Math.max(1, num(b.cantidad, 1));
      bonificaciones.push({
        producto_id: producto.id, nombre: producto.nombre, emoji: producto.emoji, cantidad,
        precio: 0, costo_unitario: num(producto.costo),
        promocion_id: promo.id, promocion_codigo: promo.codigo,
        motivo: `Bonificación por ${requiere} uds.`,
      });
      requisiteStock.set(producto.id, (requisiteStock.get(producto.id) || 0) + cantidad);
      aplicadas.push({ id: promo.id, codigo: promo.codigo, nombre: promo.nombre, tipo: promo.tipo, detalle: `${veces} bonificación(es) · ${cantidad} uds.` });
      return;
    }

    if (promo.tipo === 'mixto') {
      const req = promo.mixto?.items || [];
      const cumple = req.length > 0 && req.every((r) => (carrito.find((i) => i.producto_id === Number(r.producto_id))?.cantidad || 0) >= num(r.cantidad));
      if (!cumple) return;
      const pct = num(promo.mixto.descuento_porcentaje);
      if (pct > 0) {
        const monto = round2(subtotalAfectado * pct / 100);
        todos.forEach((i) => agregarDescuento(descuentosMap, i.producto_id, i.nombre, round2(monto * (i.subtotal / (subtotalAfectado || 1))), promo));
      }
      if (promo.mixto.bonificacion_producto_id && num(promo.mixto.bonificacion_cantidad) > 0) {
        const producto = db.productos.find((p) => p.id === Number(promo.mixto.bonificacion_producto_id));
        if (producto) {
          const cantidad = num(promo.mixto.bonificacion_cantidad);
          bonificaciones.push({
            producto_id: producto.id, nombre: producto.nombre, emoji: producto.emoji, cantidad,
            precio: 0, costo_unitario: num(producto.costo),
            promocion_id: promo.id, promocion_codigo: promo.codigo, motivo: 'Promoción mixta',
          });
          requisiteStock.set(producto.id, (requisiteStock.get(producto.id) || 0) + cantidad);
        }
      }
      aplicadas.push({ id: promo.id, codigo: promo.codigo, nombre: promo.nombre, tipo: promo.tipo, detalle: req.map((r) => `${r.cantidad}x${db.productos.find((p) => p.id === Number(r.producto_id))?.nombre || r.producto_id}`).join(' + ') });
    }
  });

  const descuentos = [...descuentosMap.values()];
  const descuento_total = round2(descuentos.reduce((s, d) => s + d.monto, 0));
  const lineas = carrito.map((i) => {
    const descuento = round2(descuentos.find((d) => d.producto_id === i.producto_id)?.monto || 0);
    return { ...i, descuento, subtotal_final: round2(i.subtotal - descuento) };
  });

  const insuficientes = [];
  requisiteStock.forEach((cantidad, productoId) => {
    const disponible = typeof stockDisponible === 'function' ? stockDisponible(productoId) : stockEn(db, productoId, almacenId);
    if (cantidad > disponible) {
      const producto = db.productos.find((p) => p.id === Number(productoId));
      insuficientes.push({ producto_id: Number(productoId), nombre: producto?.nombre || 'Producto', requerido: cantidad, disponible });
    }
  });

  return {
    aplicadas, descuentos, descuento_total, bonificaciones, lineas, insuficientes,
    advertencias,
  };
}

module.exports = { activas, evaluar };
