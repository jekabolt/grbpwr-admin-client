import { beforeEach, describe, expect, it, vi } from 'vitest';

const codecs = vi.hoisted(() => ({ decodeV4: vi.fn(), decodeV5: vi.fn() }));

vi.mock('./composite-sidecar-v4', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composite-sidecar-v4')>()),
  decodePatternImportDxfProductCompositeSidecarV4: codecs.decodeV4,
}));
vi.mock('./composite-sidecar-v5', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./composite-sidecar-v5')>()),
  decodePatternImportDxfProductCompositeSidecarV5: codecs.decodeV5,
}));

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_CLAIMS_V4,
  readPatternImportDxfProductExactNSeamRestorePatchV2,
  restorePatternImportDxfProductCompositeSidecarDurableV4,
} from './composite-sidecar-restore-authority-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';

const digest = (character: string) => character.repeat(64);

function currentBindings() {
  return {
    row: {
      techCardId: 11,
      scopeKey: 'fabric:main',
      patternLineKey: 'pattern:main',
      revision: 8,
      cardLockVersion: 301,
      url: 'https://media.example.invalid/pants.dxf',
      sizeBytes: 42,
      sha256: digest('a'),
    },
    serverAssemblyRevision: 'assembly:revision:7',
    assemblyTopologySha256: digest('b'),
    selectedOperation: {
      sourceOperationNumber: 7,
      authoringOperationId: `zero-connect-binding-v1:${digest('c')}`,
      localOperationOrder: 0,
      seamIds: ['seam-side'],
    },
    catalogCanonicalSha256: digest('d'),
    phaseEAggregatePlanSha256: digest('e'),
  };
}

function exactSeams() {
  return [
    {
      seamId: 'seam-side',
      sides: [
        {
          seamId: 'seam-side',
          sideIndex: 0,
          pieceId: 'front-id',
          pieceLineKey: 'piece-front',
          contourId: 'front-contour',
          boundaryVertexIds: ['front:v0', 'front:v1'],
          direction: 'forward',
        },
        {
          seamId: 'seam-side',
          sideIndex: 1,
          pieceId: 'back-id',
          pieceLineKey: 'piece-back',
          contourId: 'back-contour',
          boundaryVertexIds: ['back:v9', 'back:v8'],
          direction: 'reverse',
        },
      ],
    },
  ];
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const result = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes.slice().buffer),
  );
  return Array.from(result, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

describe('durable Composite V4 reload restore snapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('captures getter-free current bindings before the first digest await', async () => {
    const current = currentBindings();
    const original = structuredClone(current);
    const bytes = new TextEncoder().encode('{"durable":"v4"}');
    codecs.decodeV4.mockResolvedValue({
      ok: true,
      document: {
        bindings: {
          row: original.row,
          serverAssemblyRevision: original.serverAssemblyRevision,
          assemblyTopologySha256: original.assemblyTopologySha256,
        },
      },
      exactNSeam: {
        carrier: { bindings: original, seams: exactSeams() },
      },
    });
    const restore = restorePatternImportDxfProductCompositeSidecarDurableV4(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
        current,
        readback: {
          status: 'present',
          source: 'fresh-current-sidecar-get',
          mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
          sha256: await sha256(bytes),
          byteLength: bytes.byteLength,
          bytes,
        },
      } as never,
      globalThis.crypto,
    );

    current.serverAssemblyRevision = 'mutated-after-call';
    current.row.cardLockVersion = 999;
    current.selectedOperation.seamIds[0] = 'different-seam';
    const result = await restore;

    expect(result).toMatchObject({
      ok: true,
      claims: {
        verifiedPersistenceOutcomeRequired: false,
        ephemeralPersistenceReceiptUsed: false,
      },
    });
    if (!result.ok) throw new Error(result.blockers[0].detail);
    const patch = readPatternImportDxfProductExactNSeamRestorePatchV2(result.owner);
    expect(patch?.bindings).toEqual(original);
    expect(result.claims).toBe(
      PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_CLAIMS_V4,
    );
  });

  it('rejects an active current getter before hashing or decoding', async () => {
    const bytes = new TextEncoder().encode('{"durable":"v4"}');
    const request = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
      get current() {
        return currentBindings();
      },
      readback: {
        status: 'present',
        source: 'fresh-current-sidecar-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
        sha256: await sha256(bytes),
        byteLength: bytes.byteLength,
        bytes,
      },
    };

    const result = await restorePatternImportDxfProductCompositeSidecarDurableV4(
      request as never,
      globalThis.crypto,
    );

    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'invalid-request' }] });
    expect(codecs.decodeV4).not.toHaveBeenCalled();
  });

  it('copies bytes with captured intrinsics without invoking a hostile own slice getter', async () => {
    const current = currentBindings();
    const bytes = new TextEncoder().encode('{"durable":"v4"}');
    const expectedSha256 = await sha256(bytes);
    const hostileSlice = vi.fn(() => {
      throw new Error('caller-owned slice must not execute');
    });
    Object.defineProperty(bytes, 'slice', { enumerable: false, get: hostileSlice });
    codecs.decodeV4.mockResolvedValue({
      ok: true,
      document: {
        bindings: {
          row: current.row,
          serverAssemblyRevision: current.serverAssemblyRevision,
          assemblyTopologySha256: current.assemblyTopologySha256,
        },
      },
      exactNSeam: { carrier: { bindings: current, seams: exactSeams() } },
    });

    const result = await restorePatternImportDxfProductCompositeSidecarDurableV4(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
        current,
        readback: {
          status: 'present',
          source: 'fresh-current-sidecar-get',
          mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
          sha256: expectedSha256,
          byteLength: bytes.byteLength,
          bytes,
        },
      } as never,
      globalThis.crypto,
    );

    expect(result.ok).toBe(true);
    expect(hostileSlice).not.toHaveBeenCalled();
  });

  it('rejects symbol-bearing seam arrays from the getter-free binding snapshot', async () => {
    const current = currentBindings();
    Object.defineProperty(current.selectedOperation.seamIds, Symbol('hostile'), {
      enumerable: true,
      value: 'hidden-seam',
    });
    const bytes = new TextEncoder().encode('{"durable":"v4"}');

    const result = await restorePatternImportDxfProductCompositeSidecarDurableV4(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
        current,
        readback: {
          status: 'present',
          source: 'fresh-current-sidecar-get',
          mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
          sha256: await sha256(bytes),
          byteLength: bytes.byteLength,
          bytes,
        },
      } as never,
      globalThis.crypto,
    );

    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'invalid-request' }] });
    expect(codecs.decodeV4).not.toHaveBeenCalled();
  });
});
