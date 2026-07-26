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
