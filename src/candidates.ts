/** Real thematic candidates from OpenStreetMap, used to ground the AI's choices. */
import maplibregl from 'maplibre-gl';
import { destinationPoint, distanceKm, bearingBetween } from './geo';

export interface Candidate {
  name: string;
  lng: number;
  lat: number;
  kind: string;
  /** Distance from the ride start, km. */
  distKm: number;
  /** Compass direction from the start, e.g. "NE". */
  dir: string;
}

// overpass-api.de is often slow/overloaded; try mirrors in turn.
const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** POST an Overpass query, trying each mirror until one succeeds. */
async function overpassQuery(body: string): Promise<{ elements?: { lat?: number; lon?: number; tags?: Record<string, string> }[] }> {
  let lastErr: unknown;
  for (const url of OVERPASS_MIRRORS) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(body)}`,
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (res.ok) return await res.json();
      lastErr = new Error(`Overpass ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass non raggiungibile');
}

/** Overpass filters per theme (only named nodes, so the AI gets real names). */
function filtersFor(themes: string[]): string[] {
  const f = new Set<string>();
  for (const t of themes) {
    switch (t) {
      case 'borghi':
      case 'arte':
        f.add('node["place"~"^(village|town)$"]["name"]');
        f.add('node["historic"~"^(castle|monastery)$"]["name"]');
        break;
      case 'panoramico':
        f.add('node["tourism"="viewpoint"]["name"]');
        f.add('node["place"~"^(village|town)$"]["name"]');
        break;
      case 'montagna':
      case 'curve':
        f.add('node["mountain_pass"="yes"]["name"]');
        f.add('node["natural"="peak"]["name"]');
        break;
      case 'enogastronomia':
        f.add('node["craft"="winery"]["name"]');
        f.add('node["place"~"^(village|town)$"]["name"]');
        break;
      default:
        break;
    }
  }
  if (f.size === 0) f.add('node["place"~"^(village|town)$"]["name"]');
  return [...f];
}

const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
function compassLabel(deg: number): string {
  return COMPASS_LABELS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

/**
 * Looks for candidates in a ring roughly `radiusKm` away from the start, so the
 * picks are far enough to shape a loop of the requested size.
 */
export async function fetchCandidates(
  start: maplibregl.LngLat,
  radiusKm: number,
  themes: string[],
  bearingDeg?: number,
): Promise<Candidate[]> {
  // Centre the search where the loop should bulge; without a direction, search
  // a wide box around the start.
  const centre = bearingDeg == null ? start : destinationPoint(start, bearingDeg, radiusKm);
  const halfDeg = Math.max(0.25, Math.min(1.1, radiusKm / 95));
  const bbox = `(${(centre.lat - halfDeg).toFixed(4)},${(centre.lng - halfDeg).toFixed(4)},${(centre.lat + halfDeg).toFixed(4)},${(centre.lng + halfDeg).toFixed(4)})`;
  const body = `[out:json][timeout:25];(${filtersFor(themes).map((f) => f + bbox + ';').join('')});out body 120;`;

  const data = await overpassQuery(body);

  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const el of data.elements ?? []) {
    const name = el.tags?.name;
    if (!name || el.lat == null || el.lon == null || seen.has(name)) continue;
    const p = new maplibregl.LngLat(el.lon, el.lat);
    const d = distanceKm(start, p);
    // Keep a sensible ring: not on top of the start, not absurdly far.
    if (d < radiusKm * 0.35 || d > radiusKm * 1.9) continue;
    seen.add(name);
    out.push({
      name,
      lng: el.lon,
      lat: el.lat,
      kind: el.tags?.mountain_pass ? 'valico' : (el.tags?.tourism ?? el.tags?.historic ?? el.tags?.place ?? 'luogo'),
      distKm: Math.round(d),
      dir: compassLabel(bearingBetween(start, p)),
    });
  }
  return out.slice(0, 60);
}
