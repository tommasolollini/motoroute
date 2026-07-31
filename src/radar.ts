/**
 * Radar delle precipitazioni in tempo reale (RainViewer, senza chiave).
 *
 * L'API pubblica elenca i fotogrammi disponibili — di norma un paio d'ore di
 * passato a passi di 10 minuti — e per ciascuno restituisce un percorso di tile
 * PNG. Le tile hanno `access-control-allow-origin: *`, quindi WebGL può usarle.
 *
 * Uso non commerciale: richiesta l'attribuzione a RainViewer.
 */
import type maplibregl from 'maplibre-gl';

const INDEX_URL = 'https://api.rainviewer.com/public/weather-maps.json';
const SOURCE_ID = 'radar';
const LAYER_ID = 'radar-layer';

/** Il radar sta SOTTO il percorso: la linea del giro deve restare leggibile. */
const BELOW_LAYER = 'route-casing';

interface Frame {
  time: number;
  path: string;
}

interface RainViewerIndex {
  host: string;
  radar?: { past?: Frame[]; nowcast?: Frame[] };
}

/** Fotogrammi disponibili, dal più vecchio al più recente. */
export async function fetchFrames(): Promise<{ host: string; frames: Frame[] }> {
  const res = await fetch(INDEX_URL);
  if (!res.ok) throw new Error(`Radar non disponibile (${res.status})`);
  const data = (await res.json()) as RainViewerIndex;
  const frames = [...(data.radar?.past ?? []), ...(data.radar?.nowcast ?? [])].filter(
    (f) => typeof f.time === 'number' && typeof f.path === 'string',
  );
  if (!frames.length) throw new Error('Nessun dato radar in questo momento');
  return { host: data.host, frames };
}

/**
 * `color=4` è la palette "Universal Blue", leggibile su mappa scura;
 * `1_1` attiva smoothing e i puntini di neve.
 */
function tileUrl(host: string, path: string): string {
  return `${host}${path}/512/{z}/{x}/{y}/4/1_1.png`;
}

export function formatFrameTime(time: number): string {
  return new Date(time * 1000).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export class RadarLayer {
  private readonly map: maplibregl.Map;
  private host = '';
  private frames: Frame[] = [];
  private idx = 0;
  private timer: number | undefined;
  private active = false;
  /** Notifica l'ora del fotogramma mostrato, per l'etichetta in interfaccia. */
  onFrame: (label: string, isLatest: boolean) => void = () => {};

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  get isActive(): boolean {
    return this.active;
  }

  async enable(): Promise<void> {
    const { host, frames } = await fetchFrames();
    this.host = host;
    this.frames = frames;
    this.idx = frames.length - 1; // parte dall'istante più recente
    this.active = true;

    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [tileUrl(host, frames[this.idx].path)],
        tileSize: 512,
        attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">RainViewer</a>',
      });
      // beforeId solo se il percorso esiste già, altrimenti MapLibre solleva errore.
      const before = this.map.getLayer(BELOW_LAYER) ? BELOW_LAYER : undefined;
      this.map.addLayer(
        {
          id: LAYER_ID,
          type: 'raster',
          source: SOURCE_ID,
          paint: { 'raster-opacity': 0.75 },
        },
        before,
      );
    } else {
      this.setFrame(this.idx);
      this.map.setLayoutProperty(LAYER_ID, 'visibility', 'visible');
    }

    this.announce();
    this.play();
  }

  disable(): void {
    this.active = false;
    this.stop();
    if (this.map.getLayer(LAYER_ID)) {
      this.map.setLayoutProperty(LAYER_ID, 'visibility', 'none');
    }
  }

  /** Rimuove del tutto livello e sorgente (usato quando si ricarica l'indice). */
  destroy(): void {
    this.stop();
    this.active = false;
    if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }

  private setFrame(i: number): void {
    const src = this.map.getSource(SOURCE_ID) as maplibregl.RasterTileSource | undefined;
    if (!src || !this.frames[i]) return;
    src.setTiles([tileUrl(this.host, this.frames[i].path)]);
  }

  private announce(): void {
    const f = this.frames[this.idx];
    if (f) this.onFrame(formatFrameTime(f.time), this.idx === this.frames.length - 1);
  }

  /** Anima i fotogrammi e si sofferma sull'ultimo, che è la situazione attuale. */
  private play(): void {
    this.stop();
    const step = (): void => {
      if (!this.active) return;
      const wasLast = this.idx === this.frames.length - 1;
      this.idx = wasLast ? 0 : this.idx + 1;
      this.setFrame(this.idx);
      this.announce();
      const pause = this.idx === this.frames.length - 1 ? 1600 : 420;
      this.timer = window.setTimeout(step, pause);
    };
    this.timer = window.setTimeout(step, 1600);
  }

  private stop(): void {
    window.clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Ricarica l'elenco dei fotogrammi (il radar si aggiorna ogni ~10 minuti). */
  async refresh(): Promise<void> {
    if (!this.active) return;
    const { host, frames } = await fetchFrames();
    this.host = host;
    this.frames = frames;
    this.idx = frames.length - 1;
    this.setFrame(this.idx);
    this.announce();
  }
}
