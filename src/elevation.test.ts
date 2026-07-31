import { describe, it, expect } from 'vitest';
import {
  hasElevation,
  elevationProfile,
  curvinessDegPerKm,
  curvinessLabel,
} from './elevation';

/** Una salita netta di ~100 m su pochi punti. */
const climb: number[][] = [
  [12.0, 43.0, 100],
  [12.01, 43.0, 140],
  [12.02, 43.0, 180],
  [12.03, 43.0, 200],
];

describe('hasElevation', () => {
  it('rifiuta le coordinate 2D', () => {
    expect(hasElevation([[12, 43], [12.1, 43.1]])).toBe(false);
  });

  it('rifiuta le quote tutte uguali (dato assente travestito da zero)', () => {
    expect(hasElevation([[12, 43, 0], [12.1, 43.1, 0]])).toBe(false);
  });

  it('accetta quote reali', () => {
    expect(hasElevation(climb)).toBe(true);
  });
});

describe('elevationProfile', () => {
  it('restituisce null senza quote, invece di un grafico finto', () => {
    expect(elevationProfile([[12, 43], [12.1, 43.1]])).toBeNull();
  });

  it('somma la salita e riconosce gli estremi', () => {
    const p = elevationProfile(climb)!;
    expect(p.ascentM).toBe(100);
    expect(p.descentM).toBe(0);
    expect(p.minEle).toBe(100);
    expect(p.maxEle).toBe(200);
    expect(p.distanceKm).toBeGreaterThan(0);
  });

  it('filtra il rumore del modello del terreno invece di sommarlo', () => {
    // Oscillazioni di ±2 m: rumore, non dislivello.
    const noisy: number[][] = [];
    for (let i = 0; i < 60; i++) noisy.push([12 + i * 0.001, 43, 500 + (i % 2 ? 2 : -2)]);
    const p = elevationProfile(noisy)!;
    expect(p.ascentM).toBe(0);
  });

  it('non supera il numero massimo di punti richiesto', () => {
    const long: number[][] = [];
    for (let i = 0; i < 900; i++) long.push([12 + i * 0.001, 43, 200 + Math.sin(i / 20) * 80]);
    const p = elevationProfile(long, 140)!;
    expect(p.points.length).toBeLessThanOrEqual(142);
  });
});

describe('curvinessDegPerKm', () => {
  it('dà circa zero su una linea retta', () => {
    const straight: number[][] = [];
    for (let i = 0; i < 40; i++) straight.push([12 + i * 0.002, 43]);
    expect(curvinessDegPerKm(straight)).toBeLessThan(5);
  });

  it('cresce su un percorso a zigzag', () => {
    const zig: number[][] = [];
    for (let i = 0; i < 40; i++) zig.push([12 + i * 0.002, 43 + (i % 2 ? 0.0015 : -0.0015)]);
    expect(curvinessDegPerKm(zig)).toBeGreaterThan(200);
  });

  it('non dipende dalla densità dei punti (stessa strada, punti doppi)', () => {
    const base: number[][] = [];
    for (let i = 0; i < 80; i++) base.push([12 + i * 0.004, 43 + Math.sin(i / 6) * 0.01]);
    // stessa geometria, campionata il doppio
    const dense: number[][] = [];
    for (let i = 0; i < 160; i++) dense.push([12 + i * 0.002, 43 + Math.sin(i / 12) * 0.01]);
    const a = curvinessDegPerKm(base);
    const b = curvinessDegPerKm(dense);
    expect(Math.abs(a - b) / Math.max(a, b)).toBeLessThan(0.25);
  });
});

describe('curvinessLabel', () => {
  it('usa le soglie tarate sui percorsi misurati', () => {
    expect(curvinessLabel(80)).toBe('scorrevole');
    expect(curvinessLabel(190)).toBe('poco tortuoso');
    expect(curvinessLabel(280)).toBe('tortuoso');
    expect(curvinessLabel(430)).toBe('molto tortuoso');
  });
});
