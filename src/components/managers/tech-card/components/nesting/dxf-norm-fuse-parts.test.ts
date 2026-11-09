import { describe, expect, it } from 'vitest';
import type { PieceDTO, Pt } from 'lib/nesting/types';
import { dxfNormAreas, type DxfNormPiece } from './dxf-consumption';
import { buildDxfIndex } from './dxf-geometry';

// #223: a fuse zone of two separate regions is generated as two blocks of one piece (BP and
// BP_PART1, lib/fusing-dxf fuseParts). The interlining norm must count both regions, not the first.
const SCOPE = 'interlining';
const rect = (w: number, h: number): Pt[] => [
  { x: 0, y: 0 },
  { x: w, y: 0 },
  { x: w, y: h },
  { x: 0, y: h },
];
let nextId = 1;
const block = (blockName: string, w: number, h: number): PieceDTO => ({
  id: nextId++,
  name: blockName,
  blockName,
  layer: '1',
  source: 'fuse.dxf',
  fileIndex: 0,
  poly: rect(w, h),
  bboxW: w,
  bboxH: h,
  areaCm2: w * h,
});

const SIZES: Record<number, string> = { 1: 'xs', 2: 'm' };
const run = (pieces: PieceDTO[], refs: string[]) => {
  const index = buildDxfIndex(
    { pieces, scopeByFile: new Map([[0, SCOPE]]), warnings: [] },
    new Set(Object.values(SIZES)),
  );
  const piece: DxfNormPiece = {
    name: 'back',
    lineKey: 'bp-line',
    perGarment: 1,
    refs: refs.map((b) => ({ scopeKey: SCOPE, block: b })),
  };
  return dxfNormAreas({
    index,
    pieces: [piece],
    unaliasedPieces: [],
    sizeIds: [1, 2],
    tokensOfSize: (id) => [SIZES[id]],
    contourLayer: index.contourLayer,
    allowanceCm: 0,
  });
};

describe('interlining norm of a piece fused in several regions', () => {
  const blocks = () => [
    block('BP_XS', 10, 19),
    block('BP_PART1_XS', 10, 18),
    block('BP_M', 11, 19),
    block('BP_PART1_M', 11, 18),
  ];

  it('adds every region of the piece to the size area and to its piece row', () => {
    const out = run(blocks(), ['BP_XS', 'BP_PART1_XS']);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.areas.rows.map((r) => [r.sizeId, Math.round(r.areaCm2)])).toEqual([
      [1, 190 + 180],
      [2, 209 + 198],
    ]);
    expect(
      out.areas.pieceRows.map((r) => [r.pieceLineKey, r.sizeId, Math.round(r.areaCm2)]),
    ).toEqual([
      ['bp-line', 1, 370],
      ['bp-line', 2, 407],
    ]);
    expect(Math.round(out.areas.pieceRows[0].perimeterCm)).toBe(58 + 56);
  });

  it('a part ref listed first still belongs to its piece', () => {
    const out = run(blocks(), ['BP_PART1_XS', 'BP_XS']);
    expect(out.ok && out.areas.rows.map((r) => Math.round(r.areaCm2))).toEqual([370, 407]);
  });

  it('a one-region piece is unchanged', () => {
    const out = run(
      blocks().filter((b) => !b.blockName?.includes('PART')),
      ['BP_XS'],
    );
    expect(out.ok && out.areas.rows.map((r) => Math.round(r.areaCm2))).toEqual([190, 209]);
  });
});
