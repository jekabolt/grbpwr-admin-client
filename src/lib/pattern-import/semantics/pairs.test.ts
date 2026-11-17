import { describe, expect, it } from 'vitest';
import { readRawDxf } from '../gate/reader';
import { readManifest } from '../manifest';
import type { PieceSizeSpec, PieceSpec, PtMm, WriteJob } from '../types';
import { writeDxfDetailed } from '../write';
import { applyAffine, signedArea } from './geom';
import { mirrorSizeAcrossGrain } from './pairs';

function rectangle(left: number, bottom: number, width: number, height: number): PtMm[] {
  return [
    { x: left, y: bottom },
    { x: left + width, y: bottom },
    { x: left + width, y: bottom + height },
    { x: left, y: bottom + height },
  ];
}

function family(): PieceSizeSpec[] {
  const evidence = { origin: 'operator' as const, ranges: [], confidence: 1 };
  return ['S', 'M'].map((sizeToken, rank) => {
    const shift = rank * 5;
    const width = 60 + rank * 10;
    const x = shift + 20 + rank * 5;
    return {
      rank,
      sizeToken,
      sizeId: rank + 3,
      cut: rectangle(shift, 0, width, 70),
      cutLoops: [
        rectangle(shift + 35, 10, 10, 10).reverse(),
        rectangle(shift + width + 10, 10, 10, 20),
      ],
      seam: rectangle(shift + 1, 1, width - 2, 68),
      grain: { ...evidence, kind: 'grain', a: { x, y: 15 }, b: { x, y: 55 }, angleDeg: 90 },
      notches: [
        {
          ...evidence,
          kind: 'notch',
          at: { x: shift + width, y: 20 },
          seg: [
            { x: shift + width, y: 20 },
            { x: shift + width - 3, y: 20 },
          ],
          depthMm: 3,
        },
      ],
      drills: [{ ...evidence, kind: 'drill', at: { x: shift + 34, y: 40 }, form: 'point' }],
      internal: [
        {
          ...evidence,
          kind: 'internal',
          pts: [
            { x: shift + 30, y: 45 },
            { x: shift + 37, y: 43 },
          ],
          closed: false,
        },
      ],
      fold: { ...evidence, kind: 'fold', a: { x: shift + 7, y: 0 }, b: { x: shift + 7, y: 70 } },
      offset: null,
      walls: [],
      areaMm2: width * 70 - 100 + 200,
      bbox: { minX: shift, minY: 0, maxX: shift + width + 20, maxY: 70 },
    };
  });
}

describe('graded mirror cut loops', () => {
  it('reflects each rank and its complete geometry while preserving hole and island winding', () => {
    const sizes = family();
    const before = structuredClone(sizes);
    for (const source of sizes) {
      const mirrored = mirrorSizeAcrossGrain(source);
      expect(mirrored).not.toBeNull();
      const { size, t } = mirrored!;
      const map = (point: PtMm) => applyAffine(t, point);
      expect(size).toMatchObject({
        rank: source.rank,
        sizeToken: source.sizeToken,
        sizeId: source.sizeId,
        areaMm2: source.areaMm2,
        bbox: {
          minX: map({ x: source.bbox.maxX, y: 0 }).x,
          maxX: map({ x: source.bbox.minX, y: 0 }).x,
          minY: 0,
          maxY: 70,
        },
      });
      expect(size.cut).toEqual(source.cut.map(map).reverse());
      expect(size.seam).toEqual(source.seam?.map(map).reverse());
      expect(size.cutLoops).toEqual(source.cutLoops?.map((loop) => loop.map(map).reverse()));
      expect(size.cutLoops?.map(signedArea)).toEqual([-100, 200]);
      expect(size.notches[0].at).toEqual(map(source.notches[0].at));
      expect(size.notches[0].seg).toEqual(source.notches[0].seg.map(map));
      expect(size.drills[0].at).toEqual(map(source.drills[0].at));
      expect(size.internal[0].pts).toEqual(source.internal[0].pts.map(map));
      expect(size.fold?.a).toEqual(map(source.fold!.a));
      expect(size.fold?.b).toEqual(map(source.fold!.b));
      expect(size.grain).toEqual(source.grain);
    }
    expect(sizes).toEqual(before);
  });

  it.each(['r12', 'r2000'] as const)(
    'keeps both ranks and signed loops in the existing %s writer-derived pair',
    (dialect) => {
      const sizes = family();
      const left: PieceSpec = {
        identity: 'FRONT_L',
        code: 'FRONT',
        mods: ['L'],
        displayName: 'Front',
        nameOrigin: 'operator',
        seed: 1,
        variant: null,
        pairHand: 'L',
        pairOf: 'FRONT_R',
        unfoldedFold: true,
        piecesPerGarment: 1,
        allowance: { meaning: 'both', allowanceMm: 1, origin: 'operator', evidence: [] },
        fabrics: ['main'],
        fused: false,
        ungraded: false,
        sizes,
      };
      const job: WriteJob = {
        techCardId: 12,
        scope: {
          scopeKey: 'main',
          fabricPurpose: '',
          bomLineKey: 'main',
          label: 'Main',
          isInterlining: false,
        },
        pieces: [left],
        sizes: sizes.map((size) => ({
          rank: size.rank,
          token: size.sizeToken,
          sizeId: size.sizeId,
          name: size.sizeToken,
          sourceLabel: size.sizeToken,
        })),
        source: {
          files: [],
          scale: { method: 'none', factor: 1, measuredMm: null, declaredMm: null },
          sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
          sizeEncoding: 'dxf-block',
          variant: null,
        },
        generator: 'mirror regression',
        dialect,
      };
      const written = writeDxfDetailed(job, { now: () => new Date(0) });
      const raw = readRawDxf(written.dxfText);
      const rightBlocks = written.plan.blocks.filter(({ identity }) => identity === 'FRONT_R');
      expect(rightBlocks.map(({ name }) => name)).toEqual(['FRONT_R_S', 'FRONT_R_M']);
      for (const [index, block] of rightBlocks.entries()) {
        expect(block.derivedFrom).toBe('FRONT_L');
        expect(block.cutLoops.map((loop) => Math.round(signedArea(loop)))).toEqual([-100, 200]);
        expect(block.size.areaMm2).toBeCloseTo(sizes[index].areaMm2);
        const emittedRings = raw.blocks
          .get(block.name)
          ?.filter(({ closed, layer }) => closed && layer === '1');
        expect(emittedRings?.map(({ pts }) => Math.round(signedArea(pts)))).toEqual([
          Math.round(signedArea(sizes[index].cut)),
          -100,
          200,
        ]);
      }
      const manifest = readManifest(written.dxfText);
      expect(manifest?.pieces).toEqual([
        expect.objectContaining({ identity: 'FRONT_L', pairHand: 'L', pairOf: 'FRONT_R' }),
        expect.objectContaining({ identity: 'FRONT_R', pairHand: 'R', pairOf: 'FRONT_L' }),
      ]);
      expect(
        manifest?.blocks
          .filter(({ identity }) => identity === 'FRONT_R')
          .map(({ sizeToken, areaMm2 }) => [sizeToken, areaMm2]),
      ).toEqual(sizes.map(({ sizeToken, areaMm2 }) => [sizeToken, areaMm2]));
    },
  );
});
