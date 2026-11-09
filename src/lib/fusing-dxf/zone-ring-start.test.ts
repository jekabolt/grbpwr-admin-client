import { describe, expect, it } from 'vitest';
import fixture from './bp-shirt-back.fixture.json';
import { mapFuseSpecToSize } from './dxf';
import { blankFuse, type PieceFuseSpec } from './types';

// #202 «the interlining zone sometimes drifts when the size changes»: the same zone on the same two
// contours must land on the same spot whatever vertex the DXF happens to start each ring at — the
// «sometimes» of d4e493531 was exactly that (a point thrown onto the shoulder for one ring start).
// Every point of a two-ring prod zone (card 5 BP), both directions, many ring starts.
const ring = (pts: number[][]) => pts.map(([x, y]) => ({ x, y }));
const spline = (pts: number[][]) => ({ points: pts.map(([x, y]) => ({ x, y, corner: true })) });
const rotate = <T>(points: T[], k: number) => [...points.slice(k), ...points.slice(0, k)];
const m = ring(fixture.m);
const xs = ring(fixture.xs);
const zone: PieceFuseSpec = {
  ...blankFuse('zone'),
  zone: {
    spline: spline([
      [457.9, 541],
      [492.4, 546.3],
      [501.8, 607.2],
      [528.9, 614.8],
      [451, 693.8],
      [386.8, 747.8],
      [320.7, 707.1],
      [319.1, 674.7],
    ]),
    holes: [],
    islands: [
      spline([
        [30.9, 608.6],
        [101.8, 536.8],
        [184.3, 618.7],
        [240.8, 674.3],
        [236.7, 706.1],
        [169.7, 745.1],
        [99.6, 681.5],
      ]),
    ],
  },
};
const pointsOf = (spec: PieceFuseSpec) => {
  if (!spec.zone || !('spline' in spec.zone)) throw new Error('expected a spline zone');
  return [spec.zone.spline, ...spec.zone.islands].flatMap((s) => s.points);
};

describe('a zone across sizes does not depend on where the DXF starts a ring', () => {
  const starts = Array.from({ length: 24 }, (_, i) => i * 9);
  it.each([
    ['M → XS', m, xs],
    ['XS → M', xs, m],
  ])('%s', (_, from, to) => {
    const reference = pointsOf(mapFuseSpecToSize(zone, from, to));
    for (const a of starts)
      for (const b of [0, 37, 101, 180]) {
        const moved = pointsOf(
          mapFuseSpecToSize(zone, rotate(from, a % from.length), rotate(to, b % to.length)),
        );
        moved.forEach((p, i) =>
          expect(
            Math.hypot(p.x - reference[i].x, p.y - reference[i].y),
            `point ${i}, rings from ${a}/${b}`,
          ).toBeLessThan(1),
        );
      }
    // And nothing jumps across the piece: M and XS differ by 20 mm on each axis, so a point moves
    // with its edge by about that much (the shoulder jump of d4e493531 was a quarter of the piece).
    pointsOf(zone).forEach((p, i) =>
      expect(Math.hypot(p.x - reference[i].x, p.y - reference[i].y)).toBeLessThan(35),
    );
  });
});
