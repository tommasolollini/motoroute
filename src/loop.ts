import maplibregl from 'maplibre-gl';
import { destinationPoint, bearingBetween, distanceKm, midpoint } from './geo';
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

/**
 * Loop that MUST pass through the given places. Goes start → vias → back, with a
 * return arc on the far side so it's a real ring, not an out-and-back. The arc
 * offset is scaled over a few tries to approach the target distance.
 */
export async function generateLoopVia(
  start: maplibregl.LngLat,
  vias: maplibregl.LngLat[],
  targetKm: number,
  route: RouteFn,
): Promise<LoopResult> {
  if (vias.length === 0) throw new Error('Nessuna tappa da attraversare');

  // With 3+ spread stops the ring is already formed by the stops themselves.
  if (vias.length >= 3) {
    const points = [start, ...vias, start];
    return { points, route: await route(points) };
  }

  const last = vias[vias.length - 1];
  const legKm = Math.max(distanceKm(start, last), 1);
  const side = 90; // arc on one side of the outbound leg
  let offset = legKm * 0.45;
  let best: LoopResult | null = null;

  for (let i = 0; i < 3; i++) {
    const arc = destinationPoint(midpoint(start, last), bearingBetween(start, last) + side, offset);
    const points = [start, ...vias, arc, start];
    const result = await route(points);
    best = { points, route: result };

    const err = Math.abs(result.distanceKm - targetKm) / targetKm;
    if (err < 0.18 || result.distanceKm === 0) break;
    // Only the arc can stretch the ring; the vias are fixed.
    const extra = (targetKm - result.distanceKm) / 2;
    offset = Math.max(legKm * 0.15, offset + extra * 0.6);
  }

  if (!best) throw new Error('Impossibile generare l’anello');
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
