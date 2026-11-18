import { createHash } from 'node:crypto';
import type {
  AdminService,
  common_Size,
  common_TechCard,
  common_TechCardBomItem,
  common_TechCardPiece,
  common_TechCardPieceDxfAlias,
  GetTechCardSavedAssemblySnapshotResponse,
} from 'api/proto-http/admin';
import {
  buildFusingSheets,
  reconstructHistoricalFusingForVerificationV1,
} from 'lib/fusing-dxf/dxf';
import { sourcePieces } from 'lib/fusing-dxf/regenerate';
import { NEST_DEFAULTS } from 'lib/nesting/types';
import { parseSheets } from 'lib/nesting/worker/parse-files';
import { loadDxf } from 'lib/pattern-import/adapters/dxf/tags';
import type { CardDraft, CardSize, PieceSpec } from 'lib/pattern-import/types';
import { writeDxfDetailed, writeScopes } from 'lib/pattern-import/write';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { replaySavedFullAssemblyGeneratedFusingV1 } from './saved-full-assembly-generated-fusing-v1';

const { readNativeCuts } = vi.hoisted(() => ({ readNativeCuts: vi.fn() }));
// The external archive probe exercises the genuine cut owner. This fixture controls just that
// dependency to exercise mismatches at the historical verifier's exact binding boundary.
vi.mock('./saved-full-assembly-native-boundaries-v1', () => ({
  bindSavedFullAssemblyNativeCutPathsV1: readNativeCuts,
}));

const sha = (text: string | Uint8Array) => createHash('sha256').update(text).digest('hex');
const encoder = new TextEncoder();
const sizes: CardSize[] = [
  { sizeId: 1, name: 'S', token: 'S', rank: 0 },
  { sizeId: 2, name: 'M', token: 'M', rank: 1 },
];
const dictionary: common_Size[] = [
  { id: 1, name: 's' },
  { id: 2, name: 'm' },
  { id: 84, name: 'm_32bo_m' },
].map((size) => ({
  ...size,
  countMen: undefined,
  countWomen: undefined,
  skuOrd: undefined,
  skuSystem: undefined,
}));
const stamp = '2026-10-23T16:08:00.000Z';
const bomKey = 'interlining';
const pieceLineKey = 'stable-front';
const nativeMain = { draft: {} as CardDraft, sizes };

const planned = writeScopes(
  {
    techCardId: 6,
    scopes: [
      {
        scopeKey: 'main',
        fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN',
        bomLineKey: 'main-bom',
        label: 'MAIN',
        isInterlining: false,
        sections: ['TECH_CARD_BOM_SECTION_FABRIC'],
      },
    ],
    pieces: [
      {
        identity: 'FRONT',
        code: 'FRONT',
        mods: [],
        displayName: 'FRONT',
        nameOrigin: 'operator',
        seed: 0,
        variant: null,
        pairHand: null,
        pairOf: null,
        unfoldedFold: false,
        piecesPerGarment: 1,
        allowance: { meaning: 'cut', allowanceMm: 0, origin: 'operator', evidence: [] },
        fabrics: ['main'],
        fused: false,
        ungraded: false,
        sizes: sizes.map(({ sizeId, token: sizeToken, rank }) => ({
          sizeId,
          sizeToken,
          rank,
          cut: [
            { x: 10, y: 20 },
            { x: 110 + rank, y: 20 },
            { x: 110 + rank, y: 180 },
            { x: 10, y: 180 },
          ],
          grain: null,
          seam: null,
          notches: [],
          drills: [],
          internal: [],
          fold: null,
          offset: null,
          walls: [],
          bbox: { minX: 10, minY: 20, maxX: 110 + rank, maxY: 180 },
          areaMm2: (100 + rank) * 160,
        })),
      } satisfies PieceSpec,
    ],
    sizes: sizes.map(({ sizeId, token, name, rank }) => ({
      sizeId,
      token,
      name,
      sourceLabel: token,
      rank,
    })),
    source: {
      files: [],
      scale: { method: 'declared', factor: 1, measuredMm: null, declaredMm: null },
      sheet: { pages: 1, method: 'single', maxResidualMm: 0 },
      sizeEncoding: 'dxf-block',
      variant: null,
    },
    dialect: 'r12',
    generator: 'fixture',
  },
  { embed: null, now: () => new Date(stamp) },
)[0]!;

const mainBytes = encoder.encode(planned.detail.bareText);
const mainPattern = {
  name: 'MAIN',
  filename: 'main.dxf',
  lineKey: 'main-pattern',
  bomLineKey: 'main-bom',
  fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' as const,
  version: 7,
  uploadedAt: stamp,
  sha256: sha(mainBytes),
  sizeBytes: mainBytes.length,
};
const bomItems = [
  { lineKey: 'main-bom', section: 'TECH_CARD_BOM_SECTION_FABRIC' as const },
  { lineKey: bomKey, section: 'TECH_CARD_BOM_SECTION_INTERLINING' as const, name: 'Interlining' },
] as common_TechCardBomItem[];
const cardPieces: common_TechCardPiece[] = [
  {
    lineKey: pieceLineKey,
    name: 'FRONT',
    fused: true,
    piecesPerGarment: 1,
    fusingMode: 'TECH_CARD_PIECE_FUSING_MODE_FULL' as const,
    mirrored: undefined,
    grainline: undefined,
    note: undefined,
    materials: undefined,
    detached: undefined,
    fusingWidthMm: undefined,
    fusingEdges: undefined,
    fusingZone: undefined,
    fusingInsetMm: undefined,
    fusingBase: undefined,
  },
];
const cardAliases = [
  {
    pieceLineKey,
    blockName: 'FRONT',
    bomLineKey: 'main-bom',
    fabricPurpose: 'TECH_CARD_BOM_PURPOSE_MAIN' as const,
  },
] as common_TechCardPieceDxfAlias[];

async function generatorInput() {
  const parsed = await parseSheets([{ name: 'main.dxf', open: async () => mainBytes.buffer }], {
    unit: 'auto',
    tol: NEST_DEFAULTS.tol,
    tolChain: NEST_DEFAULTS.tolChain,
  });
  const prepared = sourcePieces(
    parsed.pieces,
    cardPieces,
    cardAliases,
    new Map(bomItems.map((bom) => [bom.lineKey!, bom])),
    dictionary,
    [1, 2],
    2,
    10,
  );
  expect(prepared.unmatchedFused).toEqual([]);
  return {
    techCardId: 6,
    style: 'Test',
    baseSizeId: 2,
    createdAt: stamp,
    bomLines: [{ bomLineKey: bomKey, code: 'Interlining', label: 'Interlining' }],
    pieces: prepared.pieces,
  };
}

async function fixture(
  options: {
    editBytes?: (text: string) => string;
    fusingAliasOwner?: string;
    filename?: string;
  } = {},
) {
  const [historic] = reconstructHistoricalFusingForVerificationV1(await generatorInput()).sheets;
  if (!historic) throw new Error('Missing historical fixture sheet.');
  const fusingBytes = encoder.encode(options.editBytes?.(historic.dxfText) ?? historic.dxfText);
  const fusingPattern = {
    name: 'Fusing · generated · Interlining',
    filename: options.filename ?? historic.filename,
    lineKey: 'fusing-pattern',
    bomLineKey: bomKey,
    version: 7,
    sha256: sha(fusingBytes),
    sizeBytes: fusingBytes.length,
  };
  const card = {
    id: 6,
    lockVersion: 12,
    techCard: {
      styleNumber: 'Test',
      baseSampleSizeId: 2,
      sizeIds: [1, 2],
      patterns: [mainPattern, fusingPattern],
      bomItems,
      pieces: cardPieces,
      pieceDxfAliases: { items: cardAliases },
      requiredSeamAllowanceMm: { value: '10' },
    },
  } as common_TechCard;
  const rows = [
    { scopeKey: 'main', pattern: mainPattern },
    { scopeKey: bomKey, pattern: fusingPattern },
  ].map(({ scopeKey, pattern }) => ({
    techCardId: 6,
    scopeKey,
    patternLineKey: pattern.lineKey,
    savedRowRevision: 3,
    cardLockVersion: 12,
    patternVersion: pattern.version,
    url: `https://objects.invalid/${pattern.filename}`,
    sizeBytes: pattern.sizeBytes,
    sha256: pattern.sha256,
  }));
  const [main] = rows;
  const serverAssemblyRevision = `asm:v1:${'9'.repeat(32)}:42`;
  const partial = {
    serverAssemblyRevision,
    rows,
    aliases: [
      { scopeKey: 'main', blockName: 'FRONT', pieceLineKey },
      {
        scopeKey: bomKey,
        blockName: 'FRONT',
        pieceLineKey: options.fusingAliasOwner ?? pieceLineKey,
      },
    ],
    operations: [],
    ownedSeams: [],
    garmentLabels: [],
  };
  const json = JSON.stringify(partial, (_key, value: unknown) =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value,
  );
  const downloadable = rows.map((row) => ({ ...row, downloadUrl: `/read/${row.patternLineKey}` }));
  const snapshot = {
    row: downloadable[0],
    serverAssemblyRevision,
    operations: [],
    selectedOperationNumber: undefined,
    selectedSeams: undefined,
    assemblyTopologySha256: undefined,
    topologyCanonicalJson: undefined,
    completeSourceV1: {
      ...partial,
      rows: downloadable,
      canonicalJson: Buffer.from(json).toString('base64'),
      sourceSha256: sha('tech-card-saved-assembly-complete-source/1\0' + json),
    },
  } satisfies GetTechCardSavedAssemblySnapshotResponse;
  const service: Pick<AdminService, 'GetTechCardSavedAssemblySnapshot'> = {
    GetTechCardSavedAssemblySnapshot: vi.fn().mockResolvedValue(snapshot),
  };
  const signal = new AbortController().signal;
  const source = await readCompleteSavedAssemblySourceV1(
    service,
    { ...main!, revision: 3 },
    {},
    signal,
  );
  return {
    signal,
    args: {
      source,
      card,
      sizeDictionary: [...dictionary].reverse(),
      sizeId: 2,
      fusingScopeKey: bomKey,
      mainBytes,
      fusingBytes,
      nativeMain,
    },
  };
}

beforeEach(() => {
  readNativeCuts.mockReset();
  readNativeCuts.mockResolvedValue([{ pieceLineKey, blockName: 'FRONT' }]);
});

describe('historical saved generated fusing verification', () => {
  it('replays sealed markerless bytes and selects the current native M host independently from the old size-ID collision', async () => {
    const { args, signal } = await fixture();
    const layer = await replaySavedFullAssemblyGeneratedFusingV1(args, signal);
    expect(layer.selectedSizeId).toBe(2);
    expect(layer).not.toHaveProperty('sourceOwner');
    expect(layer.parts).toEqual([
      expect.objectContaining({ blockName: 'FRONT_M', sizeToken: 'M', pieceLineKey }),
    ]);
    expect(readNativeCuts).toHaveBeenCalledWith(
      args.source,
      expect.objectContaining({ row: expect.objectContaining({ scopeKey: 'main' }) }),
      'M',
      signal,
    );
  });

  it.each([
    ['rollover date', (text: string) => text.replace('23-10-2026', '31-02-2026')],
    [
      'duplicate date',
      (text: string) => text.replace('Author: GRBPWR', 'Creation Date: 23-10-2026'),
    ],
    [
      'writer profile relabel',
      (text: string) => text.replace('Author: GRBPWR', 'Author: Arbitrary'),
    ],
  ])('rejects a sealed markerless fusing row with %s', async (_case, editBytes) => {
    const { args, signal } = await fixture({ editBytes });
    await expect(replaySavedFullAssemblyGeneratedFusingV1(args, signal)).rejects.toThrow(
      'exact model-space R12 UTC stamp',
    );
    expect(readNativeCuts).not.toHaveBeenCalled();
  });

  it('refuses changed bytes after the seal, a relabelled row, and a moved saved alias', async () => {
    const { args, signal } = await fixture();
    const changed = encoder.encode(
      new TextDecoder().decode(args.fusingBytes).replace('16:08', '16:09'),
    );
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1({ ...args, fusingBytes: changed }, signal),
    ).rejects.toThrow('bytes differ');
    const wrongFilename = await fixture({ filename: 'relabelled.dxf' });
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1(wrongFilename.args, wrongFilename.signal),
    ).rejects.toThrow('could not be reproduced');
    const wrongAlias = await fixture({ fusingAliasOwner: 'different-piece' });
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1(wrongAlias.args, wrongAlias.signal),
    ).rejects.toThrow('exact main garment piece owner');
    expect(readNativeCuts).not.toHaveBeenCalled();
  });

  it('refuses a sealed changed geometry or a corrupt dictionary despite a valid historical header', async () => {
    const altered = await fixture({
      editBytes: (text) => text.replace('0.000000', '1.000000'),
    });
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1(altered.args, altered.signal),
    ).rejects.toThrow('could not be reproduced');
    const { args, signal } = await fixture();
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1(
        { ...args, sizeDictionary: [...dictionary, dictionary[0]] },
        signal,
      ),
    ).rejects.toThrow('complete, unique size dictionary');
    expect(readNativeCuts).not.toHaveBeenCalled();
  });

  it('requires the current exact native host and full ranked coverage', async () => {
    const { args, signal } = await fixture();
    await expect(
      replaySavedFullAssemblyGeneratedFusingV1({ ...args, nativeMain: undefined }, signal),
    ).rejects.toThrow('exact current MAIN native source');
    readNativeCuts.mockResolvedValueOnce([{ pieceLineKey, blockName: 'SOME_OTHER_CUT' }]);
    await expect(replaySavedFullAssemblyGeneratedFusingV1(args, signal)).rejects.toThrow(
      'exact current MAIN native cut',
    );
    const missingRank = { ...args, nativeMain: { ...nativeMain, sizes: sizes.slice(1) } };
    await expect(replaySavedFullAssemblyGeneratedFusingV1(missingRank, signal)).rejects.toThrow(
      'exact block at a current garment rank',
    );
    const swappedTokens = {
      ...args,
      nativeMain: {
        ...nativeMain,
        sizes: sizes.map((size, index) => ({ ...size, token: sizes[1 - index].token })),
      },
    };
    await expect(replaySavedFullAssemblyGeneratedFusingV1(swappedTokens, signal)).rejects.toThrow(
      'exact current card size tokens',
    );
  });

  it('limits historical grain to bare fusing verification and preserves the modern generated marker', async () => {
    expect(() =>
      writeDxfDetailed(planned.job, { embed: null, legacyFusingGrainAnchor: true }),
    ).toThrow('only for bare R12 interlining replay');
    const input = await generatorInput();
    const modern = buildFusingSheets(input).sheets[0]!;
    const historic = reconstructHistoricalFusingForVerificationV1(input).sheets[0]!;
    expect(loadDxf(encoder.encode(modern.dxfText).buffer).generatedFusing).toBe(true);
    expect(loadDxf(encoder.encode(historic.dxfText).buffer).generatedFusing).toBe(false);
  });
});
