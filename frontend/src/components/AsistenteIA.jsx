import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Bot, Check, Loader2, Mic, MicOff, Send, Sparkles, X } from 'lucide-react';
import { api } from '../api';
import { Badge, useToast } from '../ui';

const SUGERENCIAS = [
  '¿Cómo van las ventas de esta semana?',
  '¿Quiénes deben y cuánto?',
  '¿Qué productos debo reponer?',
  '¿Qué visitas tengo pendientes hoy?',
];

export default function AsistenteIA({ pagina }) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState(null);
  const [alertas, setAlertas] = useState([]);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [ejecutando, setEjecutando] = useState('');
  const [escuchando, setEscuchando] = useState(false);
  const finRef = useRef(null);
  const reconocedorRef = useRef(null);

  const cargarAlertas = useCallback(async () => {
    try {
      const r = await api.get('/ia/alertas');
      setAlertas(r.alertas || []);
    } catch { /* silencio: las alertas son informativas */ }
  }, []);

  useEffect(() => {
    api.get('/ia/estado').then(setEstado).catch(() => {});
    cargarAlertas();
  }, [cargarAlertas]);

  useEffect(() => {
    if (finRef.current) finRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [mensajes, enviando]);

  const enviar = async (mensaje = texto) => {
    const contenido = String(mensaje || '').trim();
    if (!contenido || enviando) return;
    setTexto('');
    setMensajes((m) => [...m, { rol: 'usuario', texto: contenido }]);
    setEnviando(true);
    try {
      const historial = mensajes.slice(-8).map(({ rol, texto: t }) => ({ rol, texto: t }));
      const r = await api.post('/ia/chat', { mensaje: contenido, pagina, historial });
      if (!r.ok) throw new Error(r.error || 'No se pudo consultar al asistente.');
      setMensajes((m) => [...m, { rol: 'ia', texto: r.respuesta, propuestas: r.propuestas || [] }]);
      cargarAlertas();
    } catch (error) {
      toast(error.message, 'error');
      setMensajes((m) => [...m, { rol: 'ia', texto: `No pude responder: ${error.message}` }]);
    } finally { setEnviando(false); }
  };

  const hablar = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return toast('Tu navegador no soporta dictado por voz. Usa Chrome, Edge o la APK.', 'error');
    if (escuchando) {
      reconocedorRef.current?.stop();
      setEscuchando(false);
      return;
    }
    const r = new SR();
    r.lang = 'es-BO';
    r.continuous = false;
    r.interimResults = true;
    r.onresult = (evento) => {
      let transcripcion = '';
      for (let i = evento.resultIndex; i < evento.results.length; i += 1) transcripcion += evento.results[i][0].transcript;
      setTexto(transcripcion);
      if (evento.results[evento.results.length - 1].isFinal) {
        setEscuchando(false);
        if (transcripcion.trim()) enviar(transcripcion.trim());
      }
    };
    r.onerror = (evento) => {
      setEscuchando(false);
      toast(`No se pudo escuchar: ${evento.error}`, 'error');
    };
    r.onend = () => setEscuchando(false);
    reconocedorRef.current = r;
    try { r.start(); setEscuchando(true); }
    catch (error) { toast('No se pudo iniciar el micrófono.', 'error'); }
  };

  const confirmar = async (propuesta) => {
    setEjecutando(propuesta.herramienta);
    try {
      const r = await api.post('/ia/ejecutar', { herramienta: propuesta.herramienta, args: propuesta.args });
      if (!r.ok) throw new Error(r.error || 'No se pudo ejecutar la acción.');
      toast('Acción ejecutada correctamente');
      setMensajes((m) => [
        ...m,
        { rol: 'ia', texto: `Listo: ${propuesta.resumen} Se ejecutó correctamente.` },
      ]);
      cargarAlertas();
    } catch (error) {
      toast(error.message, 'error');
      setMensajes((m) => [...m, { rol: 'ia', texto: `No se pudo ejecutar: ${error.message}` }]);
    } finally { setEjecutando(''); }
  };

  return (
    <div className="ia-widget">
      <button
        className={`ia-lanzador ${abierto ? 'activo' : ''}`}
        onClick={() => setAbierto((v) => !v)}
        title="Asistente AI de DADINI"
      >
        <Sparkles size={17} />
        <span>Asistente AI</span>
        {alertas.length > 0 && <span className="ia-badge">{alertas.length}</span>}
      </button>

      {abierto && (
        <div className="ia-panel">
          <div className="ia-head">
            <div className="inline" style={{ gap: 8 }}>
              <span className="ia-avatar"><Bot size={16} /></span>
              <div>
                <strong>Asistente DADINI</strong>
                <span className="small muted">{estado?.configurado ? `Activo · ${estado.modelo}` : 'Sin configurar'}</span>
              </div>
            </div>
            <button className="icon-btn" onClick={() => setAbierto(false)} aria-label="Cerrar asistente"><X size={16} /></button>
          </div>

          {estado && !estado.configurado && (
            <div className="notice notice-warn ia-aviso"><AlertTriangle size={14} /> {estado.aviso}</div>
          )}

          {alertas.length > 0 && (
            <details className="ia-alertas">
              <summary><AlertTriangle size={13} /> {alertas.length} alertas automáticas</summary>
              {alertas.map((a, i) => (
                <div key={i} className="ia-alerta">
                  <Badge tone={a.severidad === 'alta' ? 'red' : 'amber'}>{a.tipo}</Badge>
                  <strong>{a.titulo}</strong>
                  <span>{a.detalle}</span>
                </div>
              ))}
            </details>
          )}

          <div className="ia-chat">
            {mensajes.length === 0 && (
              <>
                <div className="ia-bienvenida">
                  <Sparkles size={20} />
                  <p>Pregúntame por ventas, cobranzas, stock o visitas. También puedo ejecutar acciones con tu confirmación.</p>
                </div>
                <div className="ia-sugerencias">
                  {SUGERENCIAS.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}
                </div>
              </>
            )}
            {mensajes.map((m, i) => (
              <div key={i} className={`ia-mensaje ${m.rol}`}>
                <div className="ia-burbuja">{m.texto}</div>
                {(m.propuestas || []).map((p, j) => (
                  <div key={j} className="ia-propuesta">
                    <div className="ia-propuesta-head"><Check size={13} /> Acción propuesta</div>
                    <p>{p.resumen}</p>
                    <button className="btn btn-primary btn-sm" disabled={Boolean(ejecutando)} onClick={() => confirmar(p)}>
                      {ejecutando === p.herramienta ? <Loader2 size={13} className="spin" /> : <Check size={13} />}
                      Confirmar y ejecutar
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {enviando && <div className="ia-mensaje ia"><div className="ia-burbuja"><Loader2 size={14} className="spin" /> Pensando…</div></div>}
            <div ref={finRef} />
          </div>

          <form className="ia-form" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
            <input
              className="input"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ej. ¿Qué clientes debo cobrar hoy?"
              disabled={!estado?.configurado || enviando}
            />
            <button className={`btn btn-sm ${escuchando ? 'btn-danger' : 'btn-soft'}`} type="button" onClick={hablar} title="Pedido por voz" disabled={enviando || !estado?.configurado}>
              {escuchando ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button className="btn btn-primary btn-sm" type="submit" disabled={!texto.trim() || enviando || !estado?.configurado}><Send size={14} /></button>
          </form>
        </div>
      )}
    </div>
  );
}
