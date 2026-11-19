import { expect, it } from 'vitest';
import { readDxf } from '../adapters/dxf/extract';
import { segmentDxf } from '../adapters/dxf/segment';
import { writeDxfDetailed } from '../write';
import { embedManifest } from './index';
import { authoredInternalVertices, parseManifestAuthoredInternal } from './authored-internal';
import {
  decodeTurnAllowance,
  parseAuthoredTurnAllowance,
  turnAllowanceMarker,
  verifyTurnAllowanceGeometry,
} from './authored-turn-allowance';
import type { AuthoredTurnAllowanceVariant, PieceSizeSpec, PtMm, WriteJob } from '../types';

const cut = [
  { x: 324.000137, y: 220 },
  { x: 260.000076, y: 220 },
  { x: 260.000198, y: 0 },
  { x: 324.000137, y: 0 },
];
const sewing = [
  { x: 310.000137, y: 210 },
  { x: 270.000076, y: 210 },
  { x: 270.000198, y: 10 },
  { x: 310.000137, y: 10 },
];
const crease = [sewing[3]!, { x: 310.000137, y: 110 }, sewing[0]!];

function markerFor(variant: AuthoredTurnAllowanceVariant) {
  return turnAllowanceMarker({
    variant,
    cut: [cut[3]!, cut[0]!],
    sewing: [sewing[3]!, sewing[0]!],
  })!;
}

it.each(['single-turn-hem', 'cut-on-facing'] as const)(
  'requires explicit %s and an exact native L1/L14/L8 triple',
  (variant) => {
    const marker = markerFor(variant);
    expect(parseAuthoredTurnAllowance(marker)).toEqual({
      variant,
      cut: [324000137, 0, 324000137, 220000000],
      sewing: [310000137, 10000000, 310000137, 210000000],
    });
    expect(decodeTurnAllowance(marker).sewing).toEqual([crease[0], crease[2]]);
    expect(verifyTurnAllowanceGeometry(marker, cut, sewing, crease, true)).toBe(true);
    const shifted = (path: PtMm[], index: number) =>
      path.map((p, i) => (i === index ? { ...p, x: p.x + 0.0000001 } : p));
    const deep = cut.map((point) => (point.x === cut[0]!.x ? { ...point, x: 430 } : point));
    const deepMarker = turnAllowanceMarker({
      variant,
      cut: [deep[3]!, deep[0]!],
      sewing: [sewing[3]!, sewing[0]!],
    })!;
    expect(deepMarker).toBeDefined();
    expect(verifyTurnAllowanceGeometry(deepMarker, deep, sewing, crease, true)).toBe(false);
    const tiltedJoin = cut.map((p, i) => (i === 1 ? { ...p, y: p.y - 1 } : p));
    for (const [c, s, l] of [
      [tiltedJoin, sewing, crease],
      [cut, shifted(sewing, 3), crease],
      [cut, sewing, shifted(crease, 1)],
      [cut, sewing, crease.toReversed()],
      [cut, sewing, [crease[0]!, crease[1]!, crease[1]!, crease[2]!]],
    ] as const)
      expect(verifyTurnAllowanceGeometry(marker, c, s, l, true)).toBe(false);
  },
);

it('keeps an ordinary layer-8 pattern line readable without assigning it a turn', () => {
  const plain = {
    index: 0,
    label: 'draft-cad:pattern-line',
    closed: false,
    vertices: authoredInternalVertices(crease),
  };
  const turnAllowance = markerFor('single-turn-hem');
  const typed = { ...plain, turnAllowance };
  expect(parseManifestAuthoredInternal([plain], 1)).toEqual([plain]);
  expect(parseManifestAuthoredInternal([typed], 1)).toEqual([typed]);
  expect(parseManifestAuthoredInternal([typed, { ...typed, index: 1 }], 2)).toBeNull();
  expect(parseManifestAuthoredInternal([{ ...typed, closed: true }], 1)).toBeNull();
  expect(parseManifestAuthoredInternal([{ ...typed, label: 'draft-cad:guideline' }], 1)).toBeNull();
  expect(
    parseManifestAuthoredInternal(
      [{ ...typed, turnAllowance: { ...turnAllowance, variant: 'hem' } }],
      1,
    ),
  ).toBeNull();
});

it.each(['r12', 'r2000'] as const)(
  'writes and independently reads one native %s crease',
  async (dialect) => {
    const turn = decodeTurnAllowance(markerFor('cut-on-facing'));
    const size: PieceSizeSpec = {
      sizeId: 60,
      sizeToken: 'XL',
      rank: 0,
      cut,
      seam: sewing,
      grain: null,
      notches: [],
      drills: [],
      internal: [
        {
          kind: 'internal',
          label: 'draft-cad:pattern-line',
          pts: [turn.sewing[0], turn.sewing[1]],
          closed: false,
          origin: 'operator',
          ranges: [],
          confidence: 1,
          authoredTurnAllowance: turn,
        },
      ],
      fold: null,
      offset: null,
      walls: [],
      bbox: { minX: 260.000076, minY: 0, maxX: 324.000137, maxY: 220 },
      areaMm2: 14080,
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
    const marker = manifest.blocks[0]?.authoredInternal?.[0]?.turnAllowance;
    expect(marker?.variant).toBe('cut-on-facing');
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
    const turns = native.pieces.flatMap(({ authoredTurnAllowanceByPath }) => [
      ...(authoredTurnAllowanceByPath?.values() ?? []),
    ]);
    expect(turns).toEqual([decodeTurnAllowance(marker!)]);

    const shifted = structuredClone(manifest);
    const claim = shifted.blocks[0]!.authoredInternal![0]!.turnAllowance!;
    claim.sewing[0] += 1;
    claim.sewing[2] += 1;
    const signedMismatch = await read(embedManifest(dxfText, shifted));
    expect(() => segmentDxf(signedMismatch)).toThrow(/does not reproduce its exact native crease/);
  },
);
