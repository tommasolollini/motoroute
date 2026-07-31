import maplibregl from 'maplibre-gl';

export interface Stop {
  id: number;
  lngLat: maplibregl.LngLat;
  marker: maplibregl.Marker;
}

export type ChangeReason = 'add' | 'remove' | 'drag' | 'reorder' | 'clear';

const GREEN = '#1d9e75';
const AMBER = '#ef9f27';
const VIA = '#378add';

/**
 * Ordered list of stops for multi-waypoint routing.
 * First stop is the start (A), last is the destination (B), the rest are
 * via-points ("passa da"). Markers are draggable and relabel automatically.
 */
export class Waypoints {
  stops: Stop[] = [];
  onChange: (reason: ChangeReason) => void = () => {};

  private readonly map: maplibregl.Map;
  private seq = 0;

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  add(lngLat: maplibregl.LngLatLike): void {
    const point = maplibregl.LngLat.convert(lngLat);
    const id = ++this.seq;
    const marker = this.makeMarker(id, point);
    this.stops.push({ id, lngLat: point, marker });
    this.relabel();
    this.onChange('add');
  }

  remove(id: number): void {
    const idx = this.stops.findIndex((s) => s.id === id);
    if (idx === -1) return;
    this.stops[idx].marker.remove();
    this.stops.splice(idx, 1);
    this.relabel();
    this.onChange('remove');
  }

  move(id: number, dir: -1 | 1): void {
    const idx = this.stops.findIndex((s) => s.id === id);
    const j = idx + dir;
    if (idx === -1 || j < 0 || j >= this.stops.length) return;
    [this.stops[idx], this.stops[j]] = [this.stops[j], this.stops[idx]];
    this.relabel();
    this.onChange('reorder');
  }

  clear(): void {
    for (const s of this.stops) s.marker.remove();
    this.stops = [];
    this.onChange('clear');
  }

  /** Replace all stops at once (e.g. a generated loop). Silent by default so the
   *  caller can draw an already-computed route without a redundant re-route. */
  replaceAll(points: maplibregl.LngLatLike[], opts: { silent?: boolean } = {}): void {
    for (const s of this.stops) s.marker.remove();
    this.stops = points.map((p) => {
      const point = maplibregl.LngLat.convert(p);
      const id = ++this.seq;
      return { id, lngLat: point, marker: this.makeMarker(id, point) };
    });
    this.relabel();
    if (!opts.silent) this.onChange('reorder');
  }

  get ready(): boolean {
    return this.stops.length >= 2;
  }

  get points(): maplibregl.LngLat[] {
    return this.stops.map((s) => s.lngLat);
  }

  /** Vero quando il giro è chiuso: partenza e arrivo sono lo stesso punto. */
  private loopClosed = false;

  /** Label + colour by position: A (start), numbers (via), B (end). */
  private relabel(): void {
    const last = this.stops.length - 1;
    const first = this.stops[0];
    const end = this.stops[last];

    // In un anello A e B stanno sulla stessa coordinata: due pastiglie sovrapposte
    // e B copre A del tutto. Si mostra una sola pastiglia "A·B" bicolore nel punto
    // giusto — spostarne una la metterebbe dove la tappa non è.
    this.loopClosed =
      this.stops.length >= 3 &&
      Math.abs(first.lngLat.lng - end.lngLat.lng) < 3e-4 &&
      Math.abs(first.lngLat.lat - end.lngLat.lat) < 3e-4;

    this.stops.forEach((s, i) => {
      const el = s.marker.getElement();
      el.classList.toggle('wp-marker--ab', this.loopClosed && i === 0);
      el.style.display = this.loopClosed && i === last ? 'none' : '';
      if (i === 0) {
        el.textContent = this.loopClosed ? 'A·B' : 'A';
        el.style.setProperty('--wp', GREEN);
      } else if (i === last) {
        el.textContent = 'B';
        el.style.setProperty('--wp', AMBER);
      } else {
        el.textContent = String(i);
        el.style.setProperty('--wp', VIA);
      }
    });
  }

  private makeMarker(id: number, lngLat: maplibregl.LngLat): maplibregl.Marker {
    const el = document.createElement('div');
    el.className = 'wp-marker';
    const marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'center' })
      .setLngLat(lngLat)
      .addTo(this.map);

    marker.on('dragend', () => {
      const idx = this.stops.findIndex((s) => s.id === id);
      if (idx === -1) return;
      const at = marker.getLngLat();
      this.stops[idx].lngLat = at;
      // Anello con la pastiglia unica "A·B": trascinandola si sposta anche
      // l'arrivo, altrimenti il giro si aprirebbe senza che si veda perché.
      if (this.loopClosed && idx === 0) {
        const end = this.stops[this.stops.length - 1];
        end.lngLat = at;
        end.marker.setLngLat(at);
      }
      this.onChange('drag');
    });

    return marker;
  }
}

export function formatLngLat(p: maplibregl.LngLat): string {
  return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
}
