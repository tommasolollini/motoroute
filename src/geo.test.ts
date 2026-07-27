import { describe, it, expect } from 'vitest';
import maplibregl from 'maplibre-gl';
import { destinationPoint, COMPASS, sampleAlongTrack } from './geo';

const origin = new maplibregl.LngLat(12.0, 43.0);

describe('destinationPoint', () => {
  it('moves ~1° of latitude north for ~111 km', () => {
    const p = destinationPoint(origin, COMPASS.N, 111.19);
    expect(p.lat).toBeCloseTo(44.0, 1);
    expect(p.lng).toBeCloseTo(12.0, 2);
  });

  it('moves east (higher lng) heading E, latitude ~unchanged', () => {
    const p = destinationPoint(origin, COMPASS.E, 80);
    expect(p.lng).toBeGreaterThan(origin.lng);
    expect(p.lat).toBeCloseTo(43.0, 1);
  });

  it('moves south heading S', () => {
    const p = destinationPoint(origin, COMPASS.S, 50);
    expect(p.lat).toBeLessThan(origin.lat);
  });

  it('keeps longitude within [-180, 180]', () => {
    const p = destinationPoint(new maplibregl.LngLat(179.5, 0), COMPASS.E, 200);
    expect(p.lng).toBeGreaterThanOrEqual(-180);
    expect(p.lng).toBeLessThanOrEqual(180);
  });
});

describe('sampleAlongTrack', () => {
  // A straight west→east line at lat 43, from lon 12.0 to 13.0 (11 points).
  const line = Array.from({ length: 11 }, (_, i) => [12 + i * 0.1, 43]);

  it('returns the requested number of intermediate points', () => {
    expect(sampleAlongTrack(line, 8)).toHaveLength(8);
  });

  it('spaces them evenly and strictly between the endpoints', () => {
    const pts = sampleAlongTrack(line, 3);
    const lons = pts.map((p) => p[0]);
    expect(lons[0]).toBeGreaterThan(12);
    expect(lons[2]).toBeLessThan(13);
    expect(lons[0]).toBeLessThan(lons[1]);
    expect(lons[1]).toBeLessThan(lons[2]);
  });

  it('handles degenerate input', () => {
    expect(sampleAlongTrack([[12, 43]], 5)).toEqual([]);
  });
});
