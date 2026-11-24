import { useEffect, useState } from 'react';
import { MessageCircle, Search, Send, Users } from 'lucide-react';
import { api } from '../api';
import { EmptyState, Modal, useToast } from '../ui';

// Muestra la lista de empleados con WhatsApp para elegir uno o varios
// destinatarios de catálogos, APK, boletas y reportes.
export default function SelectorEmpleadosWhatsapp({ open, onClose, titulo, tipo = 'otro', mensaje, urlAdjunto, tituloDocumento }) {
  const toast = useToast();
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState([]);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!open) return;
    setResultado(null);
    setSeleccion([]);
    api.get('/usuarios')
      .then((r) => setUsuarios((r.usuarios || []).filter((u) => u.activo)))
      .catch((e) => toast(e.message, 'error'));
  }, [open, toast]);

  const filtrados = usuarios.filter((u) =>
    !busqueda || `${u.nombre} ${u.cargo || ''} ${u.usuario || ''}`.toLowerCase().includes(busqueda.toLowerCase()));

  const enviar = async () => {
    if (!seleccion.length) return toast('Selecciona al menos un empleado.', 'error');
    setBusy(true);
    try {
      const r = await api.post('/whatsapp/masivo', {
        usuario_ids: seleccion,
        tipo,
        titulo: tituloDocumento || titulo || 'Documento DADINI',
        url_adjunto: urlAdjunto,
        mensaje: mensaje ? (urlAdjunto ? `${mensaje}\n${urlAdjunto}` : mensaje) : undefined,
      });
      setResultado(r);
      toast(`Mensajes preparados para ${r.envios.length} empleado(s)`);
    } catch (error) { toast(error.message, 'error'); } finally { setBusy(false); }
  };

  const abrirTodos = () => {
    (resultado?.envios || []).forEach((e, i) => {
      window.setTimeout(() => window.open(e.url, '_blank', 'noopener,noreferrer'), i * 250);
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={titulo || 'Enviar por WhatsApp'} subtitle="Elige a qué empleados enviar el documento" size="lg"
      footer={resultado ? (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <button className="btn btn-green" onClick={abrirTodos}><MessageCircle size={14} /> Abrir todos los chats</button>
        </>
      ) : (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-green" onClick={enviar} disabled={busy || !seleccion.length}><Send size={14} /> {busy ? 'Preparando…' : `Enviar a ${seleccion.length}`}</button>
        </>
      )}
    >
      {resultado ? (
        <div className="form-stack">
          <div className="notice notice-info">{resultado.envios.length} mensaje(s) registrado(s) en la trazabilidad{resultado.omitidos.length ? ` · Sin WhatsApp: ${resultado.omitidos.join(', ')}` : ''}</div>
          {resultado.envios.map((e) => (
            <div className="split" key={e.id}>
              <span><strong>{e.nombre}</strong> <span className="small muted">{e.telefono}</span></span>
              <button className="btn btn-green btn-sm" onClick={() => window.open(e.url, '_blank', 'noopener,noreferrer')}><MessageCircle size={13} /> Abrir chat</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="form-stack">
          <div className="notice notice-info"><Users size={15} /> Los empleados con teléfono o WhatsApp registrado aparecen aquí. Puedes seleccionar varios.</div>
          <div className="search-box"><Search size={15} /><input className="input" placeholder="Buscar empleado…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
          <div className="inline">
            <button className="btn btn-soft btn-sm" onClick={() => setSeleccion(filtrados.filter((u) => u.whatsapp || u.telefono).map((u) => u.id))}>Marcar todos</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSeleccion([])}>Quitar todos</button>
            <span className="small muted">{seleccion.length} seleccionado(s)</span>
          </div>
          {filtrados.length === 0 ? <EmptyState icon={Users} title="Sin empleados" message="No hay empleados que coincidan." /> : (
            <div className="grid grid-2" style={{ gap: 6, maxHeight: 360, overflowY: 'auto' }}>
              {filtrados.map((u) => (
                <label key={u.id} className="check">
                  <input type="checkbox" checked={seleccion.includes(u.id)} disabled={!u.whatsapp && !u.telefono} onChange={(e) => setSeleccion((s) => e.target.checked ? [...s, u.id] : s.filter((x) => x !== u.id))} />
                  <span><strong>{u.nombre}</strong><br /><span className="hint">{u.whatsapp || u.telefono || 'Sin WhatsApp'} · {u.cargo || u.rol}</span></span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
