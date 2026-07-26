/** Reverse geocoding via the Worker (/reverse), with an in-memory cache. */
const WORKER = import.meta.env.VITE_WORKER_URL;

const cache = new Map<string, string>();
const inflight = new Set<string>();

const key = (lng: number, lat: number): string => `${lat.toFixed(4)},${lng.toFixed(4)}`;

/** Synchronous cache lookup (undefined if not yet fetched). */
export function cachedName(lng: number, lat: number): string | undefined {
  return cache.get(key(lng, lat));
}

/** Pre-seed the cache with a known name (e.g. a saved start). */
export function seedName(lng: number, lat: number, name: string): void {
  cache.set(key(lng, lat), name);
}

/** Fetches a human-readable name for a coordinate; returns null if unavailable. */
export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!WORKER) return null;
  const k = key(lng, lat);
  const hit = cache.get(k);
  if (hit) return hit;
  if (inflight.has(k)) return null;
  inflight.add(k);
  try {
    const r = await fetch(`${WORKER.replace(/\/$/, '')}/reverse?lat=${lat}&lon=${lng}`);
    const name = ((await r.json()) as { name?: string }).name;
    if (name) {
      cache.set(k, name);
      return name;
    }
    return null;
  } catch {
    return null;
  } finally {
    inflight.delete(k);
  }
}
