import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';

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
import {
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
  PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
  projectPatternImportDxfProductExactNSeamSavedCardV2,
  readPatternImportDxfProductExactNSeamSavedCardProjectionV2,
} from './exact-n-seam-saved-card-projection-v2';

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

  it.each([
    { pair: ['back:v1', 'back:v2'], matches: true },
    { pair: ['back:v2', 'back:v1'], matches: true },
    { pair: ['back:v1', 'back:v3'], matches: false },
  ])('restores the exact reverse arc for stored IDs $pair', async ({ pair, matches }) => {
    const current = currentBindings();
    const seams = exactSeams();
    seams[0].sides[0].boundaryVertexIds = ['front:v3', 'front:v0'];
    seams[0].sides[1].boundaryVertexIds = pair;
    const unsigned: Omit<PatternImportDxfProductPhaseEAuthoringCatalogV1, 'canonicalSha256'> = {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
      techCardId: current.row.techCardId,
      scopeKey: current.row.scopeKey,
      sizeToken: 'M',
      sourceFileId: 'saved-source',
      sizeSelectionCanonicalSha256: digest('e'),
      pieces: seams[0].sides.map(({ pieceId, pieceLineKey, contourId }, index) => ({
        pieceId,
        pieceLineKey,
        contours: [
          {
            contourId,
            role: 'sewing-boundary',
            geometry: { kind: 'seam' },
            closed: true,
            boundaryVertices: [0, 0.25, 0.5, 0.75].map((normalizedArc, ordinal) => ({
              ordinal,
              vertexId: `${index === 0 ? 'front' : 'back'}:v${ordinal}`,
              normalizedArc,
            })),
          },
        ],
      })),
      requiredExplicitFields: [
        'documentId-and-revision',
        'physical-surface',
        'two-seam-sides-and-anchor-ranges',
        'side-directions',
        'mapping-and-length-ratio',
        'operation-stage-and-order',
        'immutable-material-revisions',
        'tolerances',
      ],
      geometryCoordinatesExposed: false,
      rawDxfExposed: false,
      assemblyInferred: false,
      productionReady: false,
    };
    const sha = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
      unsigned,
      globalThis.crypto,
    );
    expect(sha).toBeTruthy();
    current.catalogCanonicalSha256 = sha!;
    const bytes = new TextEncoder().encode('{"durable":"v4"}');
    codecs.decodeV4.mockResolvedValue({
      ok: true,
      document: { bindings: current },
      exactNSeam: { carrier: { bindings: current, seams } },
    });
    const restored = await restorePatternImportDxfProductCompositeSidecarDurableV4({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_DURABLE_RESTORE_REQUEST_V4,
      current: {
        ...current,
        selectedOperation: { ...current.selectedOperation, localOperationOrder: 0 },
      },
      readback: {
        status: 'present',
        source: 'fresh-current-sidecar-get',
        mediaType: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
        sha256: await sha256(bytes),
        byteLength: bytes.byteLength,
        bytes,
      },
    });
    if (!restored.ok) throw new Error(restored.blockers[0].detail);
    const projected = await projectPatternImportDxfProductExactNSeamSavedCardV2({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_SAVED_CARD_PROJECTION_REQUEST_V2,
      restoreOwner: restored.owner,
      catalog: { ...unsigned, canonicalSha256: sha! },
      preparedProposal: {
        schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_EXACT_N_SEAM_PREPARED_PROPOSAL_V3,
        status: 'current-saved-card-proposal',
        expectedCatalogCanonicalSha256: sha!,
        phaseEAggregatePlanSha256: current.phaseEAggregatePlanSha256,
        operation: { ...current.selectedOperation, localOperationOrder: 0 },
        seams: [
          {
            seamId: seams[0].seamId,
            sides: [
              { pieceId: 'front-id', pieceLineKey: 'piece-front', requiredDirection: 'forward' },
              { pieceId: 'back-id', pieceLineKey: 'piece-back', requiredDirection: 'reverse' },
            ],
          },
        ],
      },
    });
    if (!matches) {
      expect(projected).toMatchObject({
        ok: false,
        blockers: [{ code: 'catalog-boundary-order-mismatch' }],
      });
      return;
    }
    if (!projected.ok) throw new Error(projected.blockers[0].detail);
    expect(
      readPatternImportDxfProductExactNSeamSavedCardProjectionV2(projected.owner),
    ).toMatchObject({
      seams: [
        {
          sides: [
            { boundaryVertexIds: ['front:v3', 'front:v0'], directedArc: { start: 0.75, end: 1 } },
            {
              boundaryVertexIds: pair,
              direction: 'reverse',
              directedArc: { start: 0.5, end: 0.75 },
            },
          ],
        },
      ],
    });
  });

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
