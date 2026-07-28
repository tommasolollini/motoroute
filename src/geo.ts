import maplibregl from 'maplibre-gl';

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

/** Point reached going `distanceKm` from `origin` along `bearingDeg` (0=N, 90=E). */
export function destinationPoint(
  origin: maplibregl.LngLat,
  bearingDeg: number,
  distanceKm: number,
): maplibregl.LngLat {
  const ang = distanceKm / R_EARTH_KM;
  const brng = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(ang) + Math.cos(lat1) * Math.sin(ang) * Math.cos(brng),
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(ang) * Math.cos(lat1),
      Math.cos(ang) - Math.sin(lat1) * Math.sin(lat2),
    );

  return new maplibregl.LngLat(((toDeg(lon2) + 540) % 360) - 180, toDeg(lat2));
}

/** Bearing in degrees for a named compass direction. */
export const COMPASS: Record<string, number> = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315,
};

/** Great-circle distance (km) between two points. */
export function distanceKm(a: maplibregl.LngLat, b: maplibregl.LngLat): number {
  return segKm([a.lng, a.lat], [b.lng, b.lat]);
}

/** Initial bearing (deg, 0=N) from a to b. */
export function bearingBetween(a: maplibregl.LngLat, b: maplibregl.LngLat): number {
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Midpoint between two points (good enough at regional scale). */
export function midpoint(a: maplibregl.LngLat, b: maplibregl.LngLat): maplibregl.LngLat {
  return new maplibregl.LngLat((a.lng + b.lng) / 2, (a.lat + b.lat) / 2);
}

function segKm(a: number[], b: number[]): number {
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLon / 2) ** 2;
  return R_EARTH_KM * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Picks `count` intermediate points spaced evenly by distance along a
 * [lon,lat(,ele)] polyline (endpoints excluded). Used to force Google Maps to
 * follow the track: the more on-road via-points it gets, the closer it stays.
 */
export function sampleAlongTrack(coords: number[][], count: number): [number, number][] {
  if (coords.length < 2 || count < 1) return [];
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + segKm(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1];
  const out: [number, number][] = [];
  for (let k = 1; k <= count; k++) {
    const target = (k * total) / (count + 1);
    let i = cum.findIndex((d) => d >= target);
    if (i < 0) i = coords.length - 1;
    out.push([coords[i][0], coords[i][1]]);
  }
  return out;
}

/** Total length (km) of a [lon,lat(,ele)] polyline, via haversine. */
export function lineDistanceKm(coords: number[][]): number {
  let km = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    km += R_EARTH_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  return km;
}
