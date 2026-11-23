import { describe, expect, it } from 'vitest';
import type { IRPath } from '../types';
import { maskedMarkLoop } from './masked-mark-loop';

function squareMark(id: number, x: number, y: number): IRPath {
  return {
    id,
    style: 0,
    closed: true,
    src: { file: 'pdf', page: 0, op: id, sub: 0 },
    pts: [
      { x: x - 0.2, y: y - 0.2 },
      { x: x + 0.2, y: y - 0.2 },
      { x: x + 0.2, y: y + 0.2 },
      { x: x - 0.2, y: y + 0.2 },
    ],
  };
}
describe('recovery of a clipped row of fill marks', () => {
  const row = [
    [0, 0],
    [2, 0],
    [4, 0],
    [4, 2],
    [4, 4],
    [2, 4],
    [0, 4],
    [0, 2],
  ].map(([x, y], i) => squareMark(i, x, y));
  const partial = { ...row[0], pts: squareMark(0, -1, 0).pts, visibleFill: row[0].pts };
  const erased = { ...squareMark(8, 2, 1), visibleFill: [] };
  it('uses the visible centre and keeps both halves of the row under cyclic/reversed input', () => {
    for (const marks of [
      [erased, ...row.slice(1), partial],
      [partial, ...row.slice(1), erased].reverse(),
    ]) {
      const cut = maskedMarkLoop(marks)!;
      expect(cut.ink.map((p) => p.id).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
      expect(cut.outer).toHaveLength(8);
      expect(cut.outer.some((p) => Math.hypot(p.x, p.y) < 1e-8)).toBe(true);
    }
  });
  it('refuses a disconnected visible mark or an ambiguous branch', () => {
    expect(
      maskedMarkLoop([partial, ...row.slice(1), erased, squareMark(9, 20, 20)]),
    ).toBeUndefined();
    expect(maskedMarkLoop([partial, ...row.slice(1), erased, squareMark(9, 2, 2)])).toBeUndefined();
  });
});
