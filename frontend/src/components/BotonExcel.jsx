import { useState } from 'react';
import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { descargarExcel } from '../excel';
import { useToast } from '../ui';

// Exporta cualquier listado a .xlsx con xlsx cargado de forma diferida.
export default function BotonExcel({ filas = [], nombre = 'listado', columnas, label = 'Excel' }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const exportar = async () => {
    if (!filas.length) return toast('No hay filas para exportar.', 'error');
    setBusy(true);
    try {
      await descargarExcel(filas, `${nombre}-${new Date().toISOString().slice(0, 10)}.xlsx`, columnas);
      toast(`Excel descargado · ${filas.length} fila(s)`);
    } catch (error) {
      toast(error.message, 'error');
    } finally { setBusy(false); }
  };

  return (
    <button className="btn btn-outline btn-sm" title={`Exportar ${filas.length} fila(s) a Excel`} onClick={exportar} disabled={busy}>
      {busy ? <Loader2 size={14} className="spin" /> : <FileSpreadsheet size={14} />} {label}
    </button>
  );
}
