import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { Modal } from '../ui';

// Usa la API nativa BarcodeDetector de Android WebView/Chrome (sin librerías
// pesadas). Si el equipo no la soporta, el conteo se hace escribiendo el
// código o el nombre en el campo de captura rápida.
export default function EscanerCodigos({ open, onClose, onLeer }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const [estado, setEstado] = useState('iniciando');

  useEffect(() => {
    if (!open) return undefined;
    let cancelado = false;

    const iniciar = async () => {
      if (!('BarcodeDetector' in window) || !navigator.mediaDevices?.getUserMedia) {
        setEstado('no-soportado');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        if (cancelado) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        let detector;
        try { detector = new window.BarcodeDetector(); }
        catch (e) { detector = new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] }); }
        setEstado('activo');
        const buscar = async () => {
          if (cancelado) return;
          try {
            const codigos = await detector.detect(videoRef.current);
            if (codigos.length && codigos[0].rawValue) { onLeer(codigos[0].rawValue); return; }
          } catch (e) { /* frame sin lectura */ }
          timerRef.current = window.setTimeout(buscar, 350);
        };
        buscar();
      } catch (error) {
        setEstado('sin-camara');
      }
    };
    iniciar();

    return () => {
      cancelado = true;
      window.clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [open, onLeer]);

  return (
    <Modal open={open} onClose={onClose} title="Escanear código de producto" subtitle="Apunta la cámara al código de barras o QR" size="md">
      <div className="form-stack">
        <div style={{ position: 'relative', background: '#061c33', borderRadius: 12, overflow: 'hidden', aspectRatio: '4 / 3' }}>
          <video ref={videoRef} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', inset: '18% 12%', border: '2px solid #25D366', borderRadius: 10, pointerEvents: 'none' }} />
        </div>
        {estado === 'iniciando' && <div className="notice notice-info"><Camera size={15} /> Activando cámara…</div>}
        {estado === 'activo' && <div className="notice notice-info">Mantén el código dentro del recuadro. La lectura se registra automáticamente.</div>}
        {estado === 'no-soportado' && <div className="notice notice-warn">Este dispositivo no soporta lectura de códigos con cámara. Usa el campo de código o nombre para el conteo rápido.</div>}
        {estado === 'sin-camara' && <div className="notice notice-warn">No se pudo abrir la cámara. Revisa el permiso de cámara o usa el campo de código o nombre.</div>}
        <button className="btn btn-outline btn-block" onClick={onClose}><X size={14} /> Cerrar escáner</button>
      </div>
    </Modal>
  );
}
