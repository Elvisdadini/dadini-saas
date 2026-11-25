// Generador del Documento Fiscal Digital (borrador conforme a los datos que
// exige el Sistema de Facturación del SIN). La estructura definitiva debe
// validarse contra el Anexo Técnico/XSD de la modalidad asignada al NIT.
function esc(valor) {
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function numero(valor) {
  return Number(valor || 0).toFixed(2);
}

function generarXml(fiscal, factura, pedido, cliente, opciones = {}) {
  const cfg = fiscal || {};
  const f = factura || {};
  const c = cliente || {};
  const sistema = cfg.siat || {};
  const porFuera = f.metodo_iva === 'por_fuera';
  const items = (f.items || (pedido?.items) || []).map((it, i) => `    <item numero="${i + 1}">
      <descripcion>${esc(it.nombre)}</descripcion>
      <cantidad>${esc(it.cantidad)}</cantidad>
      <precio_unitario>${numero(it.precio)}</precio_unitario>
      <subtotal>${numero(it.subtotal ?? (Number(it.precio || 0) * Number(it.cantidad || 0)))}</subtotal>
    </item>`).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<documento_fiscal_digital version="3.0" tipo="factura" ambiente="${esc(sistema.ambiente || 'piloto')}">
  <cabecera>
    <fecha_emision>${esc(f.fecha)}</fecha_emision>
    <numero_factura>${esc(f.numero)}</numero_factura>
    <correlativo>${esc(f.correlativo)}</correlativo>
    <modalidad>${esc(f.modalidad || cfg.modalidad || 'computarizada_sfv')}</modalidad>
    <sucursal>${esc(cfg.sucursal)}</sucursal>
    <punto_venta>${esc(cfg.punto_venta)}</punto_venta>
    <codigo_sistema>${esc(sistema.codigo_sistema)}</codigo_sistema>
    <autorizacion>${esc(f.autorizacion || sistema.codigo_autorizacion)}</autorizacion>
    <cuf>${esc(opciones.cuf || f.cuf || '')}</cuf>
  </cabecera>
  <emisor>
    <nit>${esc(f.nit || cfg.nit)}</nit>
    <razon_social>${esc(f.razon_social || cfg.razon_social)}</razon_social>
    <actividad>${esc(f.actividad || cfg.actividad)}</actividad>
    <regimen>${esc(cfg.regimen || 'general')}</regimen>
  </emisor>
  <receptor>
    <nombre>${esc(f.comprador?.nombre || 'S/N')}</nombre>
    <nit_ci>${esc(f.comprador?.nit || '0')}</nit_ci>
  </receptor>
  <detalle>
${items || '    <item numero="1"><descripcion>SIN DETALLE</descripcion><cantidad>1</cantidad><precio_unitario>0.00</precio_unitario><subtotal>0.00</subtotal></item>'}
  </detalle>
  <totales>
    <subtotal>${numero(f.subtotal)}</subtotal>
    <iva_porcentaje>${esc(f.iva_porcentaje ?? 13)}</iva_porcentaje>
    <iva_metodo>${esc(porFuera ? 'por_fuera' : 'por_dentro')}</iva_metodo>
    <iva>${numero(f.iva)}</iva>
    <it_porcentaje>${esc(f.it_porcentaje ?? 3)}</it_porcentaje>
    <it>${numero(f.it)}</it>
    <total>${numero(f.total)}</total>
    <moneda>BOB</moneda>
  </totales>
  <normativa>
    <version>${esc(f.normativa_version || '')}</version>
    <normas>${esc((f.normas_aplicadas || []).join(','))}</normas>
    <leyenda>IVA calculado segun normativa vigente a la fecha de emision</leyenda>
  </normativa>
  <control>
    <estado>${esc(f.estado || 'vigente')}</estado>
    <representacion_grafica>SIN VALOR LEGAL sin autorizacion del SIN</representacion_grafica>
    <generado_en>${esc(new Date().toISOString())}</generado_en>
  </control>
</documento_fiscal_digital>`;
}

function generarNotaXml(fiscal, nota, factura) {
  const cfg = fiscal || {};
  const n = nota || {};
  const f = factura || {};
  return `<?xml version="1.0" encoding="UTF-8"?>
<documento_fiscal_digital version="3.0" tipo="nota_${esc(n.tipo || 'credito')}" ambiente="${esc(cfg.siat?.ambiente || 'piloto')}">
  <cabecera>
    <fecha_emision>${esc(n.fecha)}</fecha_emision>
    <numero_nota>${esc(n.numero)}</numero_nota>
    <factura_relacionada>${esc(f.numero || '')}</factura_relacionada>
    <cuf>${esc(n.cuf || '')}</cuf>
  </cabecera>
  <emisor>
    <nit>${esc(cfg.nit || '')}</nit>
    <razon_social>${esc(cfg.razon_social || '')}</razon_social>
  </emisor>
  <receptor><nombre>${esc(n.cliente_nombre || 'S/N')}</nombre><nit_ci>${esc(n.cliente_nit || '0')}</nit_ci></receptor>
  <detalle><motivo>${esc(n.motivo || '')}</motivo></detalle>
  <totales>
    <monto>${numero(n.monto)}</monto>
    <moneda>BOB</moneda>
  </totales>
  <normativa><version>${esc(n.normativa_version || '')}</version></normativa>
  <control><estado>${esc(n.estado || 'vigente')}</estado><generado_en>${esc(new Date().toISOString())}</generado_en></control>
</documento_fiscal_digital>`;
}

module.exports = { generarXml, generarNotaXml };

