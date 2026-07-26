import 'maplibre-gl/dist/maplibre-gl.css';
import './style.css';
import maplibregl from 'maplibre-gl';
import { createMap } from './map';
import { Waypoints } from './waypoints';
import { routeThrough, type RouteResult } from './routing';
import { routeOrs, hasOrs, type RouteOptions } from './routing-ors';
import { drawRoute, clearRoute, fitToRoute } from './route-layer';
import { buildGpx, downloadGpx, parseGpx } from './gpx';
import { generateLoop } from './loop';
import { COMPASS, lineDistanceKm } from './geo';
import { saveRoute, allRoutes, deleteRoute, type SavedRoute } from './storage';
import type { Feature, LineString } from 'geojson';

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

// Anello (loop) UI
const modeToggle = document.getElementById('mode-toggle') as HTMLDivElement;
const anelloControls = document.getElementById('anello-controls') as HTMLDivElement;
const anelloDist = document.getElementById('anello-dist') as HTMLInputElement;
const anelloDistVal = document.getElementById('anello-dist-val') as HTMLSpanElement;
const compass = document.getElementById('compass') as HTMLDivElement;
const anelloHint = document.getElementById('anello-hint') as HTMLParagraphElement;
const btnAnelloGen = document.getElementById('btn-anello-gen') as HTMLButtonElement;
const btnAnelloSurprise = document.getElementById('btn-anello-surprise') as HTMLButtonElement;

// Library / import / share
const btnSave = document.getElementById('btn-save') as HTMLButtonElement;
const btnShare = document.getElementById('btn-share') as HTMLButtonElement;
const btnImport = document.getElementById('btn-import') as HTMLButtonElement;
const gpxInput = document.getElementById('gpx-input') as HTMLInputElement;
const btnLibrary = document.getElementById('btn-library') as HTMLButtonElement;
const library = document.getElementById('library') as HTMLDivElement;
const libList = document.getElementById('lib-list') as HTMLDivElement;
const btnLibClose = document.getElementById('btn-lib-close') as HTMLButtonElement;
const toastEl = document.getElementById('toast') as HTMLDivElement;

let toastTimer: number | undefined;
function toast(msg: string): void {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toastEl.classList.remove('show'), 2500);
}

type Mode = 'manuale' | 'anello';
let mode: Mode = 'manuale';
let anelloDir = 'rand';

let currentRoute: RouteResult | null = null;
let routeToken = 0;
const routeOptions: RouteOptions = { avoidHighways: false, preference: 'recommended' };

function runRoute(points: maplibregl.LngLat[]): Promise<RouteResult> {
  return hasOrs() ? routeOrs(points, routeOptions) : routeThrough(points);
}

function formatDrivingTime(hours: number): string {
  const totalMin = Math.round(hours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m.toString().padStart(2, '0')}` : `${m} min`;
}

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
      `<button class="wp-move" data-dir="up" title="Sposta su" ${upDis}>↑</button>` +
      `<button class="wp-move" data-dir="down" title="Sposta giù" ${downDis}>↓</button>` +
      `<button class="wp-del" title="Rimuovi tappa">×</button>`;
    row.querySelector('[data-dir="up"]')?.addEventListener('click', () => waypoints.move(s.id, -1));
    row.querySelector('[data-dir="down"]')?.addEventListener('click', () => waypoints.move(s.id, 1));
    row.querySelector('.wp-del')?.addEventListener('click', () => waypoints.remove(s.id));
    wpList.appendChild(row);
  });
}

function renderSheet(): void {
  const hasAny = waypoints.stops.length > 0;
  hint.hidden = hasAny || mode === 'anello';
  wpList.hidden = !hasAny;
  actions.hidden = !(hasAny || mode === 'anello');
  routeOpts.hidden = !(hasAny && hasOrs());
  anelloControls.hidden = mode !== 'anello';
  if (mode === 'anello') {
    anelloHint.textContent = hasAny
      ? 'Partenza pronta. Scegli distanza e direzione, poi genera.'
      : 'Tocca la mappa (o usa il GPS) per il punto di partenza.';
  }
  renderStopList();
}

function showRoute(result: RouteResult): void {
  currentRoute = result;
  drawRoute(map, result.feature);
  fitToRoute(map, result.feature);
  rsKm.textContent = result.distanceKm.toFixed(1);
  rsTime.textContent = formatDrivingTime(result.durationHours);
  routeSummary.hidden = false;
  exportRow.hidden = false;
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
    const route = await runRoute(waypoints.points);
    if (token !== routeToken) return;
    showRoute(route);
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

// Map tap: manual = append a stop; anello = set the single start point.
map.on('click', (e) => {
  if (mode === 'anello') waypoints.replaceAll([e.lngLat]);
  else waypoints.add(e.lngLat);
});

// --- Anello generation ---
async function doGenerate(bearingDir: string): Promise<void> {
  const start = waypoints.stops[0]?.lngLat;
  if (!start) {
    anelloHint.textContent = 'Prima tocca la mappa per il punto di partenza.';
    return;
  }
  const bearing = bearingDir === 'rand' ? Math.random() * 360 : COMPASS[bearingDir];
  const targetKm = Number(anelloDist.value);
  btnAnelloGen.disabled = true;
  btnAnelloSurprise.disabled = true;
  btnAnelloGen.textContent = 'Generando…';
  errBox.hidden = true;
  const token = ++routeToken;
  try {
    const loop = await generateLoop(start, targetKm, bearing, runRoute);
    if (token !== routeToken) return;
    waypoints.replaceAll(loop.points, { silent: true });
    renderSheet();
    showRoute(loop.route);
  } catch (e) {
    errBox.textContent = e instanceof Error ? e.message : 'Impossibile generare l’anello';
    errBox.hidden = false;
  } finally {
    btnAnelloGen.disabled = false;
    btnAnelloSurprise.disabled = false;
    btnAnelloGen.textContent = '🔁 Genera anello';
  }
}

btnAnelloGen.addEventListener('click', () => void doGenerate(anelloDir));
btnAnelloSurprise.addEventListener('click', () => {
  const km = [80, 120, 150, 200, 250][Math.floor(Math.random() * 5)];
  anelloDist.value = String(km);
  anelloDistVal.textContent = `${km} km`;
  void doGenerate('rand');
});

anelloDist.addEventListener('input', () => {
  anelloDistVal.textContent = `${anelloDist.value} km`;
});

compass.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    compass.querySelectorAll('button').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    anelloDir = btn.dataset.dir ?? 'rand';
  });
});

// --- Mode toggle ---
function setMode(m: Mode): void {
  mode = m;
  modeToggle.querySelectorAll('button').forEach((b) =>
    b.classList.toggle('active', b.getAttribute('data-mode') === m),
  );
  renderSheet();
}
modeToggle.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => setMode((btn.dataset.mode as Mode) ?? 'manuale'));
});

// --- Load a route from stored/imported geometry (no re-routing) ---
function makeRoute(geometry: number[][], distanceKm: number, durationHours: number): RouteResult {
  const feature: Feature<LineString> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: geometry },
  };
  return { feature, distanceKm, durationHours };
}

function loadRouteData(
  points: { lng: number; lat: number }[],
  geometry: number[][],
  distanceKm: number,
  durationHours: number,
): void {
  setMode('manuale');
  waypoints.replaceAll(points, { silent: true });
  renderSheet();
  showRoute(makeRoute(geometry, distanceKm, durationHours));
}

// --- Save current route ---
btnSave.addEventListener('click', async () => {
  if (!currentRoute || !waypoints.ready) return;
  const suggested = `Giro ${new Date().toLocaleDateString('it-IT')}`;
  const name = window.prompt('Nome del percorso:', suggested)?.trim();
  if (!name) return;
  const route: SavedRoute = {
    id: (crypto.randomUUID?.() ?? String(Date.now())),
    name,
    createdAt: Date.now(),
    points: waypoints.points.map((p) => ({ lng: p.lng, lat: p.lat })),
    distanceKm: currentRoute.distanceKm,
    durationHours: currentRoute.durationHours,
    geometry: currentRoute.feature.geometry.coordinates,
  };
  try {
    await saveRoute(route);
    toast('Percorso salvato ★');
  } catch {
    toast('Salvataggio non riuscito');
  }
});

// --- Share ---
btnShare.addEventListener('click', async () => {
  if (!currentRoute || !waypoints.ready) return;
  const pts = waypoints.points;
  const o = pts[0];
  const d = pts[pts.length - 1];
  const via = pts.slice(1, -1).map((p) => `${p.lat},${p.lng}`).join('|');
  let mapsUrl =
    `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lng}&destination=${d.lat},${d.lng}&travelmode=driving`;
  if (via) mapsUrl += `&waypoints=${encodeURIComponent(via)}`;
  const text = `🏍️ MotoRoute · ${currentRoute.distanceKm.toFixed(0)} km\n${mapsUrl}`;
  try {
    if (navigator.share) await navigator.share({ title: 'MotoRoute', text });
    else {
      await navigator.clipboard.writeText(text);
      toast('Percorso copiato negli appunti');
    }
  } catch {
    /* user cancelled share */
  }
});

// --- Import GPX ---
btnImport.addEventListener('click', () => gpxInput.click());
gpxInput.addEventListener('change', async () => {
  const file = gpxInput.files?.[0];
  gpxInput.value = '';
  if (!file) return;
  try {
    const parsed = parseGpx(await file.text());
    const km = lineDistanceKm(parsed.geometry);
    loadRouteData(parsed.points, parsed.geometry, km, km / 55); // ~55 km/h stima
    toast(`GPX importato · ${km.toFixed(0)} km`);
  } catch (e) {
    toast(e instanceof Error ? e.message : 'GPX non valido');
  }
});

// --- Library ---
async function openLibrary(): Promise<void> {
  library.hidden = false;
  libList.innerHTML = '<p class="lib-empty">Carico…</p>';
  const routes = await allRoutes();
  if (routes.length === 0) {
    libList.innerHTML = '<p class="lib-empty">Nessun percorso salvato.<br>Genera un giro e tocca ★ Salva.</p>';
    return;
  }
  libList.innerHTML = '';
  for (const r of routes) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    const date = new Date(r.createdAt).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
    item.innerHTML =
      `<div class="lib-item-main"><div class="lib-item-name"></div>` +
      `<div class="lib-item-meta">≈ ${r.distanceKm.toFixed(0)} km · ${date}</div></div>` +
      `<button class="lib-del" title="Elimina">🗑</button>`;
    (item.querySelector('.lib-item-name') as HTMLElement).textContent = r.name;
    item.querySelector('.lib-item-main')?.addEventListener('click', () => {
      loadRouteData(r.points, r.geometry, r.distanceKm, r.durationHours);
      library.hidden = true;
    });
    item.querySelector('.lib-del')?.addEventListener('click', async () => {
      await deleteRoute(r.id);
      void openLibrary();
    });
    libList.appendChild(item);
  }
}
btnLibrary.addEventListener('click', () => void openLibrary());
btnLibClose.addEventListener('click', () => { library.hidden = true; });

// --- Shared controls ---
btnGps.addEventListener('click', () => {
  if (!('geolocation' in navigator)) return;
  const label = btnGps.textContent;
  btnGps.textContent = '…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lngLat = new maplibregl.LngLat(pos.coords.longitude, pos.coords.latitude);
      if (mode === 'anello') waypoints.replaceAll([lngLat]);
      else waypoints.add(lngLat);
      map.flyTo({ center: lngLat, zoom: Math.max(map.getZoom(), 11) });
      btnGps.textContent = label;
    },
    () => { btnGps.textContent = label; },
    { enableHighAccuracy: true, timeout: 10000 },
  );
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

btnGpx.addEventListener('click', () => {
  if (!currentRoute || !waypoints.ready) return;
  const pts = waypoints.points;
  const name = `MotoRoute ${new Date().toLocaleDateString('it-IT')}`;
  const gpx = buildGpx(currentRoute.feature, { name, start: pts[0], end: pts[pts.length - 1] });
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

btnClear.addEventListener('click', () => waypoints.clear());

map.on('load', () => {
  const meta = document.getElementById('topbar-meta');
  if (meta) meta.textContent = 'pronto';
  renderSheet();
});
