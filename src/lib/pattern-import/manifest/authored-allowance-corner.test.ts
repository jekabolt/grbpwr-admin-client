import { expect, it } from 'vitest';
import type { AuthoredAllowanceCorner, PieceSizeSpec, WriteJob } from '../types';
import { readDxf } from '../adapters/dxf/extract';
import { segmentDxf } from '../adapters/dxf/segment';
import { writeDxfDetailed } from '../write';
import { embedManifest } from './index';
import {
  authoredAllowanceCornerMarker,
  decodeAuthoredAllowanceCorner,
  editAuthoredAllowanceCorner,
  matchesAuthoredAllowanceCorner,
  parseAuthoredAllowanceCorner,
} from './authored-allowance-corner';

const cut = [
  { x: 320.000137, y: 220 },
  { x: 260.000076, y: 220 },
  { x: 260.000198, y: 0 },
  { x: 320.000137, y: 0 },
];
const sewing = [
  { x: 310.000137, y: 210 },
  { x: 270.000076, y: 210 },
  { x: 270.000198, y: 10 },
  { x: 310.000137, y: 10 },
];
const baseline: AuthoredAllowanceCorner = {
  variant: 'auto',
  sewing: [sewing[3]!, sewing[0]!, sewing[1]!],
  widthMm: 10,
};

it('demotes one exact native mitre to Square, then restores it through Mitre and Auto', () => {
  expect(matchesAuthoredAllowanceCorner(cut, sewing, baseline)).toBe(true);
  const squared = editAuthoredAllowanceCorner(cut, sewing, baseline, 'square')!;
  expect(squared).toEqual([
    { x: 320.000137, y: 219.4 },
    { x: 319.400137, y: 220 },
    ...cut.slice(1),
  ]);
  const square = { ...baseline, variant: 'square' as const };
  const wire = authoredAllowanceCornerMarker(square);
  expect(wire).toEqual({
    variant: 'square',
    width: 10000000,
    sewing: [310000137, 10000000, 310000137, 210000000, 270000076, 210000000],
  });
  expect(decodeAuthoredAllowanceCorner(parseAuthoredAllowanceCorner(wire)!)).toEqual(square);
  expect(editAuthoredAllowanceCorner(squared, sewing, square, 'mitre')).toEqual(cut);
  expect(editAuthoredAllowanceCorner(squared, sewing, square, 'auto')).toEqual(cut);
});

it('refuses a stale, reversed, changed or unsupported corner declaration', () => {
  const squared = editAuthoredAllowanceCorner(cut, sewing, baseline, 'square')!;
  const square = { ...baseline, variant: 'square' as const };
  expect(parseAuthoredAllowanceCorner(undefined)).toBeNull();
  expect(
    parseAuthoredAllowanceCorner({ ...authoredAllowanceCornerMarker(square), variant: 'clip' }),
  ).toBeNull();
  expect(matchesAuthoredAllowanceCorner(squared, sewing, baseline)).toBe(false);
  expect(matchesAuthoredAllowanceCorner(squared, sewing.toReversed(), square)).toBe(false);
  const changedSeam = sewing.map((p, i) => (i === 1 ? { ...p, x: p.x + 0.000001 } : p));
  const changedCut = squared.map((p, i) => (i === 0 ? { ...p, y: p.y + 0.0000001 } : p));
  expect(matchesAuthoredAllowanceCorner(squared, changedSeam, square)).toBe(false);
  expect(matchesAuthoredAllowanceCorner(changedCut, sewing, square)).toBe(false);
});

it.each(['r12', 'r2000'] as const)(
  'writes and independently reads one authored %s allowance corner',
  async (dialect) => {
    const square = { ...baseline, variant: 'square' as const };
    const updated = editAuthoredAllowanceCorner(cut, sewing, baseline, 'square')!;
    const size: PieceSizeSpec = {
      sizeId: 60,
      sizeToken: 'XL',
      rank: 0,
      cut: updated,
      seam: sewing,
      grain: null,
      notches: [],
      drills: [],
      internal: [],
      authoredAllowanceCorner: square,
      fold: null,
      offset: null,
      walls: [],
      bbox: { minX: 260.000076, minY: 0, maxX: 320.000137, maxY: 220 },
      areaMm2: 13199.82,
    };
    const job: WriteJob = {
      dialect,
      techCardId: 169,
      generator: 'grbpwr/pattern-import',
      scope: {
        scopeKey: 'main',
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        bomLineKey: '',
        label: 'Main',
        isInterlining: false,
      },
      sizes: [{ sizeId: 60, token: 'XL', rank: 0, name: 'XL', sourceLabel: 'XL' }],
      pieces: [
        {
          identity: 'PCK',
          code: 'PCK',
          mods: [],
          displayName: 'Pocket',
          nameOrigin: 'operator',
          seed: 1,
          variant: null,
          pairHand: null,
          pairOf: null,
          unfoldedFold: false,
          piecesPerGarment: 1,
          allowance: { meaning: 'both', allowanceMm: 10, origin: 'measured', evidence: [] },
          fabrics: ['TECH_CARD_BOM_PURPOSE_MAIN'],
          fused: false,
          ungraded: false,
          sizes: [size],
        },
      ],
      source: {
        files: [],
        sizeEncoding: 'dxf-block',
        variant: null,
        scale: { method: 'declared', factor: 1, declaredMm: null, measuredMm: null },
        sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      },
    };
    const { dxfText, manifest } = writeDxfDetailed(job);
    const marker = manifest.blocks[0]?.authoredAllowanceCorner;
    expect(marker?.variant).toBe('square');
    const read = (text: string) =>
      readDxf(
        {
          id: 'authored-turn',
          name: 'authored-turn.dxf',
          bytes: new TextEncoder().encode(text).buffer,
        },
        { sagittaMm: 0.05, keepFills: true },
      );
    const native = segmentDxf(await read(dxfText));
    expect(native.pieces.map(({ authoredAllowanceCorner }) => authoredAllowanceCorner)).toEqual([
      decodeAuthoredAllowanceCorner(marker!),
    ]);
    const shifted = structuredClone(manifest);
    shifted.blocks[0]!.authoredAllowanceCorner!.variant = 'mitre';
    const mismatched = await read(embedManifest(dxfText, shifted));
    expect(() => segmentDxf(mismatched)).toThrow(/does not reproduce its exact native edges/);
  },
);
