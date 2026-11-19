import type { DxfProductPhaseDSizeSelectionResultV1 } from 'lib/pattern-import/dxf-product-phase-d-size-selection-v1';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { ringSelfIntersects, ringStrictlyInside, ringsOverlap } from 'lib/fusing-dxf/spline';
import {
  bboxOf,
  footOnSegment,
  pointInPolygon,
  signedArea,
} from 'lib/pattern-import/semantics/geom';
import { segIntersect } from 'lib/pattern-import/pieces/geom';
import { MITER_LIMIT, offsetContour, OFFSET_SCALE } from 'lib/pattern-import/semantics/offset';
import type { PieceSizeSpec, PtMm } from 'lib/pattern-import/types';

import {
  sameDraftAllowanceRingV1,
  type SavedDraftPairedAllowanceProofV1,
} from './draft-cad-paired-allowance-authority-v1';
import {
  readPairedAuthoredOutlineCorner,
  roundDraftRectangularCornerV1,
} from 'lib/pattern-import/manifest/authored-outline-corner';
import {
  authoredQuadraticGrid,
  decodeAuthoredQuadratic,
} from 'lib/pattern-import/manifest/authored-internal';
import { DRILL_SQUARE_MM } from 'lib/pattern-import/write/plan';
import type { PatternImportDxfPhaseEDraftCadCommandV1 } from './draft-cad-session-v1';

type Command = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'edge-length' }>;
type VertexEdit = Extract<
  PatternImportDxfPhaseEDraftCadCommandV1,
  { tool: 'move-point' | 'delete-point' | 'sharpen-corner' | 'round-corner' }
>;
type SelectedSizePhaseD = Extract<DxfProductPhaseDSizeSelectionResultV1, { ok: true }>['phaseD'];
type Result =
  | { ok: true; size: PieceSizeSpec; pairedAllowance?: true }
  | { ok: false; detail: string; requiresPairedAllowance?: true };

const EPS = 1e-7;

const samePoint = (a: PtMm, b: PtMm) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const ring = (points: readonly PtMm[]) =>
  points.length > 1 && samePoint(points[0]!, points.at(-1)!) ? points.slice(0, -1) : points;

function strictlyConvex(points: readonly PtMm[]) {
  const winding = Math.sign(signedArea(points));
  return (
    points.length >= 3 &&
    winding !== 0 &&
    points.every((b, i) => {
      const a = points[(i + points.length - 1) % points.length]!;
      const c = points[(i + 1) % points.length]!;
      return winding * ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) > EPS;
    })
  );
}

type ProjectedContour =
  PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number]['contours'][number];

/** Intersect the two native supporting lines of an exactly selected convex bevel. */
export function selectDraftSharpCornerV1(
  contour: ProjectedContour | undefined,
  edge: readonly [string, string],
): Readonly<{ before: PtMm; corner: PtMm; after: PtMm }> | null {
  if (!contour?.closed || contour.role !== 'cut-boundary' || contour.vertices.length < 4)
    return null;
  const vertices = contour.vertices;
  const n = vertices.length;
  const i = vertices.findIndex(({ vertexId }) => vertexId === edge[0]);
  if (i < 0 || vertices[(i + 1) % n]?.vertexId !== edge[1]) return null;
  const before = vertices[(i + n - 1) % n]!.pointMm;
  const from = vertices[i]!.pointMm;
  const to = vertices[(i + 1) % n]!.pointMm;
  const after = vertices[(i + 2) % n]!.pointMm;
  if (
    ![before, from, to, after].every(({ x, y }) =>
      [x, y].every((value) => Number.isFinite(value) && Number(value.toFixed(6)) === value),
    )
  )
    return null;
  const horizontalFirst = before.y === from.y && to.x === after.x;
  const verticalFirst = before.x === from.x && to.y === after.y;
  if (horizontalFirst === verticalFirst) return null;
  const corner = horizontalFirst ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  const dot = (a: PtMm, b: PtMm, c: PtMm) => (c.x - b.x) * (b.x - a.x) + (c.y - b.y) * (b.y - a.y);
  if (dot(before, from, corner) <= 0 || dot(after, to, corner) <= 0) return null;
  const turn = (a: PtMm, b: PtMm, c: PtMm) => (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  const winding = Math.sign(signedArea(vertices.map(({ pointMm }) => pointMm)));
  return winding * turn(before, from, to) > EPS && winding * turn(from, to, after) > EPS
    ? { before, corner, after }
    : null;
}

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
  pairedAllowance?: SavedDraftPairedAllowanceProofV1 | null,
): Result {
  return editExactOutlineVertex(source, command, projection, phaseD, pairedAllowance);
}

export function editDraftCadSelectedSizeVertexV1(
  source: PieceSizeSpec,
  command: VertexEdit,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  phaseD: SelectedSizePhaseD,
  previousMoves?: ReadonlyMap<string, PtMm>,
): Result {
  return editExactOutlineVertex(source, command, projection, phaseD, null, previousMoves);
}

function editExactOutlineVertex(
  source: PieceSizeSpec,
  command: Command | VertexEdit,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  phaseD: SelectedSizePhaseD,
  pairedAllowance?: SavedDraftPairedAllowanceProofV1 | null,
  previousMoves?: ReadonlyMap<string, PtMm>,
): Result {
  const { sizeToken } = command.payload;
  const hasEdge = command.tool === 'edge-length' || command.tool === 'sharpen-corner';
  const contourId = hasEdge ? command.payload.edge.contourId : command.payload.contourId;
  if (source.sizeToken !== sizeToken || projection.sizeToken !== sizeToken)
    return { ok: false, detail: 'The outline edit belongs to a different selected size.' };
  const pieces = projection.pieces.filter(
    ({ pieceId, pieceLineKey }) =>
      pieceId === command.target.pieceId && pieceLineKey === command.target.pieceLineKey,
  );
  const contours = pieces[0]?.contours.filter((value) => value.contourId === contourId);
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
    return { ok: false, detail: 'Choose a native outline with straight segments.' };
  const fromId = hasEdge ? command.payload.edge.boundaryVertexIds[0] : command.payload.vertexId;
  const start = contour.vertices.findIndex(({ vertexId }) => vertexId === fromId);
  const next = (start + 1) % contour.vertices.length;
  if (
    start < 0 ||
    (hasEdge && contour.vertices[next]?.vertexId !== command.payload.edge.boundaryVertexIds[1])
  )
    return { ok: false, detail: 'The selected original vertices no longer match the outline.' };

  const primary = contour.role === 'cut-boundary' ? source.cut : source.seam;
  if (!primary || source.offset || source.continuity || source.repair || source.kinks?.length)
    return {
      ok: false,
      detail: 'This outline requires its retained topology or allowance editor.',
    };
  if (source.authoredOutlineCorner && command.tool !== 'round-corner')
    return {
      ok: false,
      detail: 'Edit the saved rounded corner with its original setback control.',
    };
  const vertices = ring(primary);
  const seam = source.seam ? ring(source.seam) : null;
  const cut = ring(source.cut);
  const separate =
    seam && (seam.length !== cut.length || seam.some((point, i) => !samePoint(point, cut[i]!)));
  if ((command.tool === 'sharpen-corner' || command.tool === 'round-corner') && !seam)
    return {
      ok: false,
      detail:
        command.tool === 'sharpen-corner'
          ? 'Sharpening needs matching saved cut and sewing outlines.'
          : 'Rounding needs matching saved cut and sewing outlines.',
    };
  let allowanceWidthMm: number | null = null;
  if (separate) {
    const supportedCut =
      command.tool === 'edge-length' &&
      contour.role === 'cut-boundary' &&
      !source.fold &&
      !source.notches.length &&
      !source.cutLoops?.length &&
      !source.internal.length &&
      strictlyConvex(cut) &&
      seam?.length === cut.length &&
      strictlyConvex(seam);
    if (!supportedCut)
      return {
        ok: false,
        detail: 'This saved cut and sewing pair requires its retained allowance editor.',
      };
    if (!pairedAllowance)
      return {
        ok: false,
        requiresPairedAllowance: true,
        detail: 'Verify both saved native outlines before editing this allowance.',
      };
    if (
      pairedAllowance.commandId !== command.commandId ||
      pairedAllowance.contourId !== contourId ||
      pairedAllowance.pieceId !== command.target.pieceId ||
      pairedAllowance.pieceLineKey !== command.target.pieceLineKey ||
      pairedAllowance.sizeToken !== sizeToken ||
      !sameDraftAllowanceRingV1(cut, pairedAllowance.cut) ||
      !sameDraftAllowanceRingV1(seam!, pairedAllowance.seam)
    )
      return {
        ok: false,
        detail: 'The writer outlines differ from the verified native allowance pair.',
      };
    allowanceWidthMm = pairedAllowance.widthMm;
  }
  const holes = (source.cutLoops ?? []).map(ring);
  if (
    holes.some(
      (hole, index) =>
        hole.length < 3 ||
        !(signedArea(hole) < -EPS) ||
        ringSelfIntersects(hole) ||
        !ringStrictlyInside(hole, cut) ||
        holes.slice(0, index).some((other) => ringsOverlap(other, hole)),
    )
  )
    return {
      ok: false,
      detail: 'The edit requires unambiguous clockwise holes inside the original cut.',
    };

  const positions = contour.vertices.map(
    ({ vertexId, pointMm }) => previousMoves?.get(vertexId) ?? pointMm,
  );
  if (
    previousMoves &&
    (command.tool !== 'move-point' ||
      contour.role !== 'cut-boundary' ||
      !seam ||
      !sameDraftAllowanceRingV1(positions, vertices))
  )
    return {
      ok: false,
      detail: 'The current Draft vertices differ from the paired writer outline.',
    };
  const from = positions[start]!;
  const to = positions[next]!;
  const beforeSelection = positions[(start + positions.length - 1) % positions.length]!;
  const matching = vertices
    .map((point, i) =>
      samePoint(point, from) &&
      samePoint(vertices[(i + 1) % vertices.length]!, to) &&
      (command.tool === 'edge-length' ||
        samePoint(vertices[(i + vertices.length - 1) % vertices.length]!, beforeSelection))
        ? i
        : -1,
    )
    .filter((i) => i >= 0);
  if (matching.length !== 1 || vertices.length !== contour.vertices.length)
    return { ok: false, detail: 'The selected vertices do not match the retained writer outline.' };
  const index = matching[0]!;
  let moving = index;
  let movedPoint: PtMm | null = null;
  let sharpCorner: PtMm | null = null;
  if (command.tool === 'edge-length') {
    const { fixed, lengthMm } = command.payload;
    const resized = resizeDraftStraightEdgeV1(from, to, fixed, lengthMm);
    if (!resized)
      return { ok: false, detail: 'Enter a positive length for one nondegenerate straight edge.' };
    moving = fixed === 'start' ? (index + 1) % vertices.length : index;
    movedPoint = resized[fixed === 'start' ? 1 : 0];
  } else if (command.tool === 'move-point') {
    movedPoint = command.payload.pointMm;
    if (
      !Number.isFinite(movedPoint.x) ||
      !Number.isFinite(movedPoint.y) ||
      samePoint(movedPoint, from)
    )
      return { ok: false, detail: 'Enter a different finite X and Y for the selected point.' };
    if (previousMoves && ![movedPoint.x, movedPoint.y].every((mm) => Number(mm.toFixed(6)) === mm))
      return { ok: false, detail: 'Enter X and Y on the DXF grid.' };
  }
  if (command.tool === 'sharpen-corner') {
    const candidate = selectDraftSharpCornerV1(contour, command.payload.edge.boundaryVertexIds);
    if (!candidate)
      return { ok: false, detail: 'Choose the bevel between two perpendicular straight sides.' };
    const afterBevel = vertices[(index + 2) % vertices.length]!;
    if (!samePoint(afterBevel, candidate.after))
      return { ok: false, detail: 'The far side of the selected bevel no longer matches.' };
    if (source.notches.some(({ at }) => footOnSegment(at, to, afterBevel).d <= EPS))
      return { ok: false, detail: 'Rebind the notch on this bevel corner before sharpening.' };
    sharpCorner = candidate.corner;
  }
  const cornerGrid =
    source.authoredOutlineCorner && authoredQuadraticGrid(source.authoredOutlineCorner);
  const savedCorner = command.tool === 'round-corner' ? command.payload.savedCorner : undefined;
  const originalCorner =
    cornerGrid &&
    seam &&
    savedCorner &&
    cornerGrid.every((coordinate, i) => coordinate === savedCorner[i]) &&
    readPairedAuthoredOutlineCorner(vertices, seam, savedCorner);
  if (
    command.tool === 'round-corner' &&
    (source.authoredOutlineCorner || savedCorner) &&
    (!originalCorner ||
      originalCorner.start !== index ||
      source.notches.length ||
      originalCorner.setbackMm === command.payload.setbackMm)
  )
    return { ok: false, detail: 'The selected saved corner or its setback changed.' };
  const rounding =
    command.tool === 'round-corner' &&
    roundDraftRectangularCornerV1(
      originalCorner ? originalCorner.rectangle : vertices,
      index,
      command.payload.setbackMm,
    );
  if (command.tool === 'round-corner' && (!rounding || contour.role !== 'cut-boundary'))
    return { ok: false, detail: 'Choose one right-angle corner on an exact saved rectangle.' };
  if (!movedPoint && vertices.length <= 3)
    return { ok: false, detail: 'Keep at least three vertices in a closed outline.' };
  const oldPoint = vertices[moving]!;
  const before = vertices[(moving + vertices.length - 1) % vertices.length]!;
  const after =
    vertices[(moving + (originalCorner ? originalCorner.sampleCount : 1)) % vertices.length]!;
  if (
    source.fold ||
    source.notches.some(
      ({ at }) =>
        footOnSegment(at, before, oldPoint).d <= EPS || footOnSegment(at, oldPoint, after).d <= EPS,
    )
  )
    return {
      ok: false,
      detail: 'A fold or attached notch must be rebound before changing this vertex.',
    };

  const bevelEnd = (index + 1) % vertices.length;
  const nextRing = rounding
    ? rounding.ring
    : sharpCorner
      ? vertices.flatMap((point, i) => (i === bevelEnd ? [] : [i === index ? sharpCorner : point]))
      : movedPoint
        ? vertices.map((point, i) => (i === moving ? movedPoint : point))
        : vertices.filter((_, i) => i !== moving);
  const area = signedArea(nextRing);
  if (
    !Number.isFinite(area) ||
    Math.abs(area) <= EPS ||
    Math.sign(area) !== Math.sign(signedArea(vertices)) ||
    ringSelfIntersects(nextRing) ||
    (sharpCorner && Math.abs(area) <= Math.abs(signedArea(vertices))) ||
    (movedPoint &&
      (vertices.some((point, i) => i !== moving && samePoint(point, movedPoint)) ||
        footOnSegment(movedPoint, before, after).d <= EPS))
  )
    return { ok: false, detail: 'This edit would collapse, touch or cross the outline.' };

  if (source.textMarks?.some(({ at }) => !pointInPolygon(at, nextRing)))
    return { ok: false, detail: 'Move the text anchor inside the resized outline.' };
  if (source.pointMarks?.some(({ at }) => !pointInPolygon(at, nextRing)))
    return { ok: false, detail: 'Move the construction point inside the resized outline.' };
  if (command.tool === 'delete-point' || previousMoves || rounding) {
    const chain = rounding
      ? [before, ...rounding.samples, after]
      : movedPoint
        ? [before, movedPoint, after]
        : [before, after];
    const crosses = (point: PtMm, next?: PtMm) =>
      !pointInPolygon(point, nextRing) ||
      chain.slice(0, -1).some((a, i) => {
        const b = chain[i + 1]!;
        return (
          footOnSegment(point, a, b).d <= EPS || (next && segIntersect(point, next, a, b) !== null)
        );
      });
    if (
      source.drills.some(({ at, form, sizeMm }) => {
        if (!rounding || form === 'point') return crosses(at);
        const half = (sizeMm ?? DRILL_SQUARE_MM) / 2;
        return [-half, half].some((x) =>
          [-half, half].some((y) => crosses({ x: at.x + x, y: at.y + y })),
        );
      }) ||
      source.internal.some(({ pts, closed }) =>
        pts.some((point, i) => crosses(point, pts[i + 1] ?? (closed ? pts[0] : undefined))),
      )
    )
      return {
        ok: false,
        detail:
          command.tool === 'delete-point'
            ? 'The joined edge would cut through a retained drill or internal line.'
            : rounding
              ? 'The rounded corner would cut through a retained drill or internal line.'
              : 'The moved vertex would cut through a retained drill or internal line.',
      };
  }
  if (holes.some((hole) => !ringStrictlyInside(hole, nextRing)))
    return { ok: false, detail: 'The resized outline would cross or touch a retained cut hole.' };

  let nextSeam: readonly PtMm[] = nextRing;
  if (allowanceWidthMm !== null) {
    const bounded = (value: number) =>
      Number.isSafeInteger(
        Math.round((Math.abs(value) + MITER_LIMIT * allowanceWidthMm) * OFFSET_SCALE),
      );
    if (!strictlyConvex(nextRing) || !nextRing.every(({ x, y }) => bounded(x) && bounded(y)))
      return {
        ok: false,
        detail: 'The resized cut no longer has the verified allowance topology.',
      };
    const offset = offsetContour(nextRing, -allowanceWidthMm);
    if (
      !offset.report.ok ||
      offset.pts.length !== seam!.length ||
      !strictlyConvex(offset.pts) ||
      !ringStrictlyInside(offset.pts, nextRing)
    )
      return { ok: false, detail: 'The new length would change the paired allowance topology.' };
    const leavesCut = (point: PtMm) =>
      pointInPolygon(point, cut) && !pointInPolygon(point, nextRing);
    if (
      source.drills.some(({ at }) => leavesCut(at)) ||
      (source.grain && [source.grain.a, source.grain.b].some(leavesCut))
    )
      return {
        ok: false,
        detail: 'The resized cut would leave a retained drill or grain mark outside.',
      };
    nextSeam =
      Math.sign(signedArea(seam!)) === Math.sign(signedArea(offset.pts))
        ? offset.pts
        : offset.pts.slice().reverse();
  }
  const size = structuredClone(source);
  const copyLoop = (previous: readonly PtMm[], next: readonly PtMm[]) => {
    const updated = next.map((point) => ({ ...point }));
    if (previous.length > ring(previous).length) updated.push({ ...updated[0]! });
    return updated;
  };
  size.cut = copyLoop(source.cut, nextRing);
  if (rounding && rounding.controls)
    size.authoredOutlineCorner = decodeAuthoredQuadratic(rounding.controls);
  if (source.seam) size.seam = copyLoop(source.seam, nextSeam);
  size.bbox = bboxOf(nextRing);
  size.areaMm2 = Math.abs(area) + holes.reduce((total, hole) => total + signedArea(hole), 0);
  return { ok: true, size, ...(allowanceWidthMm !== null && { pairedAllowance: true as const }) };
}
