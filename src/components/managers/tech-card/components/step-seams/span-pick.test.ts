import { describe, expect, it } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { normalizeParts, SEAMS, type StoredSeam } from 'lib/seams';

import { rowPairSig, rowsSig } from '../assembly-seams/seams-store';

import realFixture from './fixtures/span-real-geoms.json';
import { foldCrossingsMm } from './step-folds';
import {
  clickSegment,
  edgeBreaks,
  mmOnPoints,
  NO_SPANS,
  pickFreeSpan,
  pickSegment,
  repeatsStoredSeam,
  segmentAt,
  sideParts,
  surfacePartSide,
  surfacePick,
  snapToBreak,
  storedSeamAt,
  storedSeamOverlapping,
  type SidePick,
} from './span-pick';

type Fixture = { pants: { selected: { key: string; name: string; geom: PieceGeom }[] } };
const fixture = realFixture as unknown as Fixture;
const piece = fixture.pants.selected.find((p) => p.name === 'FRONT_L')!;
const geoms = new Map<string, PieceGeom>([[piece.geom.pieceKey, piece.geom]]);
const id = `${piece.key}#4`;
const length = resolveEdge(id, geoms)!.len;
const rules = { isInner: () => false, pieceOf: (t: string) => t.slice(0, t.lastIndexOf('#')) };
const empty: SidePick = { a: [], b: [], spans: NO_SPANS };

describe('span hand', () => {
  it('a click takes the segment between neighbouring break points', () => {
    const breaks = edgeBreaks(id, geoms);
    const notch = breaks.find((b) => b.kind === 'notch')!;
    const [from, to] = segmentAt(breaks, length, notch.atMm + 1);
    expect(from).toBeCloseTo(notch.atMm, 3);
    expect(to).toBeGreaterThan(notch.atMm);
  });

  it('a click on the next segment extends, on the same one takes it back', () => {
    expect(clickSegment([[0, 100]], [100, 150])).toEqual([[0, 150]]);
    expect(clickSegment([[100, 150]], [0, 100])).toEqual([[0, 150]]);
    expect(clickSegment([[0, 100]], [0, 100])).toEqual([]);
    expect(clickSegment([[0, 150]], [100, 150])).toEqual([[0, 100]]);
  });

  it('a click off every span adds a span; a segment inside a span splits only that span', () => {
    expect(clickSegment([[0, 100]], [200, 300])).toEqual([
      [0, 100],
      [200, 300],
    ]);
    expect(clickSegment([[200, 300]], [0, 100])).toEqual([
      [0, 100],
      [200, 300],
    ]);
    expect(
      clickSegment(
        [
          [0, 300],
          [400, 500],
        ],
        [100, 150],
      ),
    ).toEqual([
      [0, 100],
      [150, 300],
      [400, 500],
    ]);
  });

  it('a click touching two spans bridges them into one', () => {
    expect(
      clickSegment(
        [
          [0, 100],
          [200, 300],
        ],
        [100, 200],
      ),
    ).toEqual([[0, 300]]);
  });

  it('a click on one of several spans shrinks or drops that span and leaves the others', () => {
    const two: readonly (readonly [number, number])[] = [
      [0, 100],
      [200, 300],
    ];
    expect(clickSegment(two, [200, 300])).toEqual([[0, 100]]);
    expect(clickSegment(two, [0, 100])).toEqual([[200, 300]]);
    expect(clickSegment(two, [250, 300])).toEqual([
      [0, 100],
      [200, 250],
    ]);
    expect(clickSegment(two, [0, 50])).toEqual([
      [50, 100],
      [200, 300],
    ]);
  });

  it('the owner: the part above the gap and the part below it both stay, in any order', () => {
    const top = [0, 200] as const;
    const bottom = [320, 500] as const;
    for (const [first, second] of [
      [top, bottom],
      [bottom, top],
    ]) {
      const one = pickSegment(empty, 'a', id, first, length, rules);
      const pick = pickSegment(one, 'a', id, second, length, rules);
      expect(pick.a).toEqual([id]);
      expect(pick.spans.a[id]).toEqual([top, bottom]);
      expect(sideParts(pick.a, pick.spans.a)).toEqual([
        { target: id, range: top },
        { target: id, range: bottom },
      ]);
    }
  });

  it('the last span gone drops the edge; dropping one keeps the edge', () => {
    let pick = pickSegment(empty, 'a', id, [0, 200], length, rules);
    pick = pickSegment(pick, 'a', id, [320, 500], length, rules);
    pick = pickSegment(pick, 'a', id, [0, 200], length, rules);
    expect(pick.a).toEqual([id]);
    expect(pick.spans.a[id]).toEqual([[320, 500]]);
    pick = pickSegment(pick, 'a', id, [320, 500], length, rules);
    expect(pick.a).toEqual([]);
    expect(pick.spans.a).toEqual({});
  });

  it('every segment clicked in turn gives the whole edge, stored as a bare target', () => {
    const breaks = edgeBreaks(id, geoms);
    let pick = empty;
    let at = 0;
    while (at < length - 0.5) {
      const segment = segmentAt(breaks, length, at + 0.2);
      pick = pickSegment(pick, 'a', id, segment, length, rules);
      at = segment[1];
    }
    expect(pick.a).toEqual([id]);
    expect(normalizeParts(sideParts(pick.a, pick.spans.a), geoms)).toEqual([{ target: id }]);
  });

  it('the owner: a click on the middle of an edge taken by hand frees it, the rest stays', () => {
    let pick = empty;
    for (const segment of [
      [0, 200],
      [320, length],
      [200, 320],
    ] as const)
      pick = pickSegment(pick, 'a', id, segment, length, rules);
    expect(pick.spans.a[id]).toEqual([[0, length]]);
    pick = pickSegment(pick, 'a', id, [200, 320], length, rules);
    expect(pick.spans.a[id]).toEqual([
      [0, 200],
      [320, length],
    ]);
  });

  it('an edge offered whole narrows to the segment clicked inside it', () => {
    const whole: SidePick = { a: [id], b: [], spans: NO_SPANS };
    expect(pickSegment(whole, 'a', id, [200, 320], length, rules).spans.a[id]).toEqual([
      [200, 320],
    ]);
  });

  it('a free drag keeps its exact range; a break point near its end catches it', () => {
    const pick = pickFreeSpan(empty, 'a', id, [300.25, 120.5], length, rules);
    expect(pick.spans.a[id]).toEqual([[120.5, 300.25]]);
    const breaks = edgeBreaks(id, geoms);
    const notch = breaks.find((b) => b.kind === 'notch')!.atMm;
    expect(snapToBreak(breaks, notch + 3)).toBe(notch);
    expect(snapToBreak(breaks, notch + 30)).toBe(notch + 30);
  });

  it('a drag on a free part adds a span, one over a span merges with it', () => {
    let pick = pickFreeSpan(empty, 'a', id, [10, 50], length, rules);
    pick = pickFreeSpan(pick, 'a', id, [200, 300], length, rules);
    expect(pick.spans.a[id]).toEqual([
      [10, 50],
      [200, 300],
    ]);
    pick = pickFreeSpan(pick, 'a', id, [40, 210], length, rules);
    expect(pick.spans.a[id]).toEqual([[10, 300]]);
  });

  it('a drag on an edge in hand whole narrows it: there is no free part to add to', () => {
    const whole = pickSegment(empty, 'a', id, [0, length], length, rules);
    expect(whole.spans.a).toEqual({});
    const pick = pickFreeSpan(whole, 'a', id, [100, 200], length, rules);
    expect(pick.spans.a[id]).toEqual([[100, 200]]);
  });

  it('spans that end up covering the edge are a bare target again', () => {
    let pick = pickFreeSpan(empty, 'a', id, [0, 300], length, rules);
    pick = pickFreeSpan(pick, 'a', id, [500, length], length, rules);
    pick = pickFreeSpan(pick, 'a', id, [250, 600], length, rules);
    expect(normalizeParts(sideParts(pick.a, pick.spans.a), geoms)).toEqual([{ target: id }]);
  });

  it('the owner: a click on the middle of an edge taken by hand frees it, the rest stays', () => {
    let pick = empty;
    for (const segment of [
      [0, 200],
      [320, length],
      [200, 320],
    ] as const)
      pick = pickSegment(pick, 'a', id, segment, length, rules);
    expect(pick.spans.a[id]).toEqual([[0, length]]);
    pick = pickSegment(pick, 'a', id, [200, 320], length, rules);
    expect(pick.spans.a[id]).toEqual([
      [0, 200],
      [320, length],
    ]);
  });

  it('an edge offered whole narrows to the segment clicked inside it', () => {
    const whole: SidePick = { a: [id], b: [], spans: NO_SPANS };
    expect(pickSegment(whole, 'a', id, [200, 320], length, rules).spans.a[id]).toEqual([
      [200, 320],
    ]);
  });

  it('a side at the anchor limit takes no further span; a click that merges still works', () => {
    let pick = empty;
    for (let at = 0; at < SEAMS.maxAnchorsPerSide; at++)
      pick = pickFreeSpan(pick, 'a', id, [at * 40, at * 40 + 10], length, rules);
    expect(pick.spans.a[id]).toHaveLength(SEAMS.maxAnchorsPerSide);
    const past = SEAMS.maxAnchorsPerSide * 40;
    expect(pickFreeSpan(pick, 'a', id, [past, past + 10], length, rules)).toBe(pick);
    expect(pickSegment(pick, 'a', id, [past, past + 10], length, rules)).toBe(pick);
    const bridged = pickSegment(pick, 'a', id, [10, 40], length, rules);
    expect(bridged.spans.a[id]).toHaveLength(SEAMS.maxAnchorsPerSide - 1);
  });

  it('a pointer maps back to the mm it was drawn at', () => {
    const points: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];
    expect(mmOnPoints(points, [100, 50], 400)).toBeCloseTo(300, 6);
    expect(mmOnPoints(points, [50, 7], 400)).toBeCloseTo(100, 6);
  });
});

describe('stored seams in the hand', () => {
  const stored = [{ parts: { a: [{ target: id, range: [100, 300] as const }], b: [] } }];

  it('a click on a stored part finds its seam, a free part of the edge stays free', () => {
    expect(storedSeamAt(stored, id, 200, geoms)).toBe(0);
    expect(storedSeamAt(stored, id, 500, geoms)).toBe(-1);
  });

  it('a dragged span that crosses a stored part finds its seam', () => {
    expect(storedSeamOverlapping(stored, id, [250, 400], geoms)).toBe(0);
    expect(storedSeamOverlapping(stored, id, [400, 500], geoms)).toBe(-1);
  });

  it('a pick that repeats a stored seam is refused, another span of the edge is not', () => {
    const other = `${piece.key}#0`;
    const sewn = [
      { parts: { a: [{ target: id, range: [100, 300] as const }], b: [{ target: other }] } },
    ];
    expect(
      repeatsStoredSeam([{ target: other }], [{ target: id, range: [150, 200] }], sewn, geoms),
    ).toBe(true);
    expect(
      repeatsStoredSeam([{ target: id, range: [400, 500] }], [{ target: other }], sewn, geoms),
    ).toBe(false);
  });
});

describe('stored seams with a gap in the hand', () => {
  const other = `${piece.key}#0`;
  const sewn = [
    {
      parts: {
        a: [
          { target: id, range: [0, 200] as const },
          { target: id, range: [320, 500] as const },
        ],
        b: [{ target: other }],
      },
    },
  ];

  it('each span is that seam; the gap between them is free', () => {
    expect(storedSeamAt(sewn, id, 100, geoms)).toBe(0);
    expect(storedSeamAt(sewn, id, 400, geoms)).toBe(0);
    expect(storedSeamAt(sewn, id, 260, geoms)).toBe(-1);
  });

  it('the repeat check sees each span and not the gap', () => {
    const repeat = (from: number, to: number) =>
      repeatsStoredSeam([{ target: id, range: [from, to] }], [{ target: other }], sewn, geoms);
    expect(repeat(50, 100)).toBe(true);
    expect(repeat(400, 450)).toBe(true);
    expect(repeat(220, 300)).toBe(false);
  });
});

describe('rows of one edge', () => {
  const row = (range: readonly [number, number], kind: StoredSeam['kind']) =>
    ({
      seamKey: 'k',
      kind,
      sideA: [{ edgeHint: id, range }],
      sideB: [{ edgeHint: `${piece.key}#0`, range: [0, 1] }],
    }) as unknown as StoredSeam;

  it('two spans of one edge are two seams; a whole row signs as it did', () => {
    expect(rowPairSig(row([0, 0.25], 'partial'))).not.toBe(rowPairSig(row([0.25, 0.5], 'partial')));
    expect(rowPairSig(row([0, 1], 'edge'))).not.toContain('@');
    expect(rowPairSig(row([0, 1], 'partial'))).not.toContain('@');
  });

  it('a whole row signs as it did; a range edited in place changes the signature', () => {
    const whole = {
      ...row([0, 1], 'edge'),
      status: 'confirmed' as const,
      direction: 'reversed' as const,
    };
    expect(rowsSig([whole])).not.toContain('~');
    const gap = (to: number) => ({
      ...row([0, to], 'composite'),
      status: 'confirmed' as const,
      direction: 'reversed' as const,
    });
    expect(rowsSig([gap(0.25)])).not.toBe(rowsSig([gap(0.5)]));
  });
});

describe('a folded edge is picked by the stretches its folds cut', () => {
  const edge = resolveEdge(id, geoms)!;
  const across = (t: number) => {
    // A fold line through the point t of the edge, square to it.
    const i = Math.max(1, Math.floor(t * (edge.pts.length - 1)));
    const [p, q] = [edge.pts[i - 1], edge.pts[i]];
    const at = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
    const n = [-(q[1] - p[1]), q[0] - p[0]] as const;
    return {
      a: [at[0] - n[0] * 50, at[1] - n[1] * 50] as [number, number],
      b: [at[0] + n[0] * 50, at[1] + n[1] * 50] as [number, number],
      flipAt: at as unknown as [number, number],
      kind: 'inward' as const,
    };
  };

  it('a fold line across the edge is a break point, a click takes one stretch', () => {
    const lines = new Map([[piece.geom.pieceKey, [across(0.5)]]]);
    const cuts = foldCrossingsMm(id, geoms, lines);
    expect(cuts).toHaveLength(1);
    const breaks = edgeBreaks(id, geoms, cuts);
    expect(breaks.some((b) => b.kind === 'fold')).toBe(true);
    const [from, to] = segmentAt(breaks, length, cuts[0] + 0.5);
    expect(from).toBeCloseTo(cuts[0], 3);
    expect(to).toBeLessThanOrEqual(length);
  });

  it('no folds, the same breaks as before', () => {
    expect(edgeBreaks(id, geoms, [])).toEqual(edgeBreaks(id, geoms));
    expect(foldCrossingsMm(id, geoms, new Map())).toEqual([]);
  });
});

describe('a gap a fold cut fills on its own', () => {
  const edge = resolveEdge(id, geoms)!;
  const across = (t: number) => {
    const i = Math.max(1, Math.floor(t * (edge.pts.length - 1)));
    const [p, q] = [edge.pts[i - 1], edge.pts[i]];
    const at = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
    const n = [-(q[1] - p[1]), q[0] - p[0]] as const;
    return {
      a: [at[0] - n[0] * 50, at[1] - n[1] * 50] as [number, number],
      b: [at[0] + n[0] * 50, at[1] + n[1] * 50] as [number, number],
      flipAt: at as unknown as [number, number],
      kind: 'inward' as const,
    };
  };
  const lines = new Map([[piece.geom.pieceKey, [across(0.45), across(0.55)]]]);
  const cuts = foldCrossingsMm(id, geoms, lines);
  const breaks = edgeBreaks(id, geoms, cuts);
  const [f1, f2] = cuts;
  const before = segmentAt(breaks, length, f1 - 0.5);
  const between = segmentAt(breaks, length, (f1 + f2) / 2);
  const after = segmentAt(breaks, length, f2 + 0.5);
  const click = (pick: SidePick, segment: readonly [number, number]) =>
    pickSegment(pick, 'a', id, [segment[0], segment[1]], length, rules, breaks);

  it('102: the stretch between two fold points skipped, the edge stays one piece', () => {
    expect(cuts).toHaveLength(2);
    expect(between).toEqual([f1, f2].map((mm) => expect.closeTo(mm, 3)));
    for (const order of [
      [before, after],
      [after, before],
    ]) {
      const pick = order.reduce(click, empty);
      expect(pick.spans.a[id]).toHaveLength(1);
      expect(pick.spans.a[id][0][0]).toBeCloseTo(before[0], 3);
      expect(pick.spans.a[id][0][1]).toBeCloseTo(after[1], 3);
    }
  });

  it('the owner: a click on the middle of a taken edge still cuts a hole there', () => {
    let pick = [before, between, after].reduce(click, empty);
    expect(pick.spans.a[id]).toHaveLength(1);
    pick = click(pick, between);
    expect(pick.spans.a[id]).toHaveLength(2);
    expect(pick.spans.a[id][0][1]).toBeCloseTo(f1, 3);
    expect(pick.spans.a[id][1][0]).toBeCloseTo(f2, 3);
  });

  it('a gap with no fold at its ends (a pocket) stays', () => {
    const plain = edgeBreaks(id, geoms);
    const inner = plain.filter((b) => b.atMm > 1 && b.atMm < length - 1);
    expect(inner.length).toBeGreaterThanOrEqual(2);
    const first = segmentAt(plain, length, inner[0].atMm - 0.5);
    const third = segmentAt(plain, length, inner[1].atMm + 0.5);
    let pick = pickSegment(empty, 'a', id, first, length, rules, plain);
    pick = pickSegment(pick, 'a', id, third, length, rules, plain);
    expect(pick.spans.a[id]).toHaveLength(2);
  });
});

describe('a surface takes one piece by whole edges (C2, Р5)', () => {
  const isInner = (id: string) => id.includes(':i');
  const pieceOf = (id: string) => id.split(/[#:]/)[0];

  it('the part side is opposite the one inner line', () => {
    expect(surfacePartSide({ a: ['FR:i0'], b: ['PCK#0'] }, isInner)).toBe('b');
    expect(surfacePartSide({ a: ['PCK#0'], b: ['FR:i0'] }, isInner)).toBe('a');
    expect(surfacePartSide({ a: ['FR#1'], b: ['BK#1'] }, isInner)).toBeNull();
    expect(surfacePartSide({ a: ['FR:i0'], b: ['BK:i0'] }, isInner)).toBeNull();
  });

  it('drops the stretch on the part side and keeps the line whole', () => {
    const sel = {
      a: ['FR:i0'],
      b: ['PCK#0'],
      spans: { a: {}, b: { 'PCK#0': [[10, 40]] as const } },
    };
    expect(surfacePick(sel, isInner, pieceOf)).toEqual({
      a: ['FR:i0'],
      b: ['PCK#0'],
      spans: { a: {}, b: {} },
    });
  });

  it('a click on a second piece takes that piece instead', () => {
    const sel = { a: ['FR:i0'], b: ['PCK#0', 'PCK#1', 'FLP#2'], spans: NO_SPANS };
    expect(surfacePick(sel, isInner, pieceOf, 'FLP#2').b).toEqual(['FLP#2']);
    expect(surfacePick(sel, isInner, pieceOf).b).toEqual(['PCK#0', 'PCK#1']);
  });

  it('an edge pair is left as it is', () => {
    const sel = {
      a: ['FR#1'],
      b: ['BK#1', 'SLV#0'],
      spans: { a: { 'FR#1': [[0, 5]] as const }, b: {} },
    };
    expect(surfacePick(sel, isInner, pieceOf)).toBe(sel);
  });
});
