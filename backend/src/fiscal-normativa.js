// Registro de normativas tributarias de Bolivia (SIAT/SIN). Los valores se
// guardan con vigencia para que el sistema pueda aplicar aumentos, reducciones
// o leyes temporales automáticamente según la fecha de la operación.
// Fuente base: Ley 843, RND 102100000011 y modificaciones 2026.
const VERSION = '2026.11.25';

const REGISTRO = [
  {
    id: 'iva-843-13',
    norma: 'Ley N° 843 art. 15 · IVA general',
    tipo: 'iva',
    descripcion: 'Tasa general del IVA 13%. Método "por dentro": el impuesto va incluido en el precio (tasa efectiva 13/87 ≈ 14,94% sobre el neto).',
    valor: 13,
    metodo: 'por_dentro',
    fecha_desde: '2021-01-01',
    fecha_hasta: null,
    activa: true,
    fuente: 'Ley N° 843 (Texto Ordenado Vigente)',
  },
  {
    id: 'it-843-3',
    norma: 'Ley N° 843 arts. 72/75 · IT',
    tipo: 'it',
    descripcion: 'Impuesto a las Transacciones 3% sobre ingresos brutos. El IUE pagado se acredita mensualmente como pago a cuenta del IT.',
    valor: 3,
    metodo: 'sobre_bruto',
    fecha_desde: '2021-01-01',
    fecha_hasta: null,
    activa: true,
    fuente: 'Ley N° 843 (Texto Ordenado Vigente)',
  },
  {
    id: 'ley-1733-iva-por-fuera',
    norma: 'Ley N° 1733 · IVA "por fuera"',
    tipo: 'iva',
    descripcion: 'Pasa el IVA a 13% sobre precio neto, discriminado en la factura. Entrará en vigencia el primer día del mes siguiente a la publicación del Decreto Supremo reglamentario. Pendiente de decreto: NO aplicar hasta confirmación oficial.',
    valor: 13,
    metodo: 'por_fuera',
    fecha_desde: null,
    fecha_hasta: null,
    activa: false,
    pendiente_decreto: true,
    fuente: 'Ley N° 1733 de 27/05/2026 · Disposición Final Única',
  },
  {
    id: 'rnd-102600000012-combustible',
    norma: 'RND N° 102600000012 · Crédito fiscal combustible',
    tipo: 'credito_fiscal_compras',
    descripcion: 'Se restablece al 100% el crédito fiscal del IVA en compras de gasolina y diésel (antes 70%). Aplica a compras, no a ventas.',
    valor: 100,
    fecha_desde: '2026-04-14',
    fecha_hasta: null,
    activa: true,
    fuente: 'RND N° 102600000012 de 13/04/2026',
  },
  {
    id: 'rnd-102100000011-comprador-1000',
    norma: 'RND N° 102100000011 art. 25 · Datos del comprador',
    tipo: 'requisito_factura',
    descripcion: 'Nombre y NIT/CI del comprador obligatorios cuando el importe supera Bs 1.000. Hasta Bs 1.000 se puede consignar "S/N" y NIT 0.',
    valor: 1000,
    fecha_desde: '2021-08-11',
    fecha_hasta: null,
    activa: true,
    fuente: 'RND N° 102100000011',
  },
  {
    id: 'rnd-ventas-menores-5',
    norma: 'RND N° 102100000011 art. 25(VI) · Ventas menores a Bs 5',
    tipo: 'requisito_factura',
    descripcion: 'No se requiere documento para ventas inferiores a Bs 5 salvo solicitud del comprador. Se registran al final del día con NIT 99003.',
    valor: 5,
    fecha_desde: '2021-08-11',
    fecha_hasta: null,
    activa: true,
    fuente: 'RND N° 102100000011',
  },
  {
    id: 'rnd-102600000026-tco',
    norma: 'RND N° 102600000026 · Tipo de Cambio Oficial',
    tipo: 'requisito_factura',
    descripcion: 'Las facturas en moneda extranjera deben consignar el TCO del Banco Central de Bolivia de la fecha de la operación.',
    valor: 0,
    fecha_desde: '2026-07-16',
    fecha_hasta: null,
    activa: true,
    fuente: 'RND N° 102600000026 de 15/07/2026',
  },
  {
    id: 'rnd-102600000034-piloto',
    norma: 'RND N° 102600000034 · Anexo Técnico Ley 1733',
    tipo: 'transicion',
    descripcion: 'Pruebas piloto obligatorias del 01/10/2026 al 16/11/2026 para sistemas propios o de proveedor. RND 102100000011 sigue vigente hasta nueva RND implementadora.',
    valor: 0,
    fecha_desde: '2026-10-01',
    fecha_hasta: '2026-11-16',
    activa: true,
    fuente: 'RND N° 102600000034 de 01/09/2026',
  },
  {
    id: 'ley-1733-prescripcion',
    norma: 'Ley N° 1733 · Prescripción tributaria 4 años',
    tipo: 'otro',
    descripcion: 'Reduce de 6 a 4 años el plazo general de prescripción de la administración tributaria (art. 59 Código Tributario). Ya en vigor.',
    valor: 4,
    fecha_desde: '2026-05-27',
    fecha_hasta: null,
    activa: true,
    fuente: 'Ley N° 1733',
  },
  {
    id: 'rnd-102600000038-abrogacion',
    norma: 'RND N° 102600000038 · Abrogación grupos 9-12',
    tipo: 'transicion',
    descripcion: 'Abroga la obligación de los grupos 9 a 12 de implementar facturación en línea en fecha fija. El SIN asignará modalidad periódicamente.',
    valor: 0,
    fecha_desde: '2026-09-30',
    fecha_hasta: null,
    activa: true,
    fuente: 'RND N° 102600000038 de 30/09/2026',
  },
];

function normativaVigente(registro, fecha = new Date().toISOString().slice(0, 10)) {
  return (registro || []).filter((r) => r.activa !== false
    && (!r.fecha_desde || r.fecha_desde <= fecha)
    && (!r.fecha_hasta || r.fecha_hasta >= fecha));
}

function calcularImpuestos(registro, monto, fecha) {
  const vigentes = normativaVigente(registro, fecha);
  const iva = vigentes.find((r) => r.tipo === 'iva' && r.activa !== false && r.fecha_desde);
  const it = vigentes.find((r) => r.tipo === 'it');
  const base = Math.max(0, Number(monto) || 0);
  const porcentajeIva = iva?.valor ?? 13;
  const porDentro = iva?.metodo !== 'por_fuera';
  const ivaValor = porDentro ? base * porcentajeIva / (100 + porcentajeIva) : base * porcentajeIva / 100;
  const itValor = base * (it?.valor ?? 3) / 100;
  const neto = porDentro ? base - ivaValor : base;
  return {
    fecha,
    monto: Math.round(base * 100) / 100,
    metodo: iva?.metodo || 'por_dentro',
    iva_porcentaje: porcentajeIva,
    iva: Math.round(ivaValor * 100) / 100,
    it_porcentaje: it?.valor ?? 3,
    it: Math.round(itValor * 100) / 100,
    neto: Math.round(neto * 100) / 100,
    total: Math.round((porDentro ? base : base + ivaValor) * 100) / 100,
    normas: vigentes.map((r) => ({ id: r.id, norma: r.norma, tipo: r.tipo })),
  };
}

module.exports = { VERSION, REGISTRO, normativaVigente, calcularImpuestos };
