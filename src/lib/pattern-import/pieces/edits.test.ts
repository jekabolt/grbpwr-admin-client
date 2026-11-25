import { describe, expect, it } from 'vitest';

import type {
  ChainSet,
  PieceCandidate,
  PieceFamily,
  Sheet,
  SizeRun,
} from 'lib/pattern-import/types';

import { applyPieceEdits } from './edits';

const square = (x: number) => [
  { x, y: 0 },
  { x: x + 50, y: 0 },
  { x: x + 50, y: 50 },
  { x, y: 50 },
];
const cand = (seed: number, over: Partial<PieceCandidate>): PieceCandidate =>
  ({
    seed,
    rank: 0,
    outer: [],
    walls: [],
    inside: [],
    textsInside: [],
    outcome: 'closed',
    areaMm2: 0,
    bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    sourceCoverage: 0,
    p95Mm: 0,
    ...over,
  }) as PieceCandidate;
const ctx = {
  sheet: {} as Sheet,
  set: { chains: [], classes: [] } as unknown as ChainSet,
  run: { sizes: [] } as unknown as SizeRun,
  opts: { cellMm: 0.5, snapMm: 0.3 },
} as Parameters<typeof applyPieceEdits>[2];
const merged = (a: PieceCandidate, b: PieceCandidate) =>
  applyPieceEdits(
    [
      { seed: 1, candidates: [a], monotone: true },
      { seed: 2, candidates: [b], monotone: true },
    ] as PieceFamily[],
    [{ kind: 'merge', seeds: [1, 2] }],
    ctx,
  )[0].candidates[0];

describe('merging two parts where one is open', () => {
  it('keeps the gap of the open part, though the first part is closed', () => {
    const c = merged(
      cand(1, { outer: square(0) }),
      cand(2, { outcome: 'leak', leakAt: { x: 70, y: 20 } }),
    );
    expect(c.outcome).toBe('leak');
    expect(c.leakAt).toEqual({ x: 70, y: 20 });
  });

  it('points at the stretch a repaired part had drawn in', () => {
    const c = merged(
      cand(1, { outer: square(0) }),
      cand(2, {
        outer: square(50),
        rankFrom: 'repair',
        derived: [
          {
            kind: 'shared-rank',
            pts: [
              { x: 60, y: 50 },
              { x: 70, y: 50 },
              { x: 80, y: 50 },
            ],
          },
        ],
      }),
    );
    expect(c.outcome).toBe('leak');
    expect(c.leakAt).toEqual({ x: 70, y: 50 });
  });
});
