import { describe, it, expect } from 'vitest';
import type { Feature, LineString } from 'geojson';
import type { LngLat } from 'maplibre-gl';
import { buildGpx } from './gpx';

// Minimal structural stand-ins — buildGpx only reads .lat / .lng.
const start = { lat: 43.1338, lng: 12.3174 } as LngLat;
const end = { lat: 42.9652, lng: 12.6387 } as LngLat;

const feature: Feature<LineString> = {
  type: 'Feature',
  properties: {},
  geometry: {
    type: 'LineString',
    coordinates: [
      [12.3174, 43.1338, 250],
      [12.5, 43.05],
      [12.6387, 42.9652, 310],
    ],
  },
};

describe('buildGpx', () => {
  const gpx = buildGpx(feature, { name: 'Giro di prova', start, end });

  it('produces a GPX 1.1 root', () => {
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('creator="MotoRoute"');
  });

  it('writes lat/lon in the correct order (not swapped)', () => {
    // GPX is lat then lon; GeoJSON coords are [lon, lat].
    expect(gpx).toContain('<trkpt lat="43.133800" lon="12.317400">');
    expect(gpx).toContain('<trkpt lat="42.965200" lon="12.638700">');
  });

  it('emits one trkpt per coordinate and keeps elevation when present', () => {
    expect(gpx.match(/<trkpt /g)).toHaveLength(3);
    expect(gpx).toContain('<ele>250</ele>');
    expect(gpx).toContain('<ele>310</ele>');
  });

  it('includes start and end as named waypoints', () => {
    expect(gpx).toContain('<wpt lat="43.133800" lon="12.317400"><name>Partenza</name></wpt>');
    expect(gpx).toContain('<wpt lat="42.965200" lon="12.638700"><name>Destinazione</name></wpt>');
  });

  it('escapes XML in the route name', () => {
    const g = buildGpx(feature, { name: 'A & B <test>', start, end });
    expect(g).toContain('A &amp; B &lt;test&gt;');
  });
});
