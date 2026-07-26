import maplibregl from 'maplibre-gl';
import { destinationPoint } from './geo';
import type { RouteResult } from './routing';

export type RouteFn = (points: maplibregl.LngLat[]) => Promise<RouteResult>;

export interface LoopResult {
  points: maplibregl.LngLat[];
  route: RouteResult;
}

/**
 * Direction-aware round-trip heuristic: fan out three waypoints around the
 * chosen bearing and route start → p1 → p2 → p3 → start, then scale the radius
 * over a few iterations to hit the target distance. Routed through the caller's
 * engine (ORS/BRouter) so the track is real.
 */
export async function generateLoop(
  start: maplibregl.LngLat,
  targetKm: number,
  bearingDeg: number,
  route: RouteFn,
): Promise<LoopResult> {
  let radius = targetKm / 3.1; // first guess; a loop ≈ 3× the fan radius
  let best: LoopResult | null = null;

  for (let i = 0; i < 4; i++) {
    const points = loopPoints(start, radius, bearingDeg);
    const result = await route(points);
    best = { points, route: result };

    const err = Math.abs(result.distanceKm - targetKm) / targetKm;
    if (err < 0.12 || result.distanceKm === 0) break;

    // Scale toward the target, damped to avoid oscillation.
    const ratio = targetKm / result.distanceKm;
    radius *= 1 + (ratio - 1) * 0.7;
  }

  if (!best) throw new Error('Impossibile generare un anello');
  return best;
}

function loopPoints(
  start: maplibregl.LngLat,
  radius: number,
  bearing: number,
): maplibregl.LngLat[] {
  const p1 = destinationPoint(start, bearing - 38, radius * 0.95);
  const p2 = destinationPoint(start, bearing, radius * 1.15);
  const p3 = destinationPoint(start, bearing + 38, radius * 0.95);
  return [start, p1, p2, p3, start];
}
