import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWriter: vi.fn(),
  persist: vi.fn(),
  encodeV7: vi.fn(),
  decodeV7: vi.fn(),
  decodeV6: vi.fn(),
  readV7Component: vi.fn(),
  readV6Component: vi.fn(),
  readV3Component: vi.fn(),
  isCurrentHostContext: vi.fn(),
  strategy: null as Record<string, unknown> | null,
}));

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('components/cloth-simulation-spike/saved-generic-observed-physical-host-v1', () => ({
  isCurrentSavedGenericObservedPhysicalHostPersistenceContextV1: mocks.isCurrentHostContext,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3', () => ({
  createPatternImportDxfProductCompositeSidecarStorageWriterV3: mocks.createWriter,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  readPatternImportDxfProductCompositeComponentBytesV3: mocks.readV3Component,
}));
vi.mock('./composite-sidecar-v6', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
  decodePatternImportDxfProductCompositeSidecarV6: mocks.decodeV6,
  readPatternImportDxfProductCompositeComponentBytesV6: mocks.readV6Component,
}));
vi.mock('./composite-sidecar-v7', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V7:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
  encodePatternImportDxfProductCompositeSidecarV7: mocks.encodeV7,
  decodePatternImportDxfProductCompositeSidecarV7: mocks.decodeV7,
  readPatternImportDxfProductCompositeComponentBytesV7: mocks.readV7Component,
}));

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
  createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7,
  createPatternImportDxfProductCompositeSidecarStorageAdapterV7,
} from './composite-sidecar-persistence-v7';

const row = {
  techCardId: 156,
  scopeKey: 'MAIN',
  patternLineKey: 'pattern-main',
  revision: 7,
  cardLockVersion: 13,
  url: 'https://example.invalid/pattern.dxf',
  sizeBytes: 1234,
  sha256: 'a'.repeat(64),
};
const authority = {
  row,
  serverAssemblyRevision: 'asm:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:13',
  assemblyTopologySha256: 'b'.repeat(64),
};
const semanticBytes = new TextEncoder().encode(
  JSON.stringify({
    persistence: {
      pattern: { version: 11 },
      receiptSealSha256: 'c'.repeat(64),
    },
  }),
);

async function digest(bytes: Uint8Array) {
  const hash = await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('');
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.strategy = null;
  mocks.createWriter.mockImplementation((_deps, strategy) => {
    mocks.strategy = strategy;
    return { persist: mocks.persist, claims: {} };
  });
  mocks.encodeV7.mockReturnValue({
    ok: true,
    bytes: new Uint8Array([7, 1, 7]),
    canonicalSha256: 'd'.repeat(64),
    canonicalByteLength: 3,
  });
  mocks.readV3Component.mockReturnValue(semanticBytes);
  mocks.isCurrentHostContext.mockReturnValue(true);
});

describe('Composite V7 storage strategy', () => {
  it('reuses the single StorageWriterV3 and replaces only physical V7 around exact nested V6', async () => {
    const currentBytes = new Uint8Array([9, 9, 9]);
    const nestedV6 = new Uint8Array([6, 6, 6]);
    const currentOwner = { id: 'current-v7' };
    const nextOwner = { id: 'next-v7' };
    mocks.decodeV7.mockImplementation(async (bytes: Uint8Array) =>
      bytes === currentBytes
        ? { ok: true, owner: currentOwner, blockers: [] }
        : {
            ok: true,
            owner: nextOwner,
            document: {
              bindings: authority,
              writeCas: { expectedPreviousSidecarSha256: await digest(currentBytes) },
            },
            nestedCompositeV6: {
              nestedCompositeV5: {
                nestedCompositeV4: { nestedCompositeV3: { owner: { id: 'v3' } } },
              },
            },
            blockers: [],
          },
    );
    mocks.readV7Component.mockImplementation((owner) =>
      owner === currentOwner || owner === nextOwner ? nestedV6.slice() : null,
    );
    const host = {};
    const context = { sourceGeneration: 4 };
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
      {
        createClient: vi.fn(),
        crypto,
      },
      host,
      context as never,
    );
    expect(mocks.createWriter).toHaveBeenCalledTimes(1);
    const prepare = mocks.strategy?.prepare as (
      request: unknown,
      current: unknown,
      crypto: Crypto,
    ) => Promise<Record<string, unknown>>;
    const currentSha = await digest(currentBytes);
    const planned = await prepare(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
        transitionIntent: 'physical',
        currentAuthority: authority,
        transportAnchor: {
          sourceOperationNumber: 20,
          serverTopologySha256: authority.assemblyTopologySha256,
        },
        nextOwner,
      },
      {
        status: 'present',
        source: 'verified-get',
        mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
        sha256: currentSha,
        byteLength: currentBytes.byteLength,
        bytes: currentBytes,
      },
      crypto,
    );
    expect(planned).toMatchObject({
      previousSidecarSha256: currentSha,
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
      transport: {
        patternVersion: 11,
        postSaveReceiptSha256: 'c'.repeat(64),
        selectedOperationNumber: 20,
      },
    });
    expect(mocks.readV7Component).toHaveBeenCalledWith(currentOwner, 'composite-v6');
    expect(mocks.readV7Component).toHaveBeenCalledWith(nextOwner, 'composite-v6');
    const beforeRequest = mocks.strategy?.beforeRequest as (
      request: unknown,
      planned: unknown,
      signal: AbortSignal,
    ) => Promise<void>;
    const controller = new AbortController();
    await beforeRequest({ transitionIntent: 'physical' }, planned, controller.signal);
    expect(mocks.isCurrentHostContext).toHaveBeenCalledWith(host, context, controller.signal);
  });

  it('rejects a V7 reissue that changes the exact nested V6 bytes', async () => {
    const currentBytes = new Uint8Array([9, 9, 8]);
    const currentSha = await digest(currentBytes);
    const currentOwner = { id: 'current-v7' };
    const nextOwner = { id: 'next-v7' };
    mocks.decodeV7.mockImplementation(async (bytes: Uint8Array) =>
      bytes === currentBytes
        ? { ok: true, owner: currentOwner, blockers: [] }
        : {
            ok: true,
            owner: nextOwner,
            document: {
              bindings: authority,
              writeCas: { expectedPreviousSidecarSha256: currentSha },
            },
            nestedCompositeV6: {
              nestedCompositeV5: {
                nestedCompositeV4: { nestedCompositeV3: { owner: { id: 'v3' } } },
              },
            },
            blockers: [],
          },
    );
    mocks.readV7Component.mockImplementation((owner) =>
      owner === currentOwner ? new Uint8Array([6]) : new Uint8Array([5]),
    );
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
      {
        createClient: vi.fn(),
        crypto,
      },
      {},
      { sourceGeneration: 4 } as never,
    );
    const prepare = mocks.strategy?.prepare as (
      request: unknown,
      current: unknown,
      crypto: Crypto,
    ) => Promise<unknown>;
    await expect(
      prepare(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
          transitionIntent: 'physical',
          currentAuthority: authority,
          transportAnchor: {
            sourceOperationNumber: 20,
            serverTopologySha256: authority.assemblyTopologySha256,
          },
          nextOwner,
        },
        {
          status: 'present',
          source: 'verified-get',
          mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
          sha256: currentSha,
          byteLength: currentBytes.byteLength,
          bytes: currentBytes,
        },
        crypto,
      ),
    ).rejects.toThrow('Exact nested Composite V6 bytes changed');
  });

  it('fails the separate pre-PUT phase when the genuine host context is no longer current', async () => {
    const host = {};
    const context = { sourceGeneration: 4 };
    mocks.isCurrentHostContext.mockReturnValue(false);
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
      { createClient: vi.fn(), crypto },
      host,
      context as never,
    );
    const beforeRequest = mocks.strategy?.beforeRequest as (
      request: unknown,
      planned: unknown,
      signal: AbortSignal,
    ) => Promise<void>;
    const controller = new AbortController();

    await expect(
      beforeRequest({ transitionIntent: 'physical' }, {}, controller.signal),
    ).rejects.toThrow('genuine physical host changed');
    expect(mocks.isCurrentHostContext).toHaveBeenCalledWith(host, context, controller.signal);
  });

  it('allows only presentation arrangement under V7 while preserving exact V5 and physical bytes', async () => {
    const currentBytes = new Uint8Array([9, 7, 1]);
    const currentSha = await digest(currentBytes);
    const currentOwner = { id: 'current-v7' };
    const nextOwner = { id: 'next-v7' };
    const currentV6Owner = { id: 'current-v6' };
    const nextV6Owner = { id: 'next-v6' };
    const currentV6 = new Uint8Array([6, 1]);
    const nextV6 = new Uint8Array([6, 2]);
    const physical = new Uint8Array([4, 4]);
    const nestedV5 = new Uint8Array([5, 5]);
    mocks.decodeV7.mockImplementation(async (bytes: Uint8Array) =>
      bytes === currentBytes
        ? { ok: true, owner: currentOwner, blockers: [] }
        : {
            ok: true,
            owner: nextOwner,
            document: {
              bindings: authority,
              writeCas: { expectedPreviousSidecarSha256: currentSha },
            },
            nestedCompositeV6: {
              nestedCompositeV5: {
                nestedCompositeV4: { nestedCompositeV3: { owner: { id: 'v3' } } },
              },
            },
            blockers: [],
          },
    );
    mocks.readV7Component.mockImplementation((owner, kind) => {
      if (kind === 'composite-v6') return owner === currentOwner ? currentV6 : nextV6;
      return physical.slice();
    });
    mocks.decodeV6.mockImplementation(async (bytes: Uint8Array) => ({
      ok: true,
      owner: bytes === currentV6 ? currentV6Owner : nextV6Owner,
      blockers: [],
    }));
    mocks.readV6Component.mockImplementation((_owner, kind) =>
      kind === 'composite-v5' ? nestedV5.slice() : new Uint8Array([8]),
    );
    createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7({
      createClient: vi.fn(),
      crypto,
    });
    const prepare = mocks.strategy?.prepare as (
      request: unknown,
      current: unknown,
      crypto: Crypto,
    ) => Promise<Record<string, unknown>>;
    await expect(
      prepare(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
          transitionIntent: 'arrangement',
          currentAuthority: authority,
          transportAnchor: {
            sourceOperationNumber: 20,
            serverTopologySha256: authority.assemblyTopologySha256,
          },
          nextOwner,
        },
        {
          status: 'present',
          source: 'verified-get',
          mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
          sha256: currentSha,
          byteLength: currentBytes.byteLength,
          bytes: currentBytes,
        },
        crypto,
      ),
    ).resolves.toMatchObject({ previousSidecarSha256: currentSha });
    const beforeRequest = mocks.strategy?.beforeRequest as (
      request: unknown,
      planned: unknown,
      signal: AbortSignal,
    ) => Promise<void>;
    await beforeRequest({ transitionIntent: 'arrangement' }, {}, new AbortController().signal);
    expect(mocks.isCurrentHostContext).not.toHaveBeenCalled();
  });

  it('rejects physical or nested V5 drift in the presentation arrangement lane', async () => {
    const currentBytes = new Uint8Array([9, 7, 2]);
    const currentSha = await digest(currentBytes);
    const currentOwner = { id: 'current-v7' };
    const nextOwner = { id: 'next-v7' };
    const currentV6 = new Uint8Array([6, 1]);
    const nextV6 = new Uint8Array([6, 2]);
    mocks.decodeV7.mockImplementation(async (bytes: Uint8Array) =>
      bytes === currentBytes
        ? { ok: true, owner: currentOwner, blockers: [] }
        : {
            ok: true,
            owner: nextOwner,
            document: {
              bindings: authority,
              writeCas: { expectedPreviousSidecarSha256: currentSha },
            },
            nestedCompositeV6: {
              nestedCompositeV5: {
                nestedCompositeV4: { nestedCompositeV3: { owner: { id: 'v3' } } },
              },
            },
            blockers: [],
          },
    );
    mocks.readV7Component.mockImplementation((owner, kind) =>
      kind === 'composite-v6'
        ? owner === currentOwner
          ? currentV6
          : nextV6
        : owner === currentOwner
          ? new Uint8Array([4])
          : new Uint8Array([3]),
    );
    mocks.decodeV6.mockResolvedValue({ ok: true, owner: {}, blockers: [] });
    mocks.readV6Component.mockReturnValue(new Uint8Array([5]));
    createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7({
      createClient: vi.fn(),
      crypto,
    });
    const prepare = mocks.strategy?.prepare as (
      request: unknown,
      current: unknown,
      crypto: Crypto,
    ) => Promise<unknown>;
    const request = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
      transitionIntent: 'arrangement',
      currentAuthority: authority,
      transportAnchor: {
        sourceOperationNumber: 20,
        serverTopologySha256: authority.assemblyTopologySha256,
      },
      nextOwner,
    };
    const current = {
      status: 'present',
      source: 'verified-get',
      mediaType: 'application/vnd.grbpwr.pattern-dxf-product-composite.v7+json',
      sha256: currentSha,
      byteLength: currentBytes.byteLength,
      bytes: currentBytes,
    };
    await expect(prepare(request, current, crypto)).rejects.toThrow(
      'Exact physical component bytes changed',
    );
    mocks.readV7Component.mockImplementation((owner, kind) =>
      kind === 'composite-v6' ? (owner === currentOwner ? currentV6 : nextV6) : new Uint8Array([4]),
    );
    mocks.readV6Component.mockImplementation((owner, kind) =>
      kind === 'composite-v5' ? new Uint8Array([owner === nextV6 ? 4 : 5]) : new Uint8Array([8]),
    );
    mocks.decodeV6.mockImplementation(async (bytes: Uint8Array) => ({
      ok: true,
      owner: bytes,
      blockers: [],
    }));
    await expect(prepare(request, current, crypto)).rejects.toThrow(
      'Exact nested Composite V5 bytes changed',
    );
  });

  it('keeps physical and arrangement adapters intent-separated before PUT', async () => {
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7(
      { createClient: vi.fn(), crypto },
      {},
      {} as never,
    );
    let beforeRequest = mocks.strategy?.beforeRequest as (
      request: unknown,
      planned: unknown,
      signal: AbortSignal,
    ) => Promise<void>;
    await expect(
      beforeRequest({ transitionIntent: 'arrangement' }, {}, new AbortController().signal),
    ).rejects.toThrow('transition intent differs');
    createPatternImportDxfProductCompositeSidecarArrangementStorageAdapterV7({
      createClient: vi.fn(),
      crypto,
    });
    beforeRequest = mocks.strategy?.beforeRequest as typeof beforeRequest;
    await expect(
      beforeRequest({ transitionIntent: 'physical' }, {}, new AbortController().signal),
    ).rejects.toThrow('transition intent differs');
  });
});
