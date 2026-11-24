// Asignación automática de ruta, zona, categoría, tipo de cliente y
// distribuidor. Todas las funciones son idempotentes: si el dato ya existe lo
// reutilizan y si falta lo crean, para que el alta de clientes nunca falle.
const { nextId } = require('./utils');

const ahora = () => new Date().toISOString();

function mismoTexto(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function asegurarZona(db, nombre) {
  const nombreFinal = String(nombre || '').trim() || 'Centro';
  let zona = (db.zonas || []).find((z) => mismoTexto(z.nombre, nombreFinal));
  let creada = false;
  if (!zona) {
    zona = {
      id: nextId(db.zonas),
      codigo: `ZON-${String(nextId(db.zonas)).padStart(4, '0')}`,
      nombre: nombreFinal,
      descripcion: `Zona comercial ${nombreFinal}`,
      activa: true,
      created_at: ahora(),
    };
    db.zonas.push(zona);
    creada = true;
  }
  return { ...zona, creada };
}

function asegurarTipoCliente(db, tipo, padreId = null) {
  const tipos = db.tipos_cliente || (db.tipos_cliente = []);
  const nombre = String(tipo || '').trim();
  if (!nombre) return asegurarTipoCliente(db, 'Minorista', padreId);
  let objeto = tipos.find((t) => mismoTexto(t.nombre, nombre));
  let creado = false;
  if (!objeto) {
    objeto = {
      id: nextId(tipos),
      codigo: `TIP-${String(nextId(tipos)).padStart(4, '0')}`,
      nombre,
      descripcion: `Clientes ${nombre.toLowerCase()}`,
      padre_id: padreId ? Number(padreId) : null,
      activo: true,
      created_at: ahora(),
    };
    tipos.push(objeto);
    creado = true;
  } else if (padreId && objeto.padre_id === undefined) {
    objeto.padre_id = Number(padreId);
  }
  return { ...objeto, creado };
}

// Tipos ordenados padre → hijo, para los selectores jerárquicos.
function tiposClienteOrdenados(db) {
  const tipos = db.tipos_cliente || [];
  const resultados = [];
  const visitados = new Set();
  const agregar = (padreId, nivel) => {
    tipos.filter((t) => Number(t.padre_id || null) === Number(padreId || null))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .forEach((t) => {
        if (visitados.has(t.id)) return;
        visitados.add(t.id);
        resultados.push({ ...t, nivel });
        agregar(t.id, nivel + 1);
      });
  };
  agregar(null, 0);
  tipos.filter((t) => !visitados.has(t.id)).forEach((t) => resultados.push({ ...t, nivel: 0 }));
  return resultados;
}

function asegurarCategoria(db, categoriaId) {
  const categorias = db.cliente_categorias || [];
  const existente = categoriaId ? categorias.find((c) => c.id === Number(categoriaId)) : null;
  if (existente) return { ...existente, creada: false };
  let categoria = categorias.find((c) => c.activa && mismoTexto(c.nombre, 'General'));
  let creada = false;
  if (!categoria) {
    categoria = {
      id: nextId(categorias),
      codigo: `CAT-${String(nextId(categorias)).padStart(4, '0')}`,
      nombre: 'General',
      descripcion: 'Categoría asignada automáticamente a clientes nuevos',
      descuento_porcentaje: 0,
      descuento_fijo: 0,
      precios: [],
      activa: true,
      created_at: ahora(),
    };
    db.cliente_categorias.push(categoria);
    creada = true;
  }
  return { ...categoria, creada };
}

function rutaDeVendedor(db, vendedor) {
  if (!vendedor) return null;
  return (db.rutas_venta || []).find((r) => r.vendedor_id === vendedor.id && r.activa !== false)
    || (db.rutas_venta || []).find((r) => mismoTexto(r.codigo, vendedor.ruta_venta))
    || null;
}

function asegurarRutaVenta(db, { codigo, nombre, zona, dia_visita, vendedor_id, distribuidor_id }) {
  const rutas = db.rutas_venta || [];
  const codigoFinal = String(codigo || '').trim() || `R${rutas.length + 1}`;
  let ruta = rutas.find((r) => mismoTexto(r.codigo, codigoFinal));
  let creada = false;
  if (!ruta) {
    ruta = {
      id: nextId(rutas),
      codigo: codigoFinal,
      nombre: nombre || `Ruta ${codigoFinal}`,
      zona: zona || 'Centro',
      dia_visita: Number(dia_visita) || 1,
      vendedor_id: vendedor_id || null,
      distribuidor_id: distribuidor_id || null,
      activa: true,
      created_at: ahora(),
      updated_at: ahora(),
    };
    rutas.push(ruta);
    creada = true;
  } else if (vendedor_id && !ruta.vendedor_id) {
    ruta.vendedor_id = vendedor_id;
    ruta.updated_at = ahora();
  }
  return { ...ruta, creada };
}

function distribuidorDeVendedor(db, vendedor) {
  if (!vendedor) return null;
  if (vendedor.repartidor_id) return Number(vendedor.repartidor_id);
  const ruta = rutaDeVendedor(db, vendedor);
  return ruta?.distribuidor_id ? Number(ruta.distribuidor_id) : null;
}

// Completa todas las asignaciones de un cliente a partir de lo ya registrado.
function asignarCliente(db, cliente, vendedor, body = {}) {
  const creados = [];
  const rutaPrev = rutaDeVendedor(db, vendedor);
  const codigoRuta = body.ruta_venta || vendedor?.ruta_venta || rutaPrev?.codigo || 'R1';
  const zonaNombre = body.zona || vendedor?.zona_venta || rutaPrev?.zona || 'Centro';
  const dia = Number(body.dia_visita) || Number(vendedor?.dias_visita?.[0]) || Number(rutaPrev?.dia_visita) || 1;

  const zona = asegurarZona(db, zonaNombre);
  if (zona.creada) creados.push(`zona ${zona.nombre}`);
  const tipoExistente = body.tipo_cliente_id
    ? (db.tipos_cliente || []).find((t) => t.id === Number(body.tipo_cliente_id))
    : null;
  const tipo = tipoExistente
    ? { ...tipoExistente, creado: false }
    : asegurarTipoCliente(db, body.tipo || cliente.tipo || 'minorista');
  if (tipo.creado) creados.push(`tipo ${tipo.nombre}`);
  const categoria = asegurarCategoria(db, body.categoria_cliente_id || vendedor?.categoria_cliente_id);
  if (categoria.creada) creados.push(`categoría ${categoria.nombre}`);
  const distribuidorId = body.distribuidor_id
    ? Number(body.distribuidor_id)
    : distribuidorDeVendedor(db, vendedor);
  const ruta = asegurarRutaVenta(db, {
    codigo: codigoRuta,
    zona: zona.nombre,
    dia_visita: dia,
    vendedor_id: vendedor?.id || null,
    distribuidor_id: distribuidorId,
  });
  if (ruta.creada) creados.push(`ruta ${ruta.codigo}`);

  cliente.vendedor_id = body.vendedor_id ? Number(body.vendedor_id) : (vendedor?.id || cliente.vendedor_id || null);
  cliente.ruta_venta = ruta.codigo;
  cliente.ruta_venta_id = ruta.id;
  cliente.zona = zona.nombre;
  cliente.zona_id = zona.id;
  cliente.tipo = tipo.nombre.toLowerCase();
  cliente.tipo_cliente_id = tipo.id;
  cliente.dia_visita = dia;
  cliente.categoria_cliente_id = categoria.id;
  cliente.distribuidor_id = distribuidorId;
  cliente.asignacion_automatica = true;
  return creados;
}

// Recalcula distribuidor de rutas y clientes cuando cambia el repartidor de un
// vendedor. Devuelve la cantidad de registros actualizados.
function sincronizarAsignaciones(db) {
  let actualizados = 0;
  (db.rutas_venta || []).forEach((ruta) => {
    const vendedor = (db.usuarios || []).find((u) => u.id === ruta.vendedor_id);
    const distribuidor = distribuidorDeVendedor(db, vendedor);
    if (distribuidor && ruta.distribuidor_id !== distribuidor) {
      ruta.distribuidor_id = distribuidor;
      ruta.updated_at = ahora();
      actualizados += 1;
    }
  });
  (db.clientes || []).forEach((cliente) => {
    const vendedor = (db.usuarios || []).find((u) => u.id === cliente.vendedor_id);
    const distribuidor = distribuidorDeVendedor(db, vendedor);
    if (distribuidor && cliente.distribuidor_id !== distribuidor) {
      cliente.distribuidor_id = distribuidor;
      actualizados += 1;
    }
  });
  return actualizados;
}

module.exports = {
  asegurarZona, asegurarTipoCliente, tiposClienteOrdenados, asegurarCategoria, asegurarRutaVenta,
  distribuidorDeVendedor, rutaDeVendedor, asignarCliente, sincronizarAsignaciones,
};
