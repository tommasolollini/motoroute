import type { Feature, LineString } from 'geojson';
import type { LngLat } from 'maplibre-gl';

export interface RouteResult {
  feature: Feature<LineString>;
  distanceKm: number;
  durationHours: number;
}

/** Public, key-less BRouter instance. Curvy/moto profiles arrive in M1. */
const BROUTER_URL = 'https://brouter.de/brouter';

export async function routeThrough(
  points: LngLat[],
  profile = 'car-fast',
  alternativeidx = 0,
): Promise<RouteResult> {
  if (points.length < 2) throw new Error('Servono almeno due punti');
  const lonlats = points.map(fmt).join('|');
  const idx = ((alternativeidx % 4) + 4) % 4; // BRouter supports 0..3
  const url = `${BROUTER_URL}?lonlats=${lonlats}&profile=${profile}&alternativeidx=${idx}&format=geojson`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Il servizio di routing ha risposto ${res.status}`);

  const data = (await res.json()) as { features?: Feature<LineString>[] };
  const feature = data.features?.[0];
  if (!feature || feature.geometry?.type !== 'LineString') {
    throw new Error('Nessun percorso trovato tra questi due punti');
  }

  const props = (feature.properties ?? {}) as Record<string, string>;
  const distanceKm = Number(props['track-length'] ?? 0) / 1000;
  const durationHours = Number(props['total-time'] ?? 0) / 3600;

  return { feature, distanceKm, durationHours };
}

function fmt(p: LngLat): string {
  return `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`;
}
