import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  resolveExactN: vi.fn(),
  decodeV4: vi.fn(),
  decodeV5: vi.fn(),
  buildV5: vi.fn(),
  encodeAnnotations: vi.fn(),
  deriveBindings: vi.fn(),
  readV5Component: vi.fn(),
  restoreAnnotations: vi.fn(),
  resolveVertex: vi.fn(),
}));

vi.mock('./exact-n-seam-production-mount-v2', () => ({
  resolvePatternImportDxfProductExactNSeamProductionMountV2: mocks.resolveExactN,
}));
vi.mock('./composite-sidecar-v4', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v4+json',
  decodePatternImportDxfProductCompositeSidecarV4: mocks.decodeV4,
}));
vi.mock('./composite-sidecar-persistence-v5', () => ({
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_STORAGE_REQUEST_V5:
    'pattern-import-dxf-product-composite-sidecar-storage-request/5',
}));
vi.mock('./composite-sidecar-v5', () => ({
  PATTERN_IMPORT_DXF_PHASE_E_TOPOLOGY_ANNOTATIONS_REQUEST_V1:
    'pattern-import-dxf-phase-e-topology-annotations-request/1',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5:
    'application/vnd.grbpwr.pattern-dxf-product-composite.v5+json',
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V5:
    'pattern-import-dxf-product-composite-sidecar-request/5',
  buildPatternImportDxfProductCompositeSidecarV5: mocks.buildV5,
  decodePatternImportDxfProductCompositeSidecarV5: mocks.decodeV5,
  derivePatternImportDxfPhaseETopologyAnnotationsBindingsV1: mocks.deriveBindings,
  encodePatternImportDxfPhaseETopologyAnnotationsV1: mocks.encodeAnnotations,
  readPatternImportDxfProductCompositeComponentBytesV5: mocks.readV5Component,
  restorePatternImportDxfPhaseETopologyAnnotationsV5: mocks.restoreAnnotations,
}));
vi.mock('./measurement-v1', () => ({
  resolvePatternImportDxfPhaseEVertexV1: mocks.resolveVertex,
}));

import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4 } from './composite-sidecar-v4';
import { PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5 } from './composite-sidecar-v5';
import { createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5 } from './topology-annotation-application-transaction-v5';

const hash = (character: string) => character.repeat(64);
const v4Bytes = new TextEncoder().encode('{"v":4}');
const v5Bytes = new TextEncoder().encode('{"v":5}');
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
  serverAssemblyRevision: 'assembly:91',
  assemblyTopologySha256: hash('b'),
});
const session = Object.freeze({
  selectionOwner: Object.freeze({}),
  current: Object.freeze({
    ...authority,
    selectedOperation: Object.freeze({
      sourceOperationNumber: 4,
      authoringOperationId: 'operation:4',
      localOperationOrder: 4,
      seamIds: Object.freeze(['seam:1']),
    }),
    catalogCanonicalSha256: hash('c'),
    phaseEAggregatePlanSha256: hash('d'),
  }),
});
const source = Object.freeze({
  identity: 'source:main',
  revision: '8',
  sha256: hash('e'),
  projection: Object.freeze({
    expectedCatalogCanonicalSha256: session.current.catalogCanonicalSha256,
    sizeToken: 'M',
  }),
});

function base64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function stored(mediaType: string, bytes: Uint8Array, sidecarSha256: string) {
  return {
    semanticSidecar: {
      techCardId: authority.row.techCardId,
      patternLineKey: authority.row.patternLineKey,
      dxfSha256: authority.row.sha256,
      savedRowRevision: authority.row.revision,
      cardLockVersion: authority.row.cardLockVersion,
      sidecarSha256,
      mediaType,
      byteLength: bytes.byteLength,
      sidecarBytes: base64(bytes),
    },
  };
}

function rig(...gets: unknown[]) {
  const GetTechCardPatternSemanticSidecar = vi.fn();
  for (const value of gets) GetTechCardPatternSemanticSidecar.mockResolvedValueOnce(value);
  const persist = vi.fn();
  const transaction = createPatternImportDxfPhaseETopologyAnnotationApplicationTransactionV5({
    createClient: () => ({ GetTechCardPatternSemanticSidecar }),
    persistence: { adapter: { persist } } as never,
  });
  return { transaction, persist, GetTechCardPatternSemanticSidecar };
}

describe('topology annotation application transaction V5', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveExactN.mockReturnValue({ ok: true });
    mocks.decodeV4.mockResolvedValue({
      ok: true,
      document: { bindings: authority },
      seal: { canonicalSha256: hash('4') },
    });
    mocks.decodeV5.mockResolvedValue({
      ok: true,
      owner: Object.freeze({ v5: true }),
      document: { bindings: authority },
      seal: { canonicalSha256: hash('5') },
    });
    mocks.readV5Component.mockReturnValue(v4Bytes);
    mocks.restoreAnnotations.mockReturnValue({
      ok: true,
      measurements: Object.freeze([]),
      callouts: Object.freeze([]),
    });
    mocks.deriveBindings.mockReturnValue({ source: 'bindings' });
    mocks.encodeAnnotations.mockResolvedValue({ ok: true, bytes: new Uint8Array([1]) });
    mocks.buildV5.mockResolvedValue({ ok: true, owner: Object.freeze({ next: true }) });
    mocks.resolveVertex.mockReturnValue({ pointMm: Object.freeze({ x: 10, y: 20 }) });
  });

  it('loads a fresh V4 as an empty durable annotation set', async () => {
    const test = rig(
      stored(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4, v4Bytes, hash('4')),
    );

    const result = await test.transaction.load(
      session as never,
      source as never,
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: true,
      status: 'ready',
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
      readback: { measurements: [], callouts: [], sidecarSha256: hash('4') },
    });
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('uses the adapter only on explicit save, then requires an extra fresh V5 readback', async () => {
    const test = rig(
      stored(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4, v4Bytes, hash('4')),
      stored(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5, v5Bytes, hash('5')),
    );
    test.persist.mockResolvedValue({
      ok: true,
      receipt: { sidecarSha256: hash('5') },
    });
    const measurement = Object.freeze({
      id: 'measurement:1',
      kind: 'point',
      anchors: Object.freeze([
        Object.freeze({
          pieceId: 'front',
          pieceLineKey: 'front:M',
          contourId: 'cut',
          vertexId: 'v0',
        }),
      ]),
      valueMm: null,
      label: 'point',
    });

    const result = await test.transaction.save(
      session as never,
      source as never,
      { measurements: [measurement] as never, callouts: [] },
      new AbortController().signal,
      hash('4'),
    );

    expect(result).toMatchObject({
      ok: true,
      status: 'verified-and-read-back',
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5,
      readback: { sidecarSha256: hash('5') },
    });
    expect(test.persist).toHaveBeenCalledTimes(1);
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledTimes(2);
    expect(mocks.resolveVertex).toHaveBeenCalledWith(source.projection, measurement.anchors[0]);
    expect(mocks.restoreAnnotations).toHaveBeenCalledTimes(1);
  });

  it('refuses a changed edit baseline before building or writing a V5 replacement', async () => {
    const test = rig(
      stored(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V5, v5Bytes, hash('5')),
    );

    const result = await test.transaction.save(
      session as never,
      source as never,
      { measurements: [], callouts: [] },
      new AbortController().signal,
      hash('4'),
    );

    expect(result).toMatchObject({
      ok: false,
      blockers: [
        {
          code: 'annotation-save-blocked',
          detail: 'Saved annotations changed. Reload them before saving your edits.',
        },
      ],
    });
    expect(test.GetTechCardPatternSemanticSidecar).toHaveBeenCalledOnce();
    expect(mocks.buildV5).not.toHaveBeenCalled();
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('rejects stale reconstructed source before reading or writing', async () => {
    const test = rig();

    const result = await test.transaction.load(
      session as never,
      {
        ...source,
        projection: { ...source.projection, expectedCatalogCanonicalSha256: hash('f') },
      } as never,
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: 'annotation-readback-blocked' }],
    });
    expect(test.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('rejects a current non-V4/V5 sidecar', async () => {
    const test = rig(stored('application/json', v4Bytes, hash('4')));

    const result = await test.transaction.load(
      session as never,
      source as never,
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: false,
      blockers: [{ code: 'annotation-readback-blocked' }],
    });
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('rejects an annotation anchor absent from the current projection before persist', async () => {
    mocks.resolveVertex.mockReturnValueOnce(null);
    const test = rig(
      stored(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4, v4Bytes, hash('4')),
    );

    const result = await test.transaction.save(
      session as never,
      source as never,
      {
        measurements: [
          {
            id: 'measurement:1',
            kind: 'point',
            anchors: [
              {
                pieceId: 'front',
                pieceLineKey: 'front:M',
                contourId: 'cut',
                vertexId: 'missing',
              },
            ],
            valueMm: null,
            label: 'point',
          },
        ],
        callouts: [],
      } as never,
      new AbortController().signal,
    );

    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'annotation-save-blocked' }] });
    expect(test.persist).not.toHaveBeenCalled();
  });

  it('fails closed on an already-aborted load without a GET', async () => {
    const test = rig();
    const controller = new AbortController();
    controller.abort();

    const result = await test.transaction.load(
      session as never,
      source as never,
      controller.signal,
    );

    expect(result).toMatchObject({ ok: false, blockers: [{ code: 'cancelled' }] });
    expect(test.GetTechCardPatternSemanticSidecar).not.toHaveBeenCalled();
  });
});
