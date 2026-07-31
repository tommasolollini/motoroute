import maplibregl from 'maplibre-gl';

/** Default view: Perugia (the prototype's default home base). */
export const DEFAULT_CENTER: [number, number] = [12.3888, 43.1107];
export const DEFAULT_ZOOM = 8;

/**
 * Stili di mappa, entrambi senza chiave.
 *
 * "chiaro" è OpenFreeMap Liberty, il predefinito: leggibile in pieno sole.
 *
 * Per lo scuro NON si usa lo stile "dark" di OpenFreeMap: ha sfondo rgb(12,12,12)
 * e strade rgb(24,24,24), cioè nero su nero, e in pratica si vede una tela nera.
 * CARTO Dark Matter è pensato come basemap scuro navigabile (93 livelli, con
 * casing e riempimenti separati) ed espone CORS aperto.
 */
export const MAP_STYLES = {
  chiaro: 'https://tiles.openfreemap.org/styles/liberty',
  scuro: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
} as const;

export type MapTheme = keyof typeof MAP_STYLES;

const THEME_KEY = 'mr_map_theme';

export function getMapTheme(): MapTheme {
  return localStorage.getItem(THEME_KEY) === 'scuro' ? 'scuro' : 'chiaro'; // chiaro di default
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
