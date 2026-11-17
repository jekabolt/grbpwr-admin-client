import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createWriter: vi.fn(),
  persist: vi.fn(),
  encodeV7: vi.fn(),
  decodeV7: vi.fn(),
  readV7Component: vi.fn(),
  readV3Component: vi.fn(),
  strategy: null as Record<string, unknown> | null,
}));

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-storage-client-v3', () => ({
  createPatternImportDxfProductCompositeSidecarStorageWriterV3: mocks.createWriter,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  readPatternImportDxfProductCompositeComponentBytesV3: mocks.readV3Component,
}));
vi.mock('./composite-sidecar-v6', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V6:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v6+json',
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
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7({
      createClient: vi.fn(),
      crypto,
    });
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
    createPatternImportDxfProductCompositeSidecarStorageAdapterV7({
      createClient: vi.fn(),
      crypto,
    });
    const prepare = mocks.strategy?.prepare as (
      request: unknown,
      current: unknown,
      crypto: Crypto,
    ) => Promise<unknown>;
    await expect(
      prepare(
        {
          schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V7,
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
});
