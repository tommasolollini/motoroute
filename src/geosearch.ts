/**
 * Ricerca di località per aggiungere una tappa scrivendo il nome.
 *
 * Passa dal Worker, che mette lo User-Agent richiesto da Nominatim e tiene una
 * cache sul bordo: le stesse ricerche non ripartono verso OpenStreetMap.
 */
const WORKER = import.meta.env.VITE_WORKER_URL;

export interface PlaceHit {
  name: string;
  /** Contesto breve — comune, provincia — per distinguere gli omonimi. */
  detail: string;
  lng: number;
  lat: number;
}

export function hasSearch(): boolean {
  return Boolean(WORKER);
}

/**
 * Controlla che il Worker esponga davvero /search.
 * Se il proxy non è aggiornato risponde con la pagina generica, e una barra di
 * ricerca che non trova mai nulla è peggio di una barra assente: meglio tenerla
 * nascosta e farla comparire da sola quando l'endpoint c'è.
 */
export async function probeSearch(): Promise<boolean> {
  if (!WORKER) return false;
  try {
    const r = await fetch(`${WORKER.replace(/\/$/, '')}/search?q=roma&limit=1`);
    if (!r.ok) return false;
    const d = (await r.json()) as { results?: unknown };
    return Array.isArray(d.results);
  } catch {
    return false;
  }
}

export async function searchPlaces(
  q: string,
  near?: { lng: number; lat: number },
  signal?: AbortSignal,
): Promise<PlaceHit[]> {
  if (!WORKER || q.trim().length < 2) return [];
  let url = `${WORKER.replace(/\/$/, '')}/search?q=${encodeURIComponent(q.trim())}`;
  if (near) url += `&near=${near.lat},${near.lng}`;

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Ricerca non disponibile');
  const data = (await res.json()) as { results?: PlaceHit[] };
  return (data.results ?? []).filter(
    (r) => Number.isFinite(r.lng) && Number.isFinite(r.lat),
  );
}
