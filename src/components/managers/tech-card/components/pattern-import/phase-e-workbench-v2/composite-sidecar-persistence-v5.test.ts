import { beforeEach, describe, expect, it, vi } from 'vitest';

const codec = vi.hoisted(() => ({
  decodeV4: vi.fn(),
  decodeV5: vi.fn(),
  encodeV5: vi.fn(),
  readV5Component: vi.fn(),
  readV3Component: vi.fn(),
}));

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));
vi.mock('./composite-sidecar-v4', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v4+json',
  decodePatternImportDxfProductCompositeSidecarV4: codec.decodeV4,
}));
vi.mock('./composite-sidecar-v5', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json',
  decodePatternImportDxfProductCompositeSidecarV5: codec.decodeV5,
  encodePatternImportDxfProductCompositeSidecarV5: codec.encodeV5,
  readPatternImportDxfProductCompositeComponentBytesV5: codec.readV5Component,
}));
vi.mock('lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3', () => ({
  readPatternImportDxfProductCompositeComponentBytesV3: codec.readV3Component,
}));

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
  createPatternImportDxfProductCompositeSidecarStorageAdapterV5,
} from './composite-sidecar-persistence-v5';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';

const encoder = new TextEncoder();
const hash = (character: string) => character.repeat(64);
const currentV4Bytes = encoder.encode('{"composite":"v4"}');
const currentV4Sha = 'cbd5f7676fee8e89ee3cc9e3967ca2a1f5c5cbe2c762e22a125ac350da1ba7ad';
const nextV5Bytes = encoder.encode('{"composite":"v5"}');
const nextV5Sha = '340c8cb935a64a5982874db0557c09562c1fe193b23a819d6776d960c1241caf';
const semanticBytes = encoder.encode(
  JSON.stringify({
    persistence: {
      receiptSealSha256: hash('d'),
      pattern: { version: 4 },
    },
  }),
);
const authority = Object.freeze({
  row: Object.freeze({
    techCardId: 11,
    scopeKey: 'fabric:main',
    patternLineKey: 'pattern:main',
    revision: 8,
    cardLockVersion: 301,
    url: 'https://media.example.invalid/pants.dxf',
    sizeBytes: 42,
    sha256: hash('a'),
  }),
  serverAssemblyRevision: 'assembly-revision:91',
  assemblyTopologySha256: hash('b'),
});
const nextOwner = Object.freeze({ schemaVersion: 'opaque-v5-owner' });

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function storedV4(overrides: Record<string, unknown> = {}) {
  return {
    techCardId: authority.row.techCardId,
    patternLineKey: authority.row.patternLineKey,
    dxfSha256: authority.row.sha256,
    patternVersion: 4,
    sidecarSha256: currentV4Sha,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
    byteLength: currentV4Bytes.byteLength,
    sidecarBytes: base64(currentV4Bytes),
    postSaveReceiptSha256: hash('d'),
    cardLockVersion: authority.row.cardLockVersion,
    savedRowRevision: authority.row.revision,
    ...overrides,
  };
}

function storedV5(bytes = nextV5Bytes, overrides: Record<string, unknown> = {}) {
  return {
    techCardId: authority.row.techCardId,
    patternLineKey: authority.row.patternLineKey,
    dxfSha256: authority.row.sha256,
    patternVersion: 4,
    sidecarSha256: nextV5Sha,
    mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
    byteLength: bytes.byteLength,
    sidecarBytes: base64(bytes),
    postSaveReceiptSha256: hash('d'),
    cardLockVersion: authority.row.cardLockVersion,
    savedRowRevision: authority.row.revision,
    ...overrides,
  };
}

function decodedV4() {
  return { ok: true, document: { bindings: authority } };
}

function decodedV5(expectedPreviousSidecarSha256 = currentV4Sha) {
  return {
    ok: true,
    owner: Object.freeze({ verifiedV5: true }),
    document: {
      bindings: authority,
      writeCas: { expectedPreviousSidecarSha256 },
    },
    nestedCompositeV4: {
      nestedCompositeV3: { owner: Object.freeze({ nestedV3: true }) },
      exactNSeam: {
        carrier: { bindings: { selectedOperation: { sourceOperationNumber: 120 } } },
      },
    },
  };
}

function request() {
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5,
    currentAuthority: authority,
    nextOwner,
  } as never;
}

function rig(
  firstGet: unknown = { semanticSidecar: storedV4() },
  putResponse: unknown = { semanticSidecar: storedV5() },
  finalGet: unknown = { semanticSidecar: storedV5() },
) {
  const GetTechCardPatternSemanticSidecar = vi
    .fn()
    .mockResolvedValueOnce(firstGet)
    .mockResolvedValueOnce(finalGet);
  const PutTechCardPatternSemanticSidecar = vi.fn().mockResolvedValue(putResponse);
  return {
    adapter: createPatternImportDxfProductCompositeSidecarStorageAdapterV5({
      createClient: () => ({
        GetTechCardPatternSemanticSidecar,
        PutTechCardPatternSemanticSidecar,
      }),
    }),
    GetTechCardPatternSemanticSidecar,
    PutTechCardPatternSemanticSidecar,
  };
}

describe('Composite V5 annotation persistence transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    codec.encodeV5.mockReturnValue({
      ok: true,
      bytes: nextV5Bytes,
      canonicalSha256: nextV5Sha,
      canonicalByteLength: nextV5Bytes.byteLength,
    });
    codec.decodeV4.mockResolvedValue(decodedV4());
    codec.decodeV5.mockResolvedValue(decodedV5());
    codec.readV5Component.mockReturnValue(currentV4Bytes);
    codec.readV3Component.mockReturnValue(semanticBytes);
  });

  it('sends opaque V5 media with full CAS and verifies PUT echo plus fresh GET', async () => {
    const test = rig();

    const result = await test.adapter.persist(request(), new AbortController().signal);

    expect(result).toMatchObject({
      ok: true,
      writeOutcome: 'verified',
      receipt: {
        previousSidecarSha256: currentV4Sha,
        sidecarSha256: nextV5Sha,
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
        selectedOperationNumber: 120,
      },
    });
    expect(test.PutTechCardPatternSemanticSidecar).toHaveBeenCalledWith({
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
      expectedDxfSha256: authority.row.sha256,
      expectedPatternVersion: 4,
      expectedPostSaveReceiptSha256: hash('d'),
      expectedCardLockVersion: authority.row.cardLockVersion,
      expectedSavedRowRevision: authority.row.revision,
      expectedPreviousSidecarSha256: currentV4Sha,
      expectedServerAssemblyRevision: authority.serverAssemblyRevision,
      expectedAssemblyTopologySha256: authority.assemblyTopologySha256,
      selectedOperationNumber: 120,
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
      sidecarSha256: nextV5Sha,
      sidecarBytes: base64(nextV5Bytes),
    });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
  });

  it('fails before PUT if the exact original V4 bytes changed', async () => {
    codec.readV5Component.mockReturnValueOnce(encoder.encode('{"different":"v4"}'));
    const test = rig();

    const result = await test.adapter.persist(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: false, writeOutcome: 'not-attempted' });
    expect(test.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('fails closed when the current V4 is missing or its authority is stale', async () => {
    const missing = rig({});
    expect(await missing.adapter.persist(request(), new AbortController().signal)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
    });
    expect(missing.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();

    codec.decodeV4.mockResolvedValueOnce({
      ok: true,
      document: { bindings: { ...authority, serverAssemblyRevision: 'newer-revision' } },
    });
    const stale = rig();
    expect(await stale.adapter.persist(request(), new AbortController().signal)).toMatchObject({
      ok: false,
      writeOutcome: 'not-attempted',
    });
    expect(stale.PutTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });

  it('accepts a current V5 only when it still contains the same original V4 bytes', async () => {
    codec.decodeV5.mockImplementation(async (bytes: Uint8Array) =>
      bytes === nextV5Bytes ? decodedV5(nextV5Sha) : decodedV5(nextV5Sha),
    );
    const test = rig({
      semanticSidecar: storedV5(nextV5Bytes, {
        sidecarSha256: nextV5Sha,
      }),
    });

    const result = await test.adapter.persist(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: true, writeOutcome: 'verified' });
  });

  it('never claims a write verified when fresh GET differs', async () => {
    const mismatch = encoder.encode('{"different":true}');
    const test = rig(
      { semanticSidecar: storedV4() },
      { semanticSidecar: storedV5() },
      {
        semanticSidecar: storedV5(mismatch, {
          byteLength: nextV5Bytes.byteLength,
          sidecarSha256: nextV5Sha,
        }),
      },
    );

    const result = await test.adapter.persist(request(), new AbortController().signal);

    expect(result).toMatchObject({ ok: false, writeOutcome: 'acknowledged-unverified' });
  });
});
