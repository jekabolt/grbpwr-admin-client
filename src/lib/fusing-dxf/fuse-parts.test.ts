import { describe, expect, it } from 'vitest';
import fixture from './bp-shirt-back.fixture.json';
import { buildFusingSheets, mapFuseSpecToSize, type FusingSourcePiece } from './dxf';
import { fuseParts, generateFuseGeometry, signedArea } from './geometry';
import { blankFuse, type FuseZone, type PieceFuseSpec } from './types';

// Prod card 5 (SS26-005 v156), the shirt back BP: one zone with two rings, a patch under each
// yoke (MAIN on the right, PART 1 on the left). The sheet carried ONE piece per size — the larger
// patch as the cut, the other drawn inside it as a loop — so the second patch never reached the
// interlining sheet, the DXF or the marker.
const ring = (pts: number[][]) => pts.map(([x, y]) => ({ x, y }));
const spline = (pts: number[][]) => ({ points: pts.map(([x, y]) => ({ x, y, corner: true })) });
const MAIN = [
  [457.9, 541],
  [492.4, 546.3],
  [501.8, 607.2],
  [528.9, 614.8],
  [451, 693.8],
  [386.8, 747.8],
  [320.7, 707.1],
  [319.1, 674.7],
];
const PART1 = [
  [30.9, 608.6],
  [101.8, 536.8],
  [184.3, 618.7],
  [240.8, 674.3],
  [236.7, 706.1],
  [169.7, 745.1],
  [99.6, 681.5],
];
const fuseOf = (zone: FuseZone): PieceFuseSpec => ({ ...blankFuse('zone'), darts: 'fuse', zone });
const twoRings = fuseOf({ spline: spline(MAIN), holes: [], islands: [spline(PART1)] });
const piece = (fuse: PieceFuseSpec): FusingSourcePiece => ({
  identity: 'BP',
  displayName: 'BP',
  piecesPerGarment: 1,
  ungraded: false,
  fuse,
  sizes: [
    { sizeToken: 'XS', sizeId: 1, rank: 1, outline: ring(fixture.xs) },
    { sizeToken: 'M', sizeId: 2, rank: 2, outline: ring(fixture.m) },
  ],
});
const build = (fuse: PieceFuseSpec) =>
  buildFusingSheets({
    techCardId: 5,
    style: 'SS26-005',
    baseSizeId: 2,
    bomLines: [{ bomLineKey: 'L1', code: 'FUS', label: 'fusible' }],
    pieces: [piece(fuse)],
  });

describe('a fuse zone with two separate rings', () => {
  it('gives each ring its own interlining piece in every size, both linked to the source piece', () => {
    const result = build(twoRings);
    expect(result.warnings).toEqual([]);
    expect(result.skippedSizes).toEqual([]);
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0].blocks).toEqual(['BP_XS', 'BP_PART1_XS', 'BP_M', 'BP_PART1_M']);
    expect(result.sheets[0].aliases).toEqual([
      { identity: 'BP', blockName: 'BP' },
      { identity: 'BP', blockName: 'BP_PART1' },
    ]);
  });

  it.each([
    ['M', fixture.m],
    ['XS', fixture.xs],
  ])('in %s the parts keep the ring order and the shape of their own patch', (_size, outline) => {
    const spec = mapFuseSpecToSize(twoRings, ring(fixture.m), ring(outline));
    const parts = fuseParts(generateFuseGeometry({ outline: ring(outline), spec }), spec.zone);
    expect(parts).toHaveLength(2);
    const [main, part1] = parts.map((part) => ({
      cm2: Math.abs(signedArea(part.outer)) / 100,
      minX: Math.min(...part.outer.map((p) => p.x)),
      maxX: Math.max(...part.outer.map((p) => p.x)),
      holes: part.holes.length,
    }));
    // MAIN is the right yoke patch, PART 1 the left one; each is about 190 cm² and holds no loop.
    expect(main.minX).toBeGreaterThan(280);
    expect(part1.maxX).toBeLessThan(260);
    for (const part of [main, part1]) {
      expect(part.cm2).toBeGreaterThan(170);
      expect(part.cm2).toBeLessThan(210);
      expect(part.holes).toBe(0);
    }
  });

  it('a one-ring zone still gives one piece under the source name', () => {
    const result = build(fuseOf({ spline: spline(MAIN), holes: [], islands: [] }));
    expect(result.sheets[0].blocks).toEqual(['BP_XS', 'BP_M']);
    expect(result.sheets[0].aliases).toEqual([{ identity: 'BP', blockName: 'BP' }]);
  });
});
