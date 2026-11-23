import { describe, expect, it } from 'vitest';
import type { IRPath, PtMm, Style } from '../types';
import { mixedPanel } from './mixed-fold-panel';

const pen: Style = {
  id: 0,
  strokeRgb: [0, 0, 0],
  widthMm: 0,
  dash: null,
  layer: null,
  fill: true,
  clip: null,
};
const square = [
  { x: 0, y: 0 },
  { x: 40, y: 0 },
  { x: 40, y: 40 },
  { x: 0, y: 40 },
];
function mark(
  id: number,
  index: number,
  pg: number,
  place: (x: number, y: number) => PtMm,
): IRPath {
  const x = index + 0.5;
  const pts =
    index % 5 < 3
      ? [
          [-0.45, -0.4],
          [-0.28, -0.2],
          [-0.12, 0.12],
          [0.45, -0.4],
        ].map(([a, b]) => place(x + a, b))
      : Array.from({ length: 9 }, (_, n) =>
          place(x + 0.48 * Math.cos((n * Math.PI) / 4), 0.4 * Math.sin((n * Math.PI) / 4)),
        );
  return {
    id,
    src: { file: 'sheet', page: pg, op: index * 5, sub: 0 },
    closed: true,
    pts,
    style: 0,
    visibleMotif: true,
  };
}
const key = Array.from({ length: 20 }, (_, i) => mark(i, i, 0, (x, y) => ({ x, y: y + 60 })));
const paths = square.flatMap((p, i) => {
  const q = square[(i + 1) % 4],
    dx = (q.x - p.x) / 40,
    dy = (q.y - p.y) / 40;
  return Array.from({ length: 40 }, (_, n) =>
    mark(100 + 40 * i + n, n, i + 1, (x, y) => ({
      x: p.x + dx * x - dy * y,
      y: p.y + dy * x + dx * y,
    })),
  );
});
describe('mixed filled pen on a folded panel', () => {
  it('recovers the turns from continued axes independently of the seed vertex', () => {
    for (const outer of [square, square.slice().reverse(), [...square.slice(1), square[0]]]) {
      const result = mixedPanel(paths, [pen], key, outer, [...key, ...paths]);
      expect(result).toBeDefined();
      for (const p of square)
        expect(result!.pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-8)).toBe(true);
    }
  });
  it('refuses when an interval of the selected pen has no visible paint', () => {
    const hidden = paths.map((p) =>
      p.src.page === 2 && p.src.op >= 25 && p.src.op <= 100 ? { ...p, visibleMotif: undefined } : p,
    );
    expect(mixedPanel(hidden, [pen], key, square, [...key, ...hidden])).toBeUndefined();
  });
});
