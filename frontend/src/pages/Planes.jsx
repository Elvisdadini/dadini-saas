import { useEffect, useState } from 'react';
import {
  Building2, Check, CreditCard, Download, Gauge, Landmark, Rocket, ShieldCheck,
  Sparkles, Users, Wallet, Zap,
} from 'lucide-react';
import { api } from '../api';
import { Badge, Money, PageHeader, SkeletonRows, useToast } from '../ui';

const FEATURES = [
  ['Punto de venta y facturación', 'Ventas por canal, crédito y cobros'],
  ['Inventario multi-almacén', 'Stock, transferencias y alertas'],
  ['Distribución y rutas', 'Repartidores, vehículos y entregas'],
  ['Cobranzas y cartera', 'Antigüedad, pagos y recordatorios'],
  ['Reportes y exportación', 'Margen, productos, clientes y CSV'],
  ['Usuarios y roles', 'Permisos por responsabilidad'],
];

const FACTURAS = [
  { id: 'FAC-2026-011', fecha: '01/11/2026', monto: 349, estado: 'Pagada' },
  { id: 'FAC-2026-010', fecha: '01/10/2026', monto: 349, estado: 'Pagada' },
  { id: 'FAC-2026-009', fecha: '01/09/2026', monto: 349, estado: 'Pagada' },
];

export default function Planes() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [upgrade, setUpgrade] = useState(false);
  const [busy, setBusy] = useState(false);

  const cargar = async () => {
    try {
      setData(await api.get('/configuracion'));
    } catch (error) { toast(error.message, 'error'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, []);

  const solicitar = async (nombre, precio, usuarios, almacenes) => {
    setBusy(true);
    try {
      await api.put('/configuracion', { plan: { nombre, precio, usuarios_incluidos: usuarios, almacenes_incluidos: almacenes, estado: 'activo' } });
      toast(`Plan ${nombre} activado. Se aplicará en la próxima facturación.`);
      setUpgrade(false);
      cargar();
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  if (loading) return <><PageHeader title="Plan y facturación" subtitle="Cargando suscripción…" /><div className="panel"><SkeletonRows rows={6} /></div></>;
  const plan = data?.plan || {};
  const uso = data?.uso || {};

  return (
    <>
      <PageHeader
        eyebrow="Suscripción SaaS"
        title="Plan y facturación"
        subtitle="Administra tu suscripción, los límites del plan y los comprobantes de pago."
        actions={<button className="btn btn-primary" onClick={() => setUpgrade(true)}><Rocket size={15} /> Mejorar plan</button>}
      />

      <div className="plan-hero">
        <div className="split" style={{ position: 'relative', zIndex: 1 }}>
          <div>
            <Badge tone="orange"><Sparkles size={11} /> Plan {plan.nombre}</Badge>
            <h2 style={{ marginTop: 10 }}>DADINI opera con {plan.nombre}</h2>
            <p>Ventas, inventario, distribución, cobranzas y administración en una sola plataforma. Tu operación crece sin límites de módulos.</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="plan-price" style={{ marginTop: 0 }}><strong>Bs {plan.precio}</strong><span>/ mes</span></div>
            <span style={{ fontSize: 10.5, color: '#b8cde0' }}>Renovación: {plan.vence}</span>
          </div>
        </div>
        <div className="plan-usage">
          <div>
            <div className="usage-top"><span>Usuarios del equipo</span><span>{uso.usuarios} / {plan.usuarios_incluidos}</span></div>
            <div className="usage-bar"><i style={{ width: `${Math.min(100, (uso.usuarios / plan.usuarios_incluidos) * 100)}%` }} /></div>
          </div>
          <div>
            <div className="usage-top"><span>Almacenes</span><span>{uso.almacenes} / {plan.almacenes_incluidos}</span></div>
            <div className="usage-bar"><i style={{ width: `${Math.min(100, (uso.almacenes / plan.almacenes_incluidos) * 100)}%`, background: '#7C6CF0' }} /></div>
          </div>
        </div>
        <div className="feature-grid">
          {FEATURES.map(([title, sub]) => (
            <div className="feature" key={title}><Check size={14} /><div><strong>{title}</strong><span>{sub}</span></div></div>
          ))}
        </div>
      </div>

      <div className="grid grid-3 section-gap">
        <div className="panel">
          <div className="panel-head"><h3><Gauge size={16} /> Consumo del ciclo</h3></div>
          <div className="panel-body">
            <div className="mini-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="mini-stat"><span>Productos</span><strong>{uso.productos}</strong></div>
              <div className="mini-stat"><span>Pedidos del mes</span><strong>{uso.pedidos_mes}</strong></div>
              <div className="mini-stat"><span>Usuarios</span><strong>{uso.usuarios}</strong></div>
              <div className="mini-stat"><span>Almacenes</span><strong>{uso.almacenes}</strong></div>
            </div>
            <div className="notice notice-success mt-16"><Check size={15} /> Estás dentro de los límites de tu plan. Sin cargos adicionales.</div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><CreditCard size={16} /> Método de pago</h3></div>
          <div className="panel-body">
            <div className="customer-pick" style={{ background: '#061c33', color: '#fff', border: 0 }}>
              <span style={{ width: 34, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.12)', display: 'grid', placeItems: 'center' }}><Landmark size={16} /></span>
              <div className="cp-copy"><strong style={{ color: '#fff' }}>QR Simple Bolivia</strong><span style={{ color: '#a9c0d5' }}>Débito automático · BNB</span></div>
              <Badge tone="green">Activo</Badge>
            </div>
            <div className="invoice-row mt-12"><span className="inv-icon"><Wallet size={16} /></span><div><strong>Transferencia BCP</strong><span>Cuenta **** 8841</span></div><span className="inv-amount muted">Respaldo</span></div>
            <button className="btn btn-outline btn-block mt-12" onClick={() => toast('En producción se abriría el portal de pagos.', 'info')}>Actualizar método de pago</button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3><ShieldCheck size={16} /> Facturación</h3><span className="panel-sub">S/ 2026</span></div>
          <div className="panel-body" style={{ paddingTop: 5 }}>
            {FACTURAS.map((f) => (
              <div className="invoice-row" key={f.id}>
                <span className="inv-icon"><Download size={15} /></span>
                <div><strong>{f.id}</strong><span>{f.fecha} · {f.estado}</span></div>
                <span className="inv-amount"><Money value={f.monto} /></span>
                <button className="icon-btn" title="Descargar" onClick={() => toast('Comprobante demo: la descarga se habilita con la pasarela real.', 'info')}><Download size={14} /></button>
              </div>
            ))}
            <div className="small muted mt-12">Los comprobantes se emiten el primer día de cada mes.</div>
          </div>
        </div>
      </div>

      <div className="panel section-gap">
        <div className="panel-head"><div><h3>Comparativa de planes</h3><p>Escala la plataforma según el tamaño de tu operación.</p></div></div>
        <div className="panel-body">
          <div className="grid grid-3">
            <div className="card card-pad" style={{ borderColor: plan.nombre === 'Starter' ? 'var(--orange)' : 'var(--line)' }}>
              <div className="split"><h3>Starter</h3>{plan.nombre === 'Starter' && <Badge tone="orange">Actual</Badge>}</div>
              <p className="small muted mt-8">Para negocios que inician su digitalización.</p>
              <div style={{ marginTop: 14 }}><strong style={{ fontSize: 25 }}>Bs 199</strong><span className="small muted"> /mes</span></div>
              <ul className="list-clean mt-12">
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> 5 usuarios · 2 almacenes</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> Ventas e inventario</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> Reportes básicos</li>
              </ul>
              {plan.nombre !== 'Starter' && <button className="btn btn-outline btn-block mt-12" onClick={() => solicitar('Starter', 199, 5, 2)} disabled={busy}>Cambiar a Starter</button>}
            </div>
            <div className="card card-pad" style={{ borderColor: plan.nombre === 'Business' ? 'var(--orange)' : 'var(--line)', boxShadow: plan.nombre === 'Business' ? '0 10px 30px rgba(255,101,0,0.12)' : 'none' }}>
              <div className="split"><h3>Business <Zap size={14} color="var(--orange)" /></h3>{plan.nombre === 'Business' && <Badge tone="orange">Actual</Badge>}</div>
              <p className="small muted mt-8">Operación completa con distribución y cobranzas.</p>
              <div style={{ marginTop: 14 }}><strong style={{ fontSize: 25 }}>Bs 349</strong><span className="small muted"> /mes</span></div>
              <ul className="list-clean mt-12">
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> 10 usuarios · 5 almacenes</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> Distribución y rutas</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> Cobranzas y reportes avanzados</li>
              </ul>
              {plan.nombre !== 'Business' && <button className="btn btn-primary btn-block mt-12" onClick={() => solicitar('Business', 349, 10, 5)} disabled={busy}>Elegir Business</button>}
              {plan.nombre === 'Business' && <div className="notice notice-success mt-12"><Check size={14} /> Plan activo y al día</div>}
            </div>
            <div className="card card-pad" style={{ borderColor: 'var(--line)' }}>
              <div className="split"><h3>Enterprise</h3><Badge tone="purple"><Sparkles size={10} /> Escala</Badge></div>
              <p className="small muted mt-8">Multi-sucursal, integraciones y soporte dedicado.</p>
              <div style={{ marginTop: 14 }}><strong style={{ fontSize: 25 }}>Bs 690</strong><span className="small muted"> /mes</span></div>
              <ul className="list-clean mt-12">
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> 25 usuarios · 10 almacenes</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> API e integraciones</li>
                <li className="small muted" style={{ padding: '5px 0' }}><Check size={12} color="var(--green)" /> Soporte prioritario</li>
              </ul>
              {plan.nombre !== 'Enterprise' && <button className="btn btn-navy btn-block mt-12" onClick={() => solicitar('Enterprise', 690, 25, 10)} disabled={busy}>Hablar con ventas</button>}
            </div>
          </div>
          <div className="notice notice-info mt-16"><Building2 size={15} /> Todos los planes incluyen actualizaciones, respaldos diarios y acceso desde cualquier dispositivo.</div>
        </div>
      </div>

      <div className="panel section-gap">
        <div className="panel-head"><div><h3>Tu equipo en el plan</h3><p>Usuarios activos y su nivel de acceso.</p></div><Badge tone="navy"><Users size={11} /> {uso.usuarios} usuarios</Badge></div>
        <div className="panel-body">
          <p className="small muted">Para agregar o desactivar usuarios, ve a <strong>Administración → Usuarios y roles</strong>. Los cupos se liberan inmediatamente al desactivar una cuenta.</p>
        </div>
      </div>
    </>
  );
}
