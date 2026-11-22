import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Check, Info, Loader2, X } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const dismiss = useCallback((id) => setItems((prev) => prev.filter((t) => t.id !== id)), []);

  const toast = useCallback((message, tone = 'success') => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack">
        {items.map((item) => (
          <div key={item.id} className={`toast toast-${item.tone}`}>
            <span className="toast-icon">
              {item.tone === 'error' ? <AlertTriangle size={17} /> : item.tone === 'info' ? <Info size={17} /> : <Check size={17} />}
            </span>
            <p>{item.message}</p>
            <button onClick={() => dismiss(item.id)} aria-label="Cerrar"><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal modal-${size}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Spinner({ label = 'Cargando información…' }) {
  return (
    <div className="loading-block">
      <Loader2 size={22} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function SkeletonRows({ rows = 5 }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }).map((_, i) => <div key={i} className="skeleton-row" />)}
    </div>
  );
}

export function EmptyState({ icon: Icon = Info, title, message, action }) {
  return (
    <div className="empty-state">
      <span className="empty-icon"><Icon size={24} /></span>
      <h4>{title}</h4>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

const TONES = {
  pendiente: ['amber', 'Pendiente'],
  preparando: ['blue', 'Preparando'],
  enviado: ['purple', 'Enviado'],
  entregado: ['green', 'Entregado'],
  cancelado: ['red', 'Cancelado'],
  pagado: ['green', 'Pagado'],
  parcial: ['blue', 'Parcial'],
  anulado: ['gray', 'Anulado'],
  programada: ['blue', 'Programada'],
  en_camino: ['amber', 'En camino'],
  completada: ['green', 'Completada'],
  cancelada: ['red', 'Cancelada'],
  fallida: ['red', 'Fallida'],
  entregada: ['green', 'Entregada'],
  operativo: ['green', 'Operativo'],
  mantenimiento: ['amber', 'Mantenimiento'],
  activo: ['green', 'Activo'],
  inactivo: ['gray', 'Inactivo'],
  mayorista: ['purple', 'Mayorista'],
  minorista: ['blue', 'Minorista'],
  efectivo: ['green', 'Efectivo'],
  qr: ['blue', 'QR'],
  transferencia: ['purple', 'Transferencia'],
  credito: ['amber', 'Crédito'],
  mostrador: ['gray', 'Mostrador'],
  delivery: ['orange', 'Delivery'],
  ruta: ['purple', 'Ruta'],
  whatsapp: ['green', 'WhatsApp'],
  entrada: ['green', 'Entrada'],
  salida: ['red', 'Salida'],
  transferencia_salida: ['amber', 'Transf. salida'],
  transferencia_entrada: ['blue', 'Transf. entrada'],
};

export function Estado({ valor, label }) {
  const [tone, text] = TONES[valor] || ['gray', label || valor];
  return <span className={`badge badge-${tone}`}><i className="dot" />{label || text}</span>;
}

export function Badge({ tone = 'gray', children }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Money({ value, className = '' }) {
  const n = Number(value) || 0;
  return <span className={`money ${className}`}>Bs {n.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>;
}

export function Num({ value }) {
  return (Number(value) || 0).toLocaleString('es-BO');
}

export function Fecha({ value, time = false, short = false }) {
  if (!value) return <span className="muted">—</span>;
  const raw = String(value);
  // Las fechas sin hora ("2026-11-21") se interpretan como UTC y pueden
  // mostrar el día anterior en Bolivia (UTC-4). Las anclamos al mediodía local.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T12:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return <span>{value}</span>;
  const opts = short ? { day: '2-digit', month: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' };
  return (
    <span>
      {date.toLocaleDateString('es-BO', opts)}
      {time && ` · ${date.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' })}`}
    </span>
  );
}

export function Avatar({ name = '', size = 36, tone = 'navy' }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <span className={`avatar avatar-${tone}`} style={{ width: size, height: size, fontSize: size * 0.36 }}>{initials || 'D'}</span>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = 'orange', trend, onClick }) {
  return (
    <button type="button" className={`stat-card ${onClick ? 'clickable' : ''}`} onClick={onClick}>
      <div className="stat-top">
        <span className={`stat-icon stat-${tone}`}>{Icon && <Icon size={19} />}</span>
        {trend !== undefined && (
          <span className={`trend ${trend >= 0 ? 'up' : 'down'}`}>{trend >= 0 ? '▲' : '▼'} {Math.abs(trend).toFixed(1)}%</span>
        )}
      </div>
      <strong>{value}</strong>
      <span className="stat-label">{label}</span>
      {hint && <span className="stat-hint">{hint}</span>}
    </button>
  );
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          className={active === tab.value ? 'active' : ''}
          onClick={() => onChange(tab.value)}
          type="button"
        >
          {tab.label}
          {tab.count !== undefined && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value = 0, tone = 'orange' }) {
  return (
    <div className="progress">
      <span className={`progress-fill progress-${tone}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function Confirm({ open, onClose, onConfirm, title = '¿Confirmas esta acción?', message, danger = false, loading = false }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={message}
      size="sm"
      footer={(
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm} disabled={loading}>
            {loading ? 'Procesando…' : 'Confirmar'}
          </button>
        </>
      )}
    >
      <div className={`confirm-icon ${danger ? 'danger' : ''}`}><AlertTriangle size={24} /></div>
    </Modal>
  );
}
