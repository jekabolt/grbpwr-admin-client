import { describe, expect, it, vi } from 'vitest';

vi.mock('api/api', () => ({ abortableAdminService: vi.fn() }));

import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
  buildPatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductCompositeSidecarV3,
  encodePatternImportDxfProductExactTopologyComponentV3,
  readPatternImportDxfProductCompositeComponentBytesV3,
} from 'lib/cloth/domain/pattern-import-dxf-product-composite-sidecar-v3';
import { buildPatternImportDxfProductPhaseEExactTopologyBindingV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1';
import { createPatternImportDxfProductPhaseEExactTopologyFixtureV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-exact-topology-binding-v1.test-fixture';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';

import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { createPatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from './composite-sidecar-production-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';
import { resolvePatternImportDxfProductExactNSeamProductionMountV2 } from './exact-n-seam-production-mount-v2';
import {
  clearPatternImportDxfProductExactNSeamProductionSessionV2,
  readPatternImportDxfProductExactNSeamProductionSessionV2,
} from './exact-n-seam-production-session-v2';
import {
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
  PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
  createPatternImportDxfPhaseEZeroConnectDurableBridgeV1,
} from './zero-connect-durable-composite-v4';

const digest = (character: string): string => character.repeat(64);
const row = Object.freeze({
  techCardId: 11,
  scopeKey: 'fabric:main',
  patternLineKey: 'pattern:main',
  revision: 8,
  cardLockVersion: 301,
  url: 'https://media.example.invalid/pants.dxf',
  sizeBytes: 42,
  sha256: digest('d'),
});
const sides = Object.freeze([
  Object.freeze({
    pieceId: 'front-id',
    pieceLineKey: 'piece-front',
    contourId: 'front-contour',
    boundaryVertexIds: Object.freeze(['front:v0', 'front:v1']),
    direction: 'forward' as const,
  }),
  Object.freeze({
    pieceId: 'back-id',
    pieceLineKey: 'piece-back',
    contourId: 'back-contour',
    boundaryVertexIds: Object.freeze(['back:v9', 'back:v8']),
    direction: 'reverse' as const,
  }),
]);

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice().buffer));
  return Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''));
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function catalog(): Promise<PatternImportDxfProductPhaseEAuthoringCatalogV1> {
  const boundaryVertices = (ids: readonly string[]) =>
    ids.map((vertexId, ordinal) => ({
      ordinal,
      vertexId,
      normalizedArc: ordinal / Math.max(1, ids.length - 1),
    }));
  const unsigned = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: row.techCardId,
    scopeKey: row.scopeKey,
    sizeToken: 'M',
    sourceFileId: 'saved-dxf-source',
    sizeSelectionCanonicalSha256: digest('1'),
    pieces: [
      {
        pieceId: 'front-id',
        pieceLineKey: 'piece-front',
        contours: [
          {
            contourId: 'front-contour',
            role: 'sewing-boundary' as const,
            geometry: { kind: 'seam' as const },
            closed: true,
            boundaryVertices: boundaryVertices(['front:v0', 'front:v1', 'front:v2']),
          },
        ],
      },
      {
        pieceId: 'back-id',
        pieceLineKey: 'piece-back',
        contours: [
          {
            contourId: 'back-contour',
            role: 'sewing-boundary' as const,
            geometry: { kind: 'seam' as const },
            closed: true,
            boundaryVertices: boundaryVertices(['back:v8', 'back:v9', 'back:v10']),
          },
        ],
      },
    ],
    requiredExplicitFields: [
      'documentId-and-revision',
      'physical-surface',
      'two-seam-sides-and-anchor-ranges',
      'side-directions',
      'mapping-and-length-ratio',
      'operation-stage-and-order',
      'immutable-material-revisions',
      'tolerances',
    ] as const,
    geometryCoordinatesExposed: false as const,
    rawDxfExposed: false as const,
    assemblyInferred: false as const,
    productionReady: false as const,
  };
  const canonicalSha256 = await computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1(
    unsigned,
    crypto,
  );
  if (!canonicalSha256) throw new Error('Catalog SHA fixture failed.');
  return Object.freeze({ ...unsigned, canonicalSha256 });
}

/**
 * Genuine codec/hash/opaque-owner/production-transaction chain. Only the generated authenticated
 * HTTP boundary and fresh saved-Assembly read are deterministic transport fixtures.
 */
describe('zero-connect durable N=1 genuine production chain', () => {
  it('persists one confirmed tuple through CAS/readback and restores it after session reload', async () => {
    const exactCatalog = await catalog();
    const semanticBytes = bytesOf(semanticDocument(row));
    const semanticSha256 = await sha256(semanticBytes);
    const stored = {
      techCardId: row.techCardId,
      patternLineKey: row.patternLineKey,
      dxfSha256: row.sha256,
      patternVersion: 4,
      postSaveReceiptSha256: digest('3'),
      cardLockVersion: row.cardLockVersion,
      savedRowRevision: row.revision,
      sidecarSha256: semanticSha256,
      byteLength: semanticBytes.byteLength,
      sidecarBytes: base64(semanticBytes),
      mediaType: PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 as string,
    };
    const get = vi.fn(async () => ({ semanticSidecar: structuredClone(stored) }));
    const put = vi.fn(async (request: Record<string, unknown>) => {
      if (request.expectedPreviousSidecarSha256 !== stored.sidecarSha256)
        throw Object.assign(new Error('Fixture CAS conflict.'), { status: 409 });
      Object.assign(stored, {
        sidecarSha256: request.sidecarSha256,
        sidecarBytes: request.sidecarBytes,
        byteLength: atob(request.sidecarBytes as string).length,
        mediaType: request.mediaType,
      });
      return { semanticSidecar: structuredClone(stored) };
    });
    const createClient = () => ({
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    });
    const application = createPatternImportDxfProductCompositeSidecarApplicationTransactionV4({
      createClient: createClient as never,
      crypto,
    });
    const readCurrentAssemblyTopology = vi.fn(async () => ({
      row,
      serverAssemblyRevision: 'assembly:revision:7',
      assemblyTopologySha256: digest('b'),
      selectedOperationNumber: 7,
      topology: {
        operations: [
          {
            number: 7,
            inputKeys: ['piece-front', 'piece-back'],
            seamKeys: ['seam-side'],
          },
        ],
      },
    }));
    const bridge = createPatternImportDxfPhaseEZeroConnectDurableBridgeV1({
      authorityAdapter: { readCurrentAssemblyTopology } as never,
      application,
      createClient: createClient as never,
      crypto,
    });
    const pending = {
      status: 'in-memory-final-seam-attached-awaiting-second-save',
      savedOperationNumber: 7,
      finalSeamKey: 'seam-side',
      candidate: { connection: { mapping: 'equal', lengthRatio: 1, sides } },
      catalog: exactCatalog,
      refreshedAuthoringAuthority: { row },
    } as never;

    const persisted = await bridge.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
        pending,
        row,
      },
      new AbortController().signal,
    );

    expect(persisted, persisted.ok ? undefined : persisted.blocker.detail).toMatchObject({
      ok: true,
      compositeOperationBindingId: expect.stringMatching(/^zero-connect-binding-v1:[0-9a-f]{64}$/),
    });
    expect(put).toHaveBeenCalledTimes(1);
    expect(stored.mediaType).toBe(PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4);
    const decoded = await decodePatternImportDxfProductCompositeSidecarV4(
      fromBase64(stored.sidecarBytes),
      crypto,
    );
    expect(decoded.ok).toBe(true);
    if (!decoded.ok || !persisted.ok) return;
    expect(
      readPatternImportDxfProductCompositeComponentBytesV3(
        decoded.nestedCompositeV3.owner,
        'semantic-product-v1',
      ),
    ).toEqual(semanticBytes);
    expect(decoded.exactNSeam.carrier.seams[0]?.sides).toMatchObject([
      {
        contourId: 'front-contour',
        boundaryVertexIds: ['front:v0', 'front:v1'],
        direction: 'forward',
      },
      {
        contourId: 'back-contour',
        boundaryVertexIds: ['back:v9', 'back:v8'],
        direction: 'reverse',
      },
    ]);

    clearPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
    expect(readPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId)).toBeNull();
    const alternateSurface = await bridge.restore(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
        row,
        selectedOperationNumber: 7,
        catalog: { ...exactCatalog, canonicalSha256: 'f'.repeat(64) },
      },
      new AbortController().signal,
    );
    expect(alternateSurface).toMatchObject({
      ok: false,
      blocker: { code: 'durable-restore-catalog-mismatch' },
    });
    expect(readPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId)).toBeNull();
    const restored = await bridge.restore(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
        row,
        selectedOperationNumber: 7,
        catalog: exactCatalog,
      },
      new AbortController().signal,
    );

    expect(restored, restored.ok ? undefined : restored.blocker.detail).toMatchObject({
      ok: true,
      compositeOperationBindingId: persisted.compositeOperationBindingId,
    });
    if (!restored.ok) return;
    expect(put).toHaveBeenCalledTimes(1);
    expect(readCurrentAssemblyTopology).toHaveBeenCalledTimes(3);
    const reloaded = readPatternImportDxfProductExactNSeamProductionSessionV2(row.techCardId);
    expect(reloaded).not.toBeNull();
    if (!reloaded) return;
    expect(reloaded?.selectionOwner).toBe(restored.session.selectionOwner);
    expect(reloaded?.current).toBe(restored.session.current);
    const mounted = resolvePatternImportDxfProductExactNSeamProductionMountV2(reloaded, 0);
    expect(mounted.ok).toBe(true);
    if (!mounted.ok) return;
    expect(mounted.model.choices.seams[0]?.sides).toMatchObject([
      {
        contourId: 'front-contour',
        boundaryVertexIds: ['front:v0', 'front:v1'],
        direction: 'forward',
      },
      {
        contourId: 'back-contour',
        boundaryVertexIds: ['back:v9', 'back:v8'],
        direction: 'reverse',
      },
    ]);
  });

  it('refuses a genuine Composite V3 exact-N2 carrier without replacing any bytes', async () => {
    const exactFixture = await createPatternImportDxfProductPhaseEExactTopologyFixtureV1();
    const exactBinding = await buildPatternImportDxfProductPhaseEExactTopologyBindingV1(
      exactFixture.buildRequest,
    );
    if (!exactBinding.ok) throw new Error(exactBinding.blockers[0].detail);
    const exactTopology = await encodePatternImportDxfProductExactTopologyComponentV3(
      exactBinding.owner,
    );
    if (!exactTopology.ok) throw new Error(exactTopology.blocker.detail);
    const currentAuthority = {
      row: exactFixture.row,
      serverAssemblyRevision: exactFixture.current.serverAssemblyRevision,
      assemblyTopologySha256: exactFixture.current.assemblyTopologySha256,
    };
    const composite = await buildPatternImportDxfProductCompositeSidecarV3({
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_REQUEST_V3,
      bindings: currentAuthority,
      expectedPreviousSidecarSha256: null,
      semanticProductV1Bytes: bytesOf(semanticDocument(exactFixture.row)),
      placementV2Bytes: null,
      exactTopologyBytes: exactTopology.bytes,
    });
    if (!composite.ok) throw new Error(composite.blockers[0].detail);
    const encoded = encodePatternImportDxfProductCompositeSidecarV3(composite.owner);
    if (!encoded.ok || !encoded.bytes) throw new Error('Composite V3 fixture encoding failed.');
    const before = encoded.bytes.slice();
    const put = vi.fn();
    const get = vi.fn(async () => ({
      semanticSidecar: {
        techCardId: exactFixture.row.techCardId,
        patternLineKey: exactFixture.row.patternLineKey,
        dxfSha256: exactFixture.row.sha256,
        savedRowRevision: exactFixture.row.revision,
        cardLockVersion: exactFixture.row.cardLockVersion,
        mediaType: composite.document.mediaType,
        sidecarSha256: encoded.canonicalSha256,
        byteLength: encoded.canonicalByteLength,
        sidecarBytes: base64(before),
      },
    }));
    const createClient = () => ({
      GetTechCardPatternSemanticSidecar: get,
      PutTechCardPatternSemanticSidecar: put,
    });
    const application = createPatternImportDxfProductCompositeSidecarApplicationTransactionV4({
      createClient: createClient as never,
      crypto,
    });
    const bridge = createPatternImportDxfPhaseEZeroConnectDurableBridgeV1({
      authorityAdapter: {
        readCurrentAssemblyTopology: vi.fn(async () => ({
          row: exactFixture.row,
          serverAssemblyRevision: exactFixture.current.serverAssemblyRevision,
          assemblyTopologySha256: exactFixture.current.assemblyTopologySha256,
          selectedOperationNumber: 7,
          topology: {
            operations: [
              {
                number: 7,
                inputKeys: ['piece-front', 'piece-back'],
                seamKeys: ['seam-side'],
              },
            ],
          },
        })),
      } as never,
      application,
      createClient: createClient as never,
      crypto,
    });
    const result = await bridge.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
        pending: {
          status: 'in-memory-final-seam-attached-awaiting-second-save',
          savedOperationNumber: 7,
          finalSeamKey: 'seam-side',
          candidate: { connection: { mapping: 'equal', lengthRatio: 1, sides } },
          catalog: await catalog(),
          refreshedAuthoringAuthority: { row: exactFixture.row },
        } as never,
        row: exactFixture.row,
      },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      ok: false,
      blocker: { code: 'durable-existing-v3-exact-conflict' },
    });
    expect(put).not.toHaveBeenCalled();
    expect(encoded.bytes).toEqual(before);
  });
});
