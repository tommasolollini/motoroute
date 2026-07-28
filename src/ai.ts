/** Natural-language ride requests, parsed by the AI behind the Worker. */
const WORKER = import.meta.env.VITE_WORKER_URL;

export interface RideRequest {
  mode: 'anello' | 'punto_a_punto';
  distance_km: number;
  direction: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO' | 'qualsiasi';
  avoid_highways: boolean;
  themes?: string[];
  /** Named places the ride must pass through (e.g. ["Gubbio"]). */
  via_places?: string[];
  /** Named destination for point-to-point requests. */
  destination?: string;
  summary: string;
}

export interface GeocodedPlace {
  name: string;
  lng: number;
  lat: number;
}

/** Resolves a place name to real coordinates (validated via the Worker). */
export async function geocodePlace(
  q: string,
  near?: { lng: number; lat: number },
): Promise<GeocodedPlace | null> {
  if (!WORKER) return null;
  let url = `${WORKER.replace(/\/$/, '')}/geocode?q=${encodeURIComponent(q)}`;
  if (near) url += `&near=${near.lat},${near.lng}`;
  try {
    const r = await fetch(url);
    const d = (await r.json()) as { found?: boolean; lat?: number; lng?: number; name?: string };
    if (!d.found || d.lat == null || d.lng == null) return null;
    return { name: d.name ?? q, lng: d.lng, lat: d.lat };
  } catch {
    return null;
  }
}

export function hasAi(): boolean {
  return Boolean(WORKER);
}

export async function parseRideRequest(text: string): Promise<RideRequest> {
  if (!WORKER) throw new Error('IA non configurata');
  const res = await fetch(`${WORKER.replace(/\/$/, '')}/ai/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<RideRequest> & { error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? 'IA non disponibile');
  if (!data.mode || typeof data.distance_km !== 'number') throw new Error('Richiesta non compresa');
  return data as RideRequest;
}
