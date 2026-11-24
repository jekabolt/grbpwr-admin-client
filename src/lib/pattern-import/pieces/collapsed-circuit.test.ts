import { describe, expect, it } from 'vitest';

import { collapsedCircuit } from './collapsed-circuit';
import { snapOutline, type WallItem } from './snap';

const rect = (lo: number, hi: number) => [
  { x: lo, y: lo },
  { x: hi, y: lo },
  { x: hi, y: hi },
  { x: lo, y: hi },
];
const wall = { chain: 1, pts: rect(0, 20), closed: true };
const raster = rect(-1, 20.5);
const crossing: WallItem = {
  chain: 2,
  pts: [
    { x: -1, y: 0.4 },
    { x: 2, y: 0.2 },
  ],
};
const opts = { stepMm: 0.9, reachMm: 2.5, snapMm: 0.3 };

describe('a closed wall observed on both sides of its seam', () => {
  it('retains the full revolution when both joins project to one point', () => {
    const result = snapOutline(raster, [wall, crossing], opts);
    expect(result.outer).toEqual(wall.pts);
    expect(result.walls).toEqual([1]);
    expect(result.coverage).toBe(1);
    expect(result.gaps).toEqual([]);
  });

  it('does not resolve a choice between two source rings on the same trace', () => {
    const second = { ...wall, chain: 3, pts: rect(0.1, 19.9) };
    expect(collapsedCircuit(raster, [wall, second], 0, true, 0.9, 2.5)).toBeUndefined();
  });

  it('requires both the trace and the entire closed wall to agree', () => {
    const spur = { ...wall, pts: [...wall.pts, { x: -10, y: 12 }, wall.pts[3]] };
    for (const mismatch of [spur, { ...wall, closed: false }, { ...wall, chain: -1 }])
      expect(collapsedCircuit(raster, [mismatch], 0, true, 0.9, 2.5)).toBeUndefined();
    expect(collapsedCircuit(rect(0, 30), [wall], 0, true, 0.9, 2.5)).toBeUndefined();
    expect(collapsedCircuit(raster, [wall], 0, false, 0.9, 2.5)).toEqual([...wall.pts].reverse());
  });
});
