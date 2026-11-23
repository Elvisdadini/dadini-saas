const bcrypt = require('bcryptjs');

const SEED_VERSION = 19;

function mulberry32(seed) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261120);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.floor(rand() * (max - min + 1)) + min;

const iso = (d) => new Date(d).toISOString().slice(0, 10);
const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};
const atHour = (date, hour, minute = 0) => {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

function buildSeed() {
  const now = new Date();
  const passwordHash = bcrypt.hashSync('Dadini2026!', 10);

  const usuarios = [
    { id: 1, nombre: 'Valeria Sejas', email: 'admin@dadini.bo', rol: 'admin', cargo: 'Gerente general', telefono: '67451234', activo: true, password: passwordHash },
    { id: 2, nombre: 'María Quispe', email: 'ventas@dadini.bo', rol: 'preventista', cargo: 'Preventista R1', telefono: '71234567', repartidor_id: 1, vehiculo_id: 2, ruta_venta: 'R1', zona_venta: 'Centro', categoria_cliente_id: 1, es_venta_directa: true, almacen_movil_id: 1, dias_visita: [1, 2, 3, 4, 5], activo: true, password: passwordHash },
    { id: 3, nombre: 'Jorge Villarroel', email: 'almacen@dadini.bo', rol: 'almacen', cargo: 'Jefe de almacén', telefono: '72345678', activo: true, password: passwordHash },
    { id: 4, nombre: 'Luis Mamani', email: 'rutas@dadini.bo', rol: 'distribucion', cargo: 'Repartidor R1', telefono: '73456789', repartidor_id: 1, vehiculo_id: 2, activo: true, password: passwordHash },
    { id: 5, nombre: 'Carla Torres', email: 'cobranzas@dadini.bo', rol: 'cobranzas', cargo: 'Analista de cobranzas', telefono: '74567890', activo: true, password: passwordHash },
    { id: 6, nombre: 'Diego Rojas', email: 'diego@dadini.bo', rol: 'preventista', cargo: 'Preventista R2', telefono: '75678901', repartidor_id: 2, vehiculo_id: 1, ruta_venta: 'R2', zona_venta: 'Quillacollo', categoria_cliente_id: 2, es_venta_directa: false, dias_visita: [1, 2, 3, 4, 5], activo: true, password: passwordHash },
    { id: 7, nombre: 'Andrés DADINI', email: 'dueno@dadini.bo', rol: 'dueno', cargo: 'Dueño del sistema', telefono: '70000001', activo: true, password: passwordHash },
    { id: 8, nombre: 'Sergio Camión', email: 'camion@dadini.bo', rol: 'vendedor_camion', cargo: 'Venta directa en camión', telefono: '70000002', ruta_venta: 'R1', zona_venta: 'Centro', categoria_cliente_id: 2, es_venta_directa: true, almacen_movil_id: 1, activo: true, password: passwordHash },
    { id: 9, nombre: 'Laura Supervisor', email: 'supervisor@dadini.bo', rol: 'supervisor', cargo: 'Supervisora de ventas', telefono: '70000003', activo: true, password: passwordHash },
  ].map((u) => ({
    ...u,
    salario_base: u.rol === 'admin' || u.rol === 'dueno' ? 0 : 2500,
    comision_venta_pct: ['ventas', 'preventista', 'vendedor_camion'].includes(u.rol) ? 2 : 0,
    comision_distribucion_pct: u.rol === 'distribucion' ? 1 : 0,
    bono_fijo: 0,
    descuento_fijo: 0,
    antiguedad_anios: 1 + (u.id % 4),
    created_at: atHour(addDays(now, -120), 9),
    ultimo_acceso: null,
  }));

  const almacenes = [
    { id: 1, nombre: 'Almacén Central', direccion: 'Av. Ayacucho #245', zona: 'Centro', ciudad: 'Cochabamba', encargado: 'Jorge Villarroel', telefono: '72345678', activo: true },
    { id: 2, nombre: 'Sucursal Quillacollo', direccion: 'Av. Blanco Galindo km 12', zona: 'Quillacollo', ciudad: 'Quillacollo', encargado: 'Ruth Aguilar', telefono: '68712345', activo: true },
    { id: 3, nombre: 'Depósito Sacaba', direccion: 'Calle Sucre #118', zona: 'Sacaba', ciudad: 'Sacaba', encargado: 'Marco Padilla', telefono: '69823456', activo: true },
  ];

  const productosBase = [
    ['ANIMALOCOS DINOS', 'Galletas', 3.5, 2.05, '🦖', '#F59E0B', 240],
    ['COOKIE CHIPS CHOCOLATE&CHIPS CHOCOLATE', 'Galletas', 2.5, 1.4, '🍪', '#B45309', 320],
    ['COOKIE CHIPS VANILLA&CHIPS CHOCOLATE', 'Galletas', 2.5, 1.4, '🍪', '#D97706', 280],
    ['KEKITO CHOCOLATE', 'Ponquesitos', 1.5, 0.82, '🧁', '#7C3AED', 420],
    ['KEKITO COCO', 'Ponquesitos', 1.5, 0.82, '🥥', '#0E7490', 8],
    ['KEKITO NARANJA', 'Ponquesitos', 1.5, 0.82, '🍊', '#EA580C', 190],
    ['KEKITO VAINILLA', 'Ponquesitos', 1.5, 0.82, '🌼', '#CA8A04', 210],
    ['OSOS ANIMALOCOS', 'Galletas', 3.0, 1.75, '🐻', '#92400E', 160],
    ['PALITOS CUÑAPE', 'Snacks', 2.0, 1.1, '🥖', '#CA8A04', 150],
    ['PALITOS PIZANTE Y LIMON', 'Snacks', 2.0, 1.1, '🍋', '#65A30D', 175],
    ['PALITOS PIZZA', 'Snacks', 2.0, 1.1, '🍕', '#DC2626', 9],
    ['PALITOS QUESO', 'Snacks', 2.0, 1.1, '🧀', '#D97706', 130],
    ['SURTIDAS 300GX24U', 'Surtidos', 35.0, 23.5, '📦', '#1D4ED8', 26],
    ['SURTIDAS 500GX15U', 'Surtidos', 45.0, 30.2, '🎁', '#0F766E', 5],
  ];

  const productos = productosBase.map((p, i) => ({
    id: i + 1,
    sku: `DAD-${String(i + 1).padStart(3, '0')}`,
    nombre: p[0],
    categoria: p[1],
    precio: p[2],
    costo: p[3],
    emoji: p[4],
    color: p[5],
    unidad: p[1] === 'Surtidos' ? 'caja' : 'unidad',
    unidades_por_caja: p[1] === 'Surtidos' ? 1 : 24,
    unidades_por_paquete: p[1] === 'Surtidos' ? 1 : 12,
    presentacion: p[1] === 'Surtidos' ? 'caja' : 'unidad',
    vender_por: ['unidad', 'caja', 'paquete'],
    categorias_clientes: p[1] === 'Surtidos' ? [1, 3] : [],
    peso_kg: p[1] === 'Surtidos' ? 12 : 0.25,
    stock_minimo: p[1] === 'Surtidos' ? 6 : 24,
    activo: true,
    created_at: atHour(addDays(now, -150), 10),
  }));

  const stockCentral = [240, 320, 280, 420, 8, 190, 210, 160, 150, 175, 9, 130, 26, 5];
  const stock = [];
  let stockId = 1;
  productos.forEach((p, i) => {
    const base = stockCentral[i];
    const q1 = base;
    const q2 = Math.max(0, Math.round(base * 0.28));
    const q3 = Math.max(0, Math.round(base * 0.16));
    [q1, q2, q3].forEach((cantidad, idx) => {
      stock.push({ id: stockId++, producto_id: p.id, almacen_id: idx + 1, cantidad });
    });
  });

  const zonasCoord = {
    'Centro': [-17.3938, -66.1571], 'El Prado': [-17.3700, -66.1400],
    'La Recoleta': [-17.3870, -66.1290], 'Cala Cala': [-17.3840, -66.1450],
    'Quillacollo': [-17.3920, -66.2810], 'Colcapirhua': [-17.3930, -66.2500],
    'Sacaba': [-17.3040, -66.0350], 'Muyurina': [-17.4100, -66.0900],
    'Sarco': [-17.4350, -66.1900], 'Temporal': [-17.3720, -66.1350],
    'Queru Queru': [-17.4180, -66.1700], 'Tiquipaya': [-17.3450, -66.2050],
    'Las Cuadras': [-17.4020, -66.1170], 'San Simón': [-17.3820, -66.1600],
  };

  const clientesBase = [
    ['Distribuidora El Prado', 'mayorista', 'El Prado', 'Av. América #456', '4521789', 6000, 'Marisol Ferrufino'],
    ['Minimarket La Recoleta', 'minorista', 'La Recoleta', 'Av. Pando #1120', '4789456', 1500, 'Rodrigo Calvo'],
    ['Tienda Doña Rosa', 'minorista', 'Cala Cala', 'Calle Antezana #221', '4123678', 0, 'Rosa Villca'],
    ['Kiosco San Simón', 'minorista', 'San Simón', 'Av. Oquendo #890', '4234567', 500, 'Pedro Choque'],
    ['Supermercado Andino', 'mayorista', 'Av. América', 'Av. América Este #2340', '4456789', 8000, 'Silvia Rojas'],
    ['Pulpería Quillacollo', 'minorista', 'Quillacollo', 'Calle Bolívar #45', '4890123', 800, 'Eduardo Céspedes'],
    ['Comercial Sacaba', 'mayorista', 'Sacaba', 'Av. Villazón #670', '4765432', 4000, 'Alicia Tapia'],
    ['Snacks Tiquipaya', 'minorista', 'Tiquipaya', 'Av. Ecológica #310', '4678901', 1200, 'Grover Nina'],
    ['Deli Colcapirhua', 'minorista', 'Colcapirhua', 'Av. Blanco Galindo km 7', '4312345', 1000, 'Fernanda Loayza'],
    ['Kiosco Plaza 14', 'minorista', 'Centro', 'Plaza 14 de Septiembre #12', '4223456', 0, 'Juan Carlos Vega'],
    ['Almacén Muyurina', 'mayorista', 'Muyurina', 'Av. Muyurina #1420', '4534567', 3500, 'Boris Antezana'],
    ['Tienda Los Ángeles', 'minorista', 'Sarco', 'Calle Tacna #560', '4645678', 600, 'Elizabeth Vargas'],
    ['Distribuidora Tunari', 'mayorista', 'Temporal', 'Av. Circunvalación #980', '4756789', 5000, 'Marco Padilla'],
    ['Minimarket El Paseo', 'minorista', 'Queru Queru', 'Av. Juan Pablo II #340', '4867890', 900, 'Nataly Arce'],
    ['Kiosco Estadio', 'minorista', 'Sarco', 'Av. Libertador #1680', '4978901', 0, 'Sergio Torrico'],
    ['Comercial Sur', 'mayorista', 'Las Cuadras', 'Av. Petrolera km 4', '4089012', 4500, 'Katherine Soliz'],
  ];

  const categoriasCliente = [
    { id: 1, codigo: 'CAT-0001', nombre: 'Mayorista', descripcion: 'Clientes mayoristas con crédito y volumen', descuento_porcentaje: 8, descuento_fijo: 0, precios: [], activa: true, created_at: atHour(addDays(now, -120), 8) },
    { id: 2, codigo: 'CAT-0002', nombre: 'Tienda de barrio', descripcion: 'Comercios minoristas de barrio', descuento_porcentaje: 3, descuento_fijo: 0, precios: [], activa: true, created_at: atHour(addDays(now, -120), 8) },
    { id: 3, codigo: 'CAT-0003', nombre: 'Distribuidora', descripcion: 'Distribuidoras y mayoristas especiales', descuento_porcentaje: 12, descuento_fijo: 0, precios: [], activa: true, created_at: atHour(addDays(now, -120), 8) },
  ];

  const clientes = clientesBase.map((c, i) => {
    const baseCoord = zonasCoord[c[2]] || zonasCoord['Centro'];
    const latitud = Math.round((baseCoord[0] + (rand() - 0.5) * 0.006) * 1000000) / 1000000;
    const longitud = Math.round((baseCoord[1] + (rand() - 0.5) * 0.006) * 1000000) / 1000000;
    return {
    id: i + 1,
    codigo: `CLI-${String(i + 1).padStart(3, '0')}`,
    nombre: c[0],
    tipo: c[1],
    zona: c[2],
    direccion: c[3],
    telefono: c[4],
    email: `contacto${i + 1}@cliente.bo`,
    limite_credito: c[5],
    saldo: 0,
    contacto: c[6],
    notas: '',
    activo: true,
    created_at: atHour(addDays(now, -100 + i), 11),
    latitud,
    longitud,
    coordenadas_verificadas: true,
    geolocalizacion_creada_en: atHour(addDays(now, -100 + i), 11),
    ruta_venta: i % 2 === 0 ? 'R1' : 'R2',
    dia_visita: (i % 5) + 1,
    categoria_cliente_id: c[1] === 'mayorista' ? (c[5] >= 4000 ? 3 : 1) : 2,
    vendedor_id: i % 2 === 0 ? 2 : 6,
    bloqueado_por_deuda: false,
    motivo_bloqueo: null,
    bloqueado_en: null,
    };
  });

  const agendaPreventa = [
    { ruta: 'R1', dia: 1, cantidad: 30 },
    { ruta: 'R1', dia: 2, cantidad: 25 },
    { ruta: 'R1', dia: 3, cantidad: 45 },
    { ruta: 'R2', dia: 1, cantidad: 20 },
    { ruta: 'R2', dia: 2, cantidad: 18 },
    { ruta: 'R2', dia: 3, cantidad: 15 },
    { ruta: 'R1', dia: 4, cantidad: 12 },
    { ruta: 'R2', dia: 4, cantidad: 10 },
    { ruta: 'R1', dia: 5, cantidad: 8 },
    { ruta: 'R2', dia: 5, cantidad: 7 },
  ];
  const diasNombre = { 1: 'Lunes', 2: 'Martes', 3: 'Miercoles', 4: 'Jueves', 5: 'Viernes' };
  const zonasLista = Object.keys(zonasCoord);
  agendaPreventa.forEach((grupo) => {
    for (let i = 1; i <= grupo.cantidad; i += 1) {
      const id = clientes.length + 1;
      const zona = zonasLista[(id * 5) % zonasLista.length];
      const baseCoord = zonasCoord[zona];
      const latitud = Math.round((baseCoord[0] + (rand() - 0.5) * 0.012) * 1e6) / 1e6;
      const longitud = Math.round((baseCoord[1] + (rand() - 0.5) * 0.012) * 1e6) / 1e6;
      clientes.push({
        id,
        codigo: `CLI-${String(id).padStart(3, '0')}`,
        nombre: `Cliente ${grupo.ruta} ${diasNombre[grupo.dia]} ${String(i).padStart(2, '0')}`,
        tipo: i % 4 === 0 ? 'mayorista' : 'minorista',
        zona,
        direccion: `Av. ${zona} #${100 + i}`,
        telefono: `4${String(100000 + id).slice(-6)}`,
        email: `cliente${id}@dadini.bo`,
        limite_credito: i % 4 === 0 ? 2500 : 800,
        saldo: 0,
        contacto: `Contacto ${i}`,
        notas: `Visita programada ${grupo.ruta} · ${diasNombre[grupo.dia]}`,
        activo: true,
        created_at: atHour(addDays(now, -60 + (id % 30)), 10),
        latitud,
        longitud,
        coordenadas_verificadas: true,
        geolocalizacion_creada_en: atHour(addDays(now, -60 + (id % 30)), 10),
        ruta_venta: grupo.ruta,
        dia_visita: grupo.dia,
        categoria_cliente_id: i % 4 === 0 ? 1 : 2,
        vendedor_id: grupo.ruta === 'R1' ? 2 : 6,
        bloqueado_por_deuda: false,
        motivo_bloqueo: null,
        bloqueado_en: null,
      });
    }
  });

  const canales = ['mostrador', 'delivery', 'ruta', 'whatsapp'];
  const formas = ['efectivo', 'qr', 'transferencia', 'credito'];
  const vendedores = [2, 6, 2, 6, 2];

  const pedidos = [];
  const pagos = [];
  const movimientos = [];
  let pedidoId = 1;
  let pagoId = 1;
  let movimientoId = 1;
  let ticket = 1001;

  function addPedido(dayOffset, forceStatus) {
    const fechaBase = addDays(now, dayOffset);
    const cliente = pick(clientes);
    const almacen = cliente.zona === 'Quillacollo' ? 2 : cliente.zona === 'Sacaba' ? 3 : 1;
    const cantidadItems = between(1, 4);
    const elegidos = [];
    for (let i = 0; i < cantidadItems; i++) {
      let p = pick(productos);
      let guard = 0;
      while (elegidos.some((e) => e.id === p.id) && guard++ < 12) p = pick(productos);
      elegidos.push(p);
    }
    const items = elegidos.map((p) => {
      const cantidad = p.categoria === 'Surtidos' ? between(1, 3) : between(2, 24);
      return {
        producto_id: p.id,
        nombre: p.nombre,
        emoji: p.emoji,
        cantidad,
        precio: p.precio,
        costo_unitario: p.costo,
        subtotal: Math.round(cantidad * p.precio * 100) / 100,
      };
    });
    const subtotal = Math.round(items.reduce((s, it) => s + it.subtotal, 0) * 100) / 100;
    const canal = pick(canales);
    let descuento = 0;
    if (rand() < 0.18) descuento = Math.round(subtotal * (rand() < 0.5 ? 0.05 : 0.1) * 100) / 100;
    const envio = canal === 'delivery' ? 5 : 0;
    const total = Math.round((subtotal - descuento + envio) * 100) / 100;

    let forma = pick(formas);
    if (cliente.limite_credito === 0 && forma === 'credito') forma = 'efectivo';
    if (cliente.tipo === 'mayorista' && rand() < 0.35) forma = 'credito';

    let estado;
    if (forceStatus) estado = forceStatus;
    else if (dayOffset > 2) estado = rand() < 0.92 ? 'entregado' : 'cancelado';
    else if (dayOffset > 0) estado = rand() < 0.75 ? 'entregado' : rand() < 0.5 ? 'enviado' : 'preparando';
    else estado = pick(['pendiente', 'pendiente', 'preparando', 'enviado', 'entregado']);

    let pagado = 0;
    let estadoPago = 'pendiente';
    if (forma === 'credito') {
      if (rand() < 0.3 && dayOffset > 5) {
        pagado = Math.round(total * 0.5 * 100) / 100;
        estadoPago = 'parcial';
      }
    } else {
      pagado = total;
      estadoPago = 'pagado';
    }
    if (estado === 'cancelado') {
      pagado = 0;
      estadoPago = 'anulado';
    }
    const saldo = estado === 'cancelado' ? 0 : Math.round((total - pagado) * 100) / 100;

    const createdAt = atHour(fechaBase, between(8, 19), between(0, 59));
    const pedido = {
      id: pedidoId++,
      codigo: `VTA-${ticket++}`,
      cliente_id: cliente.id,
      vendedor_id: pick(vendedores),
      canal,
      estado,
      estado_pago: estadoPago,
      forma_pago: forma,
      dias_credito: forma === 'credito' ? pick([8, 15, 20, 30]) : null,
      interes_pagado: 0,
      almacen_id: almacen,
      subtotal,
      descuento,
      envio,
      total,
      pagado,
      saldo,
      items,
      notas: '',
      entrega_direccion: cliente.direccion,
      created_at: createdAt,
      updated_at: createdAt,
      ruta_id: null,
    };
    const vendedorObj = usuarios.find((u) => u.id === pedido.vendedor_id);
    pedido.es_preventa = vendedorObj?.rol === 'preventista' && dayOffset <= 7 && rand() < 0.35;
    pedido.ruta_venta = pedido.es_preventa ? (vendedorObj?.ruta_venta || null) : null;
    pedido.repartidor_asignado_id = pedido.es_preventa ? (vendedorObj?.repartidor_id || null) : null;
    pedido.fecha_entrega_programada = pedido.es_preventa ? iso(addDays(now, 1)) : null;
    pedidos.push(pedido);

    if (pagado > 0 && estado !== 'cancelado') {
      pagos.push({
        id: pagoId++,
        codigo: `REC-${String(5000 + pagoId).slice(0, 4)}`,
        pedido_id: pedido.id,
        cliente_id: cliente.id,
        monto: pagado,
        metodo: forma === 'credito' ? 'transferencia' : forma,
        fecha: createdAt,
        usuario_id: 2,
        nota: forma === 'credito' ? 'Pago parcial de crédito' : 'Pago al contado',
      });
    }

    if (estado !== 'cancelado') {
      items.forEach((it) => {
        movimientos.push({
          id: movimientoId++,
          producto_id: it.producto_id,
          almacen_id: almacen,
          tipo: 'salida',
          cantidad: it.cantidad,
          motivo: 'Venta',
          referencia: pedido.codigo,
          usuario_id: 2,
          fecha: createdAt,
        });
      });
    }

    return pedido;
  }

  for (let day = 64; day >= 0; day--) {
    const cantidad = day === 0 ? 8 : day === 1 ? 5 : between(1, 3);
    for (let i = 0; i < cantidad; i++) {
      if (day === 0) addPedido(0, pick(['pendiente', 'pendiente', 'preparando', 'preparando', 'enviado', 'entregado']));
      else addPedido(-day);
    }
  }

  // Carga inicial de inventario (antes de las ventas)
  const initialDate = atHour(addDays(now, -40), 8);
  stock.forEach((s) => {
    movimientos.push({
      id: movimientoId++,
      producto_id: s.producto_id,
      almacen_id: s.almacen_id,
      tipo: 'entrada',
      cantidad: s.cantidad,
      motivo: 'Carga inicial de inventario',
      referencia: `INI-${String(s.almacen_id).padStart(2, '0')}`,
      usuario_id: 3,
      fecha: initialDate,
    });
  });
  movimientos.reverse();
  movimientos.forEach((m, i) => { m.id = i + 1; });

  const repartidores = [
    { id: 1, nombre: 'Luis Mamani', telefono: '73456789', licencia: 'A-III 45892', zona: 'Centro y Recoleta', activo: true, emoji: '🛵' },
    { id: 2, nombre: 'Ronald Choque', telefono: '76543210', licencia: 'B 12874', zona: 'Quillacollo', activo: true, emoji: '🚚' },
    { id: 3, nombre: 'Erika Villca', telefono: '77654321', licencia: 'A-III 71203', zona: 'Sacaba', activo: true, emoji: '🛵' },
    { id: 4, nombre: 'Carlos Gutiérrez', telefono: '78765432', licencia: 'C 99812', zona: 'Zona Sur', activo: false, emoji: '🚐' },
  ];

  const vehiculos = [
    { id: 1, placa: '3812-KTB', marca: 'Suzuki', modelo: 'Carry 1.3', tipo: 'Camión ligero', capacidad: '800 kg', estado: 'operativo', km: 68420, activo: true },
    { id: 2, placa: '4521-ABC', marca: 'Honda', modelo: 'XR 150', tipo: 'Motocicleta', capacidad: '60 kg', estado: 'operativo', km: 23150, activo: true },
    { id: 3, placa: '1290-XYZ', marca: 'Toyota', modelo: 'Hiace', tipo: 'Van', capacidad: '1.2 t', estado: 'mantenimiento', km: 112800, activo: true },
    { id: 4, placa: '7745-QRS', marca: 'JAC', modelo: 'X200', tipo: 'Camioneta', capacidad: '500 kg', estado: 'operativo', km: 41900, activo: true },
  ];

  // Rutas de hoy y de ayer con pedidos de reparto
  const hoyISO = iso(now);
  const ayerISO = iso(addDays(now, -1));
  const pedidosHoyReparto = pedidos.filter((p) => p.created_at.slice(0, 10) === hoyISO && ['delivery', 'ruta'].includes(p.canal) && p.estado !== 'cancelado');
  const pedidosAyer = pedidos.filter((p) => p.created_at.slice(0, 10) === ayerISO && ['delivery', 'ruta'].includes(p.canal) && p.estado !== 'cancelado');

  const rutas = [];
  let rutaId = 1;
  function crearRuta(fecha, repartidor_id, vehiculo_id, estado, lista, notas) {
    const ordenados = lista.slice(0, 6);
    if (!ordenados.length) return;
    const stops = ordenados.map((p, i) => {
      let estadoParada = 'pendiente';
      if (estado === 'completada') estadoParada = rand() < 0.9 ? 'entregada' : 'fallida';
      else if (estado === 'en_camino') estadoParada = i < 2 ? 'entregada' : i === 2 ? 'en_camino' : 'pendiente';
      return {
        pedido_id: p.id,
        orden: i + 1,
        estado: estadoParada,
        hora_estimada: `${String(9 + i).padStart(2, '0')}:${i % 2 === 0 ? '30' : '00'}`,
        notas: '',
      };
    });
    const ruta = {
      id: rutaId,
      codigo: `RUT-${String(rutaId).padStart(3, '0')}`,
      fecha,
      repartidor_id,
      vehiculo_id,
      estado,
      notas: notas || '',
      paradas: stops,
      created_at: atHour(new Date(`${fecha}T09:00:00`), 8),
    };
    rutas.push(ruta);
    ordenados.forEach((p) => { p.ruta_id = ruta.id; if (['pendiente', 'preparando'].includes(p.estado)) p.estado = estado === 'completada' ? 'entregado' : 'enviado'; });
    rutaId++;
  }

  crearRuta(hoyISO, 1, 2, 'en_camino', pedidosHoyReparto.slice(0, 5), 'Ruta centro: El Prado, Recoleta y Cala Cala');
  crearRuta(hoyISO, 2, 1, 'programada', pedidosHoyReparto.slice(5, 9), 'Ruta Quillacollo y Colcapirhua');
  crearRuta(ayerISO, 3, 4, 'completada', pedidosAyer.slice(0, 5), 'Ruta Sacaba cerrada sin novedades');

  const mananaISO = iso(addDays(now, 1));
  const porDistribuidor = new Map();
  pedidos.filter((p) => p.es_preventa && p.repartidor_asignado_id).forEach((p) => {
    if (!porDistribuidor.has(p.repartidor_asignado_id)) porDistribuidor.set(p.repartidor_asignado_id, []);
    porDistribuidor.get(p.repartidor_asignado_id).push(p);
  });
  porDistribuidor.forEach((lista, repartidorId) => {
    const ruta = {
      id: rutas.length + 1,
      codigo: `RUT-${String(rutas.length + 1).padStart(3, '0')}`,
      fecha: mananaISO,
      repartidor_id: repartidorId,
      vehiculo_id: usuarios.find((u) => u.repartidor_id === repartidorId)?.vehiculo_id || null,
      estado: 'programada',
      notas: 'Programación automática de pedidos de preventa',
      paradas: lista.map((p, i) => ({ pedido_id: p.id, orden: i + 1, estado: 'pendiente', hora_estimada: `${String(8 + i).padStart(2, '0')}:00`, notas: '' })),
      created_at: atHour(now, 18),
    };
    rutas.push(ruta);
    lista.forEach((p) => { p.ruta_id = ruta.id; });
  });

  clientes.forEach((c) => {
    c.saldo = Math.round(pedidos.filter((p) => p.cliente_id === c.id && p.saldo > 0 && p.estado !== 'cancelado').reduce((s, p) => s + p.saldo, 0) * 100) / 100;
  });

  const auditoria = [
    { id: 5, usuario_id: 1, usuario: 'Valeria Sejas', rol: 'admin', accion: 'Respaldo automático', entidad: 'Sistema', detalle: 'Respaldo diario completado correctamente', fecha: atHour(now, 3), ip: '10.0.0.4' },
    { id: 4, usuario_id: 3, usuario: 'Jorge Villarroel', rol: 'almacen', accion: 'Ajuste de inventario', entidad: 'Inventario', detalle: 'Recepción de 24 cajas SURTIDAS 500GX15U', fecha: atHour(addDays(now, -1), 16), ip: '10.0.0.12' },
    { id: 3, usuario_id: 2, usuario: 'María Quispe', rol: 'ventas', accion: 'Venta registrada', entidad: 'Ventas', detalle: `Pedido ${pedidos[pedidos.length - 1]?.codigo || 'VTA-1000'} confirmado`, fecha: atHour(addDays(now, -1), 15), ip: '10.0.0.21' },
    { id: 2, usuario_id: 4, usuario: 'Luis Mamani', rol: 'distribucion', accion: 'Ruta iniciada', entidad: 'Distribución', detalle: 'RUT-001 en camino con 5 paradas', fecha: atHour(now, 9), ip: '10.0.0.31' },
    { id: 1, usuario_id: 1, usuario: 'Valeria Sejas', rol: 'admin', accion: 'Configuración actualizada', entidad: 'Sistema', detalle: 'Se actualizó la tarifa de envío a Bs 5,00', fecha: atHour(addDays(now, -2), 11), ip: '10.0.0.4' },
  ];

  const promociones = [
    {
      id: 1, codigo: 'PROM-0001', nombre: '2x1 en KEKITO CHOCOLATE', tipo: '2x1',
      descripcion: 'Lleva 2 y paga 1 en KEKITO CHOCOLATE.',
      productos_ids: [4], categorias: [], categorias_clientes: [2], reglas: [],
      dos_por_uno: { paga: 2, gratis: 1 }, bonificacion: null, mixto: null,
      fecha_inicio: iso(addDays(now, -30)), fecha_fin: iso(addDays(now, 60)),
      activa: true, prioridad: 10, created_at: atHour(addDays(now, -30), 8), updated_at: atHour(addDays(now, -30), 8),
    },
    {
      id: 2, codigo: 'PROM-0002', nombre: 'Descuento por volumen en Snacks', tipo: 'volumen',
      descripcion: '5% desde 6 unidades y 10% desde 12 unidades.',
      productos_ids: [], categorias: ['Snacks'], categorias_clientes: [],
      reglas: [
        { min: 6, max: 11, descuento_porcentaje: 5, descuento_fijo: 0 },
        { min: 12, max: null, descuento_porcentaje: 10, descuento_fijo: 0 },
      ],
      dos_por_uno: null, bonificacion: null, mixto: null,
      fecha_inicio: iso(addDays(now, -30)), fecha_fin: iso(addDays(now, 60)),
      activa: true, prioridad: 5, created_at: atHour(addDays(now, -30), 8), updated_at: atHour(addDays(now, -30), 8),
    },
    {
      id: 3, codigo: 'PROM-0003', nombre: 'Bonificación en surtidos', tipo: 'bonificacion',
      descripcion: 'Por cada 2 surtidos, llevas 1 SURTIDAS 500GX15U de bonificación.',
      productos_ids: [13, 14], categorias: [], categorias_clientes: [1, 3], reglas: [],
      dos_por_uno: null, bonificacion: { requiere_cantidad: 2, producto_id: 14, cantidad: 1 }, mixto: null,
      fecha_inicio: iso(addDays(now, -30)), fecha_fin: iso(addDays(now, 60)),
      activa: true, prioridad: 7, created_at: atHour(addDays(now, -30), 8), updated_at: atHour(addDays(now, -30), 8),
    },
    {
      id: 4, codigo: 'PROM-0004', nombre: 'Mixto Galletas + Palitos', tipo: 'mixto',
      descripcion: 'Compra 1 ANIMALOCOS DINOS + 1 PALITOS CUÑAPE y lleva 15% de descuento.',
      productos_ids: [], categorias: [], categorias_clientes: [2], reglas: [],
      dos_por_uno: null, bonificacion: null,
      mixto: { items: [{ producto_id: 1, cantidad: 1 }, { producto_id: 9, cantidad: 1 }], descuento_porcentaje: 15, bonificacion_producto_id: null, bonificacion_cantidad: 0 },
      fecha_inicio: iso(addDays(now, -30)), fecha_fin: iso(addDays(now, 60)),
      activa: true, prioridad: 8, created_at: atHour(addDays(now, -30), 8), updated_at: atHour(addDays(now, -30), 8),
    },
  ];

  const almacenesMoviles = [
    {
      id: 1,
      codigo: 'AMOV-0001',
      nombre: 'Camión venta directa · María',
      vendedor_id: 2,
      vehiculo_id: 2,
      ruta_venta: 'R1',
      zona: 'Centro',
      estado: 'activo',
      lineas: [
        { producto_id: 1, cantidad: 40 },
        { producto_id: 4, cantidad: 30 },
        { producto_id: 9, cantidad: 25 },
        { producto_id: 13, cantidad: 4 },
      ],
      notas: 'Carga inicial para venta directa',
      created_at: atHour(now, 7),
      updated_at: atHour(now, 7),
    },
  ];

  const visitas = [
    { id: 1, cliente_id: 1, tipo: 'venta', modulo: 'Ventas', latitud: clientes[0].latitud, longitud: clientes[0].longitud, precision: 12, estado: 'completada', pedido_id: pedidos[pedidos.length - 1]?.id || null, ruta_id: null, usuario_id: 2, notas: 'Visita comercial registrada desde el móvil', fecha: atHour(now, 10, 15), created_at: atHour(now, 10, 15) },
    { id: 2, cliente_id: 2, tipo: 'cobranza', modulo: 'Cobranzas', latitud: clientes[1].latitud, longitud: clientes[1].longitud, precision: 18, estado: 'completada', pedido_id: pedidos[pedidos.length - 2]?.id || null, ruta_id: null, usuario_id: 5, notas: 'Cobro en punto de venta del cliente', fecha: atHour(now, 11, 40), created_at: atHour(now, 11, 40) },
    { id: 3, cliente_id: 3, tipo: 'distribucion', modulo: 'Distribución', latitud: clientes[2].latitud, longitud: clientes[2].longitud, precision: 10, estado: 'en_curso', pedido_id: pedidos[pedidos.length - 3]?.id || null, ruta_id: rutas[0]?.id || null, usuario_id: 4, notas: 'Repartidor en camino al cliente', fecha: atHour(now, 12, 5), created_at: atHour(now, 12, 5) },
    { id: 4, cliente_id: 17, tipo: 'preventa', modulo: 'Ventas', latitud: clientes[16]?.latitud, longitud: clientes[16]?.longitud, precision: 9, estado: 'completada', resultado: 'pedido', motivo: null, pedido_id: pedidos[pedidos.length - 4]?.id || null, ruta_id: null, ruta_venta: 'R1', dia_visita: 1, usuario_id: 2, notas: 'Pedido confirmado en visita de preventa', fecha: atHour(now, 8, 30), created_at: atHour(now, 8, 30) },
    { id: 5, cliente_id: 18, tipo: 'preventa', modulo: 'Ventas', latitud: clientes[17]?.latitud, longitud: clientes[17]?.longitud, precision: 12, estado: 'completada', resultado: 'no_pedido', motivo: 'cerrado', pedido_id: null, ruta_id: null, ruta_venta: 'R1', dia_visita: 1, usuario_id: 2, notas: 'Local cerrado al momento de la visita', fecha: atHour(now, 9, 10), created_at: atHour(now, 9, 10) },
    { id: 6, cliente_id: 19, tipo: 'preventa', modulo: 'Ventas', latitud: clientes[18]?.latitud, longitud: clientes[18]?.longitud, precision: 15, estado: 'completada', resultado: 'no_pedido', motivo: 'sin_dinero', pedido_id: null, ruta_id: null, ruta_venta: 'R1', dia_visita: 1, usuario_id: 2, notas: 'Cliente sin dinero para realizar el pedido', fecha: atHour(now, 9, 45), created_at: atHour(now, 9, 45) },
    { id: 7, cliente_id: 20, tipo: 'preventa', modulo: 'Ventas', latitud: clientes[19]?.latitud, longitud: clientes[19]?.longitud, precision: 11, estado: 'completada', resultado: 'pedido', motivo: null, pedido_id: pedidos[pedidos.length - 5]?.id || null, ruta_id: null, ruta_venta: 'R1', dia_visita: 1, usuario_id: 2, notas: 'Pedido de contado registrado', fecha: atHour(now, 10, 20), created_at: atHour(now, 10, 20) },
  ];

  return {
    version: SEED_VERSION,
    generado_en: new Date().toISOString(),
    usuarios,
    almacenes,
    productos,
    stock,
    clientes,
    pedidos,
    pagos,
    movimientos,
    rutas,
    repartidores,
    vehiculos,
    auditoria,
    configuracion: {
      empresa: {
        nombre: 'DADINI',
        slogan: 'Lo que necesitas, donde estés',
        nit: '5841230019',
        direccion: 'Av. Ayacucho #245, Centro',
        telefono: '67451234',
        email: 'hola@dadini.bo',
        ciudad: 'Cochabamba',
        pais: 'Bolivia',
        moneda: 'BOB',
        tarifa_envio: 5,
        stock_minimo: 10,
        dias_credito: 15,
        horario: 'Lun a Sáb · 08:00 a 20:00',
      },
      plan: {
        nombre: 'Business',
        precio: 349,
        moneda: 'BOB',
        usuarios_incluidos: 10,
        almacenes_incluidos: 5,
        vence: `${new Date().getFullYear() + 1}-12-31`,
        estado: 'activo',
        ciclo: 'mensual',
      },
      credito: {
        aplicar_interes: true,
        tasa_interes_mensual: 3,
        dias_gracia: 0,
        sancion_fija: 0,
        porcentaje_sancion: 0,
      },
      cobranza: {
        cobrador_id: 5,
        solo_vencidas_para_cobrador: true,
        vendedores_cobran_al_dia: true,
        bloquear_clientes_con_mora: true,
        bloquear_usuarios_con_deuda: false,
      },
      planes: [
        { id: 1, codigo: 'PLAN-START', nombre: 'Start', precio: 149, precio_anual: 1490, usuarios_incluidos: 3, almacenes_incluidos: 1, descuento_porcentaje: 0, activo: true, caracteristicas: ['Ventas', 'Clientes', 'Inventario básico'] },
        { id: 2, codigo: 'PLAN-BUSINESS', nombre: 'Business', precio: 349, precio_anual: 3490, usuarios_incluidos: 10, almacenes_incluidos: 5, descuento_porcentaje: 0, activo: true, caracteristicas: ['Ventas', 'Distribución', 'Cobranzas', 'Reportes', 'Almacenes móviles'] },
        { id: 3, codigo: 'PLAN-ENTERPRISE', nombre: 'Enterprise', precio: 699, precio_anual: 6990, usuarios_incluidos: 30, almacenes_incluidos: 20, descuento_porcentaje: 10, activo: true, caracteristicas: ['Todo Business', 'Preventa R1/R2', 'Promociones', 'Panel del dueño', 'Soporte prioritario'] },
      ],
      descuentos_globales: [
        { id: 1, codigo: 'DESC-ANUAL', nombre: 'Pago anual', porcentaje: 10, activo: true },
        { id: 2, codigo: 'DESC-LEALTAD', nombre: 'Descuento lealtad', porcentaje: 5, activo: false },
      ],
      branding: {
        logo: null,
        nombre: 'DADINI',
        color_primario: '#061C33',
        color_secundario: '#FF6500',
        color_acento: '#16A34A',
        color_fondo: '#F4F6FA',
        tipografia: 'Inter',
        radio: 14,
        densidad: 'comfortable',
      },
      apk: null,
    },
    notificaciones: [
      { id: 1, tipo: 'stock', titulo: 'Stock bajo en SURTIDAS 500GX15U', detalle: 'Solo quedan 5 cajas en Almacén Central', leida: false, fecha: atHour(now, 8) },
      { id: 2, tipo: 'cobranza', titulo: '3 facturas por vencer', detalle: 'Clientes mayoristas con crédito a 15 días', leida: false, fecha: atHour(now, 9) },
      { id: 3, tipo: 'ruta', titulo: 'RUT-001 en camino', detalle: '2 de 5 entregas completadas', leida: false, fecha: atHour(now, 10) },
    ],
    visitas,
    cargas: [],
    mensajes_whatsapp: [],
    promociones,
    cliente_categorias: categoriasCliente,
    producto_categorias: ['Galletas', 'Ponquesitos', 'Snacks', 'Surtidos'].map((nombre, i) => ({
      id: i + 1,
      codigo: `PCAT-${String(i + 1).padStart(4, '0')}`,
      nombre,
      descripcion: `Categoría de producto ${nombre}`,
      activa: true,
      created_at: atHour(now, 8),
    })),
    producto_marcas: ['DADINI', 'Kekito', 'Animalocos'].map((nombre, i) => ({
      id: i + 1,
      codigo: `PMAR-${String(i + 1).padStart(4, '0')}`,
      nombre,
      descripcion: `Marca ${nombre}`,
      activa: true,
      created_at: atHour(now, 8),
    })),
    zonas: [
      { id: 1, codigo: 'ZON-0001', nombre: 'Centro', descripcion: 'Zona comercial Centro', activa: true, created_at: atHour(now, 8) },
      { id: 2, codigo: 'ZON-0002', nombre: 'Quillacollo', descripcion: 'Zona comercial Quillacollo', activa: true, created_at: atHour(now, 8) },
      { id: 3, codigo: 'ZON-0003', nombre: 'La Recoleta', descripcion: 'Zona comercial La Recoleta', activa: true, created_at: atHour(now, 8) },
    ],
    tipos_cliente: [
      { id: 1, codigo: 'TIP-0001', nombre: 'Minorista', descripcion: 'Clientes minoristas', activo: true, created_at: atHour(now, 8) },
      { id: 2, codigo: 'TIP-0002', nombre: 'Mayorista', descripcion: 'Clientes mayoristas', activo: true, created_at: atHour(now, 8) },
    ],
    rutas_venta: [
      { id: 1, codigo: 'R1', nombre: 'Ruta R1 · Centro', zona: 'Centro', zona_id: 1, dia_visita: 1, vendedor_id: 2, distribuidor_id: 1, activa: true, created_at: atHour(now, 8), updated_at: atHour(now, 8) },
      { id: 2, codigo: 'R2', nombre: 'Ruta R2 · Quillacollo', zona: 'Quillacollo', zona_id: 2, dia_visita: 2, vendedor_id: 6, distribuidor_id: 2, activa: true, created_at: atHour(now, 8), updated_at: atHour(now, 8) },
    ],
    almacenes_moviles: almacenesMoviles,
    solicitudes_carga: [],
    devoluciones_movil: [],
    proveedores: [
      { id: 1, codigo: 'PRO-001', nombre: 'Distribuidora Boliviana SRL', nit: '102030405', contacto: 'Ricardo Peña', telefono: '4156789', email: 'ventas@disbolivia.bo', direccion: 'Av. Banzer #1450', ciudad: 'Santa Cruz', categorias: ['Galletas', 'Snacks'], dias_entrega: [1, 3, 5], condiciones_pago: 'Contado', activo: true, created_at: atHour(addDays(now, -90), 9) },
      { id: 2, codigo: 'PRO-002', nombre: 'Dulces del Valle', nit: '203040506', contacto: 'Ana Zeballos', telefono: '4234567', email: 'pedidos@dulcesdelvalle.bo', direccion: 'Calle Sucre #320', ciudad: 'Cochabamba', categorias: ['Ponquesitos'], dias_entrega: [2, 4], condiciones_pago: 'Crédito 15 días', activo: true, created_at: atHour(addDays(now, -80), 9) },
      { id: 3, codigo: 'PRO-003', nombre: 'Mayorista Andino', nit: '304050607', contacto: 'Julio Rojas', telefono: '4321098', email: 'ventas@mayoristaandino.bo', direccion: 'Av. Circunvalación #890', ciudad: 'Cochabamba', categorias: ['Surtidos'], dias_entrega: [1, 4], condiciones_pago: 'Crédito 30 días', activo: true, created_at: atHour(addDays(now, -70), 9) },
    ],
    tipos_gasto: [
      { id: 1, codigo: 'TGA-001', nombre: 'Alquiler', categoria: 'Operación', descripcion: 'Alquiler de local y almacenes', requiere_comprobante: true, activo: true },
      { id: 2, codigo: 'TGA-002', nombre: 'Servicios básicos', categoria: 'Operación', descripcion: 'Luz, agua, internet', requiere_comprobante: true, activo: true },
      { id: 3, codigo: 'TGA-003', nombre: 'Combustible', categoria: 'Distribución', descripcion: 'Combustible de camiones', requiere_comprobante: true, activo: true },
      { id: 4, codigo: 'TGA-004', nombre: 'Sueldos', categoria: 'Personal', descripcion: 'Planillas de personal', requiere_comprobante: false, activo: true },
      { id: 5, codigo: 'TGA-005', nombre: 'Mantenimiento', categoria: 'Operación', descripcion: 'Reparaciones y mantenimiento', requiere_comprobante: true, activo: true },
    ],
    solicitudes_compra: [],
    ordenes_compra: [],
    gastos: [],
    pagos_proveedor: [],
    boletas_pago: [],
    conceptos_nomina: [],
    confirmaciones_carga: [],
    sincronizacion: {
      ultimo_envio: null,
      ultimo_error: null,
      intentos: 0,
      estado: 'sin_configurar',
      empresa_id: 'dadini-principal',
    },
    objetivos_mensuales: [
      {
        id: 1,
        mes: now.toISOString().slice(0, 7),
        vendedor_id: 2,
        ruta_venta: 'R1',
        tipo: 'monto',
        producto_id: null,
        meta_monto: 80000,
        meta_unidades: 0,
        dias_laborables: 22,
        notas: 'Objetivo mensual R1 · definido por administración y supervisor',
        creado_por: 1,
        activo: true,
        created_at: atHour(now, 8),
      },
    ],
  };
}

module.exports = { buildSeed, SEED_VERSION };
