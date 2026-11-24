import { expect, it } from 'vitest';
import type { ChainSet, IRPath, PtMm, Sheet } from '../types';
import { inspectPrintedMotif, measuredMotifPolygon } from './printed-motif-polygon';

const xy = (x: number, y: number) => ({ x, y });
const square = [xy(0, 0), xy(32, 0), xy(32, 32), xy(0, 32)];
function fixture() {
  const paths: IRPath[] = [];
  const triangle = (origin: PtMm, u: PtMm) => {
    const point = (a: number, b: number) =>
      xy(origin.x + a * u.x - b * u.y, origin.y + a * u.y + b * u.x);
    paths.push({
      id: paths.length,
      src: { file: 'test', page: 0, op: paths.length, sub: 0 },
      style: 0,
      closed: true,
      visibleMotif: true,
      pts: [point(-1, -0.5), point(1, -0.5), point(0, 0.5)],
    });
  };
  for (let i = 0; i < 8; i++) triangle(xy(2 + 4 * i, -20), xy(1, 0));
  for (const [i, a] of square.entries()) {
    const b = square[(i + 1) % 4],
      u = xy((b.x - a.x) / 32, (b.y - a.y) / 32);
    for (let k = 2; k < 32; k += 4) triangle(xy(a.x + k * u.x, a.y + k * u.y), u);
  }
  const sheet = {
    paths,
    styles: [{ fill: true, strokeRgb: [0, 0, 0] }],
    texts: [
      { text: 'SIZE S', anchor: xy(0, -19), src: { page: 0 }, rotationDeg: 0, fontSizeMm: 4 },
    ],
  } as Sheet;
  const set = {
    classes: [1, 2].map(() => ({
      evidence: [{ kind: 'legend-sample', textAt: xy(0, -19), at: xy(32, -20) }],
    })),
  } as ChainSet;
  return { sheet, set, paths };
}
it('follows the visible pen through corners even with a slightly displaced grade prediction', () => {
  const { sheet, set } = fixture();
  const read = inspectPrintedMotif(
    sheet,
    set,
    'S',
    square.map((p) => xy(p.x + 0.3, p.y - 0.2)),
  )!;
  const cut = measuredMotifPolygon(read)!;
  expect(cut.corners).toEqual(square);
  expect(cut.edges.every((e) => e.gap <= e.pitch && e.residual < 1e-6)).toBe(true);
});
it('cannot complete a polygon when an entire side is hidden or painted with a different glyph', () => {
  for (const hidden of [true, false]) {
    const { sheet, set, paths } = fixture();
    for (const p of paths.slice(-8)) {
      if (hidden) delete p.visibleMotif;
      else p.pts[2] = { ...p.pts[2], x: p.pts[2].x + 1.5 };
    }
    expect(measuredMotifPolygon(inspectPrintedMotif(sheet, set, 'S', square)!)).toBeUndefined();
  }
});
