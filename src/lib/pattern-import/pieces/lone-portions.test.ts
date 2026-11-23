import { expect, it } from 'vitest';

import type { Chain, ChainSet } from 'lib/pattern-import/types';

import { lonePortions, type WallModel } from './walls';

function rectangle(id: number, x: number, y: number): Chain {
  const pts = [
    { x, y },
    { x: 100, y },
    { x: 100, y: 0 },
    { x, y: 0 },
    { x, y },
  ];
  return { id, pts, closed: true, ranges: [], motif: null, style: id, lengthMm: 2 * (100 - x + y) };
}

it('ends the shared stretch before it can step onto a neighbouring closed size at its first corner', () => {
  const set: ChainSet = {
    chains: [rectangle(0, 0, 100), rectangle(1, 9.5, 98.4)],
    bundles: [],
    classes: [],
    orphans: [],
    warnings: [],
  };
  const model: WallModel = {
    mode: 'graded',
    n: 2,
    common: [],
    byRank: [[1], [0]],
    emptyRanks: [],
    graded: [0, 1],
    fileOfRank: [],
  };
  const top = lonePortions(set, model).find(
    (wall) => wall.chain === 0 && wall.pts[0].x === 0 && wall.pts[0].y === 100,
  );
  expect(top).toBeDefined();
  expect(top!.pts.at(-1)!.x).toBeLessThanOrEqual(9.5);
});
