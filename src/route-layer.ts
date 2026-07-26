import type { Feature, LineString } from 'geojson';
import maplibregl from 'maplibre-gl';

const SOURCE_ID = 'route';
const LAYER_CASING = 'route-casing';
const LAYER_LINE = 'route-line';

/** Draws (or updates) the route line and casing on the map. */
export function drawRoute(map: maplibregl.Map, feature: Feature<LineString>): void {
  const data = { type: 'FeatureCollection', features: [feature] } as GeoJSON.FeatureCollection;
  const source = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined;

  if (source) {
    source.setData(data);
    return;
  }

  map.addSource(SOURCE_ID, { type: 'geojson', data });
  map.addLayer({
    id: LAYER_CASING,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#1a0d00', 'line-width': 8, 'line-opacity': 0.6 },
  });
  map.addLayer({
    id: LAYER_LINE,
    type: 'line',
    source: SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#ef9f27', 'line-width': 4.5 },
  });
}

export function clearRoute(map: maplibregl.Map): void {
  for (const id of [LAYER_LINE, LAYER_CASING]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/** Fits the map to the route with padding that clears the top bar and sheet. */
export function fitToRoute(map: maplibregl.Map, feature: Feature<LineString>): void {
  const coords = feature.geometry.coordinates;
  const bounds = coords.reduce(
    (b, c) => b.extend([c[0], c[1]]),
    new maplibregl.LngLatBounds(
      [coords[0][0], coords[0][1]],
      [coords[0][0], coords[0][1]],
    ),
  );
  map.fitBounds(bounds, { padding: { top: 70, right: 50, bottom: 220, left: 50 } });
}
