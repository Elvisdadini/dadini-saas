import { TileLayer } from 'react-leaflet';

// Ni OpenStreetMap ni CARTO sirven ya tiles raster sin clave (CARTO empezó a
// exigirla el 25/09/2026 y muestra "API KEY REQUIRED"). Usamos el servicio de
// Esri World Street Map, que funciona sin clave con atribución visible.
export const URL_TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}';
export const ATRIBUCION = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN';

export default function CapaMapa() {
  return (
    <TileLayer
      attribution={ATRIBUCION}
      url={URL_TILES}
      maxZoom={19}
      detectRetina={false}
    />
  );
}
