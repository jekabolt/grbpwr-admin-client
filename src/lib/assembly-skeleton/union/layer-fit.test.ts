import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from '../types';
import { apply, det, IDENTITY } from './affine';
import { fitLayerToHostUnion } from './layer-fit';

const geom = (pieceKey: string, rs: Pt2[]): PieceGeom =>
  ({
    pieceKey,
    name: pieceKey,
    hand: null,
    cloth: null,
    rs,
    corners: [],
    notchIdx: [],
    edges: [],
    rect: false,
    areaMm2: 1,
    perimMm: 1,
    twinOf: [],
  }) as PieceGeom;

const boxOf = (points: readonly Pt2[]) => ({
  x0: Math.min(...points.map((point) => point[0])),
  y0: Math.min(...points.map((point) => point[1])),
  x1: Math.max(...points.map((point) => point[0])),
  y1: Math.max(...points.map((point) => point[1])),
});

describe('fitLayerToHostUnion', () => {
  const upper: Pt2[] = [
    [0, 180],
    [200, 180],
    [200, 300],
    [0, 300],
  ];
  const lower: Pt2[] = [
    [0, 0],
    [200, 0],
    [200, 180],
    [0, 180],
  ];
  // Its top and long sides are cut from the host outline; only the rounded bottom is internal.
  const laidBag: Pt2[] = [
    [0, 300],
    [0, 140],
    [5, 125],
    [20, 120],
    [180, 120],
    [195, 125],
    [200, 140],
    [200, 300],
  ];
  const angle = Math.PI / 24;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const localBag = laidBag.map(([x, y]): Pt2 => [c * x - s * y + 360, s * x + c * y - 210]);
  const geoms = new Map([
    ['UPPER', geom('UPPER', upper)],
    ['LOWER', geom('LOWER', lower)],
    ['BAG', geom('BAG', localBag)],
  ]);
  const at = new Map([
    ['UPPER', IDENTITY],
    ['LOWER', IDENTITY],
  ]);

  it('puts an upper-shaped bag inside the assembled host, upright and unmirrored', () => {
    const fit = fitLayerToHostUnion('BAG', ['UPPER', 'LOWER'], at, geoms, {
      rasterMm: 1,
      uprightMax: Math.PI / 2,
    });
    expect(fit).not.toBeNull();
    expect(det(fit!.T)).toBeGreaterThan(0);
    expect(fit!.inside).toBeGreaterThan(0.98);
    expect(fit!.outlineMm).toBeGreaterThan(450);
    expect(fit!.runMm).toBeGreaterThan(150);
    const box = boxOf(localBag.map((point) => apply(fit!.T, point)));
    expect(box.x0).toBeCloseTo(0, 0);
    expect(box.x1).toBeCloseTo(200, 0);
    expect(box.y0).toBeGreaterThan(117);
    expect(box.y0).toBeLessThan(123);
    expect(box.y1).toBeGreaterThan(297);
    expect(box.y1).toBeLessThan(303);
  });

  it('refuses a layer with no long host-outline match', () => {
    const unrelated = geom('SMALL', [
      [0, 0],
      [50, 0],
      [50, 50],
      [0, 50],
    ]);
    geoms.set('SMALL', unrelated);
    expect(fitLayerToHostUnion('SMALL', ['UPPER', 'LOWER'], at, geoms)).toBeNull();
  });
});
