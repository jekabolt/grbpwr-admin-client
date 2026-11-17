import { describe, expect, it, vi } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { resolvePatternImportDxfPhaseEZeroConnectSavedOperationV1 } from './cad-table-zero-connect-post-save-owner-v1';
import { preparePatternImportDxfPhaseEZeroConnectCardOperationRowV1 } from './cad-table-zero-connect-row-adapter-v1';
import { derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1 } from './cad-table-connect-edge-segments-v1';
import {
  createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1,
  selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1,
  startPatternImportDxfPhaseECadTableZeroConnectControllerV1,
} from './cad-table-zero-connect-controller-v1';
import {
  buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1,
  buildPatternImportDxfPhaseECadTableZeroConnectIdentityPlanV1,
  createPatternImportDxfPhaseECadTableZeroConnectSessionV1,
  selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1,
  type PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
  type PatternImportDxfPhaseECadTableZeroConnectSessionV1,
} from './cad-table-zero-connect-session-v1';

const REQUIRED_FIELDS = [
  'documentId-and-revision',
  'physical-surface',
  'two-seam-sides-and-anchor-ranges',
  'side-directions',
  'mapping-and-length-ratio',
  'operation-stage-and-order',
  'immutable-material-revisions',
  'tolerances',
] as const;

function authority(): PatternImportDxfPhaseECadTableZeroConnectAuthorityV1 {
  const vertices = (prefix: string) =>
    [
      { ordinal: 0, vertexId: `${prefix}-v0`, normalizedArc: 0 },
      { ordinal: 1, vertexId: `${prefix}-v1`, normalizedArc: 0.5 },
      { ordinal: 2, vertexId: `${prefix}-v2`, normalizedArc: 1 },
    ] as const;
  const pieces: PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'] = [
    {
      pieceId: 'front',
      pieceLineKey: 'piece-front',
      contours: [
        {
          contourId: 'front-cut',
          role: 'cut-boundary',
          geometry: { kind: 'cut' },
          closed: true,
          boundaryVertices: vertices('front'),
        },
      ],
    },
    {
      pieceId: 'back',
      pieceLineKey: 'piece-back',
      contours: [
        {
          contourId: 'back-cut',
          role: 'cut-boundary',
          geometry: { kind: 'cut' },
          closed: true,
          boundaryVertices: vertices('back'),
        },
      ],
    },
  ];
  const catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
    techCardId: 6,
    scopeKey: 'front-material',
    sizeToken: 'M',
    sourceFileId: 'dxf-card-6',
    sizeSelectionCanonicalSha256: 'a'.repeat(64),
    pieces,
    requiredExplicitFields: REQUIRED_FIELDS,
    canonicalSha256: 'b'.repeat(64),
    geometryCoordinatesExposed: false,
    rawDxfExposed: false,
    assemblyInferred: false,
    productionReady: false,
  };
  const projectionPieces: PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'] = pieces.map(
    (piece, pieceIndex) => ({
      pieceId: piece.pieceId,
      pieceLineKey: piece.pieceLineKey,
      contours: piece.contours.map((contour) => ({
        contourId: contour.contourId,
        role: contour.role,
        closed: contour.closed,
        vertices: contour.boundaryVertices.map((vertex) => ({
          ...vertex,
          pointMm: { x: vertex.ordinal * 10 + pieceIndex * 40, y: vertex.ordinal * 8 },
        })),
      })),
      cameraMm: {
        minX: pieceIndex * 40,
        minY: 0,
        maxX: pieceIndex * 40 + 20,
        maxY: 16,
        padding: 2,
      },
    }),
  );
  const projection: PatternImportDxfProductPhaseEAssemblyProjectionV1 = {
    schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
    expectedCatalogCanonicalSha256: catalog.canonicalSha256,
    sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
    sourceFileId: catalog.sourceFileId,
    sizeToken: catalog.sizeToken,
    joinMode: 'catalog-ordinal-to-phase-d-point',
    pieces: projectionPieces,
    geometryPlacementApplied: false,
  };
  return { catalog, projection };
}

function readySession(
  currentAuthority: PatternImportDxfPhaseECadTableZeroConnectAuthorityV1,
): PatternImportDxfPhaseECadTableZeroConnectSessionV1 {
  const created = createPatternImportDxfPhaseECadTableZeroConnectSessionV1(currentAuthority, {
    sessionOperationId: 'cad-connect-1',
    order: 0,
    stage: 0,
    dependsOn: [],
    operationNumber: 0,
    authoringOperationId: null,
  });
  if (!created.ok) throw new Error(created.blocker.detail);
  const sideA = selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1(
    created.session,
    currentAuthority,
    {
      pieceId: 'front',
      contourId: 'front-cut',
      boundaryVertexIds: ['front-v0', 'front-v1'],
      direction: 'forward',
    },
  );
  if (!sideA.ok) throw new Error(sideA.blocker.detail);
  const sideB = selectPatternImportDxfPhaseECadTableZeroConnectEdgeV1(
    sideA.session,
    currentAuthority,
    {
      pieceId: 'back',
      contourId: 'back-cut',
      boundaryVertexIds: ['back-v0', 'back-v1'],
      direction: 'reverse',
    },
  );
  if (!sideB.ok) throw new Error(sideB.blocker.detail);
  return sideB.session;
}

describe('zero-connect from-scratch Assembly Order route', () => {
  it('prepares the first real form row without requiring an existing Assembly Order operation', () => {
    const currentAuthority = authority();
    const session = readySession(currentAuthority);
    const candidate = buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1(
      session,
      currentAuthority,
    );
    expect(candidate.ok).toBe(true);
    if (!candidate.ok) return;

    const identity = buildPatternImportDxfPhaseECadTableZeroConnectIdentityPlanV1([session], 0);
    expect(identity.ok).toBe(true);
    if (!identity.ok) return;

    const prepared = preparePatternImportDxfPhaseEZeroConnectCardOperationRowV1({
      candidate: candidate.candidate,
      session,
      identityPlan: identity.plan,
      existingHistoryKeys: [],
    });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.identity.insertIndex).toBe(0);
    expect(prepared.row).toMatchObject({
      historyKey: 'cad-connect-1',
      operationNumber: 0,
      draft: true,
      inputKeys: ['piece-front', 'piece-back'],
    });
  });

  it('correlates the appended row after the ordinary card save assigns its number', () => {
    const currentAuthority = authority();
    const session = readySession(currentAuthority);
    const candidate = buildPatternImportDxfPhaseECadTableZeroConnectCandidateV1(
      session,
      currentAuthority,
    );
    if (!candidate.ok) throw new Error(candidate.blocker.detail);

    const resolved = resolvePatternImportDxfPhaseEZeroConnectSavedOperationV1(
      [{ historyKey: 'cad-connect-1', operationNumber: 10, seamKeys: [] }],
      candidate.candidate,
    );
    expect(resolved).toMatchObject({
      ok: true,
      operationIndex: 0,
      savedOperation: {
        historyKey: 'cad-connect-1',
        operationNumber: 10,
      },
    });
  });

  it('refuses a structural refresh function before calling the handoff owner', () => {
    const currentAuthority = authority();
    const authoringAuthority = Object.freeze({ opaque: 'genuine-owner-token' }) as never;
    const authoringAuthorityRefresh = Object.freeze({ refresh: vi.fn() }) as never;
    const controllerAuthority = {
      ...currentAuthority,
      authoringAuthority,
      authoringAuthorityRefresh,
    };
    const ingest = vi.fn(() => {
      return {
        ok: true as const,
        inserted: 1 as const,
        historyKey: 'connect:bbbbbbbbbbbb:1',
        sessionRevision: 2,
        blocker: null,
      };
    });
    const handoff = { status: 'available' as const, ingest };
    const segments = derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(
      currentAuthority.projection,
    );
    const front = segments.find(({ pieceId }) => pieceId === 'front')!;
    const back = segments.find(({ pieceId }) => pieceId === 'back')!;

    let state = startPatternImportDxfPhaseECadTableZeroConnectControllerV1(
      createPatternImportDxfPhaseECadTableZeroConnectControllerStateV1(),
      controllerAuthority,
    );
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      controllerAuthority,
      front,
      'forward',
      handoff,
    );
    expect(ingest).not.toHaveBeenCalled();
    state = selectPatternImportDxfPhaseECadTableZeroConnectControllerEdgeV1(
      state,
      controllerAuthority,
      back,
      'reverse',
      handoff,
    );

    expect(ingest).not.toHaveBeenCalled();
    expect(state.handoffResult).toMatchObject({
      ok: false,
      inserted: 0,
      blocker: { code: 'zero-connect-authoring-write-refused' },
    });
  });
});
