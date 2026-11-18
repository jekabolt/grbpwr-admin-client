import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DxfProductSavedNativeReprocessResultV1 } from 'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1';
import type { PatternImportDxfPhaseESavedRowCardProjectionV1 } from './saved-row-production-runtime-v1';
import { prepareSavedFullAssemblyGenericFirstBootstrapV1 } from './saved-full-assembly-generic-first-bootstrap-v1';

// Exercise the complete bootstrap orchestration; authority/parser/catalog results are explicit
// test doubles. Genuine worker/native/compiler integration is covered by the sibling integration test.
const mocks = vi.hoisted(() => ({
  exactRun: vi.fn(),
  foreignRun: vi.fn(),
  exactDispose: vi.fn(),
  foreignDispose: vi.fn(),
  exactCancel: vi.fn(),
  foreignCancel: vi.fn(),
  exactHost: vi.fn(),
  foreignHost: vi.fn(),
  readSnapshot: vi.fn(),
  snapshot: vi.fn(),
  decoded: vi.fn(),
  catalog: vi.fn(),
  disposeReceipt: vi.fn(),
}));
vi.mock(
  'lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('lib/pattern-import/dxf-product-saved-native-reprocess-owner-v1')
    >()),
    createDxfProductSavedNativeReprocessOwnerV1: () => ({
      run: mocks.exactRun,
      dispose: mocks.exactDispose,
      cancel: mocks.exactCancel,
    }),
    createDxfProductSavedForeignNativeReprocessOwnerV1: () => ({
      run: mocks.foreignRun,
      dispose: mocks.foreignDispose,
      cancel: mocks.foreignCancel,
    }),
  }),
);
vi.mock('./saved-dxf-reprocess-host-v1', () => ({
  createPatternImportDxfPhaseESavedDxfReprocessHostV1: mocks.exactHost,
}));
vi.mock('./foreign-saved-dxf-reprocess-host-v1', () => ({
  createPatternImportDxfPhaseEForeignSavedDxfReprocessHostV1: mocks.foreignHost,
}));
vi.mock('./saved-full-assembly-snapshot-production-v1', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./saved-full-assembly-snapshot-production-v1')>()),
  readSavedFullAssemblySnapshotV1: mocks.readSnapshot,
  projectSavedFullAssemblySnapshotV1: mocks.snapshot,
  disposeSavedFullAssemblySnapshotV1: mocks.disposeReceipt,
}));
vi.mock('./composite-sidecar-v6', () => ({
  decodePatternImportDxfProductCompositeSidecarV6: mocks.decoded,
}));
vi.mock('./saved-assembly-snapshot-production-rpc-v1', () => ({
  createPatternImportDxfPhaseESavedAssemblySnapshotProductionRpcV1: () => ({
    bridge: { readAuthoritativeRow: vi.fn() },
  }),
}));
vi.mock('./saved-row-production-runtime-v1', () => ({
  createPatternImportDxfPhaseESavedRowCardProjectionResolverV1: () => vi.fn(),
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1', () => ({
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1: mocks.catalog,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  readPatternImportDxfProductCompositeComponentBytesV3: () =>
    new TextEncoder().encode(JSON.stringify({ persistence: { pattern: { version: 1 } } })),
}));
vi.mock('../phase-e-workbench-document-authority-v1', () => ({
  derivePatternImportDxfPhaseEDocumentAuthorityV1: async () => ({ ok: true, authority: {} }),
}));

const row = {
  techCardId: 156,
  scopeKey: 'main',
  patternLineKey: 'pattern',
  revision: 2,
  cardLockVersion: 3,
  url: '/canonical.dxf',
  sizeBytes: 400,
  sha256: 'a'.repeat(64),
};
const projection: PatternImportDxfPhaseESavedRowCardProjectionV1 = {
  card: {
    techCardId: row.techCardId,
    sizes: [],
    scopes: [],
    existingPieces: [],
    styleLabel: 'routing fixture',
    assembly: {
      ops: [
        {
          number: 150,
          work: 'join_lockstitch',
          inputKeys: ['a', 'b'],
          outputUnitKey: 'unit',
          outputUnitName: 'joined',
          seamKeys: ['seam'],
        },
      ],
      seams: [],
    },
  },
  cardLockVersion: row.cardLockVersion,
};
const draft = { scopes: [], dxfProvenance: { original: true } };
function success() {
  return {
    ok: true,
    row,
    sourceFileId: 'saved:pattern',
    draft,
    sourceOwner: { version: 'dxf-product-saved-native-compiler-source-owner/1' },
    nativeSewingReplay: { replayReady: true, pipeline: { native: true }, replay: { native: true } },
  };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSnapshot.mockResolvedValue({});
  mocks.exactRun.mockResolvedValue(success());
  mocks.foreignRun.mockResolvedValue(success());
  mocks.snapshot.mockReturnValue({
    row,
    serverAssemblyRevision: 'asm:revision',
    snapshotSha256: 'b'.repeat(64),
    outer: {
      status: 'present',
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
      currentRowBound: true,
      bytes: new Uint8Array([1]),
    },
    operations: [{ operationNumber: 150, seamKeys: ['seam'] }],
    operationsPayloadCanonicalJson: '[{"operationNumber":150,"seamKeys":["seam"]}]',
    seams: [{ seamKey: 'seam', anchoredSize: 'M' }],
  });
  mocks.decoded.mockResolvedValue({
    ok: true,
    document: { bindings: { row, serverAssemblyRevision: 'asm:revision' } },
    nestedCompositeV5: {
      nestedCompositeV4: {
        nestedCompositeV3: { owner: {} },
        exactNSeam: { restoreProjection: { seams: [] } },
      },
    },
  });
  mocks.catalog.mockResolvedValue({
    ok: true,
    catalog: {
      pieces: [],
      contours: [],
      sizeSelectionCanonicalSha256: 'c'.repeat(64),
      canonicalSha256: 'd'.repeat(64),
    },
  });
});
const prepare = (signal?: AbortSignal) =>
  prepareSavedFullAssemblyGenericFirstBootstrapV1(row, projection, signal, 'native-drawn-sewing');
const refused = (
  code: Extract<DxfProductSavedNativeReprocessResultV1, { ok: false }>['blockers'][number]['code'],
) => ({ ok: false, blockers: [{ code, detail: code }] });

describe('native first bootstrap manifest-aware owner routing', () => {
  it('refuses an unequal saved ratio before opening either native DXF owner', async () => {
    const snapshot = mocks.snapshot();
    mocks.snapshot.mockReturnValue({
      ...snapshot,
      operationsPayloadCanonicalJson:
        '[{"operationNumber":150,"seamKeys":["seam"],"stitching":{"fullnessRatio":{"value":"1.15"}}}]',
    });
    await expect(prepare()).rejects.toMatchObject({ code: 'unsupported-fullness-ratio' });
    expect(mocks.exactHost).not.toHaveBeenCalled();
    expect(mocks.foreignHost).not.toHaveBeenCalled();
    expect(mocks.disposeReceipt).toHaveBeenCalledOnce();
  });

  it('loads the selected operation from the current server when the local projection has no seam keys', async () => {
    const local = structuredClone(projection);
    local.card.assembly!.ops[0]!.seamKeys = [];
    const result = await prepareSavedFullAssemblyGenericFirstBootstrapV1(
      row,
      local,
      undefined,
      'native-drawn-sewing',
      150,
    );
    expect(mocks.readSnapshot).toHaveBeenCalledExactlyOnceWith(
      { row, seedOperationNumber: 150 },
      undefined,
    );
    expect(result.seedOperationNumber).toBe(150);
    expect(mocks.exactRun).toHaveBeenCalledOnce();
  });

  it('does not borrow a different saved operation when the selected operation has no seam', async () => {
    mocks.snapshot.mockReturnValue({
      ...mocks.snapshot(),
      operations: [
        { operationNumber: 150, seamKeys: ['seam'] },
        { operationNumber: 160, seamKeys: [] },
      ],
    });
    await expect(
      prepareSavedFullAssemblyGenericFirstBootstrapV1(
        row,
        projection,
        undefined,
        'native-drawn-sewing',
        160,
      ),
    ).rejects.toMatchObject({ code: 'genuine-stitch-required' });
    expect(mocks.readSnapshot).toHaveBeenCalledExactlyOnceWith(
      { row, seedOperationNumber: 160 },
      undefined,
    );
    expect(mocks.exactRun).not.toHaveBeenCalled();
  });

  it('uses exact saved native replay for canonical wizard output and keeps original source draft identity', async () => {
    const result = await prepare();
    expect(result.sourceRequest.draft).toBe(draft);
    expect(mocks.exactHost).toHaveBeenCalledWith(
      expect.objectContaining({ nativeSewingReplay: true }),
    );
    expect(mocks.exactRun).toHaveBeenCalledWith({
      schemaVersion: 'dxf-product-saved-reprocess-request/1',
      row,
    });
    expect(mocks.foreignHost).not.toHaveBeenCalled();
    expect(mocks.exactDispose).toHaveBeenCalledOnce();
  });
  it('opens foreign native replay only after typed manifest-absent refusal, disposing the exact owner first', async () => {
    mocks.exactRun.mockResolvedValue(refused('foreign-saved-dxf-detected'));
    const result = await prepare();
    expect(result.sourceRequest.draft).toBe(draft);
    expect(mocks.exactDispose.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.foreignHost.mock.invocationCallOrder[0],
    );
    expect(mocks.foreignHost).toHaveBeenCalledWith(
      expect.objectContaining({ nativeSewingReplay: true }),
    );
    expect(mocks.foreignRun).toHaveBeenCalledWith({
      schemaVersion: 'dxf-product-saved-foreign-reprocess-request/1',
      row,
    });
    expect(mocks.foreignDispose).toHaveBeenCalledOnce();
  });
  it.each([
    'saved-dxf-reprocess-failed',
    'saved-row-identity-mismatch',
    'saved-row-sha256-mismatch',
  ] as const)('does not fallback on %s', async (code) => {
    mocks.exactRun.mockResolvedValue({
      ok: false,
      blockers: [{ code, detail: 'invalid manifest or moved saved bytes' }],
    });
    await expect(prepare()).rejects.toMatchObject({ code: 'native-reprocess-blocked' });
    expect(mocks.foreignHost).not.toHaveBeenCalled();
    expect(mocks.exactDispose).toHaveBeenCalledOnce();
  });
  it('keeps the legacy default on its exact canonical lane', async () => {
    mocks.exactRun.mockResolvedValue(refused('foreign-saved-dxf-detected'));
    await expect(
      prepareSavedFullAssemblyGenericFirstBootstrapV1(row, projection),
    ).rejects.toMatchObject({ code: 'native-reprocess-blocked' });
    expect(mocks.foreignHost).not.toHaveBeenCalled();
    expect(mocks.exactHost.mock.calls[0][0]).not.toHaveProperty('nativeSewingReplay');
  });
  it('rejects successful replay with another row without fallback', async () => {
    mocks.exactRun.mockResolvedValue({ ...success(), row: { ...row, revision: 99 } });
    await expect(prepare()).rejects.toMatchObject({ code: 'native-source-invalid' });
    expect(mocks.foreignHost).not.toHaveBeenCalled();
  });
  it('does not start foreign replay after cancellation at exact classification', async () => {
    const controller = new AbortController();
    mocks.exactRun.mockImplementation(async () => {
      controller.abort();
      return refused('foreign-saved-dxf-detected');
    });
    await expect(prepare(controller.signal)).rejects.toMatchObject({ code: 'cancelled' });
    expect(mocks.exactCancel).toHaveBeenCalledOnce();
    expect(mocks.foreignHost).not.toHaveBeenCalled();
    expect(mocks.exactDispose).toHaveBeenCalledOnce();
    expect(mocks.disposeReceipt).toHaveBeenCalledOnce();
  });
});
