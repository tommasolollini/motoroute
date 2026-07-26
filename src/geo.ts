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
