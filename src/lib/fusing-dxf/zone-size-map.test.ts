import { describe, expect, it } from 'vitest';
import { mapFuseSpecToSize } from './dxf';
import fixture from './bp-shirt-back.fixture.json';
import { blankFuse, type PieceFuseSpec } from './types';

const ring = (pts: number[][]) => pts.map(([x, y]) => ({ x, y }));
// Card 110's shirt back (BP), piece-local mm: M is the base size, XS is the size on screen; the
// zone is the band placed from the interlining file (base size).
const base = ring(fixture.m);
const shown = ring(fixture.xs);
// The DXF ring may start anywhere along the contour; the result must not depend on where.
const rotate = <T>(points: T[], k: number) => [...points.slice(k), ...points.slice(0, k)];
const stored: PieceFuseSpec = {
  ...blankFuse('zone'),
  zone: {
    spline: { points: fixture.zone.map(([x, y]) => ({ x, y, corner: true })) },
    holes: [],
    islands: [],
  },
};

const pointsOf = (spec: PieceFuseSpec) => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return spec.zone.spline.points;
};

describe('zone points across sizes', () => {
  it.each([
    [0, 0],
    [10, 0],
    [50, 7],
    [100, 100],
    [150, 0],
  ])(
    'a point dropped on the XS cut edge stays at that spot of the edge (XS ring from %i, M from %i)',
    (shownStart, baseStart) => {
      const xs = rotate(shown, shownStart);
      const m = rotate(base, baseStart);
      // The left side seam of XS between (9.05, 269.33) and (0.96, 28.45), at y = 257.
      const onEdge = { x: 9.05 - ((269.33 - 257) / (269.33 - 28.45)) * 8.09, y: 257 };
      const onScreen = mapFuseSpecToSize(stored, m, xs);
      const edited: PieceFuseSpec = {
        ...onScreen,
        zone: {
          spline: {
            points: pointsOf(onScreen).map((point, i) =>
              i === 35 ? { ...point, ...onEdge } : point,
            ),
          },
          holes: [],
          islands: [],
        },
      };
      // The editor writes XS → base, then the sheet draws base → XS again.
      const written = mapFuseSpecToSize(edited, xs, m);
      const onBase = pointsOf(written)[35];
      expect(onBase.x).toBeLessThan(15);
      expect(Math.abs(onBase.y - 257)).toBeLessThan(25);
      const back = pointsOf(mapFuseSpecToSize(written, m, xs))[35];
      expect(Math.hypot(back.x - onEdge.x, back.y - onEdge.y)).toBeLessThan(2);
    },
  );
});
