import { describe, expect, it } from 'vitest';

import { fitNeckPath, restPath, type CollarCtx, type NeckPath } from './collar';

const ctx = (panels: number[], xy: [number, number][], notches: number[]): CollarCtx => ({
  pos: new Float64Array(xy.flatMap(([x, y]) => [x, y, 0])),
  uv: new Float64Array(xy.flat()),
  cuv: new Float64Array(xy.flat()),
  panelOf: Int32Array.from(panels),
  ringOf: Int32Array.from(panels.map((_, i) => i)),
  nbOf: () => xy.length + 1,
  isNotch: (v) => notches.includes(v),
});

const neck = (c: CollarCtx, verts: number[], cb: number): NeckPath => ({
  verts,
  path: restPath(c, verts),
  closed: false,
  cb,
  snp: null,
  ext: [0, 0],
  how: 'test walk',
});

describe('fitNeckPath', () => {
  it('uses the farther CF notch pair when the nearer pair leaves front extensions in the neck', () => {
    const xy: [number, number][] = [0, 35, 70, 289.5, 509, 544, 579].map((x) => [x, 0]);
    const c = ctx(
      xy.map(() => 0),
      xy,
      [1, 2, 4, 5],
    );
    const fitted = fitNeckPath(
      c,
      neck(
        c,
        xy.map((_, i) => i),
        289.5,
      ),
      439,
    );

    expect(fitted.path.len).toBeCloseTo(439, 6);
    expect(fitted.ext).toEqual([70, 70]);
    expect(fitted.how).toContain('CF notches');
  });

  it('stops at the shoulder panel junctions instead of walking on past the neckline', () => {
    const xy: [number, number][] = [
      [0, 0],
      [167, 0],
      [0, 0],
      [221, 0],
      [443, 0],
      [0, 0],
      [167, 0],
    ];
    const panels = [0, 0, 1, 1, 1, 2, 2];
    const c = ctx(panels, xy, []);
    const fitted = fitNeckPath(
      c,
      neck(
        c,
        xy.map((_, i) => i),
        388,
      ),
      433.5,
    );

    expect(fitted.path.len).toBeCloseTo(443, 6);
    expect(fitted.how).toContain('panel junctions');
  });

  it('does not invent cut points when no landmark pair fits', () => {
    const xy: [number, number][] = [0, 200, 400, 600].map((x) => [x, 0]);
    const c = ctx(
      xy.map(() => 0),
      xy,
      [],
    );
    const original = neck(
      c,
      xy.map((_, i) => i),
      300,
    );

    expect(fitNeckPath(c, original, 430)).toBe(original);
  });
});
