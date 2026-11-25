import { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine } from 'lucide-react';

// Firma del cliente sobre un canvas. Devuelve un dataURL PNG (compatible con
// el helper `subirFoto` del backend, bucket `comprobantes`).
export default function FirmaCanvas({ value, onChange, label = 'Firma del cliente', alto = 120 }) {
  const canvasRef = useRef(null);
  const dibujando = useRef(false);
  const [tieneTrazo, setTieneTrazo] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#061c33';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (value) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = value;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const punto = (evento) => {
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((evento.clientX - rect.left) / rect.width) * canvasRef.current.width,
      y: ((evento.clientY - rect.top) / rect.height) * canvasRef.current.height,
    };
  };

  const iniciar = (evento) => {
    evento.preventDefault();
    dibujando.current = true;
    const ctx = canvasRef.current.getContext('2d');
    const p = punto(evento);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    canvasRef.current.setPointerCapture?.(evento.pointerId);
  };

  const mover = (evento) => {
    if (!dibujando.current) return;
    evento.preventDefault();
    const ctx = canvasRef.current.getContext('2d');
    const p = punto(evento);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    setTieneTrazo(true);
  };

  const terminar = () => {
    if (!dibujando.current) return;
    dibujando.current = false;
    onChange?.(canvasRef.current.toDataURL('image/png'));
  };

  const limpiar = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setTieneTrazo(false);
    onChange?.(null);
  };

  return (
    <div className="field">
      <label><PenLine size={12} /> {label}</label>
      <div className="firma-box">
        <canvas
          ref={canvasRef}
          width={640}
          height={alto * 2}
          style={{ width: '100%', height: alto, touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={iniciar}
          onPointerMove={mover}
          onPointerUp={terminar}
          onPointerLeave={terminar}
        />
        <span className="firma-linea">Firma aquí</span>
      </div>
      <div className="inline mt-8" style={{ gap: 6 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={limpiar} disabled={!tieneTrazo}><Eraser size={13} /> Limpiar firma</button>
        {tieneTrazo && <span className="small text-green">Firma capturada</span>}
      </div>
      <span className="hint">Pide al cliente que firme con el dedo o el mouse. Se guarda como comprobante.</span>
    </div>
  );
}
