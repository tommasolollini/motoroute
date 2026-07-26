import maplibregl from 'maplibre-gl';

/** Default view: Perugia (the prototype's default home base). */
export const DEFAULT_CENTER: [number, number] = [12.3888, 43.1107];
export const DEFAULT_ZOOM = 8;

/** Free, key-less vector tiles from the OpenFreeMap public instance. */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: { compact: true },
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

  const geolocate = new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: false,
    showUserLocation: true,
  });
  map.addControl(geolocate, 'top-right');

  return map;
}
