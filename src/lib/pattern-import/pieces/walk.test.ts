import { describe, expect, it } from 'vitest';

import type { ChainSet, PieceCandidate, PtMm, Seed, SizeRun } from 'lib/pattern-import/types';

import { signedArea } from './geom';
import {
  applyLeakRepairs,
  applyOutlineChoices,
  differs,
  sharedStretches,
  walkChecks,
  walkLines,
  walkOutline,
} from './walk';

const box = { minX: -50, minY: -50, maxX: 400, maxY: 400 };
const area = (pts: PtMm[]) => Math.abs(signedArea(pts));
const P = (x: number, y: number): PtMm => ({ x, y });
/** A w × h rectangle at (x, y) as four sides, each `short` mm short of its corners. */
const sides = (x: number, y: number, w: number, h: number, short = 0): PtMm[][] => [
  [P(x + short, y), P(x + w - short, y)],
  [P(x + w, y + short), P(x + w, y + h - short)],
  [P(x + w - short, y + h), P(x + short, y + h)],
  [P(x, y + h - short), P(x, y + short)],
];

/** A chain set of `n` sizes; size r has the lines `linesOf(r)`. */
function sheet(n: number, linesOf: (r: number) => PtMm[][]): { set: ChainSet; run: SizeRun } {
  const chains: ChainSet['chains'] = [];
  const classes: ChainSet['classes'] = [];
  for (let r = 0; r < n; r++) {
    const ids: number[] = [];
    for (const pts of linesOf(r)) {
      ids.push(chains.length);
      chains.push({
        id: chains.length,
        pts,
        closed: false,
        ranges: [],
        motif: null,
        style: 0,
        lengthMm: 0,
      });
    }
    classes.push({ id: r, role: 'size', sizeLabel: `${r}`, chains: ids, totalLengthMm: 0 });
  }
  return {
    set: { chains, classes } as unknown as ChainSet,
    run: {
      encoding: 'layers',
      sizes: classes.map((c) => ({ label: c.sizeLabel, rank: c.id, classId: c.id, file: null })),
      evidence: [],
    } as unknown as SizeRun,
  };
}

describe('the walk', () => {
  it('builds the corners the sides stop short of and draws nothing else', () => {
    const w = walkOutline(sides(100, 100, 120, 80, 4), [], box, P(160, 140));
    expect(w).not.toBeNull();
    expect(area(w!.outer)).toBeCloseTo(120 * 80, 0);
    expect(w!.corners).toBe(4);
    expect(w!.sharedMm).toBe(0);
  });

  it('does not close across a gap in a side', () => {
    const own = sides(100, 100, 120, 80, 4);
    own[0] = [P(104, 100), P(140, 100)];
    expect(walkOutline(own, [], box, P(160, 140))).toBeNull();
  });

  it('puts the corner where a side ends ON another side, not where its tangent lands', () => {
    // a slanted side that ends on a long vertical 0.3 mm short of it, at a sharp angle: the two
    // tangents cross about 1 mm above the point where the printed line stops
    const vertical = [P(100, 0), P(100, 300)];
    const own: PtMm[][] = [
      [P(100.3, 100), P(130, 190)],
      [P(130, 190), P(220, 190)],
      [P(220, 190), P(220, 20)],
      [P(220, 20), P(100.2, 20)],
    ];
    const w = walkOutline([vertical, ...own], [], box, P(160, 100));
    expect(w).not.toBeNull();
    // every vertex on the vertical lies between the two junctions, none above the lower one
    const onVertical = w!.outer.filter((p) => Math.abs(p.x - 100) < 0.05).map((p) => p.y);
    expect(Math.max(...onVertical)).toBeLessThanOrEqual(100.5);
    expect(Math.min(...onVertical)).toBeGreaterThanOrEqual(19.5);
  });

  it("runs on along a side past a dart drawn in the size's own pen", () => {
    // a 200 × 120 piece; a dart from its bottom side: two legs from (150, 220) and (170, 220) to
    // the apex (160, 150). The path through the legs has more own line; the cut runs past them.
    const own: PtMm[][] = [
      ...sides(100, 100, 200, 120),
      [P(150, 220), P(160, 150)],
      [P(160, 150), P(170, 220)],
    ];
    const w = walkOutline(own, [], box, P(120, 120));
    expect(w).not.toBeNull();
    expect(area(w!.outer)).toBeCloseTo(200 * 120, 0);
  });

  it('has no outline rather than one with a dart cut into it', () => {
    // the bottom side is not printed across the mouth of the dart: the only closed path goes in
    // along one leg and out along the other
    const [top, right, , left] = sides(100, 100, 200, 120);
    const own: PtMm[][] = [
      top,
      right,
      [P(300, 220), P(170, 220)],
      [P(150, 220), P(100, 220)],
      left,
      [P(150, 220), P(160, 150)],
      [P(160, 150), P(170, 220)],
    ];
    expect(walkOutline(own, [], box, P(120, 120))).toBeNull();
  });

  it('goes round a tab that sticks out of a side', () => {
    // the same piece with a 20 × 30 tab below its bottom side: the outline is the outer way
    const own: PtMm[][] = [
      ...sides(100, 100, 200, 120),
      [P(150, 220), P(150, 250), P(170, 250), P(170, 220)],
    ];
    const w = walkOutline(own, [], box, P(120, 120));
    expect(w).not.toBeNull();
    expect(area(w!.outer)).toBeCloseTo(200 * 120 + 20 * 30, 0);
  });

  it('lets a size walk a stretch only where four sizes run on it', () => {
    // the left side is one line for every size; each size has its own three other sides
    const linesOf = (r: number): PtMm[][] => {
      const [, right, bottom, left] = sides(100, 100, 120 + 10 * r, 80);
      return [
        [P(100, 100), P(220 + 10 * r, 100)],
        right,
        bottom,
        // only size 0 keeps its own left side out of the others' way
        r === 0 ? left : [P(100, 180), P(100, 100)],
      ];
    };
    const four = sheet(4, linesOf);
    const three = sheet(3, linesOf);
    const leftOf = (s: { set: ChainSet; run: SizeRun }) =>
      sharedStretches(walkLines(s.set, s.run), box).filter((pts) =>
        pts.every((p) => Math.abs(p.x - 100) < 0.01),
      );
    expect(leftOf(four).length).toBe(1);
    expect(leftOf(three).length).toBe(0);
  });
});

describe('where two outlines differ', () => {
  const rect = [P(0, 0), P(100, 0), P(100, 60), P(0, 60)];
  it('is nothing for a short or a shallow difference', () => {
    // a 5 mm corner cut: under 12 mm long
    expect(differs([P(0, 0), P(95, 0), P(100, 5), P(100, 60), P(0, 60)], rect)).toBeNull();
    // 0.8 mm off along a whole side: under 1 mm
    expect(differs([P(0, 0.8), P(100, 0.8), P(100, 60), P(0, 60)], rect)).toBeNull();
  });
  it('is the longest stretch farther than 1 mm, with its farthest point', () => {
    const d = differs([P(0, 0), P(100, 0), P(100, 60), P(50, 80), P(0, 60)], rect);
    expect(d).not.toBeNull();
    expect(d!.maxMm).toBeGreaterThan(15);
    expect(d!.at.y).toBeGreaterThan(70);
  });
});

describe('the walk as a check beside the fill', () => {
  // five nested rectangles; the fill's outline of size 2 runs 6 mm inside along the right side
  const s = sheet(5, (r) => sides(100, 100, 120 + 10 * r, 80 + 10 * r, 2));
  const outline = (r: number, inset = 0): PtMm[] => [
    P(100, 100),
    P(220 + 10 * r - inset, 100),
    P(220 + 10 * r - inset, 180 + 10 * r),
    P(100, 180 + 10 * r),
  ];
  const cand = (r: number, inset = 0) =>
    ({ seed: 0, rank: r, outer: outline(r, inset), outcome: 'closed' }) as PieceCandidate;
  const seeds = [{ id: 0, at: P(150, 140) } as Seed];

  it('gives the walk outline of a size the fill closed on another line', () => {
    const family = { seed: 0, candidates: [cand(0), cand(1), cand(2, 6), cand(3), cand(4)] };
    walkChecks(s.set, s.run, seeds, [family]);
    expect(family.candidates.map((c) => !!c.walk)).toEqual([false, false, true, false, false]);
    const w = family.candidates[2].walk!;
    expect(area(w.outer)).toBeCloseTo(140 * 100, 0);
    expect(w.maxMm).toBeCloseTo(6, 0);
    expect(w.ownShare).toBeGreaterThan(0.95);
    // the fill's outline is not touched
    expect(family.candidates[2].outer).toEqual(outline(2, 6));
  });

  it('keeps silent when the walk went round something its neighbours do not nest', () => {
    // the fill of size 2 is right; its lines are those of size 4: the walk is larger than size 3
    const wrong = sheet(5, (r) =>
      sides(100, 100, 120 + 10 * (r === 2 ? 4 : r), 80 + 10 * (r === 2 ? 4 : r), 2),
    );
    const family = { seed: 0, candidates: [cand(0), cand(1), cand(2), cand(3)] };
    walkChecks(wrong.set, wrong.run, seeds, [family]);
    expect(family.candidates.some((c) => c.walk)).toBe(false);
  });

  it("takes the outline the operator chose and leaves the fill's own candidate as it was", () => {
    const family = { seed: 0, candidates: [cand(0), cand(1), cand(2, 6), cand(3), cand(4)] };
    walkChecks(s.set, s.run, seeds, [family]);
    const walked = applyOutlineChoices(
      [family],
      [{ kind: 'outline', seed: 0, rank: 2, take: 'walk' }],
    );
    const c = walked[0].candidates[2];
    expect(area(c.outer)).toBeCloseTo(140 * 100, 0);
    expect(c.rankFrom).toBe('walk');
    expect(c.walk).toMatchObject({ answer: 'walk', fillOuter: outline(2, 6) });
    expect(family.candidates[2].outer).toEqual(outline(2, 6));
    const kept = applyOutlineChoices(
      [family],
      [{ kind: 'outline', seed: 0, rank: 2, take: 'fill' }],
    );
    expect(kept[0].candidates[2].outer).toEqual(outline(2, 6));
    expect(kept[0].candidates[2].walk?.answer).toBe('fill');
    // a later answer for the same size stands
    const again = applyOutlineChoices(
      [family],
      [
        { kind: 'outline', seed: 0, rank: 2, take: 'walk' },
        { kind: 'outline', seed: 0, rank: 2, take: 'fill' },
      ],
    );
    expect(again[0].candidates[2].walk?.answer).toBe('fill');
  });
});

describe('the walk for a size the fill left open', () => {
  const s = sheet(5, (r) => sides(100, 100, 120 + 10 * r, 80 + 10 * r, 2));
  const outline = (r: number): PtMm[] => [
    P(100, 100),
    P(220 + 10 * r, 100),
    P(220 + 10 * r, 180 + 10 * r),
    P(100, 180 + 10 * r),
  ];
  const closed = (r: number) =>
    ({ seed: 0, rank: r, outer: outline(r), outcome: 'closed' }) as PieceCandidate;
  const open = (r: number) =>
    ({ seed: 0, rank: r, outer: [], outcome: 'leak', leakAt: P(230, 150) }) as PieceCandidate;
  const seeds = [{ id: 0, at: P(150, 140) } as Seed];

  it("proposes the outline on the size's lines, between its closed neighbours", () => {
    const family = { seed: 0, candidates: [closed(0), closed(1), open(2), closed(3), closed(4)] };
    walkChecks(s.set, s.run, seeds, [family]);
    const w = family.candidates[2].walk!;
    expect(w.open).toBe(true);
    expect(area(w.outer)).toBeCloseTo(140 * 100, 0);
    // nothing is closed without the operator's word
    expect(family.candidates[2].outcome).toBe('leak');
    const [taken] = applyOutlineChoices(
      [family],
      [{ kind: 'outline', seed: 0, rank: 2, take: 'walk' }],
    );
    expect(taken.candidates[2]).toMatchObject({ outcome: 'closed', rankFrom: 'walk' });
    expect(taken.candidates[2].leakAt).toBeUndefined();
    const [left] = applyOutlineChoices(
      [family],
      [{ kind: 'outline', seed: 0, rank: 2, take: 'fill' }],
    );
    expect(left.candidates[2]).toMatchObject({ outcome: 'leak', walk: { answer: 'fill' } });
  });

  it('proposes nothing when the walk is not between the closed neighbours', () => {
    // the lines of size 2 are those of size 4
    const wrong = sheet(5, (r) => {
      const q = r === 2 ? 4 : r;
      return sides(100, 100, 120 + 10 * q, 80 + 10 * q, 2);
    });
    const family = { seed: 0, candidates: [closed(0), closed(1), open(2), closed(3)] };
    walkChecks(wrong.set, wrong.run, seeds, [family]);
    expect(family.candidates[2].walk).toBeUndefined();
  });

  it('with no closed size keeps the proposals that grow with the size', () => {
    // size 3 walks the lines of size 0: smaller than size 2 before it
    const odd = sheet(5, (r) => {
      const q = r === 3 ? 0 : r;
      return sides(100, 100, 120 + 10 * q, 80 + 10 * q, 2).map((side) =>
        // size 3's copy of size 0's lines, a hair off so the two do not coincide
        r === 3 ? side.map((p) => P(p.x + 0.7, p.y + 0.7)) : side,
      );
    });
    const family = { seed: 0, candidates: [0, 1, 2, 3, 4].map(open) };
    walkChecks(odd.set, odd.run, seeds, [family]);
    expect(family.candidates.map((c) => !!c.walk?.open)).toEqual([true, true, true, false, true]);
  });
});

describe('a fill that leaked across the nest', () => {
  // seven nested rectangles 10 mm apart, each with its own right and bottom side
  const s = sheet(7, (r) => sides(100, 100, 120 + 10 * r, 80 + 10 * r, 2));
  const outline = (r: number, right = r): PtMm[] => [
    P(100, 100),
    P(220 + 10 * right, 100),
    P(220 + 10 * right, 180 + 10 * r),
    P(100, 180 + 10 * r),
  ];
  const cand = (r: number, right = r) =>
    ({ seed: 0, rank: r, outer: outline(r, right), outcome: 'closed' }) as PieceCandidate;
  const seeds = [{ id: 0, at: P(150, 140) } as Seed];

  it('is repaired by the program: the outline on the line of a size four away gives way to the walk', () => {
    // the fill of size 1 took the right side of size 5
    const family = { seed: 0, candidates: [cand(0), cand(1, 5), cand(2), cand(3), cand(4)] };
    walkChecks(s.set, s.run, seeds, [family]);
    expect(family.candidates[1].walk).toMatchObject({ leak: true, verdict: 'walk' });
    const [fixed] = applyLeakRepairs([family]);
    const c = fixed.candidates[1];
    expect(area(c.outer)).toBeCloseTo(130 * 90, 0);
    expect(c.rankFrom).toBe('walk');
    expect(c.walk).toMatchObject({ auto: true, answer: 'walk', fillOuter: outline(1, 5) });
    // the fill's own candidate is not changed
    expect(family.candidates[1].outer).toEqual(outline(1, 5));
  });

  it("is not seen in an outline on its NEIGHBOUR's line: a block of sizes can share one", () => {
    const family = { seed: 0, candidates: [cand(0), cand(1, 2), cand(2), cand(3), cand(4)] };
    walkChecks(s.set, s.run, seeds, [family]);
    expect(family.candidates[1].walk?.leak).toBeUndefined();
    expect(applyLeakRepairs([family])[0].candidates[1].outer).toEqual(outline(1, 2));
  });

  it("repairs an outline that steps onto the next size's line for a stretch", () => {
    // sizes 5 mm apart; the fill of size 1 runs along its own bottom side and, for 60 mm in the
    // middle, steps down onto size 2's
    const fine = sheet(5, (r) => sides(100, 100, 120 + 5 * r, 80 + 5 * r, 1));
    const own = (r: number): PtMm[] => [
      P(100, 100),
      P(220 + 5 * r, 100),
      P(220 + 5 * r, 180 + 5 * r),
      P(100, 180 + 5 * r),
    ];
    const stepped: PtMm[] = [
      P(100, 100),
      P(225, 100),
      P(225, 185),
      P(190, 185),
      P(188, 190),
      P(130, 190),
      P(128, 185),
      P(100, 185),
    ];
    const c = (r: number, outer = own(r)) =>
      ({ seed: 0, rank: r, outer, outcome: 'closed' }) as PieceCandidate;
    const family = { seed: 0, candidates: [c(0), c(1, stepped), c(2), c(3), c(4)] };
    walkChecks(fine.set, fine.run, seeds, [family]);
    expect(family.candidates[1].walk).toMatchObject({ jog: true, verdict: 'walk' });
    const [fixed] = applyLeakRepairs([family]);
    expect(area(fixed.candidates[1].outer)).toBeCloseTo(125 * 85, 0);
  });
});
