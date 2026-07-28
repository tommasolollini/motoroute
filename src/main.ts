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
import { COMPASS, lineDistanceKm, sampleAlongTrack } from './geo';
import { getQuietProfileId } from './quiet-profile';
import { cachedName, reverseGeocode, seedName } from './reverse';
import { getStarts, addStart, deleteStart, renameStart } from './starts';
import { fetchPois } from './overpass';
import { PoiLayer } from './poi-layer';
import { parseRideRequest, hasAi, geocodePlace, type GeocodedPlace } from './ai';
import { generateLoopVia } from './loop';
import { saveRoute, allRoutes, deleteRoute, type SavedRoute } from './storage';
import type { Feature, LineString } from 'geojson';

const mapContainer = document.getElementById('map');
if (!mapContainer) throw new Error('#map container not found');

const map = createMap(mapContainer);
const waypoints = new Waypoints(map);

// Intro splash: fades out after a moment (or on tap).
const splash = document.getElementById('splash');
if (splash) {
  const dismiss = (): void => splash.classList.add('hide');
  const timer = window.setTimeout(dismiss, 1900);
  splash.addEventListener('click', () => { window.clearTimeout(timer); dismiss(); });
}

// UI references
const hint = document.getElementById('hint') as HTMLParagraphElement;
const wpList = document.getElementById('wp-list') as HTMLDivElement;
const actions = document.getElementById('actions') as HTMLDivElement;
const routeSummary = document.getElementById('route-summary') as HTMLDivElement;
const rsKm = document.getElementById('rs-km') as HTMLSpanElement;
const rsTime = document.getElementById('rs-time') as HTMLSpanElement;
const errBox = document.getElementById('err') as HTMLParagraphElement;
const exportRow = document.getElementById('export-row') as HTMLDivElement;
const navRow = document.getElementById('nav-row') as HTMLDivElement;
const btnMaps = document.getElementById('btn-maps') as HTMLButtonElement;
const regenRow = document.getElementById('regen-row') as HTMLDivElement;
const btnRegen = document.getElementById('btn-regen') as HTMLButtonElement;
const btnGpx = document.getElementById('btn-gpx') as HTMLButtonElement;
const btnNavigate = document.getElementById('btn-navigate') as HTMLButtonElement;
const btnClear = document.getElementById('btn-clear') as HTMLButtonElement;
const btnGps = document.getElementById('btn-gps') as HTMLButtonElement;
const routeOpts = document.getElementById('route-opts') as HTMLDivElement;
const optAvoidHw = document.getElementById('opt-avoid-hw') as HTMLInputElement;

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

// Collapsible sheet
const sheet = document.getElementById('sheet') as HTMLDivElement;
const sheetGrip = document.getElementById('sheet-grip') as HTMLButtonElement;
const gripPeek = document.getElementById('grip-peek') as HTMLSpanElement;

let sheetCollapsed = false;

function updatePeek(): void {
  gripPeek.innerHTML = currentRoute
    ? `<b>${currentRoute.distanceKm.toFixed(0)} km</b> · ${formatDrivingTime(currentRoute.durationHours)} · scorri per aprire`
    : 'Scorri su per aprire il pannello';
}

function collapsedOffset(): number {
  return Math.max(0, sheet.offsetHeight - sheetGrip.offsetHeight);
}

function setSheetCollapsed(collapsed: boolean): void {
  sheetCollapsed = collapsed;
  sheet.classList.toggle('collapsed', collapsed);
  sheet.style.transform = collapsed ? `translateY(${collapsedOffset()}px)` : 'translateY(0)';
  sheetGrip.setAttribute('aria-expanded', String(!collapsed));
  if (collapsed) updatePeek();
}

// Drag-to-open/close (pointer events cover touch + mouse). Small drags = tap.
let dragging = false;
let dragStartY = 0;
let dragBaseOffset = 0;
let dragMax = 0;
let dragMoved = 0;

sheetGrip.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragMoved = 0;
  dragStartY = e.clientY;
  dragMax = collapsedOffset();
  dragBaseOffset = sheetCollapsed ? dragMax : 0;
  sheet.style.transition = 'none';
  sheetGrip.setPointerCapture(e.pointerId);
});

sheetGrip.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dy = e.clientY - dragStartY;
  dragMoved = Math.max(dragMoved, Math.abs(dy));
  const off = Math.min(Math.max(dragBaseOffset + dy, 0), dragMax);
  sheet.style.transform = `translateY(${off}px)`;
});

function endDrag(e: PointerEvent): void {
  if (!dragging) return;
  dragging = false;
  sheet.style.transition = '';
  try { sheetGrip.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  if (dragMoved < 6) {
    setSheetCollapsed(!sheetCollapsed); // treat as a tap
    return;
  }
  const dy = e.clientY - dragStartY;
  const off = Math.min(Math.max(dragBaseOffset + dy, 0), dragMax);
  setSheetCollapsed(off > dragMax * 0.35); // snap by how far it was dragged
}

sheetGrip.addEventListener('pointerup', endDrag);
sheetGrip.addEventListener('pointercancel', endDrag);

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
const routeOptions: RouteOptions = { avoidHighways: true, preference: 'recommended' };
let lastLoop: { start: maplibregl.LngLat; targetKm: number } | null = null;
let regenAlt = 0;

let quietProfileId: string | null = null;
void getQuietProfileId().then((id) => {
  quietProfileId = id;
  // Default is "avoid highways" ON; once the profile is ready, apply it.
  if (routeOptions.avoidHighways && waypoints.ready) void recompute();
});

async function runRoute(points: maplibregl.LngLat[], alt = 0): Promise<RouteResult> {
  // "Evita autostrade" -> quiet-roads profile on BRouter (avoids superstrade too).
  // BRouter can 400 on some geometrically-placed loop points; fall back to ORS,
  // which snaps any point to the nearest road (radiuses=-1) and never fails there.
  if (routeOptions.avoidHighways && quietProfileId) {
    try {
      return await routeThrough(points, quietProfileId, alt);
    } catch {
      /* fall back to ORS below */
    }
  }
  return hasOrs() ? routeOrs(points, routeOptions, alt) : routeThrough(points, 'car-fast', alt);
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

function stopText(s: { lngLat: maplibregl.LngLat }): string {
  return cachedName(s.lngLat.lng, s.lngLat.lat) ?? `${s.lngLat.lat.toFixed(4)}, ${s.lngLat.lng.toFixed(4)}`;
}

let namingRun = 0;
async function ensureStopNames(): Promise<void> {
  const run = ++namingRun;
  let changed = false;
  for (const s of waypoints.stops) {
    if (!cachedName(s.lngLat.lng, s.lngLat.lat)) {
      const n = await reverseGeocode(s.lngLat.lng, s.lngLat.lat); // sequential = polite to Nominatim
      if (run !== namingRun) return; // a newer edit superseded this pass
      if (n) changed = true;
    }
  }
  if (changed) renderStopList();
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
      `<span class="wp-text"></span>` +
      `<button class="wp-move" data-dir="up" title="Sposta su" ${upDis}>↑</button>` +
      `<button class="wp-move" data-dir="down" title="Sposta giù" ${downDis}>↓</button>` +
      `<button class="wp-del" title="Rimuovi tappa">×</button>`;
    (row.querySelector('.wp-text') as HTMLElement).textContent = stopText(s);
    row.querySelector('[data-dir="up"]')?.addEventListener('click', () => waypoints.move(s.id, -1));
    row.querySelector('[data-dir="down"]')?.addEventListener('click', () => waypoints.move(s.id, 1));
    row.querySelector('.wp-del')?.addEventListener('click', () => waypoints.remove(s.id));
    wpList.appendChild(row);
  });
  void ensureStopNames();
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
  navRow.hidden = false;
  regenRow.hidden = false;
  if (sheetCollapsed) setSheetCollapsed(true); // body grew: recompute offset + peek
}

function hideRouteUi(): void {
  currentRoute = null;
  clearRoute(map);
  routeSummary.hidden = true;
  exportRow.hidden = true;
  navRow.hidden = true;
  regenRow.hidden = true;
}

async function recompute(alt = 0): Promise<void> {
  if (!waypoints.ready) {
    hideRouteUi();
    return;
  }
  const token = ++routeToken;
  errBox.hidden = true;
  try {
    const route = await runRoute(waypoints.points, alt);
    if (token !== routeToken) return;
    showRoute(route);
  } catch (e) {
    if (token !== routeToken) return;
    hideRouteUi();
    errBox.textContent = e instanceof Error ? e.message : 'Errore nel calcolo del percorso';
    errBox.hidden = false;
  }
}

waypoints.onChange = () => {
  lastLoop = null; // a manual edit means it's no longer the generated loop
  regenAlt = 0;
  renderSheet();
  void recompute();
};

async function doRegen(): Promise<void> {
  if (lastLoop) {
    // A generated loop: make a different one (fresh random direction, same start + distance).
    await doGenerate('rand', lastLoop.start, lastLoop.targetKm);
    return;
  }
  regenAlt += 1;
  btnRegen.disabled = true;
  const label = btnRegen.textContent;
  btnRegen.textContent = 'Ricalcolo…';
  await recompute(regenAlt);
  btnRegen.disabled = false;
  btnRegen.textContent = label;
}
btnRegen.addEventListener('click', () => void doRegen());

// Map tap: manual = append a stop; anello = set the single start point.
map.on('click', (e) => {
  if (mode === 'anello') waypoints.replaceAll([e.lngLat]);
  else waypoints.add(e.lngLat);
});

// --- Anello generation ---
async function doGenerate(
  bearingDir: string,
  startOverride?: maplibregl.LngLat,
  kmOverride?: number,
): Promise<void> {
  const start = startOverride ?? waypoints.stops[0]?.lngLat;
  if (!start) {
    anelloHint.textContent = 'Prima tocca la mappa per il punto di partenza.';
    return;
  }
  const bearing = bearingDir === 'rand' ? Math.random() * 360 : COMPASS[bearingDir];
  const targetKm = kmOverride ?? Number(anelloDist.value);
  btnAnelloGen.disabled = true;
  btnAnelloSurprise.disabled = true;
  btnAnelloGen.textContent = 'Generando…';
  errBox.hidden = true;
  const token = ++routeToken;
  try {
    const loop = await generateLoop(start, targetKm, bearing, runRoute);
    if (token !== routeToken) return;
    waypoints.replaceAll(loop.points, { silent: true });
    lastLoop = { start, targetKm }; // remember for "Rifai diverso"
    regenAlt = 0;
    // Switch to manual: the loop is now an editable route, so a tap ADDS a stop
    // instead of resetting the start (which would wipe the loop). setMode renders.
    setMode('manuale');
    showRoute(loop.route);
    setSheetCollapsed(true); // reveal the loop on the map straight away
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
  lastLoop = null; // a loaded/imported route isn't a regenerable loop
  regenAlt = 0;
  waypoints.replaceAll(points, { silent: true });
  renderSheet();
  showRoute(makeRoute(geometry, distanceKm, durationHours));
  setSheetCollapsed(true); // show the loaded route on the map
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
  const g = currentGpx();
  if (!g || !currentRoute) return;
  const text = `🏍️ MotoRoute · ${currentRoute.distanceKm.toFixed(0)} km`;
  const file = new File([g.text], `${g.name.replace(/\s+/g, '-')}.gpx`, {
    type: 'application/gpx+xml',
  });
  try {
    // Share the GPX file so the recipient gets the exact route (not a maps link
    // that gets recalculated).
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: g.name, text });
    } else if (navigator.share) {
      await navigator.share({ title: g.name, text });
    } else {
      downloadGpx(g.name.replace(/\s+/g, '-'), g.text);
      toast('GPX scaricato');
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

// --- Saved start points ---
const btnStarts = document.getElementById('btn-starts') as HTMLButtonElement;
const startsOverlay = document.getElementById('starts') as HTMLDivElement;
const startsList = document.getElementById('starts-list') as HTMLDivElement;
const btnStartsClose = document.getElementById('btn-starts-close') as HTMLButtonElement;
const btnStartAdd = document.getElementById('btn-start-add') as HTMLButtonElement;

function useStart(lng: number, lat: number, name?: string): void {
  if (name) seedName(lng, lat, name);
  waypoints.replaceAll([{ lng, lat }]); // fresh start; onChange re-renders + clears route
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 11) });
  startsOverlay.hidden = true;
}

function renderStarts(): void {
  const list = getStarts();
  if (list.length === 0) {
    startsList.innerHTML = '<p class="lib-empty">Nessuna partenza salvata.<br>Metti un punto di partenza e tocca “Salva partenza attuale”.</p>';
    return;
  }
  startsList.innerHTML = '';
  for (const st of list) {
    const item = document.createElement('div');
    item.className = 'lib-item';
    item.innerHTML =
      `<div class="lib-item-main"><div class="lib-item-name"></div>` +
      `<div class="lib-item-meta">${st.lat.toFixed(4)}, ${st.lng.toFixed(4)}</div></div>` +
      `<button class="lib-del" data-act="rename" title="Rinomina">✎</button>` +
      `<button class="lib-del" data-act="del" title="Elimina">🗑</button>`;
    (item.querySelector('.lib-item-name') as HTMLElement).textContent = st.name;
    item.querySelector('.lib-item-main')?.addEventListener('click', () => useStart(st.lng, st.lat, st.name));
    item.querySelector('[data-act="rename"]')?.addEventListener('click', () => {
      const n = window.prompt('Nuovo nome:', st.name)?.trim();
      if (n) { renameStart(st.id, n); seedName(st.lng, st.lat, n); renderStarts(); }
    });
    item.querySelector('[data-act="del"]')?.addEventListener('click', () => { deleteStart(st.id); renderStarts(); });
    startsList.appendChild(item);
  }
}

// --- POI overlay (OpenStreetMap, keyless) ---
const btnPoi = document.getElementById('poi-toggle') as HTMLButtonElement;
const poiLayer = new PoiLayer(map);
let poiOn = false;
let poiTimer: number | undefined;

async function refreshPois(): Promise<void> {
  if (!poiOn) return;
  if (map.getZoom() < 9) {
    poiLayer.clear();
    toast('Zooma di più per i punti di interesse');
    return;
  }
  btnPoi.textContent = '⏳';
  try {
    const pois = await fetchPois(map.getBounds());
    if (poiOn) poiLayer.set(pois);
  } catch {
    toast('POI non disponibili, riprova');
  } finally {
    btnPoi.textContent = '🌄';
  }
}

btnPoi.addEventListener('click', () => {
  poiOn = !poiOn;
  btnPoi.setAttribute('aria-pressed', String(poiOn));
  if (poiOn) void refreshPois();
  else poiLayer.clear();
});

map.on('moveend', () => {
  if (!poiOn) return;
  window.clearTimeout(poiTimer);
  poiTimer = window.setTimeout(() => void refreshPois(), 700);
});

// --- Natural-language bar ---
const aiBar = document.getElementById('ai-bar') as HTMLFormElement;
const aiInput = document.getElementById('ai-input') as HTMLInputElement;
const aiGo = document.getElementById('ai-go') as HTMLButtonElement;
const aiSummary = document.getElementById('ai-summary') as HTMLParagraphElement;

if (!hasAi()) aiBar.hidden = true;

aiBar.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = aiInput.value.trim();
  if (!text) return;
  aiGo.disabled = true;
  aiGo.textContent = '⏳';
  aiSummary.hidden = true;
  errBox.hidden = true;
  try {
    const req = await parseRideRequest(text);
    aiSummary.textContent = req.summary;
    aiSummary.hidden = false;

    // Apply the understood parameters to the UI.
    optAvoidHw.checked = req.avoid_highways;
    routeOptions.avoidHighways = req.avoid_highways;
    const km = Math.min(400, Math.max(30, Math.round(req.distance_km)));
    anelloDist.value = String(km);
    anelloDistVal.textContent = `${km} km`;
    const dir = req.direction === 'qualsiasi' ? 'rand' : req.direction;
    anelloDir = dir;
    compass.querySelectorAll('button').forEach((b) =>
      b.classList.toggle('active', b.getAttribute('data-dir') === dir),
    );

    const start = waypoints.stops[0]?.lngLat;
    if (!start) {
      setMode(req.mode === 'anello' ? 'anello' : 'manuale');
      toast('Scegli prima il punto di partenza');
      return;
    }

    // Resolve the places the AI extracted into REAL coordinates (anti-hallucination:
    // anything the geocoder can't find is dropped and reported).
    const wanted = [...(req.via_places ?? [])];
    if (req.mode === 'punto_a_punto' && req.destination) wanted.push(req.destination);
    const found: GeocodedPlace[] = [];
    const missing: string[] = [];
    for (const q of wanted.slice(0, 5)) {
      const g = await geocodePlace(q, { lng: start.lng, lat: start.lat });
      if (g) found.push(g);
      else missing.push(q);
    }
    if (missing.length) toast(`Non ho trovato: ${missing.join(', ')}`);

    if (found.length) {
      for (const g of found) seedName(g.lng, g.lat, g.name);
      const vias = found.map((g) => new maplibregl.LngLat(g.lng, g.lat));
      if (req.mode === 'anello') {
        const loop = await generateLoopVia(start, vias, km, runRoute);
        waypoints.replaceAll(loop.points, { silent: true });
        lastLoop = { start, targetKm: km };
        regenAlt = 0;
        setMode('manuale');
        showRoute(loop.route);
        setSheetCollapsed(true);
      } else {
        setMode('manuale');
        waypoints.replaceAll([start, ...vias]);
      }
      return;
    }

    if (req.mode === 'anello') {
      await doGenerate(dir, start, km);
    } else {
      setMode('manuale');
      toast('Tocca la mappa per la destinazione');
    }
  } catch (err) {
    errBox.textContent = err instanceof Error ? err.message : 'IA non disponibile';
    errBox.hidden = false;
  } finally {
    aiGo.disabled = false;
    aiGo.textContent = '✨';
  }
});

btnStarts.addEventListener('click', () => { renderStarts(); startsOverlay.hidden = false; });
btnStartsClose.addEventListener('click', () => { startsOverlay.hidden = true; });
btnStartAdd.addEventListener('click', () => {
  const s = waypoints.stops[0];
  if (!s) { toast('Prima metti un punto di partenza sulla mappa'); return; }
  const suggested = cachedName(s.lngLat.lng, s.lngLat.lat) ?? 'Casa';
  const name = window.prompt('Nome della partenza:', suggested)?.trim();
  if (!name) return;
  addStart(name, s.lngLat.lng, s.lngLat.lat);
  seedName(s.lngLat.lng, s.lngLat.lat, name);
  renderStarts();
  toast('Partenza salvata 🏠');
});

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

function currentGpx(): { name: string; text: string } | null {
  if (!currentRoute || !waypoints.ready) return null;
  const pts = waypoints.points;
  const name = `MotoRoute ${new Date().toLocaleDateString('it-IT')}`;
  const text = buildGpx(currentRoute.feature, { name, start: pts[0], end: pts[pts.length - 1] });
  return { name, text };
}

btnGpx.addEventListener('click', () => {
  const g = currentGpx();
  if (g) downloadGpx(g.name.replace(/\s+/g, '-'), g.text);
});

// Navigate the EXACT route: share the GPX file so it opens in a turn-by-turn app
// (OsmAnd, Guru Maps, Cartograph…). Google Maps can't follow a custom polyline.
btnNavigate.addEventListener('click', async () => {
  const g = currentGpx();
  if (!g) return;
  const file = new File([g.text], `${g.name.replace(/\s+/g, '-')}.gpx`, {
    type: 'application/gpx+xml',
  });
  const shareData = { files: [file], title: g.name };
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share(shareData);
    } catch {
      /* user cancelled */
    }
    return;
  }
  // Fallback (e.g. desktop): download so the user can open it in a nav app.
  downloadGpx(g.name.replace(/\s+/g, '-'), g.text);
  toast('GPX scaricato — aprilo in OsmAnd o simili');
});

// Open in Google Maps: sample up to 8 on-track via-points from the route
// geometry so Maps follows the track closely, plus avoid=highways.
btnMaps.addEventListener('click', () => {
  if (!currentRoute) return;
  const coords = currentRoute.feature.geometry.coordinates;
  if (coords.length < 2) return;
  const fmt = (c: number[]): string => `${c[1].toFixed(5)},${c[0].toFixed(5)}`; // lat,lng
  const origin = fmt(coords[0]);
  const destination = fmt(coords[coords.length - 1]);
  const vias = sampleAlongTrack(coords, 8).map(fmt).join('|');
  let url =
    `https://www.google.com/maps/dir/?api=1&travelmode=driving&avoid=highways,tolls` +
    `&origin=${origin}&destination=${destination}`;
  if (vias) url += `&waypoints=${vias}`;
  window.open(url, '_blank');
});

btnClear.addEventListener('click', () => waypoints.clear());

map.on('load', () => {
  const meta = document.getElementById('topbar-meta');
  if (meta) meta.textContent = 'pronto';
  renderSheet();
});
