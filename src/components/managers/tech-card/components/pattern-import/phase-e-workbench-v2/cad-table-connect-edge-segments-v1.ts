import type {
  PatternImportDxfProductPhaseEAssemblyProjectionPieceV1,
  PatternImportDxfProductPhaseEAssemblyProjectionV1,
} from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_CONNECT_EDGE_SEGMENTS_CLAIMS_V1 = Object.freeze({
  exactProjectionOnly: true,
  keepsOrderedAdjacentVertexIds: true,
  includesClosedContourClosingEdge: true,
  createsTopologyIdentity: false,
  appliesSnappingOrNearestRecovery: false,
} as const);

export type PatternImportDxfPhaseECadTableConnectEdgeSegmentV1 = Readonly<{
  /** View-only React/data key. The exact topology identity is the fields below, not this string. */
  viewKey: string;
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  contourRole: 'sewing-boundary' | 'cut-boundary' | 'hole';
  boundaryVertexIds: readonly [string, string];
  pointsMm: readonly [Readonly<{ x: number; y: number }>, Readonly<{ x: number; y: number }>];
}>;

function segmentsOfPiece(
  piece: PatternImportDxfProductPhaseEAssemblyProjectionPieceV1,
): PatternImportDxfPhaseECadTableConnectEdgeSegmentV1[] {
  return piece.contours.flatMap((contour) => {
    const vertices = [...contour.vertices].sort((left, right) => left.ordinal - right.ordinal);
    if (vertices.length < 2) return [];
    const pairs = vertices
      .slice(0, -1)
      .map((vertex, index) => [vertex, vertices[index + 1]!] as const);
    if (contour.closed && vertices.length > 2) pairs.push([vertices.at(-1)!, vertices[0]!]);
    return pairs.flatMap(([from, to]) =>
      from.vertexId &&
      to.vertexId &&
      Number.isFinite(from.pointMm.x) &&
      Number.isFinite(from.pointMm.y) &&
      Number.isFinite(to.pointMm.x) &&
      Number.isFinite(to.pointMm.y)
        ? [
            Object.freeze({
              viewKey: `${piece.pieceId}:${piece.pieceLineKey}:${contour.contourId}:${from.vertexId}->${to.vertexId}`,
              pieceId: piece.pieceId,
              pieceLineKey: piece.pieceLineKey,
              contourId: contour.contourId,
              contourRole: contour.role,
              boundaryVertexIds: Object.freeze([from.vertexId, to.vertexId] as const),
              pointsMm: Object.freeze([from.pointMm, to.pointMm] as const),
            }),
          ]
        : [],
    );
  });
}

/** Derives pointer hit-target segments without inventing or normalizing topology identities. */
export function derivePatternImportDxfPhaseECadTableConnectEdgeSegmentsV1(
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
): readonly PatternImportDxfPhaseECadTableConnectEdgeSegmentV1[] {
  return Object.freeze(projection.pieces.flatMap(segmentsOfPiece));
}
