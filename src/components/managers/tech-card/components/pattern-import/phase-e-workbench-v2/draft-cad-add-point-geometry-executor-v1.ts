import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import type { PieceSizeSpec, PtMm, WriteJob } from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ADD_POINT_GEOMETRY_EXECUTOR_V1 =
  'pattern-import-dxf-phase-e-draft-cad-add-point-geometry-executor/1' as const;

type AddPointCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'add-point' }>;

export type PatternImportDxfPhaseEDraftCadAddPointGeometryBlockerCodeV1 =
  | 'invalid-input'
  | 'piece-unavailable'
  | 'contour-unavailable'
  | 'anchor-stale'
  | 'off-edge'
  | 'endpoint-or-duplicate-point'
  | 'unsupported-piece-geometry'
  | 'self-intersecting-boundary'
  | 'multi-size-topology-mismatch';

export type PatternImportDxfPhaseEDraftCadAddPointGeometryResultV1 =
  | Readonly<{
      ok: true;
      job: WriteJob;
      sourcePieceIdentity: string;
      insertedVertexIndex: number;
      contourRole: 'cut-boundary' | 'sewing-boundary';
      insertedSizeTokens: readonly string[];
      blockers: readonly [];
    }>
  | Readonly<{
      ok: false;
      job: null;
      sourcePieceIdentity: string | null;
      contourRole: null;
      insertedSizeTokens: readonly [];
      blockers: readonly [
        Readonly<{
          code: PatternImportDxfPhaseEDraftCadAddPointGeometryBlockerCodeV1;
          detail: string;
        }>,
      ];
    }>;

export const PATTERN_IMPORT_DXF_PHASE_E_DRAFT_CAD_ADD_POINT_GEOMETRY_CLAIMS_V1 = Object.freeze({
  exactOrderedEdgeIdentityRequired: true,
  coordinateProximitySearchUsed: false,
  allSizesUpdatedAtomically: true,
  sourceJobMutated: false,
  retainedPieceSpecWriterReused: true,
  stableCommandEntityIdentity: true,
  persistenceIntegrated: false,
} as const);

const EPS = 1e-7;

function deepFreeze<T>(value: T, seen = new Set<object>()): T {
  if (!value || typeof value !== 'object' || seen.has(value) || Object.isFrozen(value))
    return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function blocked(
  code: PatternImportDxfPhaseEDraftCadAddPointGeometryBlockerCodeV1,
  detail: string,
  sourcePieceIdentity: string | null = null,
): PatternImportDxfPhaseEDraftCadAddPointGeometryResultV1 {
  return deepFreeze({
    ok: false as const,
    job: null,
    sourcePieceIdentity,
    contourRole: null,
    insertedSizeTokens: [] as const,
    blockers: [{ code, detail }] as const,
  });
}

function finite(point: PtMm): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function same(left: PtMm, right: PtMm): boolean {
  return Math.abs(left.x - right.x) <= EPS && Math.abs(left.y - right.y) <= EPS;
}

function open(points: readonly PtMm[]): readonly PtMm[] {
  return points.length > 1 && same(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;
}

function cross(a: PtMm, b: PtMm, c: PtMm): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSegment(point: PtMm, from: PtMm, to: PtMm): boolean {
  return (
    Math.abs(cross(from, to, point)) <= EPS &&
    point.x >= Math.min(from.x, to.x) - EPS &&
    point.x <= Math.max(from.x, to.x) + EPS &&
    point.y >= Math.min(from.y, to.y) - EPS &&
    point.y <= Math.max(from.y, to.y) + EPS
  );
}

function segmentsIntersect(a: PtMm, b: PtMm, c: PtMm, d: PtMm): boolean {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  if (
    ((abC > EPS && abD < -EPS) || (abC < -EPS && abD > EPS)) &&
    ((cdA > EPS && cdB < -EPS) || (cdA < -EPS && cdB > EPS))
  )
    return true;
  return (
    (Math.abs(abC) <= EPS && onSegment(c, a, b)) ||
    (Math.abs(abD) <= EPS && onSegment(d, a, b)) ||
    (Math.abs(cdA) <= EPS && onSegment(a, c, d)) ||
    (Math.abs(cdB) <= EPS && onSegment(b, c, d))
  );
}

function selfIntersects(points: readonly PtMm[]): boolean {
  const polygon = open(points);
  for (let left = 0; left < polygon.length; left += 1) {
    const leftNext = (left + 1) % polygon.length;
    for (let right = left + 1; right < polygon.length; right += 1) {
      const rightNext = (right + 1) % polygon.length;
      if (left === right || leftNext === right || rightNext === left) continue;
      if (left === 0 && rightNext === 0) continue;
      if (
        segmentsIntersect(polygon[left]!, polygon[leftNext]!, polygon[right]!, polygon[rightNext]!)
      )
        return true;
    }
  }
  return false;
}

function samePoints(left: readonly PtMm[], right: readonly PtMm[]): boolean {
  const a = open(left);
  const b = open(right);
  return a.length === b.length && a.every((point, index) => same(point, b[index]!));
}

function area(points: readonly PtMm[]): number {
  const polygon = open(points);
  return Math.abs(
    polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length]!;
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2,
  );
}

function bounds(points: readonly PtMm[]) {
  const polygon = open(points);
  return {
    minX: Math.min(...polygon.map(({ x }) => x)),
    minY: Math.min(...polygon.map(({ y }) => y)),
    maxX: Math.max(...polygon.map(({ x }) => x)),
    maxY: Math.max(...polygon.map(({ y }) => y)),
  };
}

function exactEdgeIndex(
  points: readonly PtMm[],
  from: PtMm,
  to: PtMm,
  closed: boolean,
): number | null {
  const polygon = open(points);
  const count = closed ? polygon.length : Math.max(polygon.length - 1, 0);
  const matches: number[] = [];
  for (let index = 0; index < count; index += 1) {
    if (same(polygon[index]!, from) && same(polygon[(index + 1) % polygon.length]!, to))
      matches.push(index);
  }
  return matches.length === 1 ? matches[0]! : null;
}

function insertAt(
  points: readonly PtMm[],
  edgeIndex: number,
  progress: number,
): readonly PtMm[] | null {
  const wasExplicitlyClosed = points.length > 1 && same(points[0]!, points.at(-1)!);
  const polygon = open(points).map(({ x, y }) => ({ x, y }));
  const from = polygon[edgeIndex];
  const to = polygon[(edgeIndex + 1) % polygon.length];
  if (!from || !to || !finite(from) || !finite(to) || same(from, to)) return null;
  const inserted = {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
  if (!finite(inserted) || same(inserted, from) || same(inserted, to)) return null;
  if (polygon.some((point) => same(point, inserted))) return null;
  polygon.splice(edgeIndex + 1, 0, inserted);
  if (wasExplicitlyClosed) polygon.push({ ...polygon[0]! });
  return polygon;
}

function updateSize(
  size: PieceSizeSpec,
  role: 'cut-boundary' | 'sewing-boundary',
  edgeIndex: number,
  progress: number,
  expectedVertexCount: number,
):
  | { ok: true; size: PieceSizeSpec }
  | {
      ok: false;
      code: PatternImportDxfPhaseEDraftCadAddPointGeometryBlockerCodeV1;
      detail: string;
    } {
  if (size.cutLoops?.length || size.continuity || size.repair || size.kinks?.length)
    return {
      ok: false,
      code: 'unsupported-piece-geometry',
      detail: `Size ${size.sizeToken} carries derived topology or repair evidence that Add point cannot reseal.`,
    };
  const primary = role === 'cut-boundary' ? size.cut : size.seam;
  if (!primary)
    return {
      ok: false,
      code: 'contour-unavailable',
      detail: `Size ${size.sizeToken} has no ${role} PieceSpec contour.`,
    };
  if (open(primary).length !== expectedVertexCount)
    return {
      ok: false,
      code: 'multi-size-topology-mismatch',
      detail: `Size ${size.sizeToken} does not preserve the selected contour vertex order.`,
    };
  if (selfIntersects(primary))
    return {
      ok: false,
      code: 'self-intersecting-boundary',
      detail: `Size ${size.sizeToken} has a self-intersecting source contour.`,
    };
  const inserted = insertAt(primary, edgeIndex, progress);
  if (!inserted)
    return {
      ok: false,
      code: 'endpoint-or-duplicate-point',
      detail: `Size ${size.sizeToken} cannot insert a distinct point on the sealed edge.`,
    };
  const next = structuredClone(size);
  const twin = role === 'cut-boundary' ? size.seam : size.cut;
  const twinMatches = !!twin && samePoints(primary, twin);
  if (role === 'cut-boundary') {
    next.cut = inserted.map((point) => ({ ...point }));
    if (twinMatches) next.seam = inserted.map((point) => ({ ...point }));
    next.bbox = bounds(next.cut);
    next.areaMm2 = area(next.cut);
  } else {
    next.seam = inserted.map((point) => ({ ...point }));
    if (twinMatches) {
      next.cut = inserted.map((point) => ({ ...point }));
      next.bbox = bounds(next.cut);
      next.areaMm2 = area(next.cut);
    }
  }
  return { ok: true, size: next };
}

/** Inserts one vertex only from a sealed ordered projection edge; no coordinate search is used. */
export function executePatternImportDxfPhaseEDraftCadAddPointGeometryV1(
  sourceJob: WriteJob,
  command: AddPointCommand,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  selectedSizeToken: string,
): PatternImportDxfPhaseEDraftCadAddPointGeometryResultV1 {
  let job: WriteJob;
  try {
    job = structuredClone(sourceJob);
  } catch {
    return blocked('invalid-input', 'Add-point source writer job could not be detached safely.');
  }
  const edge = command?.payload?.edge;
  if (
    !command ||
    command.tool !== 'add-point' ||
    !edge ||
    edge.contourId !== command.payload.contourId ||
    edge.boundaryVertexIds[0] !== command.payload.afterVertexId ||
    !(edge.progress > EPS && edge.progress < 1 - EPS) ||
    !finite(command.payload.pointMm) ||
    !selectedSizeToken
  )
    return blocked(
      'invalid-input',
      'Add point requires one sealed ordered edge, an interior progress and one finite exact point.',
      command?.target?.pieceId ?? null,
    );
  const pieces = job.pieces.filter(({ identity }) => identity === command.target.pieceId);
  if (pieces.length !== 1)
    return blocked(
      'piece-unavailable',
      `Add-point target ${command.target.pieceId} must resolve to one retained PieceSpec.`,
      command.target.pieceId,
    );
  const projectedPieces = projection.pieces.filter(
    ({ pieceId, pieceLineKey }) =>
      pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
  );
  const contours = projectedPieces[0]?.contours.filter(
    ({ contourId }) => contourId === edge.contourId,
  );
  const contour = projectedPieces.length === 1 && contours?.length === 1 ? contours[0]! : null;
  if (!contour || (contour.role !== 'cut-boundary' && contour.role !== 'sewing-boundary'))
    return blocked(
      'contour-unavailable',
      'Add point requires one exact cut or sewing contour in the bound projection.',
      command.target.pieceId,
    );
  const [fromId, toId] = edge.boundaryVertexIds;
  const fromIndex = contour.vertices.findIndex(({ vertexId }) => vertexId === fromId);
  const toIndex = contour.vertices.findIndex(({ vertexId }) => vertexId === toId);
  const nextIndex = (fromIndex + 1) % contour.vertices.length;
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    toIndex !== nextIndex ||
    (!contour.closed && fromIndex === contour.vertices.length - 1)
  )
    return blocked(
      'anchor-stale',
      'The ordered edge endpoints are missing, reversed or no longer adjacent.',
      command.target.pieceId,
    );
  const from = contour.vertices[fromIndex]!.pointMm;
  const to = contour.vertices[toIndex]!.pointMm;
  const expected = {
    x: from.x + (to.x - from.x) * edge.progress,
    y: from.y + (to.y - from.y) * edge.progress,
  };
  if (!same(expected, command.payload.pointMm))
    return blocked(
      'off-edge',
      'The authored point does not exact-match its sealed edge parameter.',
      command.target.pieceId,
    );
  const piece = pieces[0]!;
  const selected = piece.sizes.filter(({ sizeToken }) => sizeToken === selectedSizeToken);
  if (selected.length !== 1)
    return blocked(
      'multi-size-topology-mismatch',
      `Add point requires one retained selected size ${selectedSizeToken}.`,
      piece.identity,
    );
  const selectedContour = contour.role === 'cut-boundary' ? selected[0]!.cut : selected[0]!.seam;
  if (!selectedContour)
    return blocked(
      'contour-unavailable',
      `Selected size ${selectedSizeToken} has no ${contour.role} contour.`,
      piece.identity,
    );
  const edgeIndex = exactEdgeIndex(selectedContour, from, to, contour.closed);
  if (edgeIndex === null)
    return blocked(
      'anchor-stale',
      'The sealed projection edge does not exact-match one retained selected-size edge.',
      piece.identity,
    );
  const vertexCount = open(selectedContour).length;
  const updatedSizes: PieceSizeSpec[] = [];
  for (const size of piece.sizes) {
    const updated = updateSize(size, contour.role, edgeIndex, edge.progress, vertexCount);
    if (!updated.ok) return blocked(updated.code, updated.detail, piece.identity);
    updatedSizes.push(updated.size);
  }
  piece.sizes = updatedSizes;
  return deepFreeze({
    ok: true as const,
    job,
    sourcePieceIdentity: piece.identity,
    insertedVertexIndex: edgeIndex + 1,
    contourRole: contour.role,
    insertedSizeTokens: updatedSizes.map(({ sizeToken }) => sizeToken),
    blockers: [] as const,
  });
}
