import maplibregl from 'maplibre-gl';
import { POI_EMOJI, type Poi } from './overpass';

/** Renders POIs as emoji markers with a name popup. */
export class PoiLayer {
  private markers: maplibregl.Marker[] = [];
  private readonly map: maplibregl.Map;

  constructor(map: maplibregl.Map) {
    this.map = map;
  }

  set(pois: Poi[], limit = 160): void {
    this.clear();
    for (const p of pois.slice(0, limit)) {
      const el = document.createElement('div');
      el.className = 'poi-marker';
      el.textContent = POI_EMOJI[p.category];
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setText(p.name))
        .addTo(this.map);
      this.markers.push(marker);
    }
  }

  clear(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
  }

  get count(): number {
    return this.markers.length;
  }
}
