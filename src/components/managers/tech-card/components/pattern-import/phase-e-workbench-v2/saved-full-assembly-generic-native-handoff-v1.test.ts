import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectPhysical: vi.fn(),
  createSnapshot: vi.fn(),
  createResolver: vi.fn(),
  createHost: vi.fn(),
  createNativeOwner: vi.fn(),
  run: vi.fn(),
  cancel: vi.fn(),
  disposeOwner: vi.fn(),
  disposeHost: vi.fn(),
}));

vi.mock('./saved-full-assembly-physical-snapshot-production-v1', () => ({
  projectSavedFullAssemblyPhysicalSnapshotV1: mocks.projectPhysical,
}));
vi.mock('./saved-assembly-snapshot-production-rpc-v1', () => ({
  createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1: mocks.createSnapshot,
}));
vi.mock('./saved-row-production-runtime-v1', () => ({
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1: mocks.createResolver,
}));
vi.mock('./saved-dxf-reprocess-host-v1', () => ({
  createPatternImportDxfPhaseESavedDxfReprocessHostV1: mocks.createHost,
}));
vi.mock('lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1', () => ({
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_OWNER_V1:
    'dxf-product-saved-native-compiler-source-owner/1',
  DXF_PRODUCT_SAVED_NATIVE_COMPILER_SOURCE_REQUEST_V1:
    'dxf-product-saved-native-compiler-source-request/1',
  createDxfProductSavedNativeReprocessOwnerV1: mocks.createNativeOwner,
}));
vi.mock('lib/pattern-import/dxf-product-saved-reprocess-owner-v1', () => ({
  DXF_PRODUCT_SAVED_REPROCESS_REQUEST_V1: 'dxf-product-saved-reprocess-request/1',
}));

import {
  SAVED_FULL_ASSEMBLY_GENERIC_NATIVE_FIRST_AUTHORING_REQUIREMENTS_V1,
  SavedFullAssemblyGenericNativeHandoffErrorV1,
  prepareSavedFullAssemblyGenericNativeHandoffV1,
} from './saved-full-assembly-generic-native-handoff-v1';

const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern-main',
  revision: 4,
  cardLockVersion: 8,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 1234,
  sha256: 'a'.repeat(64),
});
const sourceOwner = Object.freeze({
  version: 'dxf-product-saved-native-compiler-source-owner/1',
  opaque: 'module-private-weak-owner',
});

function physical(pieceCount = 3, operationCount = 1) {
  const pieceIds = Array.from({ length: pieceCount }, (_, index) => `piece-${index + 1}`);
  return Object.freeze({
    row,
    serverAssemblyRevision: 'asm:v1:revision',
    freshSnapshotSha256: 'b'.repeat(64),
    outer: Object.freeze({ sha256: 'c'.repeat(64) }),
    graphCanonicalSha256: 'd'.repeat(64),
    compileInputSha256: 'e'.repeat(64),
    graph: Object.freeze({
      pieces: Object.freeze(pieceIds.map((pieceId) => Object.freeze({ pieceId }))),
      operations: Object.freeze(
        operationCount
          ? [
              Object.freeze({
                kind: 'stitch',
                sourceOperationNumber: 10,
                seamIds: Object.freeze(['seam-1']),
              }),
            ]
          : [],
      ),
    }),
    physicalInitialization: Object.freeze({
      placements: Object.freeze(
        pieceIds.map((pieceId) => Object.freeze({ pieceId, translationM: [0, 0, 0] })),
      ),
    }),
    physicalInitializationCanonicalSha256: 'f'.repeat(64),
  });
}

function draft(pieceCount = 3) {
  return {
    scopes: [
      {
        target: { scopeKey: 'main' },
        writerReplay: {
          job: {
            pieces: Array.from({ length: pieceCount }, (_, index) => ({
              identity: `piece-${index + 1}`,
            })),
          },
        },
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  const projection = physical();
  const replayDraft = draft();
  mocks.projectPhysical.mockReturnValue(projection);
  mocks.createSnapshot.mockReturnValue({ bridge: { readAuthoritativeRow: vi.fn() } });
  mocks.createResolver.mockReturnValue(vi.fn());
  mocks.createHost.mockReturnValue({ dispose: mocks.disposeHost });
  mocks.disposeOwner.mockImplementation(() => mocks.disposeHost());
  mocks.createNativeOwner.mockReturnValue({
    run: mocks.run,
    cancel: mocks.cancel,
    dispose: mocks.disposeOwner,
  });
  mocks.run.mockResolvedValue({
    ok: true,
    row,
    sourceFileId: 'saved:156:main:pattern-main',
    draft: replayDraft,
    sourceOwner,
    blockers: [],
  });
});

describe('saved Full Assembly generic native handoff', () => {
  it('uses the existing production host/native owner and preserves the original replay draft identity', async () => {
    const receipt = {};
    const projection = { card: { techCardId: 156 }, cardLockVersion: 8 };
    const handoff = await prepareSavedFullAssemblyGenericNativeHandoffV1(
      receipt as never,
      projection as never,
    );
    const replay = await mocks.run.mock.results[0].value;

    expect(mocks.createSnapshot).toHaveBeenCalledWith(10);
    expect(mocks.createResolver).toHaveBeenCalledWith(projection);
    expect(mocks.createHost).toHaveBeenCalledWith({
      resolveCard: mocks.createResolver.mock.results[0].value,
      readAuthoritativeRow: mocks.createSnapshot.mock.results[0].value.bridge.readAuthoritativeRow,
    });
    expect(mocks.createNativeOwner).toHaveBeenCalledWith(mocks.createHost.mock.results[0].value);
    expect(mocks.run).toHaveBeenCalledWith({
      schemaVersion: 'dxf-product-saved-reprocess-request/1',
      row,
    });
    expect(handoff.sourceOwner).toBe(replay.sourceOwner);
    expect(handoff.sourceRequest.draft).toBe(replay.draft);
    expect(handoff.sourceRequest).toMatchObject({
      schemaVersion: 'dxf-product-saved-native-compiler-source-request/1',
      sourceFileId: replay.sourceFileId,
      sourceSha256: row.sha256,
      techCardId: row.techCardId,
      scopeKey: row.scopeKey,
      patternLineKey: row.patternLineKey,
      cardLockVersion: row.cardLockVersion,
    });
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff.sourceRequest)).toBe(true);
    expect(Object.isFrozen(prepareSavedFullAssemblyGenericNativeHandoffV1)).toBe(true);
    expect(mocks.projectPhysical).toHaveBeenCalledTimes(2);
    expect(mocks.disposeOwner).toHaveBeenCalledTimes(1);
    expect(mocks.disposeHost).toHaveBeenCalledTimes(1);
  });

  it('admits exact N2 only through the same verified physical/native lane', async () => {
    mocks.projectPhysical.mockReturnValue(physical(2));
    mocks.run.mockResolvedValueOnce({
      ok: true,
      row,
      sourceFileId: 'saved:156:main:pattern-main',
      draft: draft(2),
      sourceOwner,
      blockers: [],
    });

    const handoff = await prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never);
    expect(handoff.sourceOwner).toBe(sourceOwner);
    expect(handoff.sourceRequest.draft.scopes[0].writerReplay?.job.pieces).toHaveLength(2);
    expect(mocks.createNativeOwner).toHaveBeenCalledTimes(1);
    expect(SAVED_FULL_ASSEMBLY_GENERIC_NATIVE_FIRST_AUTHORING_REQUIREMENTS_V1).toMatchObject({
      verifiedPhysicalSnapshotRequired: true,
      minimumExactPieceCount: 2,
    });
  });

  it.each([0, 1])('rejects %i-piece input before downloader or worker creation', async (count) => {
    mocks.projectPhysical.mockReturnValue(physical(count));

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'generic-fullgraph-required' });
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.createHost).not.toHaveBeenCalled();
    expect(mocks.createNativeOwner).not.toHaveBeenCalled();
  });

  it('rejects a zero-operation receipt before any non-native source could be promoted', async () => {
    mocks.projectPhysical.mockReturnValue(physical(3, 0));

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'genuine-stitch-required' });
    expect(mocks.createHost).not.toHaveBeenCalled();
    expect(mocks.createNativeOwner).not.toHaveBeenCalled();
  });

  it('requires explicit metre placement coverage and never promotes a V6 visual arrangement', async () => {
    const projection = physical();
    mocks.projectPhysical.mockReturnValue({
      ...projection,
      physicalInitialization: { placements: projection.physicalInitialization.placements.slice(1) },
    });

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'explicit-physical-placement-required' });
    expect(SAVED_FULL_ASSEMBLY_GENERIC_NATIVE_FIRST_AUTHORING_REQUIREMENTS_V1).toMatchObject({
      explicitMetrePlacementsRequired: true,
      physicalInitializationRequired: true,
      v6VisualArrangementAutoPromotion: false,
    });
    expect(mocks.createHost).not.toHaveBeenCalled();
  });

  it('rejects a native replay with fewer than two genuine writer pieces', async () => {
    mocks.run.mockResolvedValueOnce({
      ok: true,
      row,
      sourceFileId: 'saved:156:main:pattern-main',
      draft: draft(1),
      sourceOwner: Object.freeze({
        version: 'dxf-product-saved-native-compiler-source-owner/1',
        opaque: 'module-private-weak-owner',
      }),
      blockers: [],
    });

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toBeInstanceOf(SavedFullAssemblyGenericNativeHandoffErrorV1);
    expect(mocks.createNativeOwner).toHaveBeenCalledTimes(1);
    expect(mocks.disposeOwner).toHaveBeenCalledTimes(1);
    expect(mocks.disposeHost).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to the zero-operation non-native or foreign replay path', async () => {
    mocks.run.mockResolvedValueOnce({
      ok: false,
      blockers: [
        {
          code: 'foreign-saved-dxf-detected',
          detail: 'Only the separate zero-operation lane may classify a foreign saved DXF.',
        },
      ],
    });

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'native-reprocess-blocked' });
    expect(mocks.createNativeOwner).toHaveBeenCalledTimes(1);
    expect(mocks.run).toHaveBeenCalledTimes(1);
    expect(mocks.disposeOwner).toHaveBeenCalledTimes(1);
  });

  it('fails a forged physical receipt before constructing any transport capability', async () => {
    mocks.projectPhysical.mockImplementationOnce(() => {
      throw new Error('forged receipt');
    });

    await expect(
      prepareSavedFullAssemblyGenericNativeHandoffV1({} as never, {} as never),
    ).rejects.toMatchObject({ code: 'verified-physical-snapshot-required' });
    expect(mocks.createSnapshot).not.toHaveBeenCalled();
    expect(mocks.createHost).not.toHaveBeenCalled();
  });
});
