// Cada aviso lleva a la pantalla donde se resuelve. Se calcula en el backend
// para que la web y la APK reciban el mismo destino, incluso en avisos antiguos.
const REGLAS = [
  { cuando: (n) => n.ruta, ruta: (n) => n.ruta },
  { cuando: (n) => ['empresa'].includes(n.tipo) || /empresa registrada|vencimiento de /i.test(n.titulo || ''), ruta: () => '/administracion/sucursales' },
  { cuando: (n) => /vencimiento|kardex|lote/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/inventario/kardex' },
  { cuando: (n) => /qr|pago qr/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/ventas/nueva' },
  { cuando: (n) => /carga|entrega|ruta|distribuc/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/distribucion' },
  { cuando: (n) => /cobranza|cobro|mora|vencid/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/cobranzas' },
  { cuando: (n) => /visita/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/ventas/agenda' },
  { cuando: (n) => /stock|inventario|producto/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/inventario' },
  { cuando: (n) => /pedido|venta|factura/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/ventas' },
  { cuando: (n) => /objetivo|reporte/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/mi-reporte' },
  { cuando: (n) => /contabilidad|impuesto|libro|arqueo/i.test(`${n.tipo || ''} ${n.titulo || ''}`), ruta: () => '/contabilidad' },
];

function rutaDe(nota) {
  const regla = REGLAS.find((r) => r.cuando(nota || {}));
  return regla ? regla.ruta(nota) : '/';
}

function enriquecer(lista) {
  return (lista || []).map((n) => ({ ...n, ruta: rutaDe(n) }));
}

module.exports = { REGLAS, rutaDe, enriquecer };
