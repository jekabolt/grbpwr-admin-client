import {
  turnAllowanceMarker,
  verifyTurnAllowanceGeometry,
} from 'lib/pattern-import/manifest/authored-turn-allowance';
import type { PatternImportDxfProductPhaseEAssemblyProjectionV1 } from 'lib/pattern-import/dxf-product-phase-e-assembly-workbench-v1';
import { bboxOf, signedArea } from 'lib/pattern-import/semantics/geom';
import type { AuthoredTurnAllowance, PieceSizeSpec, PtMm } from 'lib/pattern-import/types';
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

type GridPoint = Readonly<{ x: bigint; y: bigint }>;

function exactPoint({ x, y }: PtMm): GridPoint | null {
  const u = grid(x),
    v = grid(y);
  return u === null || v === null ? null : { x: BigInt(u), y: BigInt(v) };
}

function turn(a: GridPoint, b: GridPoint, p: GridPoint, denominator = 1n) {
  return (b.x - a.x) * (p.y - a.y * denominator) - (b.y - a.y) * (p.x - a.x * denominator);
}

function convexQuad(points: readonly PtMm[]) {
  const ring = openRing(points);
  if (ring.length !== 4 || new Set(ring.map(({ x, y }) => `${x},${y}`)).size !== 4) return null;
  const vertices = ring.map(exactPoint);
  if (!vertices.every((vertex): vertex is GridPoint => vertex !== null)) return null;
  const first = turn(vertices[0]!, vertices[1]!, vertices[2]!);
  const winding = first > 0n ? 1n : -1n;
  return vertices.every(
    (a, i) => winding * turn(a, vertices[(i + 1) % 4]!, vertices[(i + 2) % 4]!) > 0n,
  )
    ? { ring, vertices, winding }
    : null;
}

type ConvexQuad = NonNullable<ReturnType<typeof convexQuad>>;

function supports(contour: Contour | undefined, edge: readonly [string, string]) {
  if (!contour?.closed || contour.role !== 'cut-boundary' || contour.vertices.length !== 4)
    return null;
  const { vertices } = contour;
  const index = vertices.findIndex(({ vertexId }) => vertexId === edge[0]);
  const next = (index + 1) % 4;
  if (index < 0 || vertices[next]?.vertexId !== edge[1]) return null;
  const original = convexQuad(vertices.map(({ pointMm }) => pointMm));
  if (!original) return null;
  const from = original.ring[index]!,
    to = original.ring[next]!;
  const before = original.ring[(index + 3) % 4]!,
    after = original.ring[(next + 1) % 4]!;
  const fixed = parallelOpeningAxisV1([from, to]);
  if (fixed !== 'x' && fixed !== 'y') return null;
  const axis: 'x' | 'y' = fixed;
  const along = axis === 'x' ? 'y' : 'x';
  if (
    parallelOpeningAxisV1([before, from]) !== along ||
    parallelOpeningAxisV1([to, after]) !== along
  )
    return null;
  const support = from[axis];
  const sign = support > before[axis] ? 1 : -1;
  return { original, index, next, axis, support, sign };
}

export function hasDraftCutAllowanceJoinsV1(
  contour: Contour | undefined,
  edge: readonly [string, string],
) {
  return supports(contour, edge) !== null;
}

/** Moves only the selected support, preserving the two exact right-angle joins and the far side. */
export function selectDraftCutAllowanceOffsetV1(
  contour: Contour | undefined,
  edge: readonly [string, string],
  offsetMm: number,
) {
  if (!validParallelDisplacementV1(offsetMm)) return null;
  const selected = supports(contour, edge);
  const amount = grid(offsetMm);
  if (!selected || amount === null) return null;
  const { original, index, next, axis, support, sign } = selected;
  const moved = grid(support)! + sign * amount;
  if (!Number.isSafeInteger(moved)) return null;
  const movedSupport = moved / dxfScale;
  if (grid(movedSupport) !== moved) return null;
  const edited = convexQuad(
    original.ring.map((point, i) =>
      i === index || i === next ? { ...point, [axis]: movedSupport } : point,
    ),
  );
  return edited?.winding === original.winding
    ? { original, edited, ring: edited.ring, axis, support, index, next, sign }
    : null;
}

function contains(quad: ConvexQuad, point: GridPoint, denominator = 1n) {
  return quad.vertices.every(
    (a, i) => quad.winding * turn(a, quad.vertices[(i + 1) % 4]!, point, denominator) > 0n,
  );
}

function onSide(quad: ConvexQuad, point: GridPoint) {
  return quad.vertices.some((a, i) => {
    const b = quad.vertices[(i + 1) % 4]!;
    const along = (point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y);
    const lengthSquared = (b.x - a.x) ** 2n + (b.y - a.y) ** 2n;
    return turn(a, b, point) === 0n && along > 0n && along < lengthSquared;
  });
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
    return { ok: false, detail: 'Choose a native cut edge with two exact right-angle joins.' };
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
    !sameDraftAllowanceRingV1(moved.original.ring, proof.cut)
  )
    return { ok: false, detail: 'The offset does not match the verified native outline pair.' };
  const { original, edited } = moved;
  const sewing = convexQuad(source.seam);
  const bounds = bboxOf(moved.ring);
  if (
    !sewing ||
    !sewing.vertices.every((point) => contains(original, point) && contains(edited, point))
  )
    return { ok: false, detail: 'The native sewing outline must stay strictly inside both cuts.' };
  const interior = [
    ...(source.cutLoops ?? []).flat(),
    ...source.internal.flatMap(({ pts }) => pts),
    ...(source.textMarks ?? []).map(({ at }) => at),
    ...(source.pointMarks ?? []).map(({ at }) => at),
  ];
  // The ordinary writer fixes the arrow length and only refits when its midpoint leaves the cut.
  const grainA = source.grain && exactPoint(source.grain.a);
  const grainB = source.grain && exactPoint(source.grain.b);
  const grainMiddle = grainA && grainB && { x: grainA.x + grainB.x, y: grainA.y + grainB.y };
  const inside = (point: GridPoint, denominator = 1n) =>
    contains(original, point, denominator) && contains(edited, point, denominator);
  if (
    interior.some((point) => {
      const exact = exactPoint(point);
      return !exact || !inside(exact);
    }) ||
    (source.grain && (!grainMiddle || !inside(grainMiddle, 2n))) ||
    source.drills.some(({ at, form, sizeMm }) => {
      const point = exactPoint(at);
      const diameter = grid(
        form === 'point' ? 0 : form === 'circle' && sizeMm ? sizeMm : DRILL_SQUARE_MM,
      );
      if (!point || diameter === null || diameter < 0) return true;
      const d = BigInt(diameter);
      return [-d, d].some((u) =>
        [-d, d].some((v) => !inside({ x: 2n * point.x + u, y: 2n * point.y + v }, 2n)),
      );
    }) ||
    source.notches.some(({ at, seg }) => {
      const start = exactPoint(at),
        tip = exactPoint(seg[1]);
      return (
        !start ||
        !tip ||
        at[moved.axis] === moved.support ||
        !onSide(original, start) ||
        !onSide(edited, start) ||
        (contains(original, tip) && !contains(edited, tip))
      );
    })
  )
    return {
      ok: false,
      detail: 'The offset would move an attached notch or cross retained geometry.',
    };
  const holes = source.cutLoops ?? [];
  if (holes.some((loop) => signedArea(loop) >= 0))
    return { ok: false, detail: 'The cut contains an unsupported secondary outline.' };
  let turnAllowance: AuthoredTurnAllowance | undefined;
  if (command.payload.turnAllowance) {
    const cut: [PtMm, PtMm] = [moved.ring[moved.index]!, moved.ring[moved.next]!];
    const matches = sewing.ring.flatMap((point, index) => {
      const edge: [PtMm, PtMm] = [point, sewing.ring[(index + 1) % sewing.ring.length]!];
      const marker = turnAllowanceMarker({
        variant: command.payload.turnAllowance!,
        cut,
        sewing: edge,
      });
      return marker && verifyTurnAllowanceGeometry(marker, moved.ring, sewing.ring, edge, true)
        ? [edge]
        : [];
    });
    if (
      matches.length !== 1 ||
      holes.length ||
      source.notches.length ||
      source.drills.length ||
      source.internal.some(({ authoredTurnAllowance }) => authoredTurnAllowance)
    )
      return {
        ok: false,
        detail:
          'An authored turn requires one exact parallel sewing edge and no other turn, cut hole, notch or drill.',
      };
    const edge = matches[0]!;
    const axis = moved.axis;
    const reflected = 2n * exactPoint(edge[0])![axis] - exactPoint(cut[0])![axis];
    const kept = [...interior, ...(source.grain ? [source.grain.a, source.grain.b] : [])];
    if (
      kept.some((point) => {
        const exact = exactPoint(point);
        return !exact || BigInt(moved.sign) * (exact[axis] - reflected) >= 0n;
      })
    )
      return {
        ok: false,
        detail:
          'The selected turn would affect retained marks in the original or folded allowance.',
      };
    turnAllowance = { variant: command.payload.turnAllowance, cut, sewing: edge };
  }
  const size = structuredClone(source);
  size.cut = moved.ring.map((point) => ({ ...point }));
  if (openRing(source.cut).length < source.cut.length) size.cut.push({ ...size.cut[0]! });
  if (turnAllowance)
    size.internal.push({
      kind: 'internal',
      label: 'draft-cad:pattern-line',
      pts: [...turnAllowance.sewing],
      closed: false,
      origin: 'operator',
      ranges: [],
      confidence: 1,
      authoredTurnAllowance: turnAllowance,
    });
  size.bbox = bounds;
  size.areaMm2 =
    Math.abs(signedArea(moved.ring)) + holes.reduce((sum, hole) => sum + signedArea(hole), 0);
  return { ok: true, size, pairedAllowance: true };
}
