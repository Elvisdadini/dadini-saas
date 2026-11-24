import { TileLayer } from 'react-leaflet';

// El servidor público de tiles de OpenStreetMap bloquea aplicaciones que no
// cumplen su política de uso (User-Agent/Referer). Usamos los tiles de CARTO,
// construidos sobre datos de OpenStreetMap, con su atribución correspondiente.
export const URL_TILES = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
export const ATRIBUCION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

export default function CapaMapa() {
  return (
    <TileLayer
      attribution={ATRIBUCION}
      url={URL_TILES}
      subdomains="abcd"
      maxZoom={19}
      detectRetina={false}
    />
  );
}
