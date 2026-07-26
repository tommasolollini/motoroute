import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { Waypoints } from './waypoints';
import { routeThrough, type RouteResult } from './routing';
import { routeOrs, hasOrs, type RouteOptions } from './routing-ors';
import { drawRoute, clearRoute, fitToRoute } from './route-layer';
import { buildGpx, downloadGpx } from './gpx';

const mapContainer = document.getElementById('map');
if (!mapContainer) throw new Error('#map container not found');

const map = createMap(mapContainer);
const waypoints = new Waypoints(map);

// UI references
const hint = document.getElementById('hint') as HTMLParagraphElement;
const wpList = document.getElementById('wp-list') as HTMLDivElement;
const actions = document.getElementById('actions') as HTMLDivElement;
const routeSummary = document.getElementById('route-summary') as HTMLDivElement;
const rsKm = document.getElementById('rs-km') as HTMLSpanElement;
const rsTime = document.getElementById('rs-time') as HTMLSpanElement;
const errBox = document.getElementById('err') as HTMLParagraphElement;
const exportRow = document.getElementById('export-row') as HTMLDivElement;
const btnGpx = document.getElementById('btn-gpx') as HTMLButtonElement;
const btnMaps = document.getElementById('btn-maps') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnGps = document.getElementById('btn-gps') as HTMLButtonElement;

const routeOpts = document.getElementById('route-opts') as HTMLDivElement;
const optAvoidHw = document.getElementById('opt-avoid-hw') as HTMLInputElement;
const optPref = document.getElementById('opt-pref') as HTMLDivElement;

let currentRoute: RouteResult | null = null;
let routeToken = 0;
const routeOptions: RouteOptions = { avoidHighways: false, preference: 'recommended' };

function stopLabel(i: number, last: number): string {
  if (i === 0) return 'A';
  if (i === last) return 'B';
  return String(i);
}

function stopClass(i: number, last: number): string {
  if (i === 0) return 'start';
  if (i === last) return 'end';
  return 'via';
}

function renderStopList(): void {
  const last = waypoints.stops.length - 1;
  wpList.innerHTML = '';
  waypoints.stops.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'wp-row';
    const upDis = i === 0 ? 'disabled' : '';
    const downDis = i === last ? 'disabled' : '';
    row.innerHTML =
      `<span class="wp-dot" data-role="${stopClass(i, last)}">${stopLabel(i, last)}</span>` +
      `<span class="wp-text">${s.lngLat.lat.toFixed(4)}, ${s.lngLat.lng.toFixed(4)}</span>` +
      `<button class="wp-move" data-dir="up" title="Sposta su" aria-label="Sposta su" ${upDis}>↑</button>` +
      `<button class="wp-move" data-dir="down" title="Sposta giù" aria-label="Sposta giù" ${downDis}>↓</button>` +
      `<button class="wp-del" title="Rimuovi tappa" aria-label="Rimuovi tappa">×</button>`;
    row.querySelector('[data-dir="up"]')?.addEventListener('click', () => waypoints.move(s.id, -1));
    row.querySelector('[data-dir="down"]')?.addEventListener('click', () => waypoints.move(s.id, 1));
    row.querySelector('.wp-del')?.addEventListener('click', () => waypoints.remove(s.id));
    wpList.appendChild(row);
  });
}

function renderSheet(): void {
  const hasAny = waypoints.stops.length > 0;
  hint.hidden = hasAny;
  wpList.hidden = !hasAny;
  actions.hidden = !hasAny;
  routeOpts.hidden = !(hasAny && hasOrs());
  renderStopList();
}

async function recompute(): Promise<void> {
  if (!waypoints.ready) {
    currentRoute = null;
    clearRoute(map);
    routeSummary.hidden = true;
    exportRow.hidden = true;
    return;
  }
  const token = ++routeToken;
  errBox.hidden = true;
  try {
    const route = hasOrs()
      ? await routeOrs(waypoints.points, routeOptions)
      : await routeThrough(waypoints.points);
    if (token !== routeToken) return; // a newer edit superseded this one
    currentRoute = route;
    drawRoute(map, route.feature);
    fitToRoute(map, route.feature);
    rsKm.textContent = route.distanceKm.toFixed(1);
    rsTime.textContent = formatDrivingTime(route.durationHours);
    routeSummary.hidden = false;
    exportRow.hidden = false;
  } catch (e) {
    if (token !== routeToken) return;
    currentRoute = null;
    clearRoute(map);
    routeSummary.hidden = true;
    exportRow.hidden = true;
    errBox.textContent = e instanceof Error ? e.message : 'Errore nel calcolo del percorso';
    errBox.hidden = false;
  }
}

waypoints.onChange = () => {
  renderSheet();
  void recompute();
};

map.on('click', (e) => waypoints.add(e.lngLat));

btnGps.addEventListener('click', () => {
  if (!('geolocation' in navigator)) return;
  const label = btnGps.textContent;
  btnGps.textContent = '…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lngLat = new maplibregl.LngLat(pos.coords.longitude, pos.coords.latitude);
      waypoints.add(lngLat);
      map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 11) });
      btnGps.textContent = label;
    },
    () => { btnGps.textContent = label; },
    { enableHighAccuracy: true, timeout: 10000 },
  );
});

btnGpx.addEventListener('click', () => {
  if (!currentRoute || !waypoints.ready) return;
  const pts = waypoints.points;
  const name = `MotoRoute ${new Date().toLocaleDateString('it-IT')}`;
  const gpx = buildGpx(currentRoute.feature, {
    name,
    start: pts[0],
    end: pts[pts.length - 1],
  });
  downloadGpx(name.replace(/\s+/g, '-'), gpx);
});

btnMaps.addEventListener('click', () => {
  if (!waypoints.ready) return;
  const pts = waypoints.points;
  const origin = pts[0];
  const destination = pts[pts.length - 1];
  const via = pts.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join('|');
  let url =
    `https://www.google.com/maps/dir/?api=1` +
    `&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}` +
    `&travelmode=driving`;
  if (via) url += `&waypoints=${encodeURIComponent(via)}`;
  window.open(url, '_blank');
});

optAvoidHw.addEventListener('change', () => {
  routeOptions.avoidHighways = optAvoidHw.checked;
  void recompute();
});

optPref.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    optPref.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    routeOptions.preference = (btn.dataset.pref as RouteOptions['preference']) ?? 'recommended';
    void recompute();
  });
});

btnClear.addEventListener('click', () => waypoints.clear());

function formatDrivingTime(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

map.on('load', () => {
  const meta = document.getElementById('topbar-meta');
  if (meta) meta.textContent = 'pronto';
  renderSheet();
});
