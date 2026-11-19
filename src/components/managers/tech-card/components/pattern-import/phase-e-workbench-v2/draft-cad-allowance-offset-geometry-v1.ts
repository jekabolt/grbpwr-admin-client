import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { bboxOf, signedArea } from 'lib/pattern-import/semantics/geom';
import type { PieceSizeSpec, PtMm } from 'lib/pattern-import/types';
import { DRILL_SQUARE_MM } from 'lib/pattern-import/write/plan';
import {
  sameDraftAllowanceRingV1,
  type SavedDraftPairedAllowanceProofV1,
} from './draft-cad-paired-allowance-authority-v1';
import {
  parallelOpeningAxisV1,
  validParallelDisplacementV1,
  type PatternImportDxfPhaseEDraftCadCommandV1,
} from './draft-cad-session-v1';

type OffsetCommand = Extract<PatternImportDxfPhaseEDraftCadCommandV1, { tool: 'allowance-offset' }>;
type Contour =
  PatternImportDxfProductPhaseEAssemblyProjectionV1['pieces'][number]['contours'][number];

const dxfScale = 1_000_000;
const grid = (value: number) => {
  const scaled = Math.round(value * dxfScale);
  return Number.isSafeInteger(scaled) && scaled / dxfScale === value ? scaled : null;
};

function openRing(points: readonly PtMm[]) {
  const first = points[0],
    last = points.at(-1);
  return points.length > 1 && first?.x === last?.x && first?.y === last?.y
    ? points.slice(0, -1)
    : points;
}

function rectangle(points: readonly PtMm[]) {
  const ring = openRing(points);
  if (ring.length !== 4 || new Set(ring.map(({ x, y }) => `${x},${y}`)).size !== 4) return null;
  const bounds = bboxOf(ring);
  return ring.every(
    ({ x, y }, index) =>
      grid(x) !== null &&
      grid(y) !== null &&
      (x === bounds.minX || x === bounds.maxX) &&
      (y === bounds.minY || y === bounds.maxY) &&
      parallelOpeningAxisV1([ring[index]!, ring[(index + 1) % 4]!]),
  )
    ? { ring, bounds }
    : null;
}

export function isDraftRectangularCutOutlineV1(contour: Contour | undefined): boolean {
  return Boolean(
    contour?.closed &&
      contour.role === 'cut-boundary' &&
      contour.vertices.length === 4 &&
      rectangle(contour.vertices.map(({ pointMm }) => pointMm)),
  );
}

/** Moves one identified support line. Its perpendicular neighbors have unique exact joins. */
export function selectDraftCutAllowanceOffsetV1(
  contour: Contour | undefined,
  edge: readonly [string, string],
  offsetMm: number,
) {
  if (
    !contour?.closed ||
    contour.role !== 'cut-boundary' ||
    contour.vertices.length !== 4 ||
    !validParallelDisplacementV1(offsetMm)
  )
    return null;
  const { vertices } = contour;
  const index = vertices.findIndex(({ vertexId }) => vertexId === edge[0]);
  const next = (index + 1) % vertices.length;
  if (index < 0 || vertices[next]?.vertexId !== edge[1]) return null;
  const original = rectangle(vertices.map(({ pointMm }) => pointMm));
  const amount = grid(offsetMm);
  if (!original || amount === null) return null;
  const from = original.ring[index]!,
    to = original.ring[next]!;
  const axis: 'x' | 'y' = from.x === to.x ? 'x' : 'y';
  const support = from[axis];
  const minimum = axis === 'x' ? original.bounds.minX : original.bounds.minY;
  const maximum = axis === 'x' ? original.bounds.maxX : original.bounds.maxY;
  const sign = support === minimum ? -1 : 1;
  const moved = grid(support)! + sign * amount;
  if (!Number.isSafeInteger(moved)) return null;
  const movedSupport = moved / dxfScale;
  if (
    grid(movedSupport) !== moved ||
    (sign === -1 ? movedSupport >= maximum : movedSupport <= minimum)
  )
    return null;
  const ring = original.ring.map((point) =>
    point[axis] === support ? { ...point, [axis]: movedSupport } : point,
  );
  return {
    original: original.ring,
    ring,
    axis,
    support,
  };
}

type Result =
  | { ok: true; size: PieceSizeSpec; pairedAllowance: true }
  | { ok: false; detail: string; requiresPairedAllowance?: true };

export function offsetDraftCadSelectedSizeAllowanceV1(
  source: PieceSizeSpec,
  command: OffsetCommand,
  projection: PatternImportDxfProductPhaseEAssemblyProjectionV1,
  proof?: SavedDraftPairedAllowanceProofV1 | null,
): Result {
  const { sizeToken, edge, offsetMm } = command.payload;
  const { pieceId, pieceLineKey } = command.target;
  const pieces = projection.pieces.filter(
    (candidate) => candidate.pieceId === pieceId && candidate.pieceLineKey === pieceLineKey,
  );
  const contours =
    pieces.length === 1
      ? pieces[0]!.contours.filter(({ contourId }) => contourId === edge.contourId)
      : [];
  const contour = contours.length === 1 ? contours[0] : undefined;
  const moved = selectDraftCutAllowanceOffsetV1(contour, edge.boundaryVertexIds, offsetMm);
  if (
    !moved ||
    source.sizeToken !== sizeToken ||
    projection.sizeToken !== sizeToken ||
    !source.seam ||
    source.fold ||
    source.offset ||
    source.continuity ||
    source.repair ||
    source.kinks?.length
  )
    return { ok: false, detail: 'Choose a straight side of the native rectangular cut outline.' };
  if (!proof)
    return {
      ok: false,
      requiresPairedAllowance: true,
      detail: 'Verify the saved native cut and sewing outlines before offsetting the allowance.',
    };
  if (
    proof.commandId !== command.commandId ||
    proof.contourId !== edge.contourId ||
    proof.pieceId !== pieceId ||
    proof.pieceLineKey !== pieceLineKey ||
    proof.sizeToken !== sizeToken ||
    !sameDraftAllowanceRingV1(source.cut, proof.cut) ||
    !sameDraftAllowanceRingV1(source.seam, proof.seam) ||
    !sameDraftAllowanceRingV1(moved.original, proof.cut)
  )
    return { ok: false, detail: 'The offset does not match the verified native outline pair.' };
  const sewing = rectangle(source.seam);
  const bounds = bboxOf(moved.ring);
  const originalBounds = bboxOf(moved.original);
  const inside = (point: PtMm, box = bounds) =>
    point.x > box.minX && point.x < box.maxX && point.y > box.minY && point.y < box.maxY;
  if (!sewing || !sewing.ring.every((point) => inside(point, originalBounds) && inside(point)))
    return { ok: false, detail: 'The native sewing rectangle must stay strictly inside the cut.' };
  const interior = [
    ...(source.cutLoops ?? []).flat(),
    ...source.internal.flatMap(({ pts }) => pts),
    ...source.drills.flatMap(({ at, form, sizeMm }) => {
      if (form === 'point') return [at];
      const radius = (form === 'circle' && sizeMm ? sizeMm : DRILL_SQUARE_MM) / 2;
      return [
        { x: at.x - radius, y: at.y - radius },
        { x: at.x + radius, y: at.y + radius },
      ];
    }),
    ...(source.textMarks ?? []).map(({ at }) => at),
    ...(source.pointMarks ?? []).map(({ at }) => at),
  ];
  // The ordinary writer fixes the arrow length and only refits when its midpoint leaves the cut.
  const grainMiddle = source.grain
    ? {
        x: (source.grain.a.x + source.grain.b.x) / 2,
        y: (source.grain.a.y + source.grain.b.y) / 2,
      }
    : null;
  const onSide = (point: PtMm, ring: readonly PtMm[]) =>
    ring.some((a, i) => {
      const b = ring[(i + 1) % 4]!;
      const fixed = parallelOpeningAxisV1([a, b])!;
      const along = fixed === 'x' ? 'y' : 'x';
      return (
        point[fixed] === a[fixed] &&
        point[along] > Math.min(a[along], b[along]) &&
        point[along] < Math.max(a[along], b[along])
      );
    });
  if (
    interior.some((point) => !inside(point)) ||
    (grainMiddle && (!inside(grainMiddle, originalBounds) || !inside(grainMiddle))) ||
    source.notches.some(
      ({ at, seg }) =>
        at[moved.axis] === moved.support ||
        !onSide(at, moved.original) ||
        !onSide(at, moved.ring) ||
        (inside(seg[1], originalBounds) && !inside(seg[1])),
    )
  )
    return {
      ok: false,
      detail: 'The offset would move an attached notch or cross retained geometry.',
    };
  const holes = source.cutLoops ?? [];
  if (holes.some((loop) => signedArea(loop) >= 0))
    return { ok: false, detail: 'The cut contains an unsupported secondary outline.' };
  const size = structuredClone(source);
  size.cut = moved.ring.map((point) => ({ ...point }));
  if (openRing(source.cut).length < source.cut.length) size.cut.push({ ...size.cut[0]! });
  size.bbox = bounds;
  size.areaMm2 =
    Math.abs(signedArea(moved.ring)) + holes.reduce((sum, hole) => sum + signedArea(hole), 0);
  return { ok: true, size, pairedAllowance: true };
}
