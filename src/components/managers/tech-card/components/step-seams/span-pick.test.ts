import { describe, expect, it } from 'vitest';

import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import type { StoredSeam } from 'lib/seams';

import { rowPairSig } from '../assembly-seams/seams-store';

import realFixture from './fixtures/span-real-geoms.json';
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
  snapToBreak,
  storedSeamAt,
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
    expect(clickSegment([0, 100], [100, 150])).toEqual([0, 150]);
    expect(clickSegment([100, 150], [0, 100])).toEqual([0, 150]);
    expect(clickSegment([0, 100], [0, 100])).toBeNull();
    expect(clickSegment([0, 150], [100, 150])).toEqual([0, 100]);
    expect(clickSegment([0, 100], [200, 300])).toEqual([200, 300]);
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
    expect(pick.spans.a).toEqual({});
    expect(sideParts(pick.a, pick.spans.a)).toEqual([{ target: id }]);
  });

  it('a free drag keeps its exact range; a break point near its end catches it', () => {
    const pick = pickFreeSpan(empty, 'a', id, [300.25, 120.5], length, rules);
    expect(pick.spans.a[id]).toEqual([120.5, 300.25]);
    const breaks = edgeBreaks(id, geoms);
    const notch = breaks.find((b) => b.kind === 'notch')!.atMm;
    expect(snapToBreak(breaks, notch + 3)).toBe(notch);
    expect(snapToBreak(breaks, notch + 30)).toBe(notch + 30);
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
});
