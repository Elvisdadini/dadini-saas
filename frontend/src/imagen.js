// Optimiza una foto de producto antes de subirla: redimensiona a 800 px como
// máximo y la convierte a WebP calidad 0.8 (~30–60 KB por imagen).
export async function optimizarImagen(archivo, maxLado = 800, calidad = 0.8) {
  if (!archivo || !archivo.type || !archivo.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen.');
  }
  const imagen = await new Promise((resolve, reject) => {
    const temporal = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(temporal); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(temporal); reject(new Error('No se pudo leer la imagen.')); };
    img.src = temporal;
  });
  const escala = Math.min(1, maxLado / Math.max(imagen.width || 1, imagen.height || 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round((imagen.width || maxLado) * escala));
  canvas.height = Math.max(1, Math.round((imagen.height || maxLado) * escala));
  canvas.getContext('2d').drawImage(imagen, 0, 0, canvas.width, canvas.height);
  let datos = canvas.toDataURL('image/webp', calidad);
  if (!datos.startsWith('data:image/webp')) datos = canvas.toDataURL('image/jpeg', calidad);
  return datos;
}

// Color promedio de una imagen (para comparación visual rápida en el POS).
export function colorPromedio(imagen, lado = 24) {
  const lienzo = document.createElement('canvas');
  lienzo.width = lado; lienzo.height = lado;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imagen, 0, 0, lado, lado);
  const datos = ctx.getImageData(0, 0, lado, lado).data;
  let r = 0; let g = 0; let b = 0;
  for (let i = 0; i < datos.length; i += 4) { r += datos[i]; g += datos[i + 1]; b += datos[i + 2]; }
  const n = datos.length / 4;
  return [r / n, g / n, b / n];
}

export function distanciaColor(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function colorDeUrl(url) {
  return new Promise((res) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => { try { res(colorPromedio(img)); } catch (e) { res(null); } };
    img.onerror = () => res(null);
    img.src = url;
  });
}

export function skuDeArchivo(nombre) {
  return String(nombre || '').replace(/\.[^.]+$/, '').trim().toUpperCase();
}

export function pesoDeDataUrl(datos) {
  if (!datos || !datos.includes(',')) return 0;
  return Math.round((datos.split(',')[1].length * 3) / 4 / 1024);
}
