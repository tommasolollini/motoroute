import maplibregl from 'maplibre-gl';

/** Default view: Perugia (the prototype's default home base). */
export const DEFAULT_CENTER: [number, number] = [12.3888, 43.1107];
export const DEFAULT_ZOOM = 8;

/**
 * Free, key-less vector tiles from the OpenFreeMap public instance.
 * "dark" ha lo sfondo rgb(12,12,12), quasi identico al fondo dell'app, e fa
 * risaltare l'ambra del percorso; "liberty" resta per chi guida in pieno sole.
 */
export const MAP_STYLES = {
  scuro: 'https://tiles.openfreemap.org/styles/dark',
  chiaro: 'https://tiles.openfreemap.org/styles/liberty',
} as const;

export type MapTheme = keyof typeof MAP_STYLES;

const THEME_KEY = 'mr_map_theme';

export function getMapTheme(): MapTheme {
  const v = localStorage.getItem(THEME_KEY);
  return v === 'chiaro' ? 'chiaro' : 'scuro'; // scuro di default: l'app è scura
}

export function setMapTheme(theme: MapTheme): void {
  localStorage.setItem(THEME_KEY, theme);
}

export function createMap(container: HTMLElement): maplibregl.Map {
  const map = new maplibregl.Map({
    container,
    style: MAP_STYLES[getMapTheme()],
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
