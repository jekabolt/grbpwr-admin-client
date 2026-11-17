import { describe, expect, it } from 'vitest';

import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
  type PatternImportDxfProductPhaseEAuthoringCatalogV1,
} from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import {
  PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
  type PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import { PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1 } from './from-scratch-operation-identity-policy-v1';
import { buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1 } from './cad-table-zero-connect-exact-anchor-geometry-v1';
import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
} from './cad-table-zero-connect-session-v1';

const CATALOG_SHA = 'a'.repeat(64);
const SELECTION_SHA = 'b'.repeat(64);

function vertices(pieceId: string) {
  return [0, 1, 2, 3].map((ordinal) => ({
    ordinal,
    vertexId: `${pieceId}:v${ordinal}`,
    normalizedArc: ordinal / 4,
  }));
}

function authority(): {
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
} {
  const pieces = ['front', 'back'].map((pieceId) => ({
    pieceId,
    pieceLineKey: `piece-${pieceId}`,
    contours: [
      {
        contourId: `${pieceId}:sewing`,
        role: 'sewing-boundary' as const,
        geometry: { kind: 'seam' as const },
        closed: true,
        boundaryVertices: vertices(pieceId),
      },
    ],
  }));
  return {
    catalog: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_AUTHORING_CATALOG_V1,
      techCardId: 156,
      scopeKey: 'main',
      sizeToken: 'M',
      sourceFileId: 'source-156',
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      pieces,
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
      canonicalSha256: CATALOG_SHA,
      geometryCoordinatesExposed: false,
      rawDxfExposed: false,
      assemblyInferred: false,
      productionReady: false,
    },
    projection: {
      schemaVersion: PATTERN_IMPORT_DXF_PRODUCT_PHASE_E_ASSEMBLY_PROJECTION_V1,
      expectedCatalogCanonicalSha256: CATALOG_SHA,
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      sourceFileId: 'source-156',
      sizeToken: 'M',
      joinMode: 'catalog-ordinal-to-phase-d-point',
      pieces: pieces.map((piece) => ({
        pieceId: piece.pieceId,
        pieceLineKey: piece.pieceLineKey,
        contours: [
          {
            contourId: piece.contours[0]!.contourId,
            role: 'sewing-boundary' as const,
            closed: true,
            // Deliberately identical coordinates: sealed identity must select the source edge.
            vertices: vertices(piece.pieceId).map((vertex, index) => ({
              ...vertex,
              pointMm: [
                { x: 0, y: 0 },
                { x: 120, y: 0 },
                { x: 120, y: 80 },
                { x: 0, y: 80 },
              ][index]!,
            })),
          },
        ],
        cameraMm: { minX: 0, minY: 0, maxX: 120, maxY: 80, padding: 0 },
      })),
      geometryPlacementApplied: false,
    },
  };
}

function candidate(
  frontVertices: readonly [string, string] = ['front:v0', 'front:v1'],
  backVertices: readonly [string, string] = ['back:v1', 'back:v0'],
): PatternImportDxfPhaseECadTableZeroConnectCandidateV1 {
  const side = (
    pieceId: string,
    boundaryVertexIds: readonly [string, string],
    direction: 'forward' | 'reverse',
  ) => ({
    pieceId,
    pieceLineKey: `piece-${pieceId}`,
    contourId: `${pieceId}:sewing`,
    boundaryVertexIds,
    direction,
  });
  return {
    schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
    status: 'session-only-operation-candidate',
    source: {
      catalogCanonicalSha256: CATALOG_SHA,
      sizeSelectionCanonicalSha256: SELECTION_SHA,
      sourceFileId: 'source-156',
      scopeKey: 'main',
      sizeToken: 'M',
    },
    operation: {
      sessionOperationId: 'connect-156',
      order: 0,
      stage: 0,
      dependsOn: [],
      operationNumber: 0,
      authoringOperationId: null,
    },
    connection: {
      intentId: 'connect-156',
      mapping: 'equal',
      lengthRatio: 1,
      sides: [side('front', frontVertices, 'forward'), side('back', backVertices, 'reverse')],
    },
    apply: {
      eligible: false,
      boundary: PATTERN_IMPORT_DXF_PHASE_E_FROM_SCRATCH_OPERATION_IDENTITY_POLICY_V1,
    },
    claims: PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  };
}

describe('zero-connect exact anchor geometry', () => {
  it('creates only two selected edges with sealed DXF identities', () => {
    const result = buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
      candidate: candidate(),
      ...authority(),
    });

    expect(result).toMatchObject({
      ok: true,
      geometry: {
        geometrySizeToken: 'M',
        sideTargets: [
          'piece-front#dxf:front%3Asewing:front%3Av0>front%3Av1',
          'piece-back#dxf:back%3Asewing:back%3Av1>back%3Av0',
        ],
        pieces: [
          {
            edges: [
              {
                exactDxfBoundary: {
                  sourceFileId: 'source-156',
                  scopeKey: 'main',
                  pieceId: 'front',
                  boundaryVertexIds: ['front:v0', 'front:v1'],
                },
              },
            ],
          },
          {
            edges: [{ exactDxfBoundary: { boundaryVertexIds: ['back:v1', 'back:v0'] } }],
          },
        ],
      },
    });
  });

  it('distinguishes exact edges on the same pieces and is invariant to A/B pair order', () => {
    const first = buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
      candidate: candidate(),
      ...authority(),
    });
    const secondCandidate = candidate(['front:v1', 'front:v2'], ['back:v2', 'back:v1']);
    const second = buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
      candidate: secondCandidate,
      ...authority(),
    });
    const swapped = buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
      candidate: {
        ...secondCandidate,
        connection: {
          ...secondCandidate.connection,
          sides: [secondCandidate.connection.sides[1], secondCandidate.connection.sides[0]],
        },
      },
      ...authority(),
    });

    if (!first.ok || !second.ok || !swapped.ok) throw new Error('expected exact geometry');
    expect(second.geometry.sideTargets).not.toEqual(first.geometry.sideTargets);
    expect(new Set(swapped.geometry.sideTargets)).toEqual(new Set(second.geometry.sideTargets));
    expect(
      swapped.geometry.pieces.map(({ pieceKey, edges }) => [pieceKey, edges[0]!.k]).sort(),
    ).toEqual(second.geometry.pieces.map(({ pieceKey, edges }) => [pieceKey, edges[0]!.k]).sort());
  });

  it('rejects a foreign source binding even when geometry coordinates coincide', () => {
    const current = authority();
    const projection = { ...current.projection, sourceFileId: 'foreign-source' };
    expect(
      buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
        candidate: candidate(),
        catalog: current.catalog,
        projection,
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'exact-anchor-source-stale' } });
  });

  it('rejects catalog scope, size and selection drift', () => {
    const current = authority();
    const attempts = [
      { catalog: { ...current.catalog, scopeKey: 'lining' }, projection: current.projection },
      {
        catalog: current.catalog,
        projection: { ...current.projection, sizeToken: 'L' },
      },
      {
        catalog: current.catalog,
        projection: {
          ...current.projection,
          sizeSelectionCanonicalSha256: 'c'.repeat(64),
        },
      },
    ];
    for (const attempt of attempts)
      expect(
        buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
          candidate: candidate(),
          ...attempt,
        }),
      ).toMatchObject({ ok: false, blocker: { code: 'exact-anchor-source-stale' } });
  });

  it('rejects nonadjacent vertex identities', () => {
    expect(
      buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
        candidate: candidate(['front:v0', 'front:v2']),
        ...authority(),
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'exact-anchor-edge-nonadjacent' } });
  });

  it('rejects a duplicate piece pair', () => {
    const duplicate = candidate();
    const first = duplicate.connection.sides[0];
    const samePiece = {
      ...duplicate,
      connection: { ...duplicate.connection, sides: [first, first] as const },
    };
    expect(
      buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1({
        candidate: samePiece,
        ...authority(),
      }),
    ).toMatchObject({ ok: false, blocker: { code: 'exact-anchor-piece-pair-invalid' } });
  });
});
