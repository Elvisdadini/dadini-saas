// xlsx es pesado (~425 KB): se carga solo cuando el usuario importa o
// descarga una plantilla, no al abrir Clientes/Inventario.
async function cargarXlsx() {
  return import('xlsx');
}

export async function leerExcel(file) {
  const XLSX = await cargarXlsx();
  const buffer = await file.arrayBuffer();
  const libro = XLSX.read(buffer, { type: 'array' });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  return XLSX.utils.sheet_to_json(hoja, { defval: '' });
}

export async function descargarPlantilla(columnas, nombre) {
  const XLSX = await cargarXlsx();
  const hoja = XLSX.utils.json_to_sheet([Object.fromEntries(columnas.map((c) => [c, '']))]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
  XLSX.writeFile(libro, nombre);
}

// Descarga un Excel ya lleno (útil para exportar precios actuales y editarlos).
export async function descargarExcel(filas, nombre, columnas) {
  const XLSX = await cargarXlsx();
  const datos = columnas
    ? filas.map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] ?? ''])))
    : filas;
  const hoja = XLSX.utils.json_to_sheet(datos.length ? datos : [{}]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Datos');
  XLSX.writeFile(libro, nombre);
}
