/** Points of interest from OpenStreetMap via the public Overpass API (keyless). */
import maplibregl from 'maplibre-gl';

export type PoiCategory = 'viewpoint' | 'pass' | 'fuel';

export interface Poi {
  id: number;
  lng: number;
  lat: number;
  name: string;
  category: PoiCategory;
}

export const POI_EMOJI: Record<PoiCategory, string> = {
  viewpoint: '🌄',
  pass: '⛰',
  fuel: '⛽',
};

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Fetches viewpoints, mountain passes and fuel stations within the bounds. */
export async function fetchPois(bounds: maplibregl.LngLatBounds): Promise<Poi[]> {
  const s = bounds.getSouth().toFixed(5);
  const w = bounds.getWest().toFixed(5);
  const n = bounds.getNorth().toFixed(5);
  const e = bounds.getEast().toFixed(5);
  const bbox = `(${s},${w},${n},${e})`;

  const query =
    `[out:json][timeout:20];(` +
    `node["tourism"="viewpoint"]${bbox};` +
    `node["mountain_pass"="yes"]${bbox};` +
    `node["natural"="saddle"]${bbox};` +
    `node["amenity"="fuel"]${bbox};` +
    `);out body 300;`;

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) throw new Error(`Overpass ${res.status}`);

  const data = (await res.json()) as { elements?: OverpassElement[] };
  const pois: Poi[] = [];
  for (const el of data.elements ?? []) {
    const lat = el.lat ?? el.center?.lat;
    const lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const tags = el.tags ?? {};
    const category = categoryOf(tags);
    if (!category) continue;
    pois.push({ id: el.id, lng: lon, lat, name: tags.name ?? defaultName(category), category });
  }
  return pois;
}

function categoryOf(tags: Record<string, string>): PoiCategory | null {
  if (tags.tourism === 'viewpoint') return 'viewpoint';
  if (tags.mountain_pass === 'yes' || tags.natural === 'saddle') return 'pass';
  if (tags.amenity === 'fuel') return 'fuel';
  return null;
}

function defaultName(category: PoiCategory): string {
  return { viewpoint: 'Punto panoramico', pass: 'Valico', fuel: 'Distributore' }[category];
}
