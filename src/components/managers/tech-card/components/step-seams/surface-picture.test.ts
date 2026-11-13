import { describe, expect, it } from 'vitest';

import type { Edge, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';
import { anchorOfRunId, fromWire, toWire, type StoredSeam } from 'lib/seams';

import {
  CARD6_CHAIN_OPS,
  CARD6_CHAIN_PIECE_KEYS,
  CARD6_CHAIN_POSES,
  CARD6_CHAIN_SEAMS,
  card6ChainGeoms,
  card6ChainInnerLines,
  card6ChainStep,
} from './card6-chain.fixture';
import { OWNER_FIT, stepResults } from './step-result';
import { stepPictureOf, unitPictureOf } from './surface-picture';
import { candidateOfStoredSeam, storedSeamSides } from './step-rows';
import { seamSig, surfaceSeam } from './step-picture';
import { surfaceRow } from './step-seams-model';
import { storedSeamAt } from './span-pick';

function rect(key: string, w: number, h: number): PieceGeom {
  const rs: Pt2[] = [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ];
  const edges: Edge[] = rs.map((point, index) => {
    const next = rs[(index + 1) % rs.length];
    const lenMm = Math.hypot(next[0] - point[0], next[1] - point[1]);
    return {
      id: `${key}#${index}`,
      pieceKey: key,
      k: index,
      s: index,
      e: index + 1,
      pts: [point, next],
      lenMm,
      chordMm: lenMm,
      turnDeg: 0,
      notchesMm: [],
      kind: 'edge',
    } as Edge;
  });
  return {
    pieceKey: key,
    name: key,
    hand: 'none',
    cloth: null,
    rs,
    corners: [0, 1, 2, 3],
    notchIdx: [],
    edges,
    rect: true,
    areaMm2: w * h,
    perimMm: 2 * (w + h),
    twinOf: [],
  } as unknown as PieceGeom;
}

const results = stepResults(
  {
    ops: CARD6_CHAIN_OPS,
    byKey: CARD6_CHAIN_SEAMS,
    poses: CARD6_CHAIN_POSES,
    geoms: card6ChainGeoms(),
    innerLines: card6ChainInnerLines(),
    pieceKeys: CARD6_CHAIN_PIECE_KEYS,
  },
  OWNER_FIT,
);

describe('surface pictures', () => {
  it('returns the operation result layout and layers by identity', () => {
    const index = card6ChainStep(430);
    const picture = stepPictureOf(results, index);

    expect(picture?.layout).toBe(results[index].layout);
    expect(picture?.layers).toBe(results[index].layers);
    expect(stepPictureOf(results, -1)).toBeNull();
    expect(stepPictureOf(null, index)).toBeNull();
  });

  it('returns the latest matching producer before the consumer', () => {
    const first = card6ChainStep(380);
    const second = card6ChainStep(430);
    const ops = CARD6_CHAIN_OPS.map((op, index) =>
      index === second ? { ...op, outputUnitKey: 'SLEEVE-2' } : op,
    );

    expect(unitPictureOf(results, ops, 'SLEEVE-2', second)?.layout).toBe(results[first].layout);
    expect(unitPictureOf(results, ops, ' SLEEVE-2 ')?.layout).toBe(results[second].layout);
    expect(unitPictureOf(results, ops, 'missing')).toBeNull();
    expect(unitPictureOf(null, ops, 'SLEEVE-2')).toBeNull();
  });
});

describe('stored closed-contour surfaces', () => {
  const host = rect('HOST', 240, 180);
  const part = rect('PART', 40, 20);
  const geoms = new Map([
    [host.pieceKey, host],
    [part.pieceKey, part],
  ]);
  const lineUp: Pt2[] = [
    [20, 50],
    [160, 50],
    [160, 60],
    [20, 60],
    [20, 50],
  ];
  const lineDown = lineUp.map(([x, y]) => [x, -y] as Pt2);
  const innerLines = new Map([['HOST', [lineUp]]]);
  const partAnchor = anchorOfRunId([...geoms.values()], 'PART#0')!;
  const base = surfaceRow(
    { geom: host, k: 0, line: lineDown, grainDeg: 0 },
    [partAnchor],
    undefined,
    'legacy-inner',
  )!;

  it('reads, draws, detaches, and fingerprints a legacy whole iK row exactly as before', () => {
    const row = fromWire(toWire(base)) as StoredSeam;
    const sides = storedSeamSides(row, geoms);
    const drawn = candidateOfStoredSeam(row, geoms, innerLines)!;
    const legacy = surfaceSeam('HOST', 'PART', lineUp, geoms, undefined, 'PART#0')!;

    expect(row.seamKey).toBe('legacy-inner');
    expect(row.sideA[0].range).toEqual([0, 1]);
    expect(row.sideA[0].contourSig).toBe(base.sideA[0].contourSig);
    expect(sides.parts.a).toEqual([{ target: 'HOST:i0' }]);
    expect(storedSeamAt([{ parts: sides.parts }], 'HOST:i0', undefined, geoms)).toBe(0);
    expect(seamSig([drawn])).toBe(seamSig([legacy]));
  });

  it('lays the part edge along only the stored contour side', () => {
    const ranged: StoredSeam = {
      ...base,
      sideA: [{ ...base.sideA[0], range: [0, 140 / 300] }],
    };
    const sides = storedSeamSides(ranged, geoms);
    const candidate = candidateOfStoredSeam(ranged, geoms, innerLines)!;
    const edge = part.edges[0].pts.map((point) => apply(candidate.surface!.T, point));

    expect(sides.parts.a).toEqual([{ target: 'HOST:i0', range: [0, 140] }]);
    expect(edge[0][1]).toBeCloseTo(50, 6);
    expect(edge[1][1]).toBeCloseTo(50, 6);
    expect((edge[0][0] + edge[1][0]) / 2).toBeCloseTo(90, 6);
  });

  it('lays a many-part wrap like the equivalent merged wrap without a chord', () => {
    const many: StoredSeam = {
      ...base,
      sideA: [
        { ...base.sideA[0], range: [250 / 300, 1] },
        { ...base.sideA[0], range: [0, 20 / 300] },
        { ...base.sideA[0], range: [20 / 300, 60 / 300] },
      ],
    };
    const merged: StoredSeam = {
      ...base,
      sideA: [
        { ...base.sideA[0], range: [250 / 300, 1] },
        { ...base.sideA[0], range: [0, 60 / 300] },
      ],
    };

    expect(seamSig([candidateOfStoredSeam(many, geoms, innerLines)!])).toBe(
      seamSig([candidateOfStoredSeam(merged, geoms, innerLines)!]),
    );
  });

  it('lays a straight partner on the longer leg of a stored wrap that turns a sharp corner', () => {
    const longPart = rect('LONG_PART', 150, 20);
    const cornerGeoms = new Map(geoms).set(longPart.pieceKey, longPart);
    const cornerBase = surfaceRow(
      { geom: host, k: 0, line: lineDown, grainDeg: 0 },
      [anchorOfRunId([...cornerGeoms.values()], 'LONG_PART#0')!],
      undefined,
      'corner-inner',
    )!;
    const row: StoredSeam = {
      ...cornerBase,
      sideA: [
        { ...cornerBase.sideA[0], range: [0, 140 / 300] },
        { ...cornerBase.sideA[0], range: [290 / 300, 1] },
      ],
    };
    const sides = storedSeamSides(row, cornerGeoms, innerLines);
    const candidate = candidateOfStoredSeam(row, cornerGeoms, innerLines)!;
    const edge = longPart.edges[0].pts.map((point) => apply(candidate.surface!.T, point));

    expect(sides.parts.a).toEqual([
      { target: 'HOST:i0', range: [0, 140] },
      { target: 'HOST:i0', range: [290, 300] },
    ]);
    expect(edge.map((point) => point[1])).toEqual([50, 50]);
    expect(edge.map((point) => point[0]).sort((a, b) => a - b)).toEqual([10, 160]);
    expect(edge).toContainEqual([160, 50]);
  });

  it('keeps a straight partner on the chord when the stored host bend is soft', () => {
    const longPart = rect('SOFT_PART', 150, 20);
    const softGeoms = new Map(geoms).set(longPart.pieceKey, longPart);
    const line: Pt2[] = [
      [20, 50],
      [90, 50],
      [160, 80],
    ];
    const candidate = surfaceSeam(
      'HOST',
      longPart.pieceKey,
      line,
      softGeoms,
      undefined,
      'SOFT_PART#0',
    )!;
    const edge = longPart.edges[0].pts.map((point) => apply(candidate.surface!.T, point));

    expect((edge[0][0] + edge[1][0]) / 2).toBeCloseTo(90, 6);
    expect((edge[0][1] + edge[1][1]) / 2).toBeCloseTo(65, 6);
    expect((edge[1][1] - edge[0][1]) / (edge[1][0] - edge[0][0])).toBeCloseTo(30 / 140, 6);
  });

  it('converts inner shares with the current contour length', () => {
    const currentLine: Pt2[] = [
      [20, 50],
      [180, 50],
      [180, 60],
      [20, 60],
      [20, 50],
    ];
    const ranged: StoredSeam = {
      ...base,
      sideA: [{ ...base.sideA[0], range: [0.5, 0.75] }],
    };
    const currentLines = new Map([['HOST', [currentLine]]]);

    expect(storedSeamSides(ranged, geoms, currentLines).parts.a).toEqual([
      { target: 'HOST:i0', range: [170, 255] },
    ]);
  });
});
