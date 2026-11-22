import * as XLSX from 'xlsx';

export async function leerExcel(file) {
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: '' });
}

export function descargarPlantilla(columnas, nombre) {
  const hoja = XLSX.utils.json_to_sheet([Object.fromEntries(columnas.map((c) => [c, '']))]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
  XLSX.writeFile(libro, nombre);
}
