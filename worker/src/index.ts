/**
 * MotoRoute proxy Worker (Cloudflare, free tier).
 *
 * Holds the single OpenRouteService key as a secret so NO client device
 * (iPhone included) ever needs it. Every device just calls this Worker.
 * Future: this is also where the AI (M2) proxy + caching will live.
 */

export interface Env {
  /** Secret: `wrangler secret put ORS_API_KEY` */
  ORS_API_KEY: string;
  /** Optional comma-separated allowlist of app origins (e.g. the Pages URL). */
  ALLOWED_ORIGINS?: string;
}

const ORS_DIRECTIONS = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get('Origin') ?? '';
    const cors = corsHeaders(origin, env);

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const url = new URL(req.url);

    // Reverse geocoding (Nominatim) with a proper User-Agent + edge cache.
    if (req.method === 'GET' && url.pathname === '/reverse') {
      const lat = url.searchParams.get('lat');
      const lon = url.searchParams.get('lon');
      if (!lat || !lon) return json({ error: 'lat/lon mancanti' }, 400, cors);

      const key = new Request(
        `https://mr-cache/reverse?lat=${Number(lat).toFixed(4)}&lon=${Number(lon).toFixed(4)}`,
      );
      const cache = caches.default;
      const cached = await cache.match(key);
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      const nurl =
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1` +
        `&accept-language=it&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
      let name = '';
      try {
        const nr = await fetch(nurl, {
          headers: { 'User-Agent': 'MotoRoute/1.0 (https://motoroute-97c.pages.dev)' },
        });
        if (nr.ok) name = shortLabel(await nr.json());
      } catch { /* leave name empty */ }

      const payload = JSON.stringify({ name });
      const toCache = new Response(payload, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
      });
      ctx.waitUntil(cache.put(key, toCache.clone()));
      return new Response(payload, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'POST' && url.pathname === '/route') {
      if (!env.ORS_API_KEY) {
        return json({ error: 'Worker non configurato: manca ORS_API_KEY' }, 500, cors);
      }
      const body = await req.text();
      const upstream = await fetch(ORS_DIRECTIONS, {
        method: 'POST',
        headers: { Authorization: env.ORS_API_KEY, 'Content-Type': 'application/json' },
        body,
      });
      const text = await upstream.text();
      return new Response(text, {
        status: upstream.status,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true, hasKey: Boolean(env.ORS_API_KEY) }, 200, cors);
    }

    return new Response('MotoRoute proxy', { headers: cors });
  },
};

function corsHeaders(origin: string, env: Env): Record<string, string> {
  const allow = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  // If an allowlist is set, echo the origin only when it matches; otherwise
  // (unset) reflect the caller's origin — convenient for personal use.
  const allowed = allow.length === 0 || allow.includes(origin);
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : allow[0] ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

interface NominatimResult {
  display_name?: string;
  address?: Record<string, string>;
}

/** Short human label from a Nominatim result, e.g. "Strada Fabrianese, Civitella d'Arna". */
function shortLabel(data: NominatimResult): string {
  const a = data.address ?? {};
  const road = a.road ?? a.pedestrian ?? a.footway ?? a.path;
  const place =
    a.village ?? a.town ?? a.city ?? a.municipality ?? a.hamlet ?? a.suburb ?? a.county;
  if (road && place) return `${road}, ${place}`;
  if (place) return place;
  if (road) return road;
  return (data.display_name ?? '').split(',').slice(0, 2).join(',').trim() || 'Posizione';
}

function json(data: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}
