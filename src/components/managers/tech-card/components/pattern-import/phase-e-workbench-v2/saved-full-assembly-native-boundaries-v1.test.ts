import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import type { GetTechCardSavedAssemblySnapshotResponse } from 'api/proto-http/admin';
import {
  createDxfInsertInstancePathV1,
  readDxfInsertInstanceBlockNameV1,
} from 'lib/pattern-import/dxf-path-provenance-v1';
import {
  DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1,
  DXF_PRODUCT_PHASE_D_REPLAY_V1,
  type DxfProductPhaseDReplayCarrierV1,
} from 'lib/pattern-import/dxf-product-phase-d-replay-v1';
import { computeDxfProductSavedSourceFileIdV1 } from 'lib/pattern-import/dxf-product-saved-reprocess-owner-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
  type CardDraft,
  type DraftScope,
  type ManifestBlock,
} from 'lib/pattern-import/types';
import { describe, expect, it, vi } from 'vitest';
import { readCompleteSavedAssemblySourceV1 } from './saved-assembly-complete-source-rpc-v1';
import { bindSavedFullAssemblyNativeCutPathsV1 } from './saved-full-assembly-native-boundaries-v1';

vi.mock('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1', () => ({
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1: async () => ({
    ok: true,
    catalog: { pieces: [{ pieceId: 'PCK_L', pieceLineKey: 'piece-line' }] },
  }),
}));

const row = {
  techCardId: 169,
  scopeKey: 'main',
  patternLineKey: 'pattern-line',
  cardLockVersion: 5,
  revision: 3,
  url: 'https://objects.invalid/pattern.dxf',
  sizeBytes: 160,
  sha256: 'a'.repeat(64),
};
const fileId = computeDxfProductSavedSourceFileIdV1(row);
const nativeName = 'PCK_L_M';
const manifestBlock = { identity: 'PCK_L', block: nativeName, sizeToken: 'M', sizeId: 58 };
const failure = 'A selected native cut has no unique saved source-block identity.';

async function readSource(names: string[]) {
  const { revision, ...identity } = row;
  const wireRow = { ...identity, savedRowRevision: revision, patternVersion: 9 };
  const download = { ...wireRow, downloadUrl: '/read/pattern-line' };
  const core = {
    serverAssemblyRevision: `asm:v1:${'b'.repeat(32)}:7`,
    rows: [wireRow],
    operations: [],
    aliases: names.map((blockName) => ({
      scopeKey: row.scopeKey,
      blockName,
      pieceLineKey: 'piece-line',
    })),
    ownedSeams: [],
    garmentLabels: [],
  };
  const canonicalJson = JSON.stringify(core, (_key, value: unknown) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a === b ? 0 : 1)))
      : value,
  );
  const response = {
    row: download,
    serverAssemblyRevision: core.serverAssemblyRevision,
    operations: [],
    selectedOperationNumber: undefined,
    selectedSeams: undefined,
    assemblyTopologySha256: undefined,
    topologyCanonicalJson: undefined,
    completeSourceV1: {
      ...core,
      rows: [download],
      cutStrips: undefined,
      canonicalJson: Buffer.from(canonicalJson).toString('base64'),
      sourceSha256: createHash('sha256')
        .update('tech-card-saved-assembly-complete-source/1\0' + canonicalJson)
        .digest('hex'),
    },
  } satisfies GetTechCardSavedAssemblySnapshotResponse;
  return readCompleteSavedAssemblySourceV1(
    { GetTechCardSavedAssemblySnapshot: async () => response },
    row,
    {},
    new AbortController().signal,
  );
}

function blockInsert(blockName: string, insertOp: number) {
  const formed = createDxfInsertInstancePathV1([
    {
      blockName,
      insertHandle: null,
      insertOp,
      occurrenceIndex: 0,
      mInsertRow: 0,
      mInsertColumn: 0,
    },
  ]);
  if (!formed.ok) throw new Error('Could not form test INSERT provenance');
  return formed.value;
}

function draft(
  options: {
    rawName?: string;
    otherInsert?: string;
    extraManifest?: Pick<ManifestBlock, 'identity' | 'block' | 'sizeToken' | 'sizeId'>;
    writerSizeId?: number;
    sourceFileId?: string;
    withoutWriter?: boolean;
  } = {},
) {
  const scope = {
    target: { scopeKey: 'main' },
    manifest: {
      techCardId: row.techCardId,
      blocks: [manifestBlock, ...(options.extraManifest ? [options.extraManifest] : [])],
    },
    writerReplay: options.withoutWriter
      ? undefined
      : {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_WRITER_REPLAY_CARRIER_V1,
          job: {
            techCardId: row.techCardId,
            scope: { scopeKey: row.scopeKey },
            pieces: [
              {
                identity: 'PCK_L',
                displayName: 'FLAP_L',
                sizes: [{ sizeToken: 'M', sizeId: options.writerSizeId ?? 58 }],
              },
            ],
          },
        },
  } as DraftScope;
  const paths = [
    options.rawName ?? nativeName,
    ...(options.otherInsert ? [options.otherInsert] : []),
  ].map((name, index) => ({
    pathId: index + 1,
    closed: true,
    pointsMm: [],
    provenance: { sourceFileId: fileId, instancePath: blockInsert(name, index + 1) },
  }));
  // The catalog owns Phase D validation. This fixture supplies just the carrier fields read here.
  const carrier = {
    sourceSha256: row.sha256,
    sourceFileId: options.sourceFileId ?? fileId,
    source: { sourceFileId: fileId, paths },
    contours: [
      {
        pieceId: 'PCK_L',
        sizeToken: 'M',
        contourId: 'cut-1',
        role: 'cut-boundary',
        closed: true,
        lineage: { sourcePathIds: [1] },
      },
    ],
  } as unknown as DxfProductPhaseDReplayCarrierV1;
  return {
    techCardId: row.techCardId,
    scopes: [scope],
    pieces: [],
    aliases: [],
    pieceUpdates: [],
    downloads: [],
    dxfPhaseDReplay: {
      schemaVersion: DXF_PRODUCT_PHASE_D_REPLAY_V1,
      replayReady: true,
      blockers: [],
      claims: DXF_PRODUCT_PHASE_D_REPLAY_CLAIMS_V1,
      carrier,
    },
  } satisfies CardDraft;
}

async function readCuts(names: string[], input = draft()) {
  const source = await readSource(names);
  const cuts = await bindSavedFullAssemblyNativeCutPathsV1(
    source,
    { row, draft: input },
    'M',
    new AbortController().signal,
  );
  return { source, cuts };
}

describe('saved native cut aliases', () => {
  it('reads the literal INSERT block name and refuses malformed provenance', () => {
    const [token] = blockInsert('ÉLASTIQUE_М', 2);
    expect(readDxfInsertInstanceBlockNameV1(token)).toBe('ÉLASTIQUE_М');
    expect(readDxfInsertInstanceBlockNameV1('b/ff/p/2/o/0/r/0/c/0')).toBeNull();
    expect(readDxfInsertInstanceBlockNameV1('b/ff/p/02/o/0/r/0/c/0')).toBeNull();
  });

  it('retains single legacy aliases without requiring writer replay', async () => {
    const { cuts } = await readCuts(['FLAP_L'], draft({ withoutWriter: true }));
    expect(cuts.map(({ blockName }) => blockName)).toEqual(['FLAP_L']);
  });

  it.each(['PCK_L', nativeName])(
    'binds the exact %s alias while retaining the display alias',
    async (alias) => {
      const { source, cuts } = await readCuts(['FLAP_L', alias]);
      expect(cuts).toMatchObject([
        { blockName: alias, pieceLineKey: 'piece-line', nativePathId: 1 },
      ]);
      expect(source.aliases.map(({ blockName }) => blockName)).toEqual(['FLAP_L', alias]);
    },
  );

  it.each([
    ['two exact aliases', ['PCK_L', nativeName], {}],
    ['one exact alias declared twice', ['PCK_L', 'PCK_L'], {}],
    ['only display aliases', ['FLAP_L', 'POCKET'], {}],
    [
      'a competing writer block on a different rank',
      ['PCK_L', 'OTHER_S'],
      {
        extraManifest: { identity: 'OTHER', block: 'OTHER_S', sizeToken: 'S', sizeId: 57 },
      },
    ],
    ['a competing INSERT', ['PCK_L', 'FLAP_L'], { otherInsert: 'FLAP_L' }],
    [
      'more than one occurrence of the selected block',
      ['PCK_L', 'FLAP_L'],
      { otherInsert: nativeName },
    ],
    ['the wrong selected INSERT', ['PCK_L', 'FLAP_L'], { rawName: 'SWAPPED_M' }],
    ['the wrong source file ID', ['PCK_L', 'FLAP_L'], { sourceFileId: 'another-row' }],
    ['a different writer rank', ['PCK_L', 'FLAP_L'], { writerSizeId: 57 }],
    [
      'a duplicate manifest block on another identity',
      ['PCK_L', 'FLAP_L'],
      { extraManifest: { identity: 'OTHER', block: nativeName, sizeToken: 'M', sizeId: 58 } },
    ],
    ['a missing writer replay', ['PCK_L', 'FLAP_L'], { withoutWriter: true }],
  ] as const)('rejects %s', async (_why, aliases, options) => {
    await expect(readCuts([...aliases], draft(options))).rejects.toThrow(failure);
  });
});
