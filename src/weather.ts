/** Weather along the ride, from Open-Meteo (free, keyless). */
import { sampleAlongTrack } from './geo';

export interface WeatherPoint {
  label: string;
  emoji: string;
  temp: number;
}

export interface RideWeather {
  points: WeatherPoint[];
  rain: boolean;
}

/** WMO weather code → emoji + whether it means precipitation. */
function describe(code: number): { emoji: string; rain: boolean } {
  if (code === 0) return { emoji: '☀️', rain: false };
  if (code <= 3) return { emoji: '⛅', rain: false };
  if (code === 45 || code === 48) return { emoji: '🌫️', rain: false };
  if (code >= 51 && code <= 67) return { emoji: '🌧️', rain: true };
  if (code >= 71 && code <= 77) return { emoji: '❄️', rain: true };
  if (code >= 80 && code <= 82) return { emoji: '🌦️', rain: true };
  if (code >= 85 && code <= 86) return { emoji: '🌨️', rain: true };
  if (code >= 95) return { emoji: '⛈️', rain: true };
  return { emoji: '🌡️', rain: false };
}

async function pointWeather(lon: number, lat: number): Promise<{ code: number; temp: number }> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    `&current=temperature_2m,weather_code&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Meteo ${r.status}`);
  const j = (await r.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
  return { code: j.current?.weather_code ?? -1, temp: Math.round(j.current?.temperature_2m ?? 0) };
}

/** Current conditions at start, middle and end of the route. */
export async function rideWeather(coords: number[][]): Promise<RideWeather> {
  if (coords.length < 2) throw new Error('Percorso non valido');
  const mid = sampleAlongTrack(coords, 1)[0] ?? coords[Math.floor(coords.length / 2)];
  const samples: { label: string; c: number[] }[] = [
    { label: 'Partenza', c: coords[0] },
    { label: 'Metà', c: mid },
    { label: 'Arrivo', c: coords[coords.length - 1] },
  ];

  const points: WeatherPoint[] = [];
  let rain = false;
  for (const s of samples) {
    const w = await pointWeather(s.c[0], s.c[1]);
    const d = describe(w.code);
    if (d.rain) rain = true;
    points.push({ label: s.label, emoji: d.emoji, temp: w.temp });
  }
  return { points, rain };
}
