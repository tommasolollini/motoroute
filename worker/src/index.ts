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
  /** Secret: `wrangler secret put GEMINI_API_KEY` */
  GEMINI_API_KEY?: string;
  /** Optional comma-separated allowlist of app origins (e.g. the Pages URL). */
  ALLOWED_ORIGINS?: string;
}

const GEMINI_MODEL = 'gemini-flash-latest';

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

    // Thematic curation: pick the nicest stops among REAL OSM candidates.
    if (req.method === 'POST' && url.pathname === '/ai/curate') {
      if (!env.GEMINI_API_KEY) return json({ error: 'IA non configurata' }, 500, cors);
      const { themes, candidates, targetKm, startName } = (await req.json().catch(() => ({}))) as {
        themes?: string[];
        candidates?: { name: string; kind: string; distKm: number; dir: string }[];
        targetKm?: number;
        startName?: string;
      };
      if (!candidates?.length) return json({ error: 'Nessun candidato' }, 400, cors);

      const list = candidates
        .slice(0, 60)
        .map((c) => `- ${c.name} (${c.kind}, ${c.distKm} km a ${c.dir})`)
        .join('\n');
      const prompt =
        `Sei un esperto di itinerari in moto in Italia. Partenza: ${startName ?? 'punto scelto'}. ` +
        `L'utente vuole un anello di circa ${targetKm ?? 150} km` +
        `${themes?.length ? ` con questi interessi: ${themes.join(', ')}` : ''}.\n\n` +
        `Scegli da 2 a 3 tappe da questo elenco di luoghi REALI, tali da formare un bell'anello ` +
        `(ben distribuite, non tutte nella stessa direzione, coerenti con gli interessi).\n` +
        `Usa ESATTAMENTE i nomi dell'elenco. Non inventare luoghi.\n\n${list}\n\n` +
        `Restituisci le tappe scelte in ordine di percorrenza e una spiegazione ` +
        `di 1-2 frasi in italiano sul perché questo giro è bello.`;

      const gres = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: 'OBJECT',
                properties: {
                  chosen: { type: 'ARRAY', items: { type: 'STRING' } },
                  explanation: { type: 'STRING' },
                },
                required: ['chosen', 'explanation'],
              },
              temperature: 0.6,
            },
          }),
        },
      );
      if (!gres.ok) return json({ error: `IA non disponibile (${gres.status})` }, 502, cors);
      const gdata = (await gres.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      try {
        return json(JSON.parse(gdata.candidates?.[0]?.content?.parts?.[0]?.text ?? ''), 200, cors);
      } catch {
        return json({ error: 'Risposta IA non interpretabile' }, 502, cors);
      }
    }

    // Forward geocoding (name -> coords) so AI-named places are validated as real.
    // Ricerca località con più risultati, per la barra "cerca una tappa".
    // /geocode restituisce un solo esito ed è pensato per la validazione dell'IA;
    // qui servono alternative fra cui scegliere, come nei suggerimenti di Maps.
    if (req.method === 'GET' && url.pathname === '/search') {
      const q = (url.searchParams.get('q') ?? '').trim();
      if (q.length < 2) return json({ results: [] }, 200, cors);
      const near = url.searchParams.get('near');
      const limit = Math.min(8, Math.max(1, Number(url.searchParams.get('limit')) || 6));

      const key = new Request(
        `https://mr-cache/search?q=${encodeURIComponent(q.toLowerCase())}&near=${near ?? ''}&l=${limit}`,
      );
      const cache = caches.default;
      const cached = await cache.match(key);
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      let nurl =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&accept-language=it` +
        `&limit=${limit}&q=${encodeURIComponent(q)}`;
      if (near) {
        const [lat, lon] = near.split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const d = 2.5; // riquadro ampio: suggerisce vicino ma non esclude il resto
          nurl += `&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}`;
        }
      }

      let payload = JSON.stringify({ results: [] });
      try {
        const nr = await fetch(nurl, {
          headers: { 'User-Agent': 'MotoRoute/1.0 (https://motoroute-97c.pages.dev)' },
        });
        if (nr.ok) {
          const arr = (await nr.json()) as NominatimResult[];
          const results = arr
            .filter((r) => r.lat && r.lon)
            .map((r) => {
              const full = (r.display_name ?? '').split(',').map((s) => s.trim());
              return {
                name: r.name || full[0] || q,
                // contesto breve: comune/provincia, senza ripetere il nome
                detail: full.slice(1, 4).filter((p) => p && p !== (r.name ?? '')).join(', '),
                lat: Number(r.lat),
                lng: Number(r.lon),
              };
            });
          payload = JSON.stringify({ results });
        }
      } catch {
        /* si risponde con l'elenco vuoto */
      }

      const toCache = new Response(payload, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=86400' },
      });
      ctx.waitUntil(cache.put(key, toCache.clone()));
      return new Response(payload, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    if (req.method === 'GET' && url.pathname === '/geocode') {
      const q = url.searchParams.get('q');
      if (!q) return json({ error: 'q mancante' }, 400, cors);
      const near = url.searchParams.get('near'); // "lat,lon" for proximity bias

      const key = new Request(`https://mr-cache/geocode?q=${encodeURIComponent(q.toLowerCase())}&near=${near ?? ''}`);
      const cache = caches.default;
      const cached = await cache.match(key);
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
      }

      let nurl =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=it` +
        `&q=${encodeURIComponent(q)}`;
      if (near) {
        const [lat, lon] = near.split(',').map(Number);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          const d = 1.2; // ~130 km box around the start
          nurl += `&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}`;
        }
      }

      let payload = JSON.stringify({ found: false });
      try {
        const nr = await fetch(nurl, {
          headers: { 'User-Agent': 'MotoRoute/1.0 (https://motoroute-97c.pages.dev)' },
        });
        if (nr.ok) {
          const arr = (await nr.json()) as { lat?: string; lon?: string; name?: string; display_name?: string }[];
          const hit = arr[0];
          if (hit?.lat && hit?.lon) {
            payload = JSON.stringify({
              found: true,
              lat: Number(hit.lat),
              lng: Number(hit.lon),
              name: hit.name || (hit.display_name ?? q).split(',')[0],
            });
          }
        }
      } catch { /* keep found:false */ }

      const toCache = new Response(payload, {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=2592000' },
      });
      ctx.waitUntil(cache.put(key, toCache.clone()));
      return new Response(payload, { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // Natural-language ride request -> app parameters (Gemini, structured output).
    if (req.method === 'POST' && url.pathname === '/ai/parse') {
      if (!env.GEMINI_API_KEY) return json({ error: 'IA non configurata' }, 500, cors);
      const { text } = (await req.json().catch(() => ({}))) as { text?: string };
      if (!text || text.length > 400) return json({ error: 'Richiesta non valida' }, 400, cors);

      const prompt =
        `Sei l'assistente di un'app di percorsi in moto. Interpreta la richiesta dell'utente ` +
        `e restituisci SOLO i parametri del giro.\n` +
        `- mode: "anello" se vuole un giro circolare che torna al punto di partenza, altrimenti "punto_a_punto".\n` +
        `- distance_km: intero tra 30 e 400 (se parla di ore, stima ~45 km/h).\n` +
        `- direction: una fra N, NE, E, SE, S, SO, O, NO, oppure "qualsiasi".\n` +
        `- avoid_highways: true salvo che chieda esplicitamente strade veloci.\n` +
        `- themes: sottoinsieme di ["panoramico","borghi","montagna","mare","curve","enogastronomia","arte"].\n` +
        `- via_places: SOLO i nomi propri di località/passi che l'utente cita ESPLICITAMENTE di ` +
        `voler attraversare (es. "Castelluccio di Norcia"). Array vuoto se non ne cita.\n` +
        `- suggested_stops: se la richiesta evoca una ZONA o un itinerario tematico ` +
        `(es. "giro della Val d'Orcia", "un giro nel Chianti", "le strade dei Sibillini"), ` +
        `elenca da 2 a 4 nomi REALI e verificabili di località/valichi/luoghi iconici di quella ` +
        `zona che catturano lo spirito della richiesta e formano un bell'anello. ` +
        `Usa nomi di posti realmente esistenti in Italia, non inventarli. Array vuoto se la ` +
        `richiesta è generica (solo distanza/direzione/temi).\n` +
        `- destination: nome del luogo di arrivo se chiede un punto-a-punto, altrimenti "".\n` +
        `- summary: una frase breve che riassume cosa hai capito.\n` +
        `- description: 2-3 frasi che descrivono il giro con un consiglio pratico ` +
        `(cosa vedere, una sosta consigliata, una dritta di guida).\n\n` +
        `Richiesta: "${text}"`;

      const schema = {
        type: 'OBJECT',
        properties: {
          mode: { type: 'STRING', enum: ['anello', 'punto_a_punto'] },
          distance_km: { type: 'INTEGER' },
          direction: { type: 'STRING', enum: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO', 'qualsiasi'] },
          avoid_highways: { type: 'BOOLEAN' },
          themes: { type: 'ARRAY', items: { type: 'STRING' } },
          via_places: { type: 'ARRAY', items: { type: 'STRING' } },
          suggested_stops: { type: 'ARRAY', items: { type: 'STRING' } },
          destination: { type: 'STRING' },
          summary: { type: 'STRING' },
          description: { type: 'STRING' },
        },
        required: ['mode', 'distance_km', 'direction', 'avoid_highways', 'summary'],
      };

      const gres = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${env.GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.2 },
          }),
        },
      );
      if (!gres.ok) {
        return json({ error: `IA non disponibile (${gres.status})` }, 502, cors);
      }
      const gdata = (await gres.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const raw = gdata.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      try {
        return json(JSON.parse(raw), 200, cors);
      } catch {
        return json({ error: 'Risposta IA non interpretabile' }, 502, cors);
      }
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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

interface NominatimResult {
  display_name?: string;
  address?: Record<string, string>;
  /** Presenti nelle risposte di /search (non in quelle di /reverse). */
  name?: string;
  lat?: string;
  lon?: string;
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
