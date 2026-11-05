import { describe, expect, it } from 'vitest';

import type { common_TechCard } from 'api/proto-http/admin';
import type { MapRead } from 'lib/assembly-skeleton/map';
import { breakPoints } from 'lib/assembly-skeleton/geometry';
import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply, compose } from 'lib/assembly-skeleton/union/affine';
import {
  anchorOfRunId,
  candidateSideParts,
  contourSig,
  frameOf,
  fromWire,
  normalizeParts,
  poseOf,
  poseRow,
  resolveSeamDecisions,
  SEAMS,
  seamFromCandidate,
  splitWire,
  toWire,
  type AnchorHit,
  type EdgeAnchor,
  type SidePart,
  type StoredSeam,
} from 'lib/seams';

import { mismatchFacts } from '../assembly-map/step-view';
import { reconfirmRow, rowFromHand } from '../assembly-seams/seam-actions';
import {
  deriveAssembly,
  seamOfCandidate,
  type AsmPiece,
  type AssemblyInput,
} from '../../techpack/derive-assembly';
import { toUV } from 'lib/seams/frame';
import { activeFoldRows, foldToWire, type StoredFold } from 'lib/folds';
import realFixture from './fixtures/span-real-geoms.json';
import { sideLengthMm } from './seam-length';
import { highlightPartsOfRows } from './step-highlight';
import { candidateOf, invert, seamSig } from './step-picture';
import { rangedPicturePoints } from './step-picture-view';
import {
  fitPlan,
  fitSourceOf,
  fitSpan,
  placementT,
  poseAfterDrop,
  poseRowFromFit,
  type SpanFitPlan,
} from './step-pose';
import { OWNER_FIT, stepResults } from './step-result';
import { candidateOfStoredSeam, edgeRowFromPick, storedSeamSides } from './step-rows';
import { NO_SPANS, pickSegment, repeatsStoredSeam, sideParts, type SidePick } from './span-pick';
import { fullyUsedEdges, usedEdgesBeforeStep } from './step-seams-model';
import { seamTileSideLines } from './step-seams-row';

type Fixture = {
  pants: { selected: Array<{ key: string; name: string; geom: PieceGeom }> };
  load: { selected: Array<{ key: string; name: string; geom: PieceGeom }> };
};

const fixture = realFixture as unknown as Fixture;
const all = [...fixture.pants.selected, ...fixture.load.selected];
const piece = (name: string) => {
  const found = all.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`missing fixture piece ${name}`);
  return found;
};
const pantsPieces = fixture.pants.selected.map((item) => item.geom);
const pantsGeoms = new Map(pantsPieces.map((geom) => [geom.pieceKey, geom]));
const id = (name: string, edge: number) => `${piece(name).key}#${edge}`;
const range = (name: string, edge: number, from: number, to: number): SidePart => ({
  target: id(name, edge),
  range: [from, to],
});
const anchorCtx = {
  pieces: pantsPieces,
  grainDeg: null,
  nameOf: (key: string) => all.find((candidate) => candidate.key === key)?.name ?? key,
};
const row = (key: string, a: readonly SidePart[], b: readonly SidePart[]): StoredSeam => {
  const stored = rowFromHand(a, b, pantsGeoms, anchorCtx, {
    direction: 'reversed',
    seamKey: key,
  });
  if (!stored) throw new Error(`row ${key} did not anchor`);
  return stored;
};
const candidate = (stored: StoredSeam) => {
  const found = candidateOfStoredSeam(stored, pantsGeoms, new Map());
  if (!found) throw new Error(`row ${stored.seamKey} did not read`);
  return found;
};
const lengthOf = (parts: readonly SidePart[]) => sideLengthMm(parts, pantsGeoms, () => 0);

const lineWindow = (points: readonly Pt2[], from: number, to: number): Pt2[] => {
  const out: Pt2[] = [];
  let at = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const next = at + length;
    if (length > 0 && next >= from && at <= to) {
      const pointAt = (distance: number): Pt2 => {
        const share = Math.max(0, Math.min(1, (distance - at) / length));
        return [a[0] + share * (b[0] - a[0]), a[1] + share * (b[1] - a[1])];
      };
      if (!out.length) out.push(pointAt(Math.max(from, at)));
      out.push(pointAt(Math.min(to, next)));
    }
    at = next;
    if (at >= to) break;
  }
  return out;
};
const middle = (points: readonly Pt2[]): Pt2 => {
  const first = points[0];
  const last = points[points.length - 1];
  return [(first[0] + last[0]) / 2, (first[1] + last[1]) / 2];
};
const gap = (a: Pt2, b: Pt2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const pointAtShare = (points: readonly Pt2[], share: number): Pt2 => {
  const lengths = [0];
  for (let index = 1; index < points.length; index++)
    lengths.push(lengths[index - 1] + gap(points[index - 1], points[index]));
  const target = share * lengths[lengths.length - 1];
  let index = 1;
  while (index < lengths.length - 1 && lengths[index] < target) index++;
  const length = lengths[index] - lengths[index - 1];
  const at = length ? (target - lengths[index - 1]) / length : 0;
  return [
    points[index - 1][0] + at * (points[index][0] - points[index - 1][0]),
    points[index - 1][1] + at * (points[index][1] - points[index - 1][1]),
  ];
};
const meanGap = (from: readonly Pt2[], onto: readonly Pt2[], reversed: boolean) => {
  let total = 0;
  for (let index = 0; index <= 32; index++) {
    const share = index / 32;
    total += gap(pointAtShare(from, share), pointAtShare(onto, reversed ? 1 - share : share));
  }
  return total / 33;
};
const lineAngle = (points: readonly Pt2[]) => {
  const first = points[0];
  const last = points[points.length - 1];
  return (Math.atan2(last[1] - first[1], last[0] - first[0]) * 180) / Math.PI;
};
const undirectedAngleGap = (a: number, b: number) => {
  const delta = Math.abs((((a - b) % 180) + 180) % 180);
  return Math.min(delta, 180 - delta);
};

const PCK = range('PCK_L', 0, 72, 224);
const FRONT = range('FRONT_L', 4, 852, 1004);

describe('real span rows', () => {
  it('#90 op 290 is 152 = 152, with endpoint notches excluded', () => {
    const stored = row('op290', [PCK], [FRONT]);
    const read = candidate(stored);

    expect(stored.kind).toBe('partial');
    expect(lengthOf([PCK])).toBeCloseTo(152, 6);
    expect(lengthOf([FRONT])).toBeCloseTo(152, 6);
    expect(read.range).toEqual({
      a: [expect.closeTo(72, 1), expect.closeTo(224, 1)],
      b: [expect.closeTo(852, 1), expect.closeTo(1004, 1)],
    });
    expect(mismatchFacts({ geoms: pantsGeoms } as unknown as MapRead, read)).toEqual([]);
  });

  it('#90 op 350 keeps one whole side and one ranged side', () => {
    const flap: SidePart = { target: id('FLAP_R', 0) };
    const front = range('FRONT_R', 1, 107, 267);
    const stored = row('op350', [flap], [front]);
    const read = candidate(stored);

    expect(stored.kind).toBe('partial');
    expect(lengthOf([flap])).toBeCloseTo(160, 1);
    expect(lengthOf([front])).toBeCloseTo(160, 6);
    expect(read.range?.a).toEqual([0, expect.closeTo(160, 1)]);
    expect(read.range?.b).toEqual([expect.closeTo(107, 1), expect.closeTo(267, 1)]);
    expect(mismatchFacts({ geoms: pantsGeoms } as unknown as MapRead, read)).toEqual([]);
  });

  it('#90 op 490 keeps a 152 mm range across two pieces of BACK-6', () => {
    const pocket = range('PCK_L_1', 0, 72, 224);
    const back = range('Back_L', 1, 0, 80);
    const top = range('Back_Top_L_R', 1, 0, 72);
    const stored = row('op490', [pocket], [back, top]);
    const read = candidate(stored);

    expect(stored.kind).toBe('composite');
    expect(stored.sideB).toHaveLength(2);
    expect(lengthOf([pocket])).toBeCloseTo(152, 6);
    expect(lengthOf([back, top])).toBeCloseTo(152, 6);
    expect(read.bParts).toEqual([back.target, top.target]);
    expect(read.partRange).toMatchObject({
      [pocket.target]: [expect.closeTo(72, 1), expect.closeTo(224, 1)],
      [back.target]: [0, expect.closeTo(80, 1)],
      [top.target]: [0, expect.closeTo(72, 1)],
    });
    const metric = deriveAssembly(
      assemblyInputFor(stored, 490, ['PCK_L_1', 'Back_L', 'Back_Top_L_R']),
      undefined,
      { globalAssembly: false },
    ).cards.get(490)!.metrics[0];
    expect(metric.left).toBeCloseTo(152, 1);
    expect(metric.right).toBeCloseTo(152, 1);
  });

  it('two rows reuse separate windows of one edge and draw separate stretches', () => {
    const first = row('first', [range('PCK_L', 0, 20, 50)], [range('FRONT_L', 4, 200, 230)]);
    const second = row('second', [range('PCK_L', 0, 80, 110)], [range('FRONT_L', 4, 300, 330)]);
    const operations = [{ seamKeys: [first.seamKey, second.seamKey] }, {}];
    const byKey = new Map([
      [first.seamKey, first],
      [second.seamKey, second],
    ]);
    const used = usedEdgesBeforeStep(operations, 1, byKey, pantsGeoms);

    expect(used.get(id('PCK_L', 0))).toEqual([
      [expect.closeTo(20, 1), expect.closeTo(50, 1)],
      [expect.closeTo(80, 1), expect.closeTo(110, 1)],
    ]);
    expect(fullyUsedEdges(used, pantsGeoms)).not.toContain(id('PCK_L', 0));
    expect(candidate(first).range).not.toEqual(candidate(second).range);
    expect(
      highlightPartsOfRows([first, second])
        .filter((part) => part.target === id('PCK_L', 0))
        .map((part) => part.range),
    ).toEqual([
      [expect.closeTo(20, 1), expect.closeTo(50, 1)],
      [expect.closeTo(80, 1), expect.closeTo(110, 1)],
    ]);
    const pckEdge = pantsGeoms.get(piece('PCK_L').key)!.edges[0];
    const ink = rangedPicturePoints(pckEdge.pts, [20, 50], pckEdge.lenMm);
    expect(
      ink.slice(1).reduce((total, point, index) => total + gap(point, ink[index]), 0),
    ).toBeCloseTo(30, 0);
  });

  it('draws a window away from the edge start at any picture scale', () => {
    // 100 mm drawn as 300 picture units, with a bend so the walk crosses a vertex.
    const edge: [number, number][] = [
      [0, 0],
      [150, 0],
      [150, 150],
    ];
    expect(rangedPicturePoints(edge, [30, 60], 100)).toEqual([
      [90, 0],
      [150, 0],
      [150, 30],
    ]);
    expect(rangedPicturePoints(edge, [70, 100], 100)).toEqual([
      [150, 60],
      [150, 150],
    ]);
    expect(rangedPicturePoints(edge, [0, 70], 100)).toEqual([
      [0, 0],
      [150, 0],
      [150, 60],
    ]);
  });

  it('refuses a chain and its own member on one side: the same line named twice', () => {
    expect(
      rowFromHand(
        [{ target: `${piece('Back_L').key}#0+1`, range: [0, 100] }, range('Back_L', 1, 100, 200)],
        [range('FRONT_L', 4, 200, 500)],
        pantsGeoms,
        anchorCtx,
        { direction: 'reversed', seamKey: 'duplicate' },
      ),
    ).toBeNull();
  });
});

describe('one edge sewn with a gap: a long edge broken by a pocket', () => {
  const edge = id('FRONT_L', 4);
  const length = pantsGeoms.get(piece('FRONT_L').key)!.edges[4].lenMm;
  const top: SidePart = range('FRONT_L', 4, 0, 300);
  const bottom: SidePart = range('FRONT_L', 4, 500, 1000);
  const pocket: SidePart = { target: id('PCK_L', 0) };
  const pocketLen = pantsGeoms.get(piece('PCK_L').key)!.edges[0].lenMm;
  const other: SidePart = { target: id('Back_L', 2) };
  const rules = { isInner: () => false, pieceOf: (t: string) => t.slice(0, t.lastIndexOf('#')) };
  const closeParts = (parts: readonly SidePart[]) =>
    parts.map((part) =>
      part.range
        ? {
            target: part.target,
            range: [expect.closeTo(part.range[0], 0), expect.closeTo(part.range[1], 0)],
          }
        : part,
    );
  const gapRow = (key = 'gap') => {
    const stored = row(key, [top, bottom, pocket], [other]);
    return stored;
  };

  it('the owner, end to end: pick top, pick bottom, both stay, through the wire, parts identical', () => {
    let pick: SidePick = { a: [], b: [], spans: NO_SPANS };
    pick = pickSegment(pick, 'a', edge, [0, 300], length, rules);
    pick = pickSegment(pick, 'a', edge, [500, 1000], length, rules);
    pick = pickSegment(pick, 'a', pocket.target, [0, pocketLen], pocketLen, rules);
    pick = pickSegment(pick, 'b', other.target, [0, 1003.5], 1003.5, rules);
    expect(pick.spans.a[edge]).toEqual([
      [0, 300],
      [500, 1000],
    ]);
    const picked = { a: sideParts(pick.a, pick.spans.a), b: sideParts(pick.b, pick.spans.b) };
    expect(repeatsStoredSeam(picked.a, picked.b, [], pantsGeoms)).toBe(false);

    const stored = edgeRowFromPick(pick, pantsGeoms, anchorCtx, picked);
    if (!stored) throw new Error('the gap row did not build');
    expect(stored.kind).toBe('composite');
    expect(stored.sideA.map((anchor) => anchor.edgeHint)).toEqual([edge, pocket.target, edge]);
    expect(stored.sideA[0].range[0]).toBe(0);
    expect(stored.sideA[0].range[1]).toBeCloseTo(300 / length, 3);
    expect(stored.sideA[2].range[0]).toBeCloseTo(500 / length, 3);
    expect(stored.sideA[2].range[1]).toBeCloseTo(1000 / length, 3);

    const wire = toWire(stored);
    expect(wire.sideA?.parts).toHaveLength(3);
    const back = fromWire(wire);
    if (!back) throw new Error('the gap row did not come back');
    expect(toWire(back)).toEqual(wire);
    expect(storedSeamSides(back, pantsGeoms).parts.a).toEqual(closeParts([top, pocket, bottom]));
    expect(storedSeamSides(back, pantsGeoms).a).toEqual([edge, pocket.target]);

    const read = candidate(back);
    expect(read.kind).toBe('composite');
    expect(read.aParts).toEqual([edge, pocket.target]);
    expect(candidateSideParts(read, 'a', pantsGeoms)).toEqual(closeParts([top, pocket, bottom]));
    expect(lengthOf(candidateSideParts(read, 'a', pantsGeoms))).toBeCloseTo(800 + pocketLen, 0);
  });

  it('whichever order it was clicked, the side walks top, pocket, bottom', () => {
    for (const clicked of [
      [top, bottom, pocket],
      [bottom, top, pocket],
      [pocket, bottom, top],
      [top, pocket, bottom],
    ])
      expect(normalizeParts(clicked, pantsGeoms)).toEqual([top, pocket, bottom]);
  });

  it('several pieces in one gap keep the order they were clicked; with two gaps each takes the one it fits', () => {
    const second: SidePart = { target: id('PCK_L_1', 0) };
    expect(normalizeParts([top, bottom, second, pocket], pantsGeoms)).toEqual([
      top,
      second,
      pocket,
      bottom,
    ]);
    const low = range('FRONT_L', 4, 0, 100);
    const mid = range('FRONT_L', 4, 400, 500);
    const high = range('FRONT_L', 4, 1000, 1084);
    const short: SidePart = { target: id('FLAP_R', 3) };
    const long: SidePart = range('Back_L', 2, 0, 600);
    expect(normalizeParts([low, mid, high, short, long], pantsGeoms)).toEqual([
      low,
      short,
      mid,
      long,
      high,
    ]);
  });

  it('a read row is a fixed point: rewritten byte for byte, the walk kept', () => {
    const stored = gapRow();
    const read = candidate(stored);
    const rewritten = seamFromCandidate(read, pantsPieces, {
      seamKey: stored.seamKey,
      status: stored.status,
      source: stored.source,
      direction: stored.direction,
      anchoredSize: stored.anchoredSize,
      note: stored.note,
    });
    expect(JSON.stringify(rewritten)).toBe(JSON.stringify(stored));
  });

  it('partRange holds the hull, the walk the stretches; other edges of the side as before', () => {
    const read = candidate(gapRow());
    expect(read.partRange).toEqual({
      [edge]: [0, expect.closeTo(1000, 0)],
    });
    expect(read.aParts).toEqual([edge, pocket.target]);
    expect(read.walk?.a).toEqual(closeParts([top, pocket, bottom]));
    expect(read.walk).not.toHaveProperty('b');
    expect(read.bParts).toBeUndefined();
  });

  it('a side of two stretches of one edge alone: one id, one hull, both anchors', () => {
    const stored = row('alone', [top, bottom], [other]);
    expect(stored.sideA.map((anchor) => anchor.edgeHint)).toEqual([edge, edge]);
    const read = candidate(stored);
    expect(read.a).toBe(edge);
    expect(read.aParts).toBeUndefined();
    expect(candidateSideParts(read, 'a', pantsGeoms)).toEqual(closeParts([top, bottom]));
    const again = rowFromHand(
      candidateSideParts(read, 'a', pantsGeoms),
      candidateSideParts(read, 'b', pantsGeoms),
      pantsGeoms,
      anchorCtx,
      { direction: 'reversed', seamKey: 'again' },
    );
    expect(again?.sideA.map((anchor) => anchor.range)).toEqual(
      stored.sideA.map((anchor) => anchor.range),
    );
  });

  it('never sends overlapping spans: they merge, and a whole part takes them all', () => {
    const merged = row(
      'merged',
      [range('FRONT_L', 4, 0, 300), range('FRONT_L', 4, 250, 400), pocket],
      [other],
    );
    expect(merged.sideA.filter((anchor) => anchor.edgeHint === edge)).toHaveLength(1);
    expect(merged.sideA[0].range[1]).toBeCloseTo(400 / length, 3);
    expect(merged.sideA.map((anchor) => anchor.edgeHint)).toEqual([edge, pocket.target]);
    const touching = normalizeParts(
      [range('FRONT_L', 4, 0, 300), range('FRONT_L', 4, 300.2, 400)],
      pantsGeoms,
    );
    expect(touching).toEqual([range('FRONT_L', 4, 0, 400)]);
    expect(normalizeParts([{ target: edge }, top], pantsGeoms)).toEqual([{ target: edge }]);
    expect(
      normalizeParts([range('FRONT_L', 4, 0, 600), range('FRONT_L', 4, 500, length)], pantsGeoms),
    ).toEqual([{ target: edge }]);
    for (const part of [...merged.sideA, ...merged.sideB])
      expect(part.range[1]).toBeGreaterThan(part.range[0]);
  });

  it('holds to the limit of anchors per side: eight build, nine do not', () => {
    const spans = (count: number) =>
      Array.from({ length: count }, (_, at) => range('FRONT_L', 4, at * 100, at * 100 + 50));
    const eight = rowFromHand(spans(SEAMS.maxAnchorsPerSide), [other], pantsGeoms, anchorCtx, {
      direction: 'reversed',
    });
    expect(eight?.sideA).toHaveLength(SEAMS.maxAnchorsPerSide);
    expect(
      rowFromHand(spans(SEAMS.maxAnchorsPerSide + 1), [other], pantsGeoms, anchorCtx, {
        direction: 'reversed',
      }),
    ).toBeNull();
  });

  it('length, highlight and used stretches see the spans, never the gap', () => {
    const stored = gapRow();
    expect(lengthOf([top, bottom, pocket])).toBeCloseTo(800 + pocketLen, 3);
    const highlighted = highlightPartsOfRows([stored]).filter((part) => part.target === edge);
    expect(highlighted.map((part) => part.range)).toEqual([
      [0, expect.closeTo(300, 0)],
      [expect.closeTo(500, 0), expect.closeTo(1000, 0)],
    ]);
    const used = usedEdgesBeforeStep(
      [{ seamKeys: [stored.seamKey] }, {}],
      1,
      new Map([[stored.seamKey, stored]]),
      pantsGeoms,
    );
    expect(used.get(edge)).toEqual([
      [0, expect.closeTo(300, 0)],
      [expect.closeTo(500, 0), expect.closeTo(1000, 0)],
    ]);
    expect(fullyUsedEdges(used, pantsGeoms)).not.toContain(edge);
    const lines = seamTileSideLines(
      { a: [top, pocket, bottom], b: [other] },
      pantsGeoms,
      new Map(),
    );
    expect(lines[0]).toBe(`FRONT_L + PCK_L ${Math.round(800 + pocketLen)}`);
  });

  it('the step picture reads the walk, and a new span is a new picture', () => {
    const picture = candidateOf({ a: [top, bottom, pocket], b: [other] }, pantsGeoms)!;
    expect(picture.kind).toBe('composite');
    expect(picture.aParts).toEqual([edge, pocket.target]);
    expect(picture.partRange?.[edge]).toEqual([0, 1000]);
    expect(picture.walk?.a).toEqual([top, bottom, pocket]);
    const moved = candidateOf(
      { a: [top, range('FRONT_L', 4, 600, 1000), pocket], b: [other] },
      pantsGeoms,
    )!;
    expect(seamSig([picture])).not.toBe(seamSig([moved]));
  });

  it('the document takes the same spans: the metric adds them up, the gap left out', () => {
    const stored = gapRow();
    const model = deriveAssembly(
      assemblyInputFor(stored, 180, ['FRONT_L', 'PCK_L', 'Back_L']),
      undefined,
      { globalAssembly: false },
    );
    const metric = model.cards.get(180)!.metrics[0];
    expect(metric.left).toBeCloseTo(800 + pocketLen, 0);
    expect(metric.right).toBeCloseTo(1003, 0);

    const seam = seamOfCandidate(candidate(stored), 180, 0, pantsGeoms)!;
    expect(seam.kind).toBe('composite');
    expect(seam.a.map((part) => part.piece)).toEqual([
      piece('FRONT_L').key,
      piece('PCK_L').key,
      piece('FRONT_L').key,
    ]);
    expect(seam.a.map((part) => part.range)).toEqual([
      [0, expect.closeTo(300, 0)],
      undefined,
      [expect.closeTo(500, 0), expect.closeTo(1000, 0)],
    ]);
    expect(seam.pieces).toEqual(
      expect.arrayContaining([piece('FRONT_L').key, piece('PCK_L').key, piece('Back_L').key]),
    );
  });

  it('a stale gap row re-confirmed keeps both stretches and their order', () => {
    const stored = gapRow();
    const again = reconfirmRow(
      { row: stored } as unknown as Parameters<typeof reconfirmRow>[0],
      anchorCtx,
    );
    expect(again?.sideA.map((anchor) => anchor.edgeHint)).toEqual([edge, pocket.target, edge]);
    expect(again?.sideA.map((anchor) => anchor.range)).toEqual(
      stored.sideA.map((anchor) => anchor.range),
    );
  });

  it('read on a mirrored frame the order stays physical and the stretches flip', () => {
    const stored = gapRow();
    const hitOn = (anchor: EdgeAnchor): AnchorHit | undefined =>
      anchor.edgeHint === edge
        ? {
            anchor,
            run: edge,
            edges: [edge],
            edgeLens: [length],
            lenMm: length,
            how: 'shape',
            frame: 'mirrorU',
            fit: 0,
          }
        : undefined;
    const read = resolveSeamDecisions([stored], pantsPieces, { preHit: hitOn }).applied[0];
    const walk = read?.candidate?.walk?.a;
    if (!walk) throw new Error('the mirrored gap row did not read');
    expect(walk.map((part) => part.target)).toEqual([edge, pocket.target, edge]);
    expect(walk[0].range?.[0]).toBeCloseTo(length - 300, 0);
    expect(walk[0].range?.[1]).toBeCloseTo(length, 0);
    expect(walk[2].range?.[0]).toBeCloseTo(length - 1000, 0);
    expect(walk[2].range?.[1]).toBeCloseTo(length - 500, 0);
    expect(read.candidate?.partRange?.[edge]?.[0]).toBeCloseTo(length - 1000, 0);
    expect(read.candidate?.partRange?.[edge]?.[1]).toBeCloseTo(length, 0);
  });

  it('rows of today carry no walk at all', () => {
    for (const stored of [
      row('w-whole', [{ target: id('PCK_L', 0) }], [{ target: id('FRONT_L', 4) }]),
      row('w-partial', [PCK], [FRONT]),
      row(
        'w-composite',
        [range('PCK_L_1', 0, 72, 224)],
        [range('Back_L', 1, 0, 80), range('Back_Top_L_R', 1, 0, 72)],
      ),
    ])
      expect(candidate(stored)).not.toHaveProperty('walk');
  });
});

describe('span storage invariants', () => {
  it('normalizes outline order, clamps, and removes only a whole range', () => {
    const edge = pantsGeoms.get(piece('PCK_L').key)!.edges[0];
    expect(
      normalizeParts(
        [{ target: id('PCK_L', 1) }, { target: edge.id, range: [-1, edge.lenMm + 0.01] }],
        pantsGeoms,
      ),
    ).toEqual([{ target: edge.id }, { target: id('PCK_L', 1) }]);
  });

  it('keeps a whole row byte-identical through candidate read/write', () => {
    const stored = row('whole', [{ target: id('PCK_L', 0) }], [{ target: id('FRONT_L', 4) }]);
    const read = candidate(stored);
    const rewritten = seamFromCandidate(read, pantsPieces, {
      seamKey: stored.seamKey,
      status: stored.status,
      source: stored.source,
      direction: stored.direction,
      anchoredSize: stored.anchoredSize,
      note: stored.note,
    });
    const legacy = candidateOf({ a: [id('PCK_L', 0)], b: [id('FRONT_L', 4)] }, pantsGeoms)!;

    expect(JSON.stringify(rewritten)).toBe(JSON.stringify(stored));
    expect(seamSig([read])).toBe(seamSig([legacy]));
    expect(read).not.toHaveProperty('range');
    expect(read).not.toHaveProperty('partRange');
  });

  it('ranged rows are fixed points, including their wire shares', () => {
    for (const stored of [
      row('partial-wire', [PCK], [FRONT]),
      row(
        'composite-wire',
        [range('PCK_L_1', 0, 72, 224)],
        [range('Back_L', 1, 0, 80), range('Back_Top_L_R', 1, 0, 72)],
      ),
    ]) {
      const read = candidate(stored);
      const rewritten = seamFromCandidate(read, pantsPieces, {
        seamKey: stored.seamKey,
        status: stored.status,
        source: stored.source,
        direction: stored.direction,
        anchoredSize: stored.anchoredSize,
        note: stored.note,
      });
      expect(JSON.stringify(rewritten)).toBe(JSON.stringify(stored));
      const wire = toWire(stored);
      expect(toWire(fromWire(wire)!)).toEqual(wire);
    }
  });

  it('ignores anchor ranges when the stored kind is edge', () => {
    const ranged = row('edge-range', [PCK], [FRONT]);
    const stored: StoredSeam = { ...ranged, kind: 'edge' };
    const read = candidate(stored);
    expect(read.kind).toBe('edge');
    expect(read).not.toHaveProperty('range');
    expect(read).not.toHaveProperty('partRange');
  });

  it('a whole composite row still reads as a plain edge candidate', () => {
    const whole = row(
      'whole-composite',
      [{ target: id('PCK_L', 0) }],
      [{ target: id('Back_L', 0) }],
    );
    const stored: StoredSeam = { ...whole, kind: 'composite' };
    const read = candidate(stored);
    expect(read.kind).toBe('edge');
    expect(read).not.toHaveProperty('aParts');
    expect(read).not.toHaveProperty('partRange');
  });

  it('a chain and its two anchors stay one seam, two spans of one edge stay two', () => {
    const chain = anchorOfRunId(pantsPieces, `${piece('Back_L').key}#0+1`);
    const first = anchorOfRunId(pantsPieces, id('Back_L', 0));
    const second = anchorOfRunId(pantsPieces, id('Back_L', 1));
    const pocket = anchorOfRunId(pantsPieces, id('PCK_L_1', 0));
    if (!chain || !first || !second || !pocket) throw new Error('missing anchors');
    const base = {
      status: 'confirmed',
      kind: 'composite',
      direction: 'reversed',
      source: 'manual',
      sideA: [pocket],
      anchoredSize: '',
      note: '',
    } as const;
    const whole = resolveSeamDecisions(
      [
        { ...base, seamKey: 'chain', sideB: [chain] },
        { ...base, seamKey: 'pair', sideB: [first, second] },
      ] as unknown as StoredSeam[],
      pantsPieces,
    );
    expect(whole.applied[1].candidate).toBe(whole.applied[0].candidate);

    const spans = resolveSeamDecisions(
      [
        { ...base, kind: 'partial', seamKey: 'low', sideB: [{ ...first, range: [0, 0.4] }] },
        { ...base, kind: 'partial', seamKey: 'high', sideB: [{ ...first, range: [0.5, 0.9] }] },
      ] as unknown as StoredSeam[],
      pantsPieces,
    );
    expect(spans.applied[1].candidate).not.toBe(spans.applied[0].candidate);
  });

  it('a side with an unknown length states no length fact', () => {
    const read = {
      geoms: pantsGeoms,
    } as unknown as MapRead;
    const facts = mismatchFacts(read, {
      a: `${piece('Back_L').key}:i0`,
      b: id('PCK_L', 0),
      score: 1,
      kind: 'edge',
    } as never);
    expect(facts.some((fact) => fact.startsWith('length'))).toBe(false);
  });

  it('expands a ranged chain anchor and omits the fully covered member range', () => {
    const chain = `${piece('Back_L').key}#0+1`;
    const chainAnchor = anchorOfRunId(pantsPieces, chain);
    const pocketAnchor = anchorOfRunId(pantsPieces, id('PCK_L_1', 0));
    if (!chainAnchor || !pocketAnchor) throw new Error('missing chain anchors');
    const firstLength = pantsGeoms.get(piece('Back_L').key)!.edges[0].lenMm;
    const total = chainAnchor.lenMm;
    const stored: StoredSeam = {
      seamKey: 'chain',
      status: 'confirmed',
      kind: 'composite',
      direction: 'reversed',
      source: 'manual',
      sideA: [pocketAnchor],
      sideB: [{ ...chainAnchor, range: [0, (firstLength + 80) / total] }],
      anchoredSize: '',
      note: '',
    };
    const read = candidate(stored);
    const resolved = resolveSeamDecisions([stored], pantsPieces).applied[0]?.candidate;

    for (const result of [read, resolved]) {
      expect(result?.bParts).toEqual([id('Back_L', 0), id('Back_L', 1)]);
      expect(result?.partRange).not.toHaveProperty(id('Back_L', 0));
      expect(result?.partRange?.[id('Back_L', 1)]).toEqual([0, expect.closeTo(80, 1)]);
    }
  });
});

describe('real break points', () => {
  it('#90 FRONT_L keeps both near-end notches', () => {
    const geom = piece('FRONT_L').geom;
    const points = breakPoints(geom, geom.edges[4]);
    expect(points.filter((point) => point.kind === 'notch').map((point) => point.atMm)).toEqual([
      expect.closeTo(852, 0),
      expect.closeTo(1004, 0),
    ]);
  });

  it('#92 op 220 keeps the hip kink but not curve samples', () => {
    const fp = piece('FP_R').geom;
    const lining = piece('FP_1_R').geom;
    const fpTurns = fp.edges
      .flatMap((edge) => breakPoints(fp, edge))
      .filter((p) => p.kind === 'turn');
    const liningTurns = lining.edges
      .flatMap((edge) => breakPoints(lining, edge))
      .filter((p) => p.kind === 'turn');
    expect(fpTurns.length).toBeGreaterThan(0);
    expect(fpTurns.length).toBeLessThan(6);
    expect(liningTurns.length).toBeLessThan(3);
  });

  it('vertexIdx is additive and does not change contourSig', () => {
    const geom = piece('FP_R').geom;
    const without = { ...geom, vertexIdx: undefined };
    expect(contourSig(geom, frameOf(geom, 0))).toBe(contourSig(without, frameOf(without, 0)));
  });
});

const asmPiece = (geom: PieceGeom): AsmPiece => ({
  key: geom.pieceKey,
  name: geom.name,
  cut: geom.rs.map(([x, y]) => [x, -y]),
  inner: [],
  notch: [],
  pocketing: /PCK/.test(geom.name),
  area: Math.abs(geom.areaMm2),
  geom,
});
const matrixApply = (T: readonly number[], point: Pt2): Pt2 => [
  T[0] * point[0] + T[2] * point[1] + T[4],
  T[1] * point[0] + T[3] * point[1] + T[5],
];

function assemblyInputFor(
  stored: StoredSeam,
  operationNumber: number,
  names: readonly string[],
): AssemblyInput {
  const selected = names.map((name) => piece(name).geom);
  const operation = {
    operationNumber,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    work: 'join_lockstitch',
    inputKeys: selected.map((geom) => geom.pieceKey),
    pieceLineKeys: selected.map((geom) => geom.pieceKey),
    outputUnitKey: 'FRONT',
    seamKeys: [stored.seamKey],
  };
  const techCard = {
    techCard: {
      pieces: selected.map((geom) => ({ lineKey: geom.pieceKey, name: geom.name })),
      operations: [operation],
    },
    seams: [toWire(stored)],
  } as unknown as common_TechCard;
  return {
    techCard,
    pieces: new Map(selected.map((geom) => [geom.pieceKey, asmPiece(geom)])),
    grainDeg: new Map(),
  };
}

describe('#90 op 250 FIT on the archived pocket pair', () => {
  const pocket = piece('PCK_BACK_1L').geom;
  const back = piece('Back_L').geom;
  const seam = row('op250-edge', [{ target: id('PCK_BACK_1L', 0) }], [{ target: id('Back_L', 1) }]);
  const oldPose = poseRow({
    seamKey: 'op250-old-pose',
    piece: pocket,
    host: back,
    placement: { xMm: -1.4, yMm: 26.36, rotDeg: 0, flip: false },
  });
  const operation = {
    operationNumber: 250,
    inputKeys: [pocket.pieceKey, back.pieceKey],
    outputUnitKey: 'BACK-3',
    seamKeys: [seam.seamKey],
    poseKeys: [oldPose.seamKey],
  };
  const base = stepResults(
    {
      ops: [operation],
      byKey: new Map([[seam.seamKey, seam]]),
      poses: new Map([[oldPose.seamKey, oldPose]]),
      geoms: pantsGeoms,
      innerLines: new Map(),
      pieceKeys: new Set(pantsGeoms.keys()),
    },
    OWNER_FIT,
  )[0];
  const source = fitSourceOf({
    a: [{ target: id('PCK_BACK_1L', 0) }],
    b: [{ target: id('Back_L', 1) }],
  })!;
  const planAt = (alternate: boolean) =>
    fitPlan(
      source,
      {
        blocks: base.blocks,
        hung: base.hung,
        transforms: base.transforms,
        stacked: base.layout.stacked,
      },
      pantsGeoms,
      alternate,
    )!;
  const resultAt = (plan: SpanFitPlan) => {
    const dropped = poseAfterDrop(
      plan.piece,
      compose(plan.D, base.transforms.get(plan.piece)!),
      { host: plan.host },
      { transforms: base.transforms },
      pantsGeoms,
    )!;
    const fittedPose = poseRow({
      seamKey: oldPose.seamKey,
      piece: pocket,
      host: back,
      placement: dropped.placement,
    });
    const roundTrip = splitWire([toWire(fittedPose)]).poses[0];
    const read = poseOf(roundTrip)!;
    expect(read.placement.xMm).toBeCloseTo(dropped.placement.xMm, 1);
    expect(read.placement.yMm).toBeCloseTo(dropped.placement.yMm, 1);
    expect(read.placement.rotDeg).toBeCloseTo(dropped.placement.rotDeg, 2);
    expect(placementT(back, pocket, read.placement)).toEqual(
      placementT(back, pocket, dropped.placement),
    );
    const result = stepResults(
      {
        ops: [operation],
        byKey: new Map([[seam.seamKey, seam]]),
        poses: new Map([[roundTrip.seamKey, roundTrip]]),
        geoms: pantsGeoms,
        innerLines: new Map(),
        pieceKeys: new Set(pantsGeoms.keys()),
      },
      OWNER_FIT,
    )[0];
    const moving = pocket.edges[0].pts.map((point) =>
      apply(result.transforms.get(pocket.pieceKey)!, point),
    );
    const fixed = back.edges[1].pts.map((point) =>
      apply(result.transforms.get(back.pieceKey)!, point),
    );
    const targetStart = plan.reversed ? fixed[fixed.length - 1] : fixed[0];
    const targetEnd = plan.reversed ? fixed[0] : fixed[fixed.length - 1];
    return {
      result,
      angleDeg: undirectedAngleGap(lineAngle(moving), lineAngle(fixed)),
      gapMm: meanGap(moving, fixed, plan.reversed),
      endResidualMm: (gap(moving[0], targetStart) + gap(moving[moving.length - 1], targetEnd)) / 2,
    };
  };

  it('first press seats PCK_BACK_1L on Back_L and round-trips the pending pose', () => {
    const first = planAt(false);
    const second = planAt(true);
    const fitted = resultAt(first);

    expect(Math.abs(first.fit.angleDeg)).toBeLessThanOrEqual(Math.abs(second.fit.angleDeg));
    expect(fitted.angleDeg).toBeLessThan(0.5);
    expect(fitted.gapMm).toBeLessThan(1);
    expect(first.group).toEqual(
      base.blocks.find((block) => block.pieces.includes(pocket.pieceKey))?.pieces,
    );
    console.info(
      `[T13 #90 op250] PCK_BACK_1L -> Back_L: angle ${fitted.angleDeg.toFixed(3)}°, mean gap ${fitted.gapMm.toFixed(3)} mm`,
    );
  });

  it('second press swaps ends with the same endpoint residual; third returns to the first', () => {
    const first = planAt(false);
    const second = planAt(true);
    const third = planAt(false);
    const firstFit = resultAt(first);
    const secondFit = resultAt(second);

    expect(second.reversed).not.toBe(first.reversed);
    expect(secondFit.angleDeg).toBeLessThan(0.5);
    expect(firstFit.endResidualMm).toBeLessThan(0.02);
    expect(secondFit.endResidualMm).toBeLessThan(0.02);
    expect(secondFit.endResidualMm).toBeCloseTo(firstFit.endResidualMm, 1);
    expect(third.D).toEqual(first.D);
  });
});

describe('#90 op 290 placement and PDF metric', () => {
  const stored = row('op290-placement', [PCK], [FRONT]);
  const pckEdge = pantsGeoms.get(piece('PCK_L').key)!.edges[0];
  const frontEdge = pantsGeoms.get(piece('FRONT_L').key)!.edges[4];
  const pckSpan = lineWindow(pckEdge.pts, 72, 224);
  const frontSpan = lineWindow(frontEdge.pts, 852, 1004);
  const operation = {
    operationNumber: 290,
    inputKeys: [piece('PCK_L').key, piece('FRONT_L').key],
    outputUnitKey: 'FRONT',
    seamKeys: [stored.seamKey],
  };

  it('OWNER_FIT translates by the ranged midpoint', () => {
    const result = stepResults(
      {
        ops: [operation],
        byKey: new Map([[stored.seamKey, stored]]),
        geoms: pantsGeoms,
        innerLines: new Map(),
        pieceKeys: new Set(pantsGeoms.keys()),
      },
      OWNER_FIT,
    )[0];
    const pckT = result.transforms.get(piece('PCK_L').key)!;
    const frontT = result.transforms.get(piece('FRONT_L').key)!;
    expect(gap(apply(pckT, middle(pckSpan)), apply(frontT, middle(frontSpan)))).toBeLessThan(2);
  });

  it('fitSpan pose round-trips through the owner result and seats both ends', () => {
    const fit = fitSpan(pckSpan, frontSpan, { reversed: true });
    const pose = poseRowFromFit({
      seamKey: 'op290-pose',
      piece: piece('PCK_L').geom,
      host: piece('FRONT_L').geom,
      fit,
    });
    const pin = poseOf(pose);
    expect(pin).not.toBeNull();
    const result = stepResults(
      {
        ops: [{ ...operation, poseKeys: [pose.seamKey] }],
        byKey: new Map([[stored.seamKey, stored]]),
        poses: new Map([[pose.seamKey, pose]]),
        geoms: pantsGeoms,
        innerLines: new Map(),
        pieceKeys: new Set(pantsGeoms.keys()),
      },
      OWNER_FIT,
    )[0];
    const pckT = result.transforms.get(piece('PCK_L').key)!;
    const frontT = result.transforms.get(piece('FRONT_L').key)!;
    const relative = compose(invert(frontT), pckT);
    const angle = (T: Affine) => (Math.atan2(T[1], T[0]) * 180) / Math.PI;
    expect(relative[4]).toBeCloseTo(fit.T[4], 1);
    expect(relative[5]).toBeCloseTo(fit.T[5], 1);
    expect(angle(relative)).toBeCloseTo(angle(fit.T), 1);
    const moved = [apply(pckT, pckSpan[0]), apply(pckT, pckSpan[pckSpan.length - 1])];
    const onto = [apply(frontT, frontSpan[frontSpan.length - 1]), apply(frontT, frontSpan[0])];
    expect(gap(moved[0], onto[0])).toBeLessThan(2);
    expect(gap(moved[1], onto[1])).toBeLessThan(2);
    expect(Math.abs(fit.angleDeg)).toBeLessThanOrEqual(180);
  });

  it('FIT uses the current world layout and keeps the 72→224 / 852→1004 ranges', () => {
    const base = stepResults(
      {
        ops: [operation],
        byKey: new Map([[stored.seamKey, stored]]),
        geoms: pantsGeoms,
        innerLines: new Map(),
        pieceKeys: new Set(pantsGeoms.keys()),
      },
      OWNER_FIT,
    )[0];
    const source = fitSourceOf({ a: [PCK], b: [FRONT] })!;
    const plan = fitPlan(
      source,
      {
        blocks: base.blocks,
        hung: base.hung,
        transforms: base.transforms,
        stacked: base.layout.stacked,
      },
      pantsGeoms,
    )!;
    const dropped = poseAfterDrop(
      plan.piece,
      compose(plan.D, base.transforms.get(plan.piece)!),
      { host: plan.host },
      { transforms: base.transforms },
      pantsGeoms,
    )!;
    const pose = poseRow({
      seamKey: 'op290-fit-plan',
      piece: piece('PCK_L').geom,
      host: piece('FRONT_L').geom,
      placement: dropped.placement,
    });
    const result = stepResults(
      {
        ops: [{ ...operation, poseKeys: [pose.seamKey] }],
        byKey: new Map([[stored.seamKey, stored]]),
        poses: new Map([[pose.seamKey, pose]]),
        geoms: pantsGeoms,
        innerLines: new Map(),
        pieceKeys: new Set(pantsGeoms.keys()),
      },
      OWNER_FIT,
    )[0];
    const moving = pckSpan.map((point) => apply(result.transforms.get(piece('PCK_L').key)!, point));
    const fixed = frontSpan.map((point) =>
      apply(result.transforms.get(piece('FRONT_L').key)!, point),
    );

    expect(gap(moving[0], fixed[plan.reversed ? fixed.length - 1 : 0])).toBeLessThan(2);
    expect(
      gap(moving[moving.length - 1], fixed[plan.reversed ? 0 : fixed.length - 1]),
    ).toBeLessThan(2);
  });

  it('the PDF metric and PDF transforms use the same 152 mm spans', () => {
    const candidateSeam = seamOfCandidate(candidate(stored), 290, 0, pantsGeoms)!;
    expect(candidateSeam.a.reduce((total, part) => total + part.lenMm, 0)).toBeCloseTo(152, 1);
    expect(candidateSeam.b.reduce((total, part) => total + part.lenMm, 0)).toBeCloseTo(152, 1);
    const model = deriveAssembly(assemblyInputFor(stored, 290, ['PCK_L', 'FRONT_L']), undefined, {
      globalAssembly: false,
    });
    const card = model.cards.get(290)!;
    expect(card.metrics[0]).toMatchObject({
      left: expect.closeTo(152, 1),
      right: expect.closeTo(152, 1),
      bad: false,
    });
    const seam = card.seams[0];
    const worldPart = (part: (typeof seam.a)[number]) => {
      const T = card.items.find((item) => item.p === part.piece)!.T;
      return part.pts.map((point) => matrixApply(T, point));
    };
    const a = worldPart(seam.a[0]);
    const b = worldPart(seam.b[0]);
    const direct = gap(a[0], b[0]) + gap(a[a.length - 1], b[b.length - 1]);
    const reversed = gap(a[0], b[b.length - 1]) + gap(a[a.length - 1], b[0]);
    expect(Math.min(direct, reversed)).toBeLessThan(4);
  });
});

const flap = piece('FLAP_R');
const flapFrame = frameOf(flap.geom, 0);
const flapMiddle = (k: number) => {
  const pts = flap.geom.edges[k].pts;
  return [
    (pts[0][0] + pts[pts.length - 1][0]) / 2,
    (pts[0][1] + pts[pts.length - 1][1]) / 2,
  ] as Pt2;
};
const flapFoldRow = {
  foldKey: 'fold',
  pieceKey: flap.key,
  seq: 1,
  kind: 'inward',
  source: 'owner',
  line: [toUV(flapFrame, flapMiddle(0)), toUV(flapFrame, flapMiddle(2))],
  flipAt: toUV(flapFrame, flapMiddle(1)),
  edge: null,
  contourSig: '',
  anchoredSize: 'M',
  note: '',
  stale: false,
} satisfies StoredFold;
const flapBoth = [{ target: id('FLAP_R', 1) }, { target: id('FLAP_R', 3) }];

const partnerKey = 'fixture-flap-partner';
const partnerGeom = JSON.parse(
  JSON.stringify(flap.geom).replaceAll(flap.key, partnerKey),
) as PieceGeom;
partnerGeom.name = 'FLAP_1_R';
const foldedGeoms = new Map([
  [flap.key, flap.geom],
  [partnerKey, partnerGeom],
]);
const foldedStoredRow = rowFromHand(
  flapBoth,
  [{ target: `${partnerKey}#1` }],
  foldedGeoms,
  {
    pieces: [flap.geom, partnerGeom],
    grainDeg: null,
    nameOf: (key) => (key === flap.key ? flap.name : partnerGeom.name),
  },
  { direction: 'reversed', seamKey: 'flap-folded' },
);
if (!foldedStoredRow) throw new Error('folded flap row did not anchor');
const foldedStored: StoredSeam = foldedStoredRow;
const foldedCandidate = candidateOfStoredSeam(foldedStored, foldedGeoms, new Map());
if (!foldedCandidate) throw new Error('folded flap row did not resolve');

function foldedAssemblyInput(withFoldKey: boolean): AssemblyInput {
  const operation = {
    operationNumber: 20,
    operationType: 'TECH_CARD_OPERATION_TYPE_MACHINE',
    work: 'join_lockstitch',
    inputKeys: [flap.key, partnerKey],
    pieceLineKeys: [flap.key, partnerKey],
    outputUnitKey: 'FLAP',
    seamKeys: [foldedStored.seamKey],
    ...(withFoldKey ? { foldKeys: [flapFoldRow.foldKey] } : {}),
  };
  const techCard = {
    techCard: {
      pieces: [
        { lineKey: flap.key, name: flap.name },
        { lineKey: partnerKey, name: partnerGeom.name },
      ],
      operations: [operation],
    },
    seams: [toWire(foldedStored)],
    pieceFolds: [foldToWire(flapFoldRow)],
  } as unknown as common_TechCard;
  return {
    techCard,
    pieces: new Map([
      [flap.key, asmPiece(flap.geom)],
      [partnerKey, asmPiece(partnerGeom)],
    ]),
    grainDeg: new Map([
      [flap.key, 0],
      [partnerKey, 0],
    ]),
  };
}

describe('active fold rows', () => {
  const operations = [{}, { foldKeys: [flapFoldRow.foldKey] }, {}];

  it('activates a declared row only from its own step onward', () => {
    expect(activeFoldRows(operations, 0, [flapFoldRow])).toEqual([]);
    expect(activeFoldRows(operations, 1, [flapFoldRow])).toEqual([flapFoldRow]);
    expect(activeFoldRows(operations, 2, [flapFoldRow])).toEqual([flapFoldRow]);
  });
});

describe('sideLengthMm with active folds', () => {
  it('counts two edges folded onto each other once, when the other side says so', () => {
    expect(lengthOf(flapBoth)).toBeCloseTo(400, 0);
    expect(
      sideLengthMm(flapBoth, pantsGeoms, () => 0, {
        activeFolds: [flapFoldRow],
        otherSideMm: 200,
      }),
    ).toBeCloseTo(200, 0);
  });

  it('keeps the sum with no active fold, no other side, or an other side of the sum', () => {
    expect(sideLengthMm(flapBoth, pantsGeoms, () => 0, { otherSideMm: 200 })).toBeCloseTo(400, 0);
    expect(sideLengthMm(flapBoth, pantsGeoms, () => 0, { activeFolds: [flapFoldRow] })).toBeCloseTo(
      400,
      0,
    );
    expect(
      sideLengthMm(flapBoth, pantsGeoms, () => 0, {
        activeFolds: [flapFoldRow],
        otherSideMm: 400,
      }),
    ).toBeCloseTo(400, 0);
  });

  it("uses each folded side's other plain sum without iterating", () => {
    const plainA = lengthOf(flapBoth);
    const plainB = lengthOf(flapBoth);
    const foldedA = sideLengthMm(flapBoth, pantsGeoms, () => 0, {
      activeFolds: [flapFoldRow],
      otherSideMm: plainB,
    });
    const foldedB = sideLengthMm(flapBoth, pantsGeoms, () => 0, {
      activeFolds: [flapFoldRow],
      otherSideMm: plainA,
    });

    expect([foldedA, foldedB]).toEqual([expect.closeTo(400, 0), expect.closeTo(400, 0)]);
  });
});

describe('seamTileSideLines with active folds', () => {
  const sides = { a: flapBoth, b: [{ target: `${partnerKey}#1` }] };

  it('prints the folded length on the tile, the same as the picker', () => {
    expect(seamTileSideLines(sides, foldedGeoms, new Map())).toEqual([
      'FLAP_R 400',
      'FLAP_1_R 200',
    ]);
    expect(
      seamTileSideLines(sides, foldedGeoms, new Map(), { activeFolds: [flapFoldRow] }),
    ).toEqual(['FLAP_R 200', 'FLAP_1_R 200']);
    expect(seamTileSideLines(sides, foldedGeoms, new Map(), { activeFolds: [] })).toEqual([
      'FLAP_R 400',
      'FLAP_1_R 200',
    ]);
  });
});

describe('fold-aware length readers', () => {
  it('lets a changed fold-aware map length override plain evidence', () => {
    const mapCandidate = {
      ...foldedCandidate,
      a: flapBoth[0].target,
      b: `${partnerKey}#1`,
      aParts: flapBoth.map((part) => part.target),
      bParts: [`${partnerKey}#1`],
      evidence: {
        ...foldedCandidate.evidence,
        dLenMm: 200,
        relLen: 0.5,
        aLenMm: 400,
        bLenMm: 200,
      },
    };
    const read = { geoms: foldedGeoms } as unknown as MapRead;
    const lengthFacts = (folds: readonly StoredFold[] = []) =>
      mismatchFacts(read, mapCandidate, folds).filter((fact) => fact.startsWith('length'));

    expect(lengthFacts([flapFoldRow])).toEqual([]);
    expect(lengthFacts()).toEqual(['length 400 / 200 mm']);
    // The notch cut in one ply only reads while flat, and stops being a fact once folded.
    const flapKey = flapBoth[0].target.split('#')[0];
    const flap = foldedGeoms.get(flapKey)!;
    const notchedK = Number(flapBoth[0].target.split('#')[1]);
    const notched = {
      geoms: new Map(foldedGeoms).set(flapKey, {
        ...flap,
        edges: flap.edges.map((edge, k) =>
          k === notchedK ? { ...edge, notchesMm: [40] } : { ...edge, notchesMm: [] },
        ),
      }),
    } as unknown as MapRead;
    expect(mismatchFacts(notched, mapCandidate, [])).toContain('notches 1 / 0');
    expect(mismatchFacts(notched, mapCandidate, [flapFoldRow])).toEqual([]);
  });

  it('uses active fold keys for the PDF seam metric', () => {
    const folded = deriveAssembly(foldedAssemblyInput(true), undefined, {
      globalAssembly: false,
    }).cards.get(20)!.metrics[0];
    const flat = deriveAssembly(foldedAssemblyInput(false), undefined, {
      globalAssembly: false,
    }).cards.get(20)!.metrics[0];

    expect(folded).toMatchObject({
      left: expect.closeTo(200, 2),
      right: expect.closeTo(200, 2),
      bad: false,
    });
    expect(flat).toMatchObject({
      left: expect.closeTo(400, 2),
      right: expect.closeTo(200, 2),
      bad: true,
    });
  });
});
