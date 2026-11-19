import {
  ASSEMBLY_SKELETON_DXF_EXACT_BOUNDARY_EDGE_V1,
  type Edge,
  type PieceGeom,
  type Pt2,
} from 'lib/assembly-skeleton/types';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
} from './cad-table-zero-connect-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_V1 =
  'pattern-import-dxf-phase-e-zero-connect-exact-anchor-geometry/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_CLAIMS_V1 =
  Object.freeze({
    catalogAndProjectionIdentityRequired: true,
    nearestGeometryRecoveryUsed: false,
    coordinateEqualityUsedAsAuthority: false,
    legacySkeletonGeometryUsedAsAuthority: false,
    projectionCoordinatesUsedForLegacyAnchorSerializationOnly: true,
    onlySelectedEdgesCarryExactDxfBoundary: true,
    networkWritePerformed: false,
    formMutationPerformed: false,
  } as const);

export type PatternImportDxfPhaseEZeroConnectExactAnchorGeometryBlockerV1 = Readonly<{
  code:
    | 'exact-anchor-envelope-invalid'
    | 'exact-anchor-source-stale'
    | 'exact-anchor-piece-pair-invalid'
    | 'exact-anchor-piece-ambiguous'
    | 'exact-anchor-contour-ambiguous'
    | 'exact-anchor-vertex-ambiguous'
    | 'exact-anchor-edge-nonadjacent'
    | 'exact-anchor-projection-invalid';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_V1;
  status: 'exact-selected-edges-ready-for-legacy-anchor-serialization';
  geometrySizeToken: string;
  pieces: readonly [PieceGeom, PieceGeom];
  sideTargets: readonly [string, string];
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEZeroConnectExactAnchorGeometryResultV1 =
  | Readonly<{
      ok: true;
      geometry: PatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      geometry: null;
      blocker: PatternImportDxfPhaseEZeroConnectExactAnchorGeometryBlockerV1;
    }>;

type CandidateSide =
  PatternImportDxfPhaseECadTableZeroConnectCandidateV1['connection']['sides'][number];
type ExactAnchorEdge = Pick<
  CandidateSide,
  'pieceId' | 'pieceLineKey' | 'contourId' | 'boundaryVertexIds'
>;
type CatalogPiece = PatternImportDxfProductPhaseEAuthoringCatalogV1['pieces'][number];
type ProjectionPiece = PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number];

function blocked(
  code: PatternImportDxfPhaseEZeroConnectExactAnchorGeometryBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEZeroConnectExactAnchorGeometryResultV1 {
  return Object.freeze({
    ok: false as const,
    geometry: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function finitePoint(value: unknown): value is Readonly<{ x: number; y: number }> {
  const point = value as Readonly<{ x?: unknown; y?: unknown }> | null;
  return Boolean(
    point &&
      typeof point.x === 'number' &&
      Number.isFinite(point.x) &&
      typeof point.y === 'number' &&
      Number.isFinite(point.y),
  );
}

function distance(left: Pt2, right: Pt2): number {
  return Math.hypot(right[0] - left[0], right[1] - left[1]);
}

function perimeter(points: readonly Pt2[], closed: boolean): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += distance(points[index - 1]!, points[index]!);
  if (closed && points.length > 2) total += distance(points[points.length - 1]!, points[0]!);
  return total;
}

function area(points: readonly Pt2[], closed: boolean): number {
  if (!closed || points.length < 3) return 0;
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

function currentSource(input: {
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}): boolean {
  const { candidate, catalog, projection } = input;
  return (
    candidate.source.catalogCanonicalSha256 === catalog.canonicalSha256 &&
    candidate.source.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    candidate.source.sourceFileId === catalog.sourceFileId &&
    candidate.source.scopeKey === catalog.scopeKey &&
    candidate.source.sizeToken === catalog.sizeToken &&
    projection.expectedCatalogCanonicalSha256 === catalog.canonicalSha256 &&
    projection.sizeSelectionCanonicalSha256 === catalog.sizeSelectionCanonicalSha256 &&
    projection.sourceFileId === catalog.sourceFileId &&
    projection.sizeToken === catalog.sizeToken &&
    projection.joinMode === 'catalog-ordinal-to-phase-d-point' &&
    projection.geometryPlacementApplied === false
  );
}

function exactPiece(
  side: ExactAnchorEdge,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
):
  | Readonly<{ ok: true; catalogPiece: CatalogPiece; projectionPiece: ProjectionPiece }>
  | Readonly<{
      ok: false;
      blocker: PatternImportDxfPhaseEZeroConnectExactAnchorGeometryBlockerV1;
    }> {
  const catalogMatches = catalog.pieces.filter(
    (piece) => piece.pieceId === side.pieceId && piece.pieceLineKey === side.pieceLineKey,
  );
  const projectionMatches = projection.pieces.filter(
    (piece) => piece.pieceId === side.pieceId && piece.pieceLineKey === side.pieceLineKey,
  );
  if (catalogMatches.length !== 1 || projectionMatches.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-piece-ambiguous' as const,
        detail: 'The selected piece must occur once in the current catalog and projection.',
      }),
    });
  return Object.freeze({
    ok: true as const,
    catalogPiece: catalogMatches[0]!,
    projectionPiece: projectionMatches[0]!,
  });
}

/** Builds one tagged edge for the existing persisted seam anchor serializer. */
export function buildPatternImportDxfPhaseEExactAnchorEdgeV1(
  side: ExactAnchorEdge,
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
):
  | Readonly<{ ok: true; piece: PieceGeom; target: string }>
  | Readonly<{
      ok: false;
      blocker: PatternImportDxfPhaseEZeroConnectExactAnchorGeometryBlockerV1;
    }> {
  const piece = exactPiece(side, catalog, projection);
  if (!piece.ok) return piece;
  const catalogContours = piece.catalogPiece.contours.filter(
    (contour) => contour.contourId === side.contourId,
  );
  const projectionContours = piece.projectionPiece.contours.filter(
    (contour) => contour.contourId === side.contourId,
  );
  if (
    catalogContours.length !== 1 ||
    projectionContours.length !== 1 ||
    catalogContours[0]!.role !== 'sewing-boundary' ||
    projectionContours[0]!.role !== 'sewing-boundary'
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-contour-ambiguous' as const,
        detail: 'The selected contour must be one current sewing boundary.',
      }),
    });
  const catalogContour = catalogContours[0]!;
  const projectionContour = projectionContours[0]!;
  if (
    catalogContour.closed !== projectionContour.closed ||
    catalogContour.boundaryVertices.length < 2 ||
    catalogContour.boundaryVertices.length !== projectionContour.vertices.length
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-projection-invalid' as const,
        detail: 'The current catalog contour and Phase-D projection cardinality differ.',
      }),
    });

  const points: Pt2[] = [];
  for (let index = 0; index < catalogContour.boundaryVertices.length; index += 1) {
    const catalogVertex = catalogContour.boundaryVertices[index]!;
    const projectedVertex = projectionContour.vertices[index]!;
    const catalogIdentityCount = catalogContour.boundaryVertices.filter(
      (vertex) => vertex.vertexId === catalogVertex.vertexId,
    ).length;
    const projectionIdentityCount = projectionContour.vertices.filter(
      (vertex) => vertex.vertexId === projectedVertex.vertexId,
    ).length;
    if (
      catalogVertex.ordinal !== index ||
      projectedVertex.ordinal !== index ||
      catalogVertex.vertexId !== projectedVertex.vertexId ||
      catalogIdentityCount !== 1 ||
      projectionIdentityCount !== 1 ||
      !finitePoint(projectedVertex.pointMm)
    )
      return Object.freeze({
        ok: false as const,
        blocker: Object.freeze({
          code: 'exact-anchor-vertex-ambiguous' as const,
          detail: 'Each current contour vertex needs one matching projected identity and ordinal.',
        }),
      });
    points.push([projectedVertex.pointMm.x, projectedVertex.pointMm.y]);
  }

  if (
    !Array.isArray(side.boundaryVertexIds) ||
    side.boundaryVertexIds.length !== 2 ||
    side.boundaryVertexIds[0] === side.boundaryVertexIds[1]
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-vertex-ambiguous' as const,
        detail: 'An exact selected edge needs two distinct ordered vertex identities.',
      }),
    });
  const indexes = side.boundaryVertexIds.map((vertexId) =>
    catalogContour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  ) as [number, number];
  if (
    indexes.some((index) => index < 0) ||
    indexes.some(
      (index, selectedIndex) =>
        projectionContour.vertices[index]?.vertexId !== side.boundaryVertexIds[selectedIndex],
    )
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-vertex-ambiguous' as const,
        detail: 'A selected vertex identity is absent from the current exact contour.',
      }),
    });
  const delta = Math.abs(indexes[0] - indexes[1]);
  if (
    delta !== 1 &&
    !(
      catalogContour.closed &&
      catalogContour.boundaryVertices.length > 2 &&
      delta === catalogContour.boundaryVertices.length - 1
    )
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-edge-nonadjacent' as const,
        detail: 'The ordered selected vertices are not one adjacent boundary edge.',
      }),
    });

  const edgePoints = [points[indexes[0]]!, points[indexes[1]]!] as [Pt2, Pt2];
  const lenMm = distance(edgePoints[0], edgePoints[1]);
  if (!(lenMm > 0) || !Number.isFinite(lenMm))
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-projection-invalid' as const,
        detail: 'The selected projected edge must have finite positive length.',
      }),
    });

  const edgeOrdinal =
    (indexes[0] + 1) % catalogContour.boundaryVertices.length === indexes[1]
      ? indexes[0]
      : indexes[1];
  // The existing seam writer serializes this edge key into a 64-rune diagnostic hint.
  // Full native contour and vertex identities remain in exactDxfBoundary and the sidecar.
  const contourOrdinal = piece.catalogPiece.contours.indexOf(catalogContour);
  const target = exactEdgeHint(side.pieceLineKey, contourOrdinal, edgeOrdinal);
  if (Array.from(target).length > 64)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'exact-anchor-projection-invalid' as const,
        detail: 'The selected pattern edge cannot be represented by a saved seam locator.',
      }),
    });
  const edge: Edge = Object.freeze({
    id: target,
    pieceKey: side.pieceLineKey,
    k: edgeOrdinal,
    s: indexes[0],
    e: indexes[1],
    pts: edgePoints.map((point) => [...point] as Pt2),
    lenMm,
    chordMm: lenMm,
    turnDeg: 0,
    notchesMm: [],
    kind: 'edge' as const,
    exactDxfBoundary: Object.freeze({
      schemaVersion: ASSEMBLY_SKELETON_DXF_EXACT_BOUNDARY_EDGE_V1,
      sourceFileId: catalog.sourceFileId,
      scopeKey: catalog.scopeKey,
      sizeToken: catalog.sizeToken,
      catalogCanonicalSha256: catalog.canonicalSha256,
      sizeSelectionCanonicalSha256: catalog.sizeSelectionCanonicalSha256,
      pieceId: side.pieceId,
      pieceLineKey: side.pieceLineKey,
      contourId: side.contourId,
      boundaryVertexIds: Object.freeze([
        side.boundaryVertexIds[0],
        side.boundaryVertexIds[1],
      ]) as readonly [string, string],
      fullEdge: true as const,
    }),
  });
  const exactPieceGeometry: PieceGeom = Object.freeze({
    pieceKey: side.pieceLineKey,
    name: side.pieceLineKey,
    hand: null,
    cloth: null,
    rs: points.map((point) => [...point] as Pt2),
    corners: points.map((_, index) => index),
    notchIdx: [],
    edges: [edge],
    rect: false,
    areaMm2: area(points, catalogContour.closed),
    perimMm: perimeter(points, catalogContour.closed),
    twinOf: [],
  });
  return Object.freeze({ ok: true as const, piece: exactPieceGeometry, target });
}

function exactEdgeHint(pieceLineKey: string, contourOrdinal: number, edgeOrdinal: number): string {
  return `${pieceLineKey}#dxf:${contourOrdinal.toString(36)}:${edgeOrdinal.toString(36)}`;
}

/** A saved locator yields candidates only. The complete anchor independently checks the edge. */
export function readPatternImportDxfPhaseEExactAnchorEdgeHintV1(
  pieceLineKey: string,
  hint: string,
): Readonly<{ contourOrdinal: number; edgeOrdinal: number }> | null {
  const prefix = `${pieceLineKey}#dxf:`;
  if (!hint.startsWith(prefix) || Array.from(hint).length > 64) return null;
  const ordinals = hint.slice(prefix.length).match(/^([0-9a-z]+):([0-9a-z]+)$/);
  if (!ordinals) return null;
  const contourOrdinal = Number.parseInt(ordinals[1]!, 36);
  const edgeOrdinal = Number.parseInt(ordinals[2]!, 36);
  if (
    !Number.isSafeInteger(contourOrdinal) ||
    !Number.isSafeInteger(edgeOrdinal) ||
    exactEdgeHint(pieceLineKey, contourOrdinal, edgeOrdinal) !== hint
  )
    return null;
  return { contourOrdinal, edgeOrdinal };
}

/**
 * Builds the minimum legacy anchor geometry from sealed exact identities. Projection coordinates
 * serialize the existing StoredSeam samples only; they never select the edge.
 */
export function buildPatternImportDxfPhaseEZeroConnectExactAnchorGeometryV1(input: {
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
}): PatternImportDxfPhaseEZeroConnectExactAnchorGeometryResultV1 {
  try {
    const { candidate, catalog, projection } = input ?? {};
    if (
      !candidate ||
      !catalog ||
      !projection ||
      candidate.schemaVersion !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1 ||
      candidate.status !== 'session-only-operation-candidate' ||
      candidate.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1 ||
      !Array.isArray(candidate.connection?.sides) ||
      candidate.connection.sides.length !== 2
    )
      return blocked(
        'exact-anchor-envelope-invalid',
        'One current exact zero-connect candidate, catalog and projection are required.',
      );
    if (!currentSource({ candidate, catalog, projection }))
      return blocked(
        'exact-anchor-source-stale',
        'The candidate, catalog and projection are not the same exact source.',
      );
    const [sideA, sideB] = candidate.connection.sides;
    if (
      sideA.pieceId === sideB.pieceId ||
      sideA.pieceLineKey === sideB.pieceLineKey ||
      (sideA.direction !== 'forward' && sideA.direction !== 'reverse') ||
      (sideB.direction !== 'forward' && sideB.direction !== 'reverse')
    )
      return blocked(
        'exact-anchor-piece-pair-invalid',
        'The selected pair must contain two distinct exact pieces with explicit directions.',
      );
    const first = buildPatternImportDxfPhaseEExactAnchorEdgeV1(sideA, catalog, projection);
    if (!first.ok)
      return Object.freeze({ ok: false as const, geometry: null, blocker: first.blocker });
    const second = buildPatternImportDxfPhaseEExactAnchorEdgeV1(sideB, catalog, projection);
    if (!second.ok)
      return Object.freeze({ ok: false as const, geometry: null, blocker: second.blocker });
    return Object.freeze({
      ok: true as const,
      geometry: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_V1,
        status: 'exact-selected-edges-ready-for-legacy-anchor-serialization' as const,
        geometrySizeToken: catalog.sizeToken,
        pieces: Object.freeze([first.piece, second.piece]) as readonly [PieceGeom, PieceGeom],
        sideTargets: Object.freeze([first.target, second.target]) as readonly [string, string],
        claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_EXACT_ANCHOR_GEOMETRY_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch {
    return blocked(
      'exact-anchor-envelope-invalid',
      'The exact zero-connect anchor input must be readable current data.',
    );
  }
}
