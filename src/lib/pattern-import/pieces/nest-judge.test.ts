import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { judgeNest, onNeighbour } from './nest-judge';

type FxCell = { size: string; outcome: string; outer?: number[][] };
type Fx = {
  cases: { family: string; size: string; expect: string; note?: string }[];
  families: Record<string, { label: string; cells: FxCell[] }>;
};
const fx: Fx = JSON.parse(
  readFileSync(
    resolve(
      dirname(fileURLToPath(import.meta.url)),
      '../../../../scripts/pattern-import/nest-check.fixture.json',
    ),
    'utf8',
  ),
);
const KIND: Record<string, string> = { TRUNC: 'trunc', OVER: 'over', both: 'both' };

function judge(family: string, robust: boolean) {
  const cells = fx.families[family].cells;
  const closed = cells
    .map((c, rank) => ({ c, rank }))
    .filter(({ c }) => c.outcome === 'closed' && (c.outer?.length ?? 0) > 2)
    .map(({ c, rank }) => ({ rank, outer: c.outer!.map(([x, y]) => ({ x, y })) }));
  const j = judgeNest(closed, { robust });
  return (size: string) =>
    j.verdicts.get(cells.findIndex((c) => c.size === size))?.kind ?? 'absent';
}

describe('judgeNest — parity with nest-check.mjs on its labelled fixture', () => {
  for (const robust of [false, true])
    for (const t of fx.cases)
      it(`${robust ? 'robust' : 'plain'} · ${t.family} · ${t.size} → ${t.expect}`, () => {
        if (t.expect === 'undecided') return;
        expect(judge(t.family, robust)(t.size)).toBe(KIND[t.expect] ?? t.expect);
      });
});

describe('onNeighbour', () => {
  // three nested squares 10 mm apart (ranks 0, 1, 2): step ≈ 10 mm
  const sq = (h: number) => [
    { x: -h, y: -h },
    { x: h, y: -h },
    { x: h, y: h },
    { x: -h, y: h },
    { x: -h, y: -h },
  ];
  // rank 1's own drawn line is sq(50), between them
  const chains = new Map([
    [0, [sq(40)]],
    [1, [sq(50)]],
    [2, [sq(60)]],
  ]);
  it('flags an outline closed on the smaller size line', () => {
    expect(onNeighbour(sq(40), 1, chains, 10)?.nb).toBe(0);
  });
  it('passes an outline between its neighbours', () => {
    expect(onNeighbour(sq(50), 1, chains, 10)).toBeNull();
  });
  it('passes a line drawn once for two sizes (no own line beside it)', () => {
    expect(
      onNeighbour(
        sq(40),
        1,
        new Map([
          [0, [sq(40)]],
          [2, [sq(60)]],
        ]),
        10,
      ),
    ).toBeNull();
  });
  it('passes a shared edge where lo and hi converge', () => {
    // lo and hi share the bottom edge y = -40 … the outline runs on it, and on its own line elsewhere
    const lo = [
      { x: -40, y: -40 },
      { x: 40, y: -40 },
      { x: 40, y: 40 },
      { x: -40, y: 40 },
      { x: -40, y: -40 },
    ];
    const hi = [
      { x: -60, y: -40 },
      { x: 60, y: -40 },
      { x: 60, y: 60 },
      { x: -60, y: 60 },
      { x: -60, y: -40 },
    ];
    const own = [
      { x: -50, y: -40 },
      { x: 50, y: -40 },
      { x: 50, y: 50 },
      { x: -50, y: 50 },
      { x: -50, y: -40 },
    ];
    expect(
      onNeighbour(
        own,
        1,
        new Map([
          [0, [lo]],
          [1, [own]],
          [2, [hi]],
        ]),
        10,
      ),
    ).toBeNull();
  });
});

describe('judgeNest lim', () => {
  const sq = (h: number, right = h) => [
    { x: -h, y: -h },
    { x: right, y: -h },
    { x: right, y: h },
    { x: -h, y: h },
  ];
  // seven sizes 10 mm apart; rank 3 is cut 28 mm short of rank 2 on its right side
  const cells = [20, 30, 40, 50, 60, 70, 80].map((h, rank) => ({
    rank,
    outer: rank === 3 ? sq(h, 12) : sq(h),
  }));
  it('the outline lim does not see a cut shallower than 3 steps', () => {
    expect(judgeNest(cells).verdicts.get(3)?.kind).toBe('ok');
  });
  it("the chain lim sees it, after pass 2 drops rank 2's flag", () => {
    const j = judgeNest(cells, { lim: 'chain' });
    expect(j.step).toBeLessThan(15); // square corners: p95 ≈ 10–14 mm per rank
    expect(j.verdicts.get(3)?.kind).toBe('trunc');
    expect(j.verdicts.get(2)?.kind).toBe('ok');
  });
});
