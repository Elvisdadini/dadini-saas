import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Pause, Play } from 'lucide-react';
import { colorDeUrl, colorPromedio, distanciaColor } from '../imagen';

// Sensor permanente del POS: mantiene la cámara abierta y agrega productos
// al carrito sin que el usuario pulse nada. Lee barras/QR con BarcodeDetector
// y, si no hay código, compara la imagen del producto con las fotos cargadas.
export default function SensorPOS({ productos, alLeerCodigo, alDetectarProducto, activo = true }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const detectorRef = useRef(null);
  const canceladoRef = useRef(false);
  const coloresRef = useRef([]);
  const ultimoRef = useRef({});
  const leerRef = useRef(alLeerCodigo);
  const detectarRef = useRef(alDetectarProducto);
  const pausadoRef = useRef(false);
  const [estado, setEstado] = useState('iniciando');
  const [pausado, setPausado] = useState(false);

  leerRef.current = alLeerCodigo;
  detectarRef.current = alDetectarProducto;
  pausadoRef.current = pausado;

  // Cache del color promedio de las fotos de productos (una sola vez).
  useEffect(() => {
    let vivo = true;
    const conImagen = (productos || []).filter((p) => p.imagen_url);
    Promise.all(conImagen.map((p) => colorDeUrl(p.imagen_url).then((color) => (color ? { producto: p, color } : null))))
      .then((lista) => { if (vivo) coloresRef.current = lista.filter(Boolean); });
    return () => { vivo = false; };
  }, [productos]);

  const registrarCodigo = (codigo) => {
    const clave = `c:${String(codigo).trim()}`;
    const ahora = Date.now();
    if (ahora - (ultimoRef.current[clave] || 0) < 1500) return;
    ultimoRef.current[clave] = ahora;
    leerRef.current?.(codigo);
  };

  const registrarImagen = (producto) => {
    const clave = `p:${producto.id}`;
    const ahora = Date.now();
    if (ahora - (ultimoRef.current[clave] || 0) < 4500) return;
    ultimoRef.current[clave] = ahora;
    detectarRef.current?.(producto);
  };

  const iniciar = useCallback(async () => {
    if (!activo) return;
    canceladoRef.current = false;
    setEstado('iniciando');
    if (!navigator.mediaDevices?.getUserMedia) { setEstado('sin-camara'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false,
      });
      if (canceladoRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      try {
        detectorRef.current = 'BarcodeDetector' in window
          ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'upc_a'] })
          : null;
      } catch (error) { detectorRef.current = null; }
      setEstado('activo');

      const ciclo = async () => {
        if (canceladoRef.current) return;
        const video = videoRef.current;
        if (!pausadoRef.current && video && video.readyState >= 2) {
          let leyoCodigo = false;
          if (detectorRef.current) {
            try {
              const codigos = await detectorRef.current.detect(video);
              if (codigos?.length && codigos[0].rawValue) {
                registrarCodigo(codigos[0].rawValue);
                leyoCodigo = true;
              }
            } catch (error) { /* frame sin lectura */ }
          }
          if (!leyoCodigo && coloresRef.current.length) {
            try {
              const objetivo = colorPromedio(video, 16);
              let mejor = null;
              coloresRef.current.forEach((entry) => {
                const distancia = distanciaColor(objetivo, entry.color);
                if (!mejor || distancia < mejor.distancia) mejor = { ...entry, distancia };
              });
              if (mejor && mejor.distancia < 24) registrarImagen(mejor.producto);
            } catch (error) { /* frame sin comparación */ }
          }
        }
        timerRef.current = window.setTimeout(ciclo, 320);
      };
      ciclo();
    } catch (error) {
      setEstado('sin-camara');
    }
  }, [activo]);

  useEffect(() => {
    iniciar();
    return () => {
      canceladoRef.current = true;
      window.clearTimeout(timerRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [iniciar]);

  return (
    <div className="sensor-pos">
      <div className="sensor-video">
        <video ref={videoRef} muted playsInline autoPlay />
        {estado !== 'activo' && <Camera size={16} />}
      </div>
      <div className="sensor-copy">
        <strong>{estado === 'activo' ? (pausado ? 'Sensor en pausa' : 'Sensor automático activo') : 'Cámara del POS'}</strong>
        <span>{estado === 'activo' ? 'Lee código, QR o muestra el producto' : estado === 'iniciando' ? 'Activando cámara…' : 'Sin permiso de cámara'}</span>
        {estado === 'sin-camara' && <button className="btn btn-primary btn-sm" onClick={iniciar}>Activar cámara</button>}
      </div>
      {estado === 'activo' && <button className="icon-btn" title={pausado ? 'Reanudar sensor' : 'Pausar sensor'} onClick={() => setPausado((v) => !v)}>{pausado ? <Play size={14} /> : <Pause size={14} />}</button>}
    </div>
  );
}
