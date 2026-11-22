import { useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../ui';

export default function BotonWhatsapp({ tipo, clienteId, pedidoId, telefono, latitud, longitude, longitud, monto, referencia, mensaje, label, disabled }) {
  const toast = useToast();
  const [enviando, setEnviando] = useState(false);

  const enviar = async () => {
    setEnviando(true);
    try {
      const r = await api.post('/whatsapp', {
        tipo,
        cliente_id: clienteId,
        pedido_id: pedidoId,
        telefono,
        latitud,
        longitud: longitud ?? longitude,
        monto,
        referencia,
        mensaje,
      });
      window.open(r.url, '_blank', 'noopener,noreferrer');
      await api.patch(`/whatsapp/${r.mensaje.id}/estado`, { estado: 'enviado' });
      toast('Detalle enviado por WhatsApp y registrado en la trazabilidad');
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <button className="btn btn-green btn-sm" onClick={enviar} disabled={disabled || enviando} style={{ background: '#25D366', borderColor: '#25D366', color: '#fff' }}>
      <MessageCircle size={13} /> {enviando ? 'Abriendo…' : label || 'Enviar por WhatsApp'}
    </button>
  );
}
