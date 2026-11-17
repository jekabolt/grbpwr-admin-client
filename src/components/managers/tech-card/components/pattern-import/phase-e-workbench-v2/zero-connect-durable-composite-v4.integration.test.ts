import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
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
  buildPatternImportDxfProductPhaseEAuthoringCatalogV1,
  computePatternImportDxfProductPhaseEAuthoringCatalogSha256V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import { selectPatternImportDxfProductDraftPhaseDSizeV1 } from 'lib/cloth/domain/pattern-import-dxf-product-draft-phase-d-selection-v1';
import { createPatternImportDxfProductSavedRuntimeSeedV1Fixture } from 'lib/cloth/domain/pattern-import-dxf-product-garment-mesh-composer-v2.test-fixture';
import { PATTERN_IMPORT_DXF_PRODUCT_SEMANTIC_SIDECAR_MEDIA_TYPE_V1 } from 'lib/cloth/domain/pattern-import-dxf-product-semantic-sidecar-v1';

import { bytesOf, semanticDocument } from './composite-placement-read-v1.test-fixture';
import { buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1 } from './cad-mannequin-pattern-piece-overlay-v1';
import * as cadTable from './cad-table-zero-connect-canvas-v1';
import { buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1 } from './cad-mannequin-saved-one-seam-scene-overlay-v1';
import {
  capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1,
  readPatternImportDxfPhaseEZeroConnectSavedSceneProjectionV1,
} from './cad-table-zero-connect-phase-e-authority-v1';
import { createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1 } from './cad-table-zero-operation-generation-owner-v1';
import { createPatternImportDxfProductCompositeSidecarApplicationTransactionV4 } from './composite-sidecar-production-transaction-v4';
import {
  PATTERN_IMPORT_DXF_PRODUCT_COMPOSITE_SIDECAR_MEDIA_TYPE_V4,
  decodePatternImportDxfProductCompositeSidecarV4,
} from './composite-sidecar-v4';
import {
  PatternImportDxfProductExactNSeamProductionMountV2,
  resolvePatternImportDxfProductExactNSeamProductionMountV2,
} from './exact-n-seam-production-mount-v2';
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
  it('stages one restored closed seam without a golden feed and refuses mixed 3D bindings', async () => {
    const seed = await createPatternImportDxfProductSavedRuntimeSeedV1Fixture();
    const selectionResult = await selectPatternImportDxfProductDraftPhaseDSizeV1(
      seed.draft,
      'main',
      'M',
    );
    if (!selectionResult.ok) throw new Error(selectionResult.blockers[0].detail);
    const { selection } = selectionResult;
    const catalogResult = await buildPatternImportDxfProductPhaseEAuthoringCatalogV1(
      seed.draft,
      'main',
      'M',
    );
    if (!catalogResult.ok) throw new Error(catalogResult.blockers[0].detail);
    const { catalog: sealedCatalog } = catalogResult;
    const savedRow = Object.freeze({ ...seed.row, sha256: selection.phaseD.sourceSha256 });
    const generations = createPatternImportDxfPhaseECadTableZeroOperationGenerationOwnerV1();
    const generation = generations.beginSaved('durable-scene');
    const capture = (sourceRow = savedRow) =>
      capturePatternImportDxfPhaseEZeroConnectPreparedAuthorityV1({
        row: sourceRow,
        draft: seed.draft,
        catalog: sealedCatalog,
        selection,
        generation,
      })!;
    const prepared = capture();
    expect(prepared).toBeTruthy();
    const projection = readPatternImportDxfPhaseEZeroConnectSavedSceneProjectionV1(prepared)!;
    expect(projection.pieces).toHaveLength(2);
    const exactSides = projection.pieces.map(({ pieceId, pieceLineKey, contours }, index) => {
      const exact = contours.find(({ closed, role }) => closed && role !== 'hole')!;
      return {
        pieceId,
        pieceLineKey,
        contourId: exact.contourId,
        boundaryVertexIds: [exact.vertices[0]!.vertexId, exact.vertices[1]!.vertexId],
        direction: index === 0 ? 'forward' : 'reverse',
      };
    });
    const operationNumber = 120;
    const seamId = 'saved-native-seam';
    const semanticBytes = bytesOf(semanticDocument(savedRow));
    const stored = {
      techCardId: savedRow.techCardId,
      patternLineKey: savedRow.patternLineKey,
      dxfSha256: savedRow.sha256,
      patternVersion: 4,
      postSaveReceiptSha256: digest('3'),
      cardLockVersion: savedRow.cardLockVersion,
      savedRowRevision: savedRow.revision,
      sidecarSha256: await sha256(semanticBytes),
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
    const authorityAdapter = {
      readCurrentAssemblyTopology: async () => ({
        row: savedRow,
        serverAssemblyRevision: 'assembly:revision:7',
        assemblyTopologySha256: digest('b'),
        selectedOperationNumber: operationNumber,
        topology: {
          operations: [
            {
              number: operationNumber,
              inputKeys: exactSides.map(({ pieceLineKey }) => pieceLineKey),
              seamKeys: [seamId],
            },
          ],
        },
      }),
    };
    const durable = createPatternImportDxfPhaseEZeroConnectDurableBridgeV1({
      authorityAdapter: authorityAdapter as never,
      application,
      createClient: createClient as never,
      crypto,
    });
    const signal = new AbortController().signal;
    const persisted = await durable.persist(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_PERSIST_REQUEST_V1,
        pending: {
          status: 'in-memory-final-seam-attached-awaiting-second-save',
          savedOperationNumber: operationNumber,
          finalSeamKey: seamId,
          candidate: { connection: { mapping: 'equal', lengthRatio: 1, sides: exactSides } },
          catalog: sealedCatalog,
          refreshedAuthoringAuthority: prepared,
        } as never,
        row: savedRow,
      },
      signal,
    );
    if (!persisted.ok) throw new Error(persisted.blocker.detail);
    clearPatternImportDxfProductExactNSeamProductionSessionV2(savedRow.techCardId);
    const restored = await durable.restore(
      {
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_DURABLE_RESTORE_REQUEST_V1,
        row: savedRow,
        selectedOperationNumber: operationNumber,
        catalog: sealedCatalog,
      },
      signal,
    );
    if (!restored.ok) throw new Error(restored.blocker.detail);
    const { session } = restored;
    expect(session.productionFeed).toBeUndefined();
    const request = { session, prepared, projection, focusedPieceId: null };
    const scene = buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1(request);
    expect(scene.status).toBe('available');
    if (scene.status !== 'available') throw new Error(scene.blocker.detail);
    expect(scene.bridge.decorations).toMatchObject([
      {
        seamId,
        side: 'A',
        pieceId: exactSides[0]!.pieceId,
        orderedVertexIds: exactSides[0]!.boundaryVertexIds,
        operationSeam: { operationNumber, ordinal: 1 },
      },
      {
        seamId,
        side: 'B',
        pieceId: exactSides[1]!.pieceId,
        orderedVertexIds: [...exactSides[1]!.boundaryVertexIds].reverse(),
        operationSeam: { operationNumber, ordinal: 1 },
      },
    ]);
    let table = cadTable.createPatternImportDxfPhaseECadTableZeroCanvasSessionV1(projection);
    const tableHook = vi.spyOn(cadTable, 'useCadTableZeroCanvasOwner').mockImplementation(() => ({
      session: table,
      update(next) {
        table = typeof next === 'function' ? next(table) : next;
      },
    }));
    try {
      const onActiveSeamIndexChange = vi.fn();
      const renderWorkbench = () => {
        type View = {
          overlay: Extract<
            ReturnType<typeof buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1>,
            { ok: true }
          >['overlay'];
          sendFocus: (piece: { scopeKey: string; pieceId: string; pieceLineKey: string }) => void;
        };
        let view: View | null = null;
        const markup = renderToStaticMarkup(
          createElement(PatternImportDxfProductExactNSeamProductionMountV2, {
            session,
            activeSeamIndex: 0,
            onActiveSeamIndexChange,
            desktopGeometry: {
              catalog: sealedCatalog,
              projection,
              annotationSource: null,
              savedSceneAuthority: prepared,
            },
            mannequin: ({ selection, focusSelection, sceneOverlay }) => {
              const sendFocus = (piece: {
                scopeKey: string;
                pieceId: string;
                pieceLineKey: string;
              }) => focusSelection({ operationNumber, ...piece, seamId });
              const staged = buildPatternImportDxfPhaseECadMannequinPatternPieceOverlayV1({
                sources: [{ scopeKey: savedRow.scopeKey, label: savedRow.scopeKey, projection }],
                selection,
                onFocus: (piece) => focusSelection({ operationNumber, ...piece }),
              });
              if (!staged.ok) throw new Error(staged.blocker.detail);
              view = { overlay: staged.overlay, sendFocus };
              return createElement('div', { 'data-restored-scene-status': sceneOverlay.status });
            },
            operationsPanel: null,
          }),
        );
        if (view === null) throw new Error('The exact N1 mannequin slot did not mount.');
        return { markup, view: view as View };
      };

      const mounted = renderWorkbench();
      expect(mounted.markup).toContain('data-restored-scene-status="available"');
      expect(mounted.markup).toContain('aria-label="Operation 120, seam 1 side A"');
      expect(mounted.markup).toContain('aria-label="Operation 120, seam 1 side B"');
      expect(mounted.markup).toContain('aria-label="Selected seam dimensions"');
      expect(mounted.markup).toMatch(/>A\s+[0-9.]+ mm</);
      expect(mounted.markup).toMatch(/>B\s+[0-9.]+ mm</);
      expect(mounted.markup).toContain('Difference 0.0 mm');
      expect(mounted.markup).toContain('Reversed');
      const [front, back] = mounted.view.overlay.pieces;
      const [frontLayout, backLayout] = table.layout.pieces;
      if (!front || !back || !frontLayout || !backLayout)
        throw new Error('The exact two-piece fixture is incomplete.');

      // The 2D pointer and object tree both commit this table-owned selection.
      table = cadTable.activatePatternImportDxfPhaseECadTableZeroCanvasPieceV1(
        table,
        frontLayout.identity.key,
        false,
      );
      const focused = renderWorkbench().view;
      expect(
        focused.overlay.pieces.filter(({ selected }) => selected).map(({ pieceKey }) => pieceKey),
      ).toEqual([front.pieceKey]);

      focused.overlay.onSelectPiece?.({ ...back, pieceLineKey: front.pieceLineKey });
      focused.sendFocus({ ...back, scopeKey: 'fabric:another' });
      focused.sendFocus({ ...back, pieceLineKey: front.pieceLineKey });
      expect(table.layout.selectedPieceKeys).toEqual([frontLayout.identity.key]);
      expect(onActiveSeamIndexChange).not.toHaveBeenCalled();

      focused.overlay.onSelectPiece?.(back);
      expect(table.layout.selectedPieceKeys).toEqual([backLayout.identity.key]);
      expect(
        renderWorkbench()
          .view.overlay.pieces.filter(({ selected }) => selected)
          .map(({ pieceKey }) => pieceKey),
      ).toEqual([back.pieceKey]);
    } finally {
      tableHook.mockRestore();
    }
    const copied = structuredClone(projection);
    const alteredCoordinates = {
      ...projection,
      pieces: projection.pieces.map((piece) => ({
        ...piece,
        contours: piece.contours.map((contour) => ({
          ...contour,
          vertices: contour.vertices.map((vertex) => ({
            ...vertex,
            pointMm: { x: vertex.pointMm.x + 5, y: vertex.pointMm.y },
          })),
        })),
      })),
    };
    const changed = {
      ...projection,
      sizeSelectionCanonicalSha256: digest('f'),
    };
    const nextRow = capture({ ...savedRow, revision: savedRow.revision + 1 });
    expect(nextRow).toBeTruthy();
    const nextProjection = readPatternImportDxfPhaseEZeroConnectSavedSceneProjectionV1(nextRow)!;
    const invalidInputs = [
      { ...request, prepared: { ...prepared } },
      { ...request, projection: copied },
      { ...request, projection: alteredCoordinates },
      { ...request, projection: changed },
      { ...request, prepared: nextRow, projection: nextProjection },
      {
        ...request,
        session: {
          ...session,
          current: { ...session.current, row: { ...savedRow, scopeKey: 'other' } },
        },
      },
      { ...request, session: { ...session, selectionOwner: { ...session.selectionOwner } } },
    ];
    for (const input of invalidInputs)
      expect(
        buildPatternImportDxfPhaseECadMannequinSavedOneSeamSceneOverlayV1(input),
      ).toMatchObject({
        status: 'blocked',
        bridge: null,
      });
    expect(put).toHaveBeenCalledTimes(1);
    clearPatternImportDxfProductExactNSeamProductionSessionV2(savedRow.techCardId);
  });

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
