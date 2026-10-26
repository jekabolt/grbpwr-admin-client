import { describe, expect, it } from 'vitest';
import { grainDisplaySegment } from './grain-display';

const inside = (p: { x: number; y: number }, ring: readonly { x: number; y: number }[]) => {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      hit = !hit;
  }
  return hit;
};

describe('grainDisplaySegment', () => {
  it('keeps a visible inset arrow inside a narrow piece', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 80, y: 0 },
      { x: 80, y: 6 },
      { x: 0, y: 6 },
    ];
    const hit = grainDisplaySegment([ring], {
      a: { x: -20, y: 3 },
      b: { x: 100, y: 3 },
    });
    expect(hit).toBeTruthy();
    expect(hit!.a.x).toBeGreaterThan(0);
    expect(hit!.b.x).toBeLessThan(80);
    expect(hit!.a.y).toBeCloseTo(3);
  });

  it('clips a slanted grain without changing its angle', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 70, y: 10 },
      { x: 55, y: 55 },
      { x: -10, y: 35 },
    ];
    const hit = grainDisplaySegment([ring], {
      a: { x: -30, y: -20 },
      b: { x: 90, y: 70 },
    });
    expect(hit).toBeTruthy();
    expect(inside(hit!.a, ring)).toBe(true);
    expect(inside(hit!.b, ring)).toBe(true);
    expect((hit!.b.y - hit!.a.y) / (hit!.b.x - hit!.a.x)).toBeCloseTo(0.75, 6);
  });

  it('uses the longest inside interval of a concave piece', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 25 },
      { x: 35, y: 25 },
      { x: 35, y: 45 },
      { x: 100, y: 45 },
      { x: 100, y: 70 },
      { x: 0, y: 70 },
    ];
    const hit = grainDisplaySegment([ring], {
      a: { x: -10, y: 35 },
      b: { x: 120, y: 35 },
    });
    expect(hit).toBeTruthy();
    expect(hit!.a.x).toBeGreaterThan(0);
    expect(hit!.b.x).toBeLessThan(35);
  });

  it('moves a bad-origin grain parallel through the widest chord', () => {
    const ring = [
      { x: 0, y: 0 },
      { x: 90, y: 15 },
      { x: 80, y: 55 },
      { x: -5, y: 40 },
    ];
    const hit = grainDisplaySegment([ring], {
      a: { x: -30, y: 120 },
      b: { x: 50, y: 120 },
    });
    expect(hit).toBeTruthy();
    expect(hit!.a.y).toBeCloseTo(hit!.b.y, 8);
    expect(hit!.a.y).toBeLessThan(55);
    expect(hit!.a.y).toBeGreaterThan(0);
    expect(inside(hit!.a, ring)).toBe(true);
    expect(inside(hit!.b, ring)).toBe(true);
  });
});
