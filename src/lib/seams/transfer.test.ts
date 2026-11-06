import type { EdgeId, PieceGeom, Pt2, SeamCandidate } from 'lib/assembly-skeleton/types';
import { describe, expect, it } from 'vitest';

import { candidatesOnSize } from './transfer';

/** A piece whose contour walks `corners` from `start`: the same shape numbered from another corner. */
function pieceOf(pieceKey: string, corners: Pt2[], start = 0): PieceGeom {
  const walk = corners.map((_, i) => corners[(i + start) % corners.length]);
  const edges = walk.map((p, k) => {
    const q = walk[(k + 1) % walk.length];
    return {
      id: `${pieceKey}#${k}`,
      k,
      pts: [p, q],
      lenMm: Math.hypot(q[0] - p[0], q[1] - p[1]),
      notchesMm: [],
    };
  });
  return {
    pieceKey,
    rs: walk,
    edges,
    perimMm: edges.reduce((sum, e) => sum + e.lenMm, 0),
  } as unknown as PieceGeom;
}

const scaled = (corners: Pt2[], k: number) => corners.map(([x, y]) => [x * k, y * k] as Pt2);

const BACK: Pt2[] = [
  [0, 0],
  [400, 0],
  [460, 150],
  [400, 700],
  [0, 760],
];
const FRONT: Pt2[] = [
  [0, 0],
  [220, 30],
  [260, 700],
  [0, 760],
];

const seam = (a: EdgeId, b: EdgeId, extra: Partial<SeamCandidate> = {}) =>
  ({ candidate: { a, b, score: 1, evidence: {}, kind: 'edge', ...extra } as SeamCandidate }) as {
    candidate: SeamCandidate;
  };

const base = { size: 'M', pieces: [pieceOf('BP', BACK), pieceOf('FL', FRONT)] };

describe('candidatesOnSize', () => {
  it('follows the edge when the smaller size numbers its contour from another corner', () => {
    const target = {
      size: 'S',
      pieces: [pieceOf('BP', scaled(BACK, 0.96), 4), pieceOf('FL', scaled(FRONT, 0.96))],
    };
    const [moved] = candidatesOnSize([seam('FL#0', 'BP#2')], base, target);
    expect(moved.candidate.a).toBe('FL#0');
    expect(moved.candidate.b).toBe('BP#3');
  });

  it('moves composite parts, ranges and part ranges with their edges', () => {
    const target = {
      size: 'S',
      pieces: [pieceOf('BP', scaled(BACK, 0.9), 4), pieceOf('FL', scaled(FRONT, 0.9))],
    };
    const len = base.pieces[0].edges[2].lenMm;
    const [moved] = candidatesOnSize(
      [
        seam('FL#1', 'BP#2', {
          kind: 'composite',
          aParts: ['FL#1'],
          bParts: ['BP#1', 'BP#2'],
          range: { a: [0, 100], b: [0, len] },
          partRange: { 'BP#1': [10, 20] },
        }),
      ],
      base,
      target,
    );
    expect(moved.candidate.bParts).toEqual(['BP#2', 'BP#3']);
    expect(Object.keys(moved.candidate.partRange ?? {})).toEqual(['BP#2']);
    expect(moved.candidate.partRange?.['BP#2'][1]).toBeCloseTo(18, 3);
    expect(moved.candidate.range?.b[1]).toBeCloseTo(len * 0.9, 3);
  });

  it('keeps the numbers when the sizes share one numbering, or a piece has no map', () => {
    const same = {
      size: 'L',
      pieces: [pieceOf('BP', scaled(BACK, 1.05)), pieceOf('FL', scaled(FRONT, 1.05))],
    };
    expect(candidatesOnSize([seam('FL#0', 'BP#2')], base, same)[0].candidate.b).toBe('BP#2');
    const cut = { size: 'S', pieces: [pieceOf('BP', BACK.slice(0, 4), 1)] };
    expect(candidatesOnSize([seam('FL#0', 'BP#2')], base, cut)[0].candidate.b).toBe('BP#2');
  });
});
