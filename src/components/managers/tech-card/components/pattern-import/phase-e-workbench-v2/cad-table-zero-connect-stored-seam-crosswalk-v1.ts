import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import type { PatternImportDxfProductPhaseEAuthoringCatalogV1 } from 'lib/cloth/domain/pattern-import-dxf-product-phase-e-authoring-catalog-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { SidePart } from 'lib/seams';

import {
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1,
  PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1,
  type PatternImportDxfPhaseECadTableZeroConnectCandidateV1,
} from './cad-table-zero-connect-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_V1 =
  'pattern-import-dxf-phase-e-zero-connect-stored-seam-crosswalk/1' as const;

export const PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_CLAIMS_V1 =
  Object.freeze({
    currentCatalogAndProjectionRequired: true,
    currentSkeletonGeometryRequired: true,
    sewingBoundaryOnly: true,
    equalMappingOnly: true,
    uniqueSingleSkeletonEdgeRequired: true,
    sidePartsUseSkeletonEdgeMillimetres: true,
    storedSeamDirectionInferred: false,
    seamIdentityMinted: false,
    formMutationPerformed: false,
    networkWritePerformed: false,
    createsSeamAuthority: false,
    productionReady: false,
  } as const);

export type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkInputV1 = Readonly<{
  candidate: PatternImportDxfPhaseECadTableZeroConnectCandidateV1;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  geometry: readonly PieceGeom[];
  /** The exact size used to build the current assembly-skeleton geometry. */
  geometrySizeToken: string;
  /** Strict geometric admission tolerance in millimetres. Defaults to 0.75 mm. */
  toleranceMm?: number;
}>;

export type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1 = Readonly<{
  pieceId: string;
  pieceLineKey: string;
  contourId: string;
  boundaryVertexIds: readonly [string, string];
  sourceDirection: 'forward' | 'reverse';
  parts: readonly [SidePart];
  maxErrorMm: number;
}>;

export type PatternImportDxfPhaseEStoredSeamExactSideCrosswalkInputV1 = Readonly<{
  side: Readonly<{
    pieceId: string;
    pieceLineKey: string;
    contourId: string;
    boundaryVertexIds: readonly [string, string];
    direction: 'forward' | 'reverse';
  }>;
  catalog: PatternImportDxfProductPhaseEAuthoringCatalogV1;
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1;
  geometry: readonly PieceGeom[];
  geometrySizeToken: string;
  toleranceMm?: number;
}>;

export type PatternImportDxfPhaseEStoredSeamExactSideCrosswalkResultV1 =
  | Readonly<{
      ok: true;
      side: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      side: null;
      blocker: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1;
    }>;

export type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkReceiptV1 = Readonly<{
  schemaVersion: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_V1;
  status: 'unique-equal-side-parts-ready';
  mapping: 'equal';
  lengthRatio: 1;
  sides: readonly [
    PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1,
    PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1,
  ];
  /** `rowFromHand` still needs an explicit caller-owned decision. */
  storedSeamDirectionRequired: true;
  claims: typeof PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_CLAIMS_V1;
}>;

export type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1 = Readonly<{
  code:
    | 'crosswalk-envelope-invalid'
    | 'crosswalk-source-stale'
    | 'crosswalk-size-mismatch'
    | 'crosswalk-mapping-unsupported'
    | 'crosswalk-piece-not-exact'
    | 'crosswalk-contour-not-sewing-boundary'
    | 'crosswalk-edge-not-exact'
    | 'crosswalk-geometry-piece-not-exact'
    | 'crosswalk-segment-off-geometry'
    | 'crosswalk-segment-ambiguous';
  detail: string;
}>;

export type PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkResultV1 =
  | Readonly<{
      ok: true;
      receipt: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkReceiptV1;
      blocker: null;
    }>
  | Readonly<{
      ok: false;
      receipt: null;
      blocker: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1;
    }>;

const DEFAULT_TOLERANCE_MM = 0.75;
const WHOLE_EDGE_TOLERANCE_MM = 0.05;
const SAMPLE_COUNT = 9;

function blocked(
  code: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1['code'],
  detail: string,
): PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkResultV1 {
  return Object.freeze({
    ok: false as const,
    receipt: null,
    blocker: Object.freeze({ code, detail }),
  });
}

function finitePoint(point: { x: number; y: number } | undefined): point is {
  x: number;
  y: number;
} {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

function distance(a: Pt2, b: Pt2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function interpolate(a: Pt2, b: Pt2, progress: number): Pt2 {
  return [a[0] + (b[0] - a[0]) * progress, a[1] + (b[1] - a[1]) * progress];
}

type NearestOnPolyline = Readonly<{ distanceMm: number; alongMm: number }>;

function nearestOnPolyline(points: readonly Pt2[], target: Pt2): NearestOnPolyline | null {
  if (points.length < 2) return null;
  let bestDistance = Infinity;
  let bestAlong = 0;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const lengthSquared = dx * dx + dy * dy;
    const length = Math.sqrt(lengthSquared);
    if (!(length > 0)) continue;
    const raw = ((target[0] - from[0]) * dx + (target[1] - from[1]) * dy) / lengthSquared;
    const progress = Math.max(0, Math.min(1, raw));
    const projected: Pt2 = [from[0] + dx * progress, from[1] + dy * progress];
    const candidateDistance = distance(target, projected);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestAlong = walked + length * progress;
    }
    walked += length;
  }
  return Number.isFinite(bestDistance)
    ? Object.freeze({ distanceMm: bestDistance, alongMm: bestAlong })
    : null;
}

function pointAtAlong(points: readonly Pt2[], targetAlong: number): Pt2 | null {
  if (points.length < 2) return null;
  let walked = 0;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    const length = distance(from, to);
    if (!(length > 0)) continue;
    if (targetAlong <= walked + length || index === points.length - 1) {
      const progress = Math.max(0, Math.min(1, (targetAlong - walked) / length));
      return interpolate(from, to, progress);
    }
    walked += length;
  }
  return points[points.length - 1] ?? null;
}

function pointToSegmentDistance(point: Pt2, from: Pt2, to: Pt2): number {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const lengthSquared = dx * dx + dy * dy;
  if (!(lengthSquared > 0)) return distance(point, from);
  const raw = ((point[0] - from[0]) * dx + (point[1] - from[1]) * dy) / lengthSquared;
  const progress = Math.max(0, Math.min(1, raw));
  return distance(point, [from[0] + dx * progress, from[1] + dy * progress]);
}

function polylineLength(points: readonly Pt2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1)
    total += distance(points[index - 1]!, points[index]!);
  return total;
}

type EdgeMatch = Readonly<{
  target: string;
  range: readonly [number, number] | undefined;
  maxErrorMm: number;
}>;

/**
 * A Phase-D adjacent segment is admitted only when both directions agree: samples of the source
 * segment lie on one skeleton edge, and samples of the selected skeleton span lie on that source
 * segment. This rejects a loop whose endpoints happen to be near while its walk detours elsewhere.
 */
function matchOneEdge(
  geometry: PieceGeom,
  from: Pt2,
  to: Pt2,
  toleranceMm: number,
): readonly EdgeMatch[] {
  const matches: EdgeMatch[] = [];
  for (const edge of geometry.edges) {
    if (edge.pts.length < 2 || !(edge.lenMm > 0)) continue;
    // SidePart ranges are interpreted against `edge.lenMm`; refuse a geometry whose stored length
    // and drawable walk disagree instead of silently emitting ranges in another scale.
    if (Math.abs(polylineLength(edge.pts) - edge.lenMm) > toleranceMm) continue;
    const start = nearestOnPolyline(edge.pts, from);
    const end = nearestOnPolyline(edge.pts, to);
    if (!start || !end || start.distanceMm > toleranceMm || end.distanceMm > toleranceMm) continue;
    let maxErrorMm = Math.max(start.distanceMm, end.distanceMm);
    for (let index = 1; index < SAMPLE_COUNT - 1; index += 1) {
      const progress = index / (SAMPLE_COUNT - 1);
      const sourceSample = interpolate(from, to, progress);
      const sourceToEdge = nearestOnPolyline(edge.pts, sourceSample);
      const edgeSample = pointAtAlong(
        edge.pts,
        start.alongMm + (end.alongMm - start.alongMm) * progress,
      );
      if (!sourceToEdge || !edgeSample) {
        maxErrorMm = Infinity;
        break;
      }
      maxErrorMm = Math.max(
        maxErrorMm,
        sourceToEdge.distanceMm,
        pointToSegmentDistance(edgeSample, from, to),
      );
    }
    if (maxErrorMm > toleranceMm) continue;
    const range = [
      Math.min(start.alongMm, end.alongMm),
      Math.max(start.alongMm, end.alongMm),
    ] as const;
    const whole =
      range[0] <= WHOLE_EDGE_TOLERANCE_MM && range[1] >= edge.lenMm - WHOLE_EDGE_TOLERANCE_MM;
    matches.push(
      Object.freeze({
        target: edge.id,
        range: whole ? undefined : range,
        maxErrorMm,
      }),
    );
  }
  return Object.freeze(matches);
}

function exactSide(
  input: Omit<PatternImportDxfPhaseEStoredSeamExactSideCrosswalkInputV1, 'side'>,
  selected: PatternImportDxfPhaseEStoredSeamExactSideCrosswalkInputV1['side'],
  sideLabel: 'A' | 'B',
):
  | Readonly<{ ok: true; side: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1 }>
  | Readonly<{
      ok: false;
      blocker: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkBlockerV1;
    }> {
  const catalogPieces = input.catalog.pieces.filter(
    ({ pieceId, pieceLineKey }) =>
      pieceId === selected.pieceId && pieceLineKey === selected.pieceLineKey,
  );
  const projectedPieces = input.projection.pieces.filter(
    ({ pieceId, pieceLineKey }) =>
      pieceId === selected.pieceId && pieceLineKey === selected.pieceLineKey,
  );
  if (catalogPieces.length !== 1 || projectedPieces.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-piece-not-exact' as const,
        detail: `Side ${sideLabel} does not identify one current catalog/projection piece.`,
      }),
    });
  const catalogContours = catalogPieces[0]!.contours.filter(
    ({ contourId }) => contourId === selected.contourId,
  );
  const projectedContours = projectedPieces[0]!.contours.filter(
    ({ contourId }) => contourId === selected.contourId,
  );
  if (
    catalogContours.length !== 1 ||
    projectedContours.length !== 1 ||
    catalogContours[0]!.role !== 'sewing-boundary' ||
    projectedContours[0]!.role !== 'sewing-boundary'
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-contour-not-sewing-boundary' as const,
        detail: `Side ${sideLabel} must use one current sewing-boundary contour.`,
      }),
    });
  const catalogContour = catalogContours[0]!;
  const projectedContour = projectedContours[0]!;
  const vertexIndexes = selected.boundaryVertexIds.map((vertexId) =>
    catalogContour.boundaryVertices.findIndex((vertex) => vertex.vertexId === vertexId),
  );
  const projectedVertices = selected.boundaryVertexIds.map((vertexId) =>
    projectedContour.vertices.find((vertex) => vertex.vertexId === vertexId),
  );
  const delta = Math.abs(vertexIndexes[0]! - vertexIndexes[1]!);
  const adjacent =
    vertexIndexes.every((index) => index >= 0) &&
    (delta === 1 ||
      (catalogContour.closed &&
        catalogContour.boundaryVertices.length > 2 &&
        delta === catalogContour.boundaryVertices.length - 1));
  if (
    !adjacent ||
    projectedVertices.some((vertex) => !finitePoint(vertex?.pointMm)) ||
    projectedVertices[0]?.ordinal !== vertexIndexes[0] ||
    projectedVertices[1]?.ordinal !== vertexIndexes[1]
  )
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-edge-not-exact' as const,
        detail: `Side ${sideLabel} is not one exact adjacent current Phase-D edge.`,
      }),
    });
  const geometryPieces = input.geometry.filter(
    ({ pieceKey }) => pieceKey === selected.pieceLineKey,
  );
  if (geometryPieces.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-geometry-piece-not-exact' as const,
        detail: `Side ${sideLabel} does not identify one current skeleton piece.`,
      }),
    });
  const fromVertex = projectedVertices[0]!;
  const toVertex = projectedVertices[1]!;
  const matches = matchOneEdge(
    geometryPieces[0]!,
    [fromVertex.pointMm.x, fromVertex.pointMm.y],
    [toVertex.pointMm.x, toVertex.pointMm.y],
    input.toleranceMm ?? DEFAULT_TOLERANCE_MM,
  );
  if (!matches.length)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-segment-off-geometry' as const,
        detail: `Side ${sideLabel} does not lie on a current skeleton sewing edge within tolerance.`,
      }),
    });
  if (matches.length !== 1)
    return Object.freeze({
      ok: false as const,
      blocker: Object.freeze({
        code: 'crosswalk-segment-ambiguous' as const,
        detail: `Side ${sideLabel} matches more than one current skeleton edge.`,
      }),
    });
  const match = matches[0]!;
  const part: SidePart = match.range
    ? Object.freeze({ target: match.target, range: match.range })
    : Object.freeze({ target: match.target });
  return Object.freeze({
    ok: true as const,
    side: Object.freeze({
      pieceId: selected.pieceId,
      pieceLineKey: selected.pieceLineKey,
      contourId: selected.contourId,
      boundaryVertexIds: Object.freeze([
        selected.boundaryVertexIds[0],
        selected.boundaryVertexIds[1],
      ]) as readonly [string, string],
      sourceDirection: selected.direction,
      parts: Object.freeze([part]) as readonly [SidePart],
      maxErrorMm: match.maxErrorMm,
    }),
  });
}

/** Exact one-authority edge → one current skeleton SidePart; no operation/seam identity is minted. */
export function buildPatternImportDxfPhaseEStoredSeamExactSideCrosswalkV1(
  input: PatternImportDxfPhaseEStoredSeamExactSideCrosswalkInputV1,
): PatternImportDxfPhaseEStoredSeamExactSideCrosswalkResultV1 {
  try {
    const toleranceMm = input?.toleranceMm ?? DEFAULT_TOLERANCE_MM;
    if (
      !input ||
      !input.side ||
      !Array.isArray(input.geometry) ||
      !input.geometrySizeToken ||
      !Number.isFinite(toleranceMm) ||
      toleranceMm <= 0 ||
      (input.side.direction !== 'forward' && input.side.direction !== 'reverse')
    )
      return Object.freeze({
        ok: false as const,
        side: null,
        blocker: Object.freeze({
          code: 'crosswalk-envelope-invalid' as const,
          detail: 'One explicit current authority side and skeleton geometry are required.',
        }),
      });
    const { catalog, projection } = input;
    if (
      !catalog ||
      !projection ||
      projection.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
      projection.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
      projection.sourceFileId !== catalog.sourceFileId ||
      projection.sizeToken !== catalog.sizeToken ||
      projection.joinMode !== 'catalog-ordinal-to-phase-d-point' ||
      projection.geometryPlacementApplied !== false
    )
      return Object.freeze({
        ok: false as const,
        side: null,
        blocker: Object.freeze({
          code: 'crosswalk-source-stale' as const,
          detail: 'The authoring catalog and Phase-D projection are not one current exact source.',
        }),
      });
    if (input.geometrySizeToken !== catalog.sizeToken)
      return Object.freeze({
        ok: false as const,
        side: null,
        blocker: Object.freeze({
          code: 'crosswalk-size-mismatch' as const,
          detail: 'The current skeleton geometry was built for another size token.',
        }),
      });
    const result = exactSide(input, input.side, 'A');
    return result.ok
      ? Object.freeze({ ok: true as const, side: result.side, blocker: null })
      : Object.freeze({ ok: false as const, side: null, blocker: result.blocker });
  } catch {
    return Object.freeze({
      ok: false as const,
      side: null,
      blocker: Object.freeze({
        code: 'crosswalk-envelope-invalid' as const,
        detail: 'The one-side crosswalk envelope must be readable current geometry data.',
      }),
    });
  }
}

/**
 * Produces only a geometry crosswalk. It cannot choose the one `StoredSeam.direction`, mint a seam
 * key or call `rowFromHand`; those decisions stay at the existing seam writer boundary.
 */
export function buildPatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkV1(
  input: PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkInputV1,
): PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkResultV1 {
  try {
    const toleranceMm = input?.toleranceMm ?? DEFAULT_TOLERANCE_MM;
    if (
      !input ||
      !Array.isArray(input.geometry) ||
      !input.geometrySizeToken ||
      !Number.isFinite(toleranceMm) ||
      toleranceMm <= 0 ||
      input.candidate?.schemaVersion !==
        PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_CANDIDATE_V1 ||
      input.candidate.claims !== PATTERN_IMPORT_DXF_PHASE_E_CAD_TABLE_ZERO_CONNECT_SESSION_CLAIMS_V1
    )
      return blocked(
        'crosswalk-envelope-invalid',
        'The crosswalk requires one current zero-connect candidate and explicit skeleton geometry.',
      );
    const { candidate, catalog, projection } = input;
    if (
      candidate.source.catalogCanonicalSha256 !== catalog.canonicalSha256 ||
      candidate.source.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
      candidate.source.sourceFileId !== catalog.sourceFileId ||
      candidate.source.scopeKey !== catalog.scopeKey ||
      candidate.source.sizeToken !== catalog.sizeToken ||
      projection.expectedCatalogCanonicalSha256 !== catalog.canonicalSha256 ||
      projection.sizeSelectionCanonicalSha256 !== catalog.sizeSelectionCanonicalSha256 ||
      projection.sourceFileId !== catalog.sourceFileId ||
      projection.sizeToken !== catalog.sizeToken ||
      projection.joinMode !== 'catalog-ordinal-to-phase-d-point' ||
      projection.geometryPlacementApplied !== false
    )
      return blocked(
        'crosswalk-source-stale',
        'The candidate, authoring catalog and Phase-D projection are not one current exact source.',
      );
    if (input.geometrySizeToken !== catalog.sizeToken)
      return blocked(
        'crosswalk-size-mismatch',
        'The current skeleton geometry was built for another size token.',
      );
    if (candidate.connection.mapping !== 'equal' || candidate.connection.lengthRatio !== 1)
      return blocked(
        'crosswalk-mapping-unsupported',
        'The first StoredSeam crosswalk slice accepts only explicit equal mapping with ratio 1.',
      );
    const sideA = exactSide(input, candidate.connection.sides[0], 'A');
    if (!sideA.ok)
      return Object.freeze({ ok: false as const, receipt: null, blocker: sideA.blocker });
    const sideB = exactSide(input, candidate.connection.sides[1], 'B');
    if (!sideB.ok)
      return Object.freeze({ ok: false as const, receipt: null, blocker: sideB.blocker });
    return Object.freeze({
      ok: true as const,
      receipt: Object.freeze({
        schemaVersion: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_V1,
        status: 'unique-equal-side-parts-ready' as const,
        mapping: 'equal' as const,
        lengthRatio: 1 as const,
        sides: Object.freeze([sideA.side, sideB.side]) as readonly [
          PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1,
          PatternImportDxfPhaseEZeroConnectStoredSeamCrosswalkSideV1,
        ],
        storedSeamDirectionRequired: true as const,
        claims: PATTERN_IMPORT_DXF_PHASE_E_ZERO_CONNECT_STORED_SEAM_CROSSWALK_CLAIMS_V1,
      }),
      blocker: null,
    });
  } catch {
    return blocked(
      'crosswalk-envelope-invalid',
      'The crosswalk envelope must be readable current geometry data.',
    );
  }
}
