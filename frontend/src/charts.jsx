import { useMemo, useState } from 'react';

const W = 820;
const H = 260;
const PAD = { top: 18, right: 16, bottom: 34, left: 54 };

function moneyShort(n) {
  const value = Number(n) || 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function smoothPath(points) {
  if (points.length < 2) return '';
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

export function AreaChart({ data = [], height = 280, showPrevious = true, label = 'Ventas' }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.total || 0, showPrevious ? d.anterior || 0 : 0)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const points = useMemo(() => data.map((d, i) => ({
    x: PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: PAD.top + innerH - ((d.total || 0) / max) * innerH,
    ...d,
  })), [data, max, innerH, innerW]);

  const prevPoints = useMemo(() => data.map((d, i) => ({
    x: PAD.left + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW),
    y: PAD.top + innerH - ((d.anterior || 0) / max) * innerH,
  })), [data, max, innerH, innerW]);

  const line = smoothPath(points);
  const prevLine = smoothPath(prevPoints);
  const area = points.length ? `${line} L ${points[points.length - 1].x} ${PAD.top + innerH} L ${points[0].x} ${PAD.top + innerH} Z` : '';

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelsEvery = Math.ceil(data.length / 7);
  const active = hover !== null ? points[hover] : null;

  return (
    <div className="chart" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="chart-svg"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * W;
          let nearest = 0;
          let dist = Infinity;
          points.forEach((p, i) => {
            const d = Math.abs(p.x - x);
            if (d < dist) { dist = d; nearest = i; }
          });
          setHover(nearest);
        }}
      >
        <defs>
          <linearGradient id="dadiniArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF6500" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#FF6500" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {ticks.map((t) => {
          const y = PAD.top + innerH - t * innerH;
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#E7EDF4" strokeWidth="1" strokeDasharray={t === 0 ? '0' : '4 5'} />
              <text x={PAD.left - 10} y={y + 4} textAnchor="end" className="chart-axis">{moneyShort(max * t)}</text>
            </g>
          );
        })}
        {area && <path d={area} fill="url(#dadiniArea)" />}
        {showPrevious && prevLine && <path d={prevLine} fill="none" stroke="#B9C7D6" strokeWidth="1.8" strokeDasharray="5 5" />}
        {line && <path d={line} fill="none" stroke="#FF6500" strokeWidth="2.6" strokeLinecap="round" />}
        {points.map((p, i) => (i % labelsEvery === 0 || i === points.length - 1) && (
          <text key={p.fecha} x={p.x} y={H - 10} textAnchor="middle" className="chart-axis">
            {new Date(`${p.fecha}T12:00:00`).toLocaleDateString('es-BO', { day: '2-digit', month: 'short' })}
          </text>
        ))}
        {active && (
          <g>
            <line x1={active.x} x2={active.x} y1={PAD.top} y2={PAD.top + innerH} stroke="#FF6500" strokeWidth="1" strokeDasharray="3 4" />
            <circle cx={active.x} cy={active.y} r="5" fill="#fff" stroke="#FF6500" strokeWidth="3" />
          </g>
        )}
      </svg>
      {active && (
        <div className="chart-tooltip" style={{ left: `${(active.x / W) * 100}%`, top: `${(active.y / H) * 100}%` }}>
          <span>{new Date(`${active.fecha}T12:00:00`).toLocaleDateString('es-BO', { weekday: 'short', day: '2-digit', month: 'short' })}</span>
          <strong>Bs {Number(active.total).toLocaleString('es-BO', { minimumFractionDigits: 2 })}</strong>
          <small>{active.pedidos} pedidos</small>
        </div>
      )}
      <div className="chart-legend">
        <span><i className="legend-dot orange" /> {label} del período</span>
        {showPrevious && <span><i className="legend-dash" /> Período anterior</span>}
      </div>
    </div>
  );
}

const COLORS = ['#FF6500', '#0B2D4D', '#0F9F7A', '#F5A623', '#7C6CF0', '#E14D6B'];

export function Donut({ items = [], size = 168, thickness = 20, centerLabel = 'Total', centerValue }) {
  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <div className="donut" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#EEF2F7" strokeWidth={thickness} />
          {items.map((item, i) => {
            const value = Number(item.value) || 0;
            const length = total ? (value / total) * circumference : 0;
            const dash = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color || COLORS[i % COLORS.length]}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="donut-center">
          <strong>{centerValue ?? (total >= 1000 ? `${(total / 1000).toFixed(1)}k` : Math.round(total))}</strong>
          <span>{centerLabel}</span>
        </div>
      </div>
      <ul className="donut-legend">
        {items.map((item, i) => (
          <li key={item.label}>
            <i style={{ background: item.color || COLORS[i % COLORS.length] }} />
            <span>{item.label}</span>
            <strong>{total ? Math.round((item.value / total) * 100) : 0}%</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Bars({ items = [], formatter = (v) => v }) {
  const max = Math.max(1, ...items.map((i) => Number(i.value) || 0));
  return (
    <div className="bars">
      {items.map((item, i) => (
        <div key={item.label} className="bar-row">
          <span className="bar-label">{item.label}</span>
          <div className="bar-track">
            <span className="bar-fill" style={{ width: `${(item.value / max) * 100}%`, background: item.color || COLORS[i % COLORS.length] }} />
          </div>
          <span className="bar-value">{formatter(item.value)}</span>
        </div>
      ))}
    </div>
  );
}
