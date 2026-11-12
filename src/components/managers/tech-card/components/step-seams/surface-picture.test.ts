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
});
