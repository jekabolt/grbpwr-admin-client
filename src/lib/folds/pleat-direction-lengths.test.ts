import { describe, expect, it } from 'vitest';

import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { foldedOutline as dollOutline } from 'lib/doll/fold-outline';
import { foldedSideLengthMm } from './coincide';
import { frameOf, toUV } from './geom';
import type { FoldKind, StoredFold } from './types';

const rs: Pt2[] = [
  [0, 0],
  [569, 0],
  [569, 662],
  [0, 662],
];
const piece = { pieceKey: 'BP', name: 'BP', rs, edges: [] } as unknown as PieceGeom;
const frame = frameOf(piece, 0);
const lines: [Pt2, Pt2][] = [
  [
    [285, 14],
    [250, 662],
  ],
  [
    [285, 14],
    [285, 663],
  ],
  [
    [285, 14],
    [320, 662],
  ],
];
const rows = (kind: FoldKind): StoredFold[] =>
  lines.map((line, index) => ({
    foldKey: `pleat-${index + 1}`,
    pieceKey: 'BP',
    seq: index + 1,
    kind,
    source: 'owner',
    line: [toUV(frame, line[0]), toUV(frame, line[1])],
    flipAt: toUV(frame, line[0]),
    edge: null,
    contourSig: '',
    anchoredSize: 'M',
    note: '',
    stale: false,
  }));
const neck = {
  id: 'BP#neck',
  piece: 'BP',
  pts: [
    [200, 662],
    [250, 662],
    [285, 663],
    [320, 662],
    [370, 662],
  ] as Pt2[],
  lenMm: 170,
};

describe('a directional pleat beside the even one', () => {
  it('folds the same length off the seam', () => {
    for (const kind of ['pleat', 'pleat_l', 'pleat_r'] as const)
      expect(foldedSideLengthMm([neck], 100, rows(kind), () => frame)).toBeCloseTo(100, 0);
  });

  it('stays flat on the doll', () => {
    const strip: [number, number][] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    for (const kind of ['pleat_l', 'pleat_r'] as const) {
      const out = dollOutline(
        strip,
        [{ a: [0.5, 0], b: [0.5, 1], flipAt: [0.2, 0.5], kind, seq: 1 }],
        { w: 100, h: 300 },
      );
      expect(out.outline).toEqual(strip);
      expect(out.skipped).toEqual([1]);
    }
  });
});
