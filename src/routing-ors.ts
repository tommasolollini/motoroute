import type { Feature, LineString } from 'geojson';
import type { LngLat } from 'maplibre-gl';
import type { RouteResult } from './routing';

/**
 * OpenRouteService routing (needs a free API key). Adds native highway/toll
 * avoidance, which BRouter's keyless profiles can't do.
 * Dev: key from VITE_ORS_API_KEY. Production: proxied via the Cloudflare Worker.
 */
const ORS_DIRECT = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
const KEY = import.meta.env.VITE_ORS_API_KEY;
const WORKER = import.meta.env.VITE_WORKER_URL;

export type Preference = 'recommended' | 'fastest' | 'shortest';

export interface RouteOptions {
  avoidHighways: boolean;
  preference: Preference;
}

/**
 * Available when EITHER a Worker URL is configured (production: key lives in the
 * Worker, every device works with no key) OR a dev key is present in .env.
 */
export function hasOrs(): boolean {
  return Boolean(WORKER) || (typeof KEY === 'string' && KEY.length > 0);
}

export async function routeOrs(points: LngLat[], opts: RouteOptions): Promise<RouteResult> {
  if (!hasOrs()) throw new Error('Routing ORS non configurato');
  if (points.length < 2) throw new Error('Servono almeno due punti');

  const body: Record<string, unknown> = {
    coordinates: points.map((p) => [p.lng, p.lat]),
    preference: opts.preference,
    instructions: false,
  };
  if (opts.avoidHighways) body.options = { avoid_features: ['highways', 'tollways'] };

  // Production: call our Worker (no key in the client). Dev: call ORS directly.
  const endpoint = WORKER ? `${WORKER.replace(/\/$/, '')}/route` : ORS_DIRECT;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!WORKER) headers.Authorization = KEY as string;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const msg = await safeError(res);
    throw new Error(msg);
  }

  const data = (await res.json()) as { features?: Feature<LineString>[] };
  const feature = data.features?.[0];
  if (!feature || feature.geometry?.type !== 'LineString') {
    throw new Error('Nessun percorso trovato tra questi punti');
  }

  const summary = (feature.properties as { summary?: { distance?: number; duration?: number } })?.summary ?? {};
  return {
    feature,
    distanceKm: (summary.distance ?? 0) / 1000,
    durationHours: (summary.duration ?? 0) / 3600,
  };
}

async function safeError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j?.error?.message ?? `OpenRouteService ha risposto ${res.status}`;
  } catch {
    return `OpenRouteService ha risposto ${res.status}`;
  }
}
