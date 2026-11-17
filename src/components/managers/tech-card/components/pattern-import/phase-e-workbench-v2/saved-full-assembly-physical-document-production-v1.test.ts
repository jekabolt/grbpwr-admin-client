import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectHost: vi.fn(),
  isCurrentHostContext: vi.fn(),
  readSnapshot: vi.fn(),
  projectSnapshot: vi.fn(),
  disposeSnapshot: vi.fn(),
  encodeInitialization: vi.fn(),
  buildComponent: vi.fn(),
  encodeComponent: vi.fn(),
  projectAoSnapshot: vi.fn(),
  buildV7: vi.fn(),
  encodeV7: vi.fn(),
  decodeV7: vi.fn(),
  readV7Component: vi.fn(),
  verifyV7: vi.fn(),
  isAuthorityReceipt: vi.fn(),
  disposeAuthorityReceipt: vi.fn(),
  createStorage: vi.fn(),
  persist: vi.fn(),
}));

vi.mock('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1', () => ({
  projectSavedGenericObservedPhysicalHostPersistenceContextV1: mocks.projectHost,
  isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1: mocks.isCurrentHostContext,
}));
vi.mock('lib/cloth/domain/dxf-garment-physical-initialization-v1', () => ({
  encodeDxfGarmentPhysicalInitializationV1: mocks.encodeInitialization,
}));
vi.mock('./saved-full-assembly-snapshot-production-v1', () => ({
  readSavedFullAssemblySnapshotV1: mocks.readSnapshot,
  projectSavedFullAssemblySnapshotV1: mocks.projectSnapshot,
  disposeSavedFullAssemblySnapshotV1: mocks.disposeSnapshot,
}));
vi.mock('./saved-full-assembly-physical-component-v1', () => ({
  buildSavedFullAssemblyPhysicalComponentV1: mocks.buildComponent,
  encodeSavedFullAssemblyPhysicalComponentV1: mocks.encodeComponent,
  projectSavedFullAssemblyAoOnlySnapshotV1: mocks.projectAoSnapshot,
}));
vi.mock('./composite-sidecar-persistence-v7', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7:
    'pattern-import-dxf-product-composite-sidecar-storage-request/7',
  createPatternImportDxfProductCompositeSidecarProductionStorageAdapterV7: mocks.createStorage,
}));
vi.mock('./composite-sidecar-v6', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
}));
vi.mock('./composite-sidecar-v7', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V7:
    'pattern-import-dxf-product-composite-sidecar-request/7',
  buildPatternImportDxfProductCompositeSidecarV7: mocks.buildV7,
  encodePatternImportDxfProductCompositeSidecarV7: mocks.encodeV7,
  decodePatternImportDxfProductCompositeSidecarV7: mocks.decodeV7,
  readPatternImportDxfProductCompositeComponentBytesV7: mocks.readV7Component,
  verifyPatternImportDxfProductCompositeSidecarV7PhysicalAuthority: mocks.verifyV7,
  isSavedFullAssemblyPhysicalAuthorityReceiptV1: mocks.isAuthorityReceipt,
  disposeSavedFullAssemblyPhysicalAuthorityReceiptV1: mocks.disposeAuthorityReceipt,
}));

import { persistCurrentSavedGenericObservedPhysicalHostV1 } from './saved-full-assembly-physical-document-production-v1';

const row = Object.freeze({
  techCardId: 156,
  scopeKey: 'MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 13,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 1234,
  sha256: 'a'.repeat(64),
});

function context() {
  return {
    schemaVersion: 'saved-generic-observed-physical-host-persistence-context/1',
    sourceGeneration: 4,
    graph: {
      schemaVersion: 'dxf-exact-assembly-graph/1',
      profile: 'single-saved-row-size-adjacent-native-stitch',
      row,
      serverAssemblyRevision: 'asm:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:13',
      source: {},
      pieces: [],
      // The current AO selection may be operation 10 (fuse), but the graph itself starts at the
      // genuine stitch 20 and therefore owns the only legal storage transport anchor.
      operations: [
        {
          clientOperationId: 'stitch-20',
          sourceOperationNumber: 20,
          inputKeys: ['front', 'back'],
          outputUnitKey: 'body',
          stage: 0,
          order: 0,
          kind: 'stitch',
          seamIds: ['graph-seam-20'],
        },
      ],
      seams: [
        {
          id: 'graph-seam-20',
          sourceSeamKey: 'saved-seam-20',
          clientOperationId: 'stitch-20',
        },
      ],
      compile: {},
    },
    graphCanonicalSha256: 'b'.repeat(64),
    compileInputSha256: 'c'.repeat(64),
    physicalInitialization: {
      document: { schemaVersion: 'dxf-garment-physical-initialization/1' },
      canonicalSha256: 'd'.repeat(64),
    },
    assemblySnapshot: {
      row,
      serverAssemblyRevision: 'asm:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:13',
      operations: [],
      seams: [],
    },
    readEvidence: { fullAssemblySnapshotSha256: 'e'.repeat(64) },
    claims: {},
  };
}

function freshSnapshot(
  snapshotSha256 = 'e'.repeat(64),
  outer: Record<string, unknown> = {
    status: 'present',
    mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
    sha256: '1'.repeat(64),
    byteLength: 3,
    bytes: new Uint8Array([6, 6, 6]),
    persistedCardLockVersion: 13,
    persistedSavedRowRevision: 7,
    currentRowBound: true,
  },
) {
  return {
    row,
    serverAssemblyRevision: 'asm:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:13',
    operations: [
      {
        operationNumber: 10,
        work: 'fuse_interlining',
        inputKeys: ['front'],
        outputUnitKey: 'front-fused',
        outputUnitName: 'Front fused',
        seamKeys: [],
      },
      {
        operationNumber: 20,
        work: 'join_lockstitch',
        inputKeys: ['front', 'back'],
        outputUnitKey: 'body',
        outputUnitName: 'Body',
        seamKeys: ['saved-seam-20'],
      },
    ],
    seams: [],
    operationsPayloadCanonicalJson: '[]',
    selectedTopologyReceipts: [
      {
        sourceOperationNumber: 20,
        sha256: 'f'.repeat(64),
        canonicalJson: '{}',
      },
    ],
    outer,
    snapshotSha256,
    rpcReadCount: 3,
    claims: {},
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.isCurrentHostContext.mockReturnValue(true);
  mocks.createStorage.mockReturnValue({ persist: mocks.persist });
  mocks.readSnapshot.mockResolvedValue({ receipt: 'genuine' });
  mocks.projectSnapshot.mockReturnValueOnce(freshSnapshot()).mockReturnValueOnce(
    freshSnapshot('2'.repeat(64), {
      status: 'present',
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
      sha256: '3'.repeat(64),
      byteLength: 3,
      bytes: new Uint8Array([7, 7, 7]),
      persistedCardLockVersion: 13,
      persistedSavedRowRevision: 7,
      currentRowBound: true,
    }),
  );
  mocks.encodeInitialization.mockResolvedValue({
    canonicalSha256: 'd'.repeat(64),
    bytes: new Uint8Array([1, 2, 3]),
  });
  mocks.buildComponent.mockResolvedValue({
    ok: true,
    owner: { component: 'owner' },
    blockers: [],
  });
  mocks.encodeComponent.mockReturnValue({ ok: true, bytes: new Uint8Array([4, 4, 4]) });
  mocks.projectAoSnapshot.mockImplementation((snapshot) => ({
    row: snapshot.row,
    serverAssemblyRevision: snapshot.serverAssemblyRevision,
    operations: snapshot.operations,
    seams: snapshot.seams,
  }));
  mocks.buildV7.mockResolvedValue({
    ok: true,
    owner: { outer: 'owner' },
    document: { bindings: { assemblyTopologySha256: 'f'.repeat(64) } },
    blockers: [],
  });
  mocks.encodeV7.mockReturnValue({
    ok: true,
    bytes: new Uint8Array([7, 7, 7]),
    canonicalSha256: '3'.repeat(64),
    canonicalByteLength: 3,
  });
  mocks.persist.mockResolvedValue({
    ok: true,
    writeOutcome: 'verified',
    receipt: {},
    blockers: [],
  });
  mocks.decodeV7.mockResolvedValue({ ok: true, owner: { readback: 'owner' }, blockers: [] });
  const authorityReceipt = { authority: 'genuine' };
  mocks.verifyV7.mockResolvedValue({ ok: true, receipt: authorityReceipt, blocker: null });
  mocks.isAuthorityReceipt.mockImplementation((candidate) => candidate === authorityReceipt);
});

describe('saved full-assembly physical document production consumer', () => {
  it('rejects an invalid generation before projecting or reading authority', async () => {
    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 0);
    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'invalid-generation' }],
    });
    expect(mocks.projectHost).not.toHaveBeenCalled();
    expect(mocks.readSnapshot).not.toHaveBeenCalled();
  });

  it('derives the seed from the first graph stitch, never from the selected fuse operation', async () => {
    const projected = context();
    const host = {};
    mocks.projectHost.mockResolvedValue({ ok: true, context: projected });
    const result = await persistCurrentSavedGenericObservedPhysicalHostV1(host, 4);
    expect(mocks.readSnapshot).toHaveBeenCalledWith(
      { row, seedOperationNumber: 20 },
      expect.any(AbortSignal),
    );
    expect(mocks.disposeSnapshot).toHaveBeenCalledTimes(2);
    expect(mocks.encodeInitialization).toHaveBeenCalledWith(
      {
        document: projected.physicalInitialization.document,
        graph: projected.graph,
        assemblySnapshot: {
          row,
          serverAssemblyRevision: projected.graph.serverAssemblyRevision,
          operations: freshSnapshot().operations,
          seams: [],
        },
      },
      expect.any(AbortSignal),
    );
    expect(mocks.buildComponent).toHaveBeenCalledWith(
      expect.objectContaining({
        bindings: { row, serverAssemblyRevision: projected.graph.serverAssemblyRevision },
        graph: projected.graph,
        graphCanonicalSha256: projected.graphCanonicalSha256,
        compileInputSha256: projected.compileInputSha256,
      }),
      expect.any(AbortSignal),
    );
    expect(mocks.buildV7).toHaveBeenCalledWith(
      expect.objectContaining({
        bindings: {
          row,
          serverAssemblyRevision: projected.graph.serverAssemblyRevision,
          assemblyTopologySha256: 'f'.repeat(64),
        },
      }),
    );
    expect(mocks.persist).toHaveBeenCalledWith(
      expect.objectContaining({
        transportAnchor: {
          sourceOperationNumber: 20,
          serverTopologySha256: 'f'.repeat(64),
        },
      }),
      expect.any(AbortSignal),
    );
    expect(mocks.createStorage).toHaveBeenCalledWith(host, projected);
    expect(mocks.verifyV7).toHaveBeenCalledWith({ readback: 'owner' }, { receipt: 'genuine' });
    expect(mocks.disposeAuthorityReceipt).toHaveBeenCalledWith({ authority: 'genuine' });
    expect(mocks.isCurrentHostContext).toHaveBeenCalledWith(
      host,
      projected,
      expect.any(AbortSignal),
    );
    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
  });

  it('fails before physical encoding when the fresh full snapshot digest moved', async () => {
    mocks.projectHost.mockResolvedValue({ ok: true, context: context() });
    mocks.projectSnapshot.mockReset().mockReturnValue(freshSnapshot('9'.repeat(64)));
    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 4);
    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
      blockers: [{ code: 'fresh-assembly-drift' }],
    });
    expect(mocks.disposeSnapshot).toHaveBeenCalledTimes(1);
    expect(mocks.encodeInitialization).not.toHaveBeenCalled();
    expect(mocks.buildComponent).not.toHaveBeenCalled();
  });

  it('reissues current V7 around the exact nested V6 instead of nesting V7 recursively', async () => {
    const projected = context();
    const currentV7Bytes = new Uint8Array([7, 0, 7]);
    const nestedV6Bytes = new Uint8Array([6, 0, 6]);
    const currentOwner = { current: 'v7' };
    mocks.projectHost.mockResolvedValue({ ok: true, context: projected });
    mocks.projectSnapshot
      .mockReset()
      .mockReturnValueOnce(
        freshSnapshot('e'.repeat(64), {
          status: 'present',
          mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
          sha256: '8'.repeat(64),
          byteLength: currentV7Bytes.byteLength,
          bytes: currentV7Bytes,
          persistedCardLockVersion: 13,
          persistedSavedRowRevision: 7,
          currentRowBound: true,
        }),
      )
      .mockReturnValueOnce(
        freshSnapshot('2'.repeat(64), {
          status: 'present',
          mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
          sha256: '3'.repeat(64),
          byteLength: 3,
          bytes: new Uint8Array([7, 7, 7]),
          persistedCardLockVersion: 13,
          persistedSavedRowRevision: 7,
          currentRowBound: true,
        }),
      );
    mocks.decodeV7.mockImplementation(async (bytes) =>
      bytes === currentV7Bytes
        ? { ok: true, owner: currentOwner, blockers: [] }
        : { ok: true, owner: { readback: 'owner' }, blockers: [] },
    );
    mocks.readV7Component.mockReturnValue(nestedV6Bytes);
    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 4);
    expect(result.ok).toBe(true);
    expect(mocks.readV7Component).toHaveBeenCalledWith(currentOwner, 'composite-v6');
    expect(mocks.buildV7).toHaveBeenCalledWith(
      expect.objectContaining({ compositeV6Bytes: nestedV6Bytes }),
    );
  });

  it('fails closed before every fixed read for an unrecognized host', async () => {
    mocks.projectHost.mockResolvedValue({
      ok: false,
      code: 'unrecognized-host',
      detail: 'A genuine host is required.',
    });
    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 4);
    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'unrecognized-host' }] });
    expect(mocks.readSnapshot).not.toHaveBeenCalled();
  });

  it('never reports success when the genuine host changes while PUT is in flight', async () => {
    mocks.projectHost.mockResolvedValue({ ok: true, context: context() });
    let current = true;
    mocks.isCurrentHostContext.mockImplementation(() => current);
    mocks.persist.mockImplementation(async () => {
      current = false;
      return { ok: true, writeOutcome: 'verified', receipt: {}, blockers: [] };
    });

    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 4);

    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(mocks.verifyV7).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: false,
      writeOutcome: 'acknowledged-unverified',
      blockers: [{ code: 'host-context-drift' }],
    });
  });

  it.each([
    { ok: true, writeOutcome: 'verified', expected: 'acknowledged-unverified' },
    { ok: false, writeOutcome: 'unknown', expected: 'unknown' },
  ])('preserves $expected when cancelled after storage returns', async (stored) => {
    const controller = new AbortController();
    mocks.projectHost.mockResolvedValue({ ok: true, context: context() });
    mocks.persist.mockImplementation(async () => {
      controller.abort();
      return { ...stored, receipt: {}, blockers: [] };
    });

    const result = await persistCurrentSavedGenericObservedPhysicalHostV1({}, 4, controller.signal);

    expect(mocks.persist).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: false, writeOutcome: stored.expected });
    expect(mocks.verifyV7).not.toHaveBeenCalled();
  });
});
