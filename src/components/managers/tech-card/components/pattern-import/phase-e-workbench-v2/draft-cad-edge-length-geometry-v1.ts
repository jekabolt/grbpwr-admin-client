import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import {
  bboxOf,
  footOnSegment,
  selfIntersects,
  signedArea,
} from 'lib/pattern-import/semantics/geom';
import type { PieceSizeSpec, PtMm } from 'lib/pattern-import/types';

import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

type Command = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'edge-length' }>;
type SelectedSizePhaseD = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>['phaseD'];
type Result = { ok: true; size: PieceSizeSpec } | { ok: false; detail: string };

const EPS = 1e-7;

const samePoint = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const ring = (points: readonly PtMm[]) =>
  points.length > 1 && samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;

export function resizeDraftStraightEdgeV1(
  from: PtMm,
  to: PtMm,
  fixed: 'start' | 'end',
  lengthMm: number,
): readonly [PtMm, PtMm] | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const oldLength = Math.hypot(dx, dy);
  if (!(oldLength > EPS) || !Number.isFinite(lengthMm) || lengthMm <= EPS) return null;
  const scale = lengthMm / oldLength;
  const resized: readonly [PtMm, PtMm] =
    fixed === 'start'
      ? [from, { x: from.x + dx * scale, y: from.y + dy * scale }]
      : [{ x: to.x - dx * scale, y: to.y - dy * scale }, to];
  return resized.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)) ? resized : null;
}

/** Applies the exact adjacent source edge edit to only the selected retained size. */
export function resizeDraftCadSelectedSizeEdgeV1(
  source: PieceSizeSpec,
  command: Command,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  phaseD: SelectedSizePhaseD,
): Result {
  const { edge, fixed, lengthMm, sizeToken } = command.payload;
  if (source.sizeToken !== sizeToken || projection.sizeToken !== sizeToken)
    return { ok: false, detail: 'The edge edit belongs to a different selected size.' };
  const pieces = projection.pieces.filter(
    ({ pieceId, pieceLineKey }) =>
      pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
  );
  const contours = pieces[0]?.contours.filter(({ contourId }) => contourId === edge.contourId);
  const contour = pieces.length === 1 && contours?.length === 1 ? contours[0] : null;
  if (!contour?.closed || contour.role === 'hole')
    return { ok: false, detail: 'Choose one exact closed cut or sewing outline.' };
  const nativeContour = phaseD.contours.find(
    ({ pieceId, contourId, sizeToken: token }) =>
      pieceId === command.target.pieceId && contourId === contour.contourId && token === sizeToken,
  );
  const path =
    nativeContour?.lineage.sourcePathIds.length === 1
      ? phaseD.source.paths.find(({ pathId }) => pathId === nativeContour.lineage.sourcePathIds[0])
      : undefined;
  const samples = path?.provenance.samples;
  const sampleIds = new Set(samples?.map(({ vertexId }) => vertexId));
  if (
    !path?.closed ||
    !samples ||
    samples.length !== contour.vertices.length ||
    samples.some(
      ({ parameterSpace, sourceCurveT }) => parameterSpace !== 'unit' || sourceCurveT !== 0,
    ) ||
    new Set(samples.map(({ sourceCurveId }) => sourceCurveId)).size !== samples.length ||
    !contour.vertices.every(({ vertexId }) => sampleIds.has(vertexId))
  )
    return { ok: false, detail: 'Use a straight native outline to change length with this tool.' };
  const [fromId, toId] = edge.boundaryVertexIds;
  const start = contour.vertices.findIndex(({ vertexId }) => vertexId === fromId);
  const next = (start + 1) % contour.vertices.length;
  if (start < 0 || contour.vertices[next]?.vertexId !== toId)
    return { ok: false, detail: 'The two ordered edge vertices are no longer adjacent.' };

  const primary = contour.role === 'cut-boundary' ? source.cut : source.seam;
  if (
    !primary ||
    source.cutLoops?.length ||
    source.offset ||
    source.continuity ||
    source.repair ||
    source.kinks?.length
  )
    return {
      ok: false,
      detail: 'This outline requires its retained topology or allowance editor.',
    };
  const vertices = ring(primary);
  const seam = source.seam ? ring(source.seam) : null;
  const cut = ring(source.cut);
  if (seam && (seam.length !== cut.length || seam.some((point, i) => !samePoint(point, cut[i]!))))
    return {
      ok: false,
      detail: 'Separate cut and sewing contours require a paired allowance edit.',
    };

  const from = contour.vertices[start]!.pointMm;
  const to = contour.vertices[next]!.pointMm;
  const matching = vertices
    .map((point, i) =>
      samePoint(point, from) && samePoint(vertices[(i + 1) % vertices.length]!, to) ? i : -1,
    )
    .filter((i) => i >= 0);
  if (matching.length !== 1 || vertices.length !== contour.vertices.length)
    return { ok: false, detail: 'The selected edge does not match the retained writer outline.' };
  const index = matching[0]!;
  const moving = fixed === 'start' ? (index + 1) % vertices.length : index;
  const resized = resizeDraftStraightEdgeV1(from, to, fixed, lengthMm);
  if (!resized)
    return { ok: false, detail: 'Enter a positive length for one nondegenerate straight edge.' };
  const movedPoint = resized[fixed === 'start' ? 1 : 0];
  const oldPoint = vertices[moving]!;
  const before = vertices[(moving + vertices.length - 1) % vertices.length]!;
  const after = vertices[(moving + 1) % vertices.length]!;
  if (
    source.fold ||
    source.notches.some(
      ({ at }) =>
        footOnSegment(at, before, oldPoint).d <= EPS || footOnSegment(at, oldPoint, after).d <= EPS,
    )
  )
    return {
      ok: false,
      detail: 'A fold or attached notch must be rebound before moving this vertex.',
    };

  const nextRing = vertices.map((point, i) => (i === moving ? movedPoint : point));
  const area = signedArea(nextRing);
  if (
    !Number.isFinite(area) ||
    Math.abs(area) <= EPS ||
    Math.sign(area) !== Math.sign(signedArea(vertices)) ||
    vertices.some((point, i) => i !== moving && samePoint(point, movedPoint)) ||
    selfIntersects(nextRing) ||
    footOnSegment(movedPoint, before, after).d <= EPS
  )
    return { ok: false, detail: 'The new edge length would collapse or cross the outline.' };

  const size = structuredClone(source);
  const copyLoop = (previous: readonly PtMm[]) => {
    const updated = nextRing.map((point) => ({ ...point }));
    if (previous.length > vertices.length) updated.push({ ...updated[0]! });
    return updated;
  };
  size.cut = copyLoop(source.cut);
  if (source.seam) size.seam = copyLoop(source.seam);
  size.bbox = bboxOf(nextRing);
  size.areaMm2 = Math.abs(area);
  return { ok: true, size };
}
