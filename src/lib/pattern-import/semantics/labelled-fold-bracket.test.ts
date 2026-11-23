import { expect, it } from 'vitest';

import { bracketEdges, foldBracket, straightRuns, unfold, type OtherLines } from './fold';

it('uses the arrowheads at a confirmed FOLD label to unfold the short side of a facing', () => {
  const lines = [
    [
      { x: 5, y: 15 },
      { x: 45, y: 15 },
    ],
    [
      { x: 5, y: 15 },
      { x: 5, y: 11 },
    ],
    [
      { x: 45, y: 15 },
      { x: 45, y: 11 },
    ],
  ].map((pts) => ({ pts, closed: false }));
  const around: OtherLines = {
    nearer: () => false,
    nearest: () => null,
    within: () => lines,
  };
  const word = { at: { x: 25, y: 16 }, text: 'FOLD', dirDeg: 0, sizeMm: 3 };
  expect(foldBracket(word, around)).toBeNull();
  const bracket = foldBracket(word, around, true);
  expect(bracket).not.toBeNull();
  for (const bottom of [0, -10]) {
    const half = [
      { x: 0, y: bottom },
      { x: 50, y: bottom },
      { x: 50, y: 243 },
      { x: 0, y: 240 },
    ];
    const edges = bracketEdges(bracket!, half, straightRuns(half));
    expect(edges).toHaveLength(1);
    const whole = unfold(half, edges[0])!;
    expect(whole.edge.every((p) => p.y === bottom)).toBe(true);
    expect(Math.min(...whole.pts.map((p) => p.y))).toBe(2 * bottom - 243);
  }
});
