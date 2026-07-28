/** Natural-language ride requests, parsed by the AI behind the Worker. */
const WORKER = import.meta.env.VITE_WORKER_URL;

export interface RideRequest {
  mode: 'anello' | 'punto_a_punto';
  distance_km: number;
  direction: 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SO' | 'O' | 'NO' | 'qualsiasi';
  avoid_highways: boolean;
  themes?: string[];
  summary: string;
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
