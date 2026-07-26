import { describe, it, expect } from 'vitest';
import maplibregl from 'maplibre-gl';
import { destinationPoint, COMPASS } from './geo';

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
