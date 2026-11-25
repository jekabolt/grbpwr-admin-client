import { describe, expect, it } from 'vitest';

import type { ChainSet, PieceCandidate, PtMm, Seed, SizeRun } from 'lib/pattern-import/types';

import { signedArea } from './geom';
import {
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
