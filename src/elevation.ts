/**
 * Profilo altimetrico e curvosità, ricavati dalla geometria del percorso.
 *
 * Non serve nessuna chiamata in più: BRouter restituisce coordinate 3D
 * [lng, lat, quota] e ORS fa lo stesso quando la richiesta include
 * `elevation: true`. Il dato è già dentro la risposta del routing.
 */

export interface ElevationProfile {
  /** Punti campionati per il grafico. */
  points: { km: number; ele: number }[];
  ascentM: number;
  descentM: number;
  minEle: number;
  maxEle: number;
  distanceKm: number;
}

const R = 6371;
const rad = (d: number): number => (d * Math.PI) / 180;

function segKm(a: number[], b: number[]): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Vero solo se le quote ci sono davvero e non sono tutte uguali. */
export function hasElevation(coords: number[][]): boolean {
  if (coords.length < 2 || coords[0].length < 3) return false;
  const first = coords[0][2];
  return coords.some((c) => c.length >= 3 && Number.isFinite(c[2]) && c[2] !== first);
}

/**
 * Dislivello con filtro a isteresi: i modelli digitali del terreno sono
 * rumorosi e sommare ogni singola differenza gonfia il totale di parecchio.
 * Si accumula solo oltre la soglia, come fa il "filtered ascend" di BRouter.
 */
const NOISE_M = 6;

export function elevationProfile(coords: number[][], maxPoints = 140): ElevationProfile | null {
  if (!hasElevation(coords)) return null;

  let km = 0;
  let ascentM = 0;
  let descentM = 0;
  let ref = coords[0][2];
  let minEle = coords[0][2];
  let maxEle = coords[0][2];

  const raw: { km: number; ele: number }[] = [{ km: 0, ele: coords[0][2] }];
  for (let i = 1; i < coords.length; i++) {
    km += segKm(coords[i - 1], coords[i]);
    const ele = coords[i][2];
    if (!Number.isFinite(ele)) continue;
    if (ele - ref > NOISE_M) {
      ascentM += ele - ref;
      ref = ele;
    } else if (ref - ele > NOISE_M) {
      descentM += ref - ele;
      ref = ele;
    }
    if (ele < minEle) minEle = ele;
    if (ele > maxEle) maxEle = ele;
    raw.push({ km, ele });
  }

  // Riduce i punti per il disegno mantenendo primo e ultimo.
  const step = Math.max(1, Math.ceil(raw.length / maxPoints));
  const points = raw.filter((_, i) => i % step === 0);
  if (points[points.length - 1] !== raw[raw.length - 1]) points.push(raw[raw.length - 1]);

  return {
    points,
    ascentM: Math.round(ascentM),
    descentM: Math.round(descentM),
    minEle: Math.round(minEle),
    maxEle: Math.round(maxEle),
    distanceKm: km,
  };
}

/**
 * Curvosità in gradi di cambio direzione per km.
 * Il ricampionamento a passo fisso serve a rendere il numero confrontabile:
 * senza, un percorso con punti più fitti risulterebbe più curvo a parità di strada.
 */
export function curvinessDegPerKm(coords: number[][], stepKm = 0.05): number {
  if (coords.length < 3) return 0;

  const p: number[][] = [coords[0]];
  let acc = 0;
  for (let i = 1; i < coords.length; i++) {
    acc += segKm(coords[i - 1], coords[i]);
    if (acc >= stepKm) {
      p.push(coords[i]);
      acc = 0;
    }
  }
  if (p.length < 3) return 0;

  const bear = (a: number[], b: number[]): number => {
    const dLon = rad(b[0] - a[0]);
    const y = Math.sin(dLon) * Math.cos(rad(b[1]));
    const x =
      Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
      Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180) / Math.PI;
  };

  let turn = 0;
  let km = 0;
  for (let i = 2; i < p.length; i++) {
    let d = bear(p[i - 1], p[i]) - bear(p[i - 2], p[i - 1]);
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    turn += Math.abs(d);
    km += segKm(p[i - 1], p[i]);
  }
  return km > 0 ? turn / km : 0;
}

/** Soglie tarate sui valori misurati: pianura ~80-150, collina ~170-280, montagna ~330+. */
export function curvinessLabel(degPerKm: number): string {
  if (degPerKm < 120) return 'scorrevole';
  if (degPerKm < 220) return 'poco tortuoso';
  if (degPerKm < 330) return 'tortuoso';
  return 'molto tortuoso';
}

/** Grafico del profilo come SVG, senza dipendenze. */
export function profileSvg(p: ElevationProfile): string {
  const W = 600;
  const H = 96;
  const padTop = 10;
  const padBottom = 16;
  const span = Math.max(p.maxEle - p.minEle, 20); // evita una linea piatta su terreno piano
  const totalKm = Math.max(p.distanceKm, 0.001);

  const x = (km: number): number => (km / totalKm) * W;
  const y = (ele: number): number =>
    padTop + (1 - (ele - p.minEle) / span) * (H - padTop - padBottom);

  const line = p.points
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${x(pt.km).toFixed(1)},${y(pt.ele).toFixed(1)}`)
    .join('');
  const area = `${line}L${W},${H - padBottom}L0,${H - padBottom}Z`;

  return (
    `<svg class="elev-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" ` +
    `aria-label="Profilo altimetrico: da ${p.minEle} a ${p.maxEle} metri">` +
    `<path class="elev-area" d="${area}" />` +
    `<path class="elev-line" d="${line}" vector-effect="non-scaling-stroke" />` +
    `</svg>`
  );
}
