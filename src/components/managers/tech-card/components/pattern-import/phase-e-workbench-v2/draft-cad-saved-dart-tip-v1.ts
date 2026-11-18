import { authoredInternalVertices } from 'lib/pattern-import/manifest/authored-internal';
import type { PtMm } from 'lib/pattern-import/types';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 as CompileInput } from './draft-cad-geometry-compile-v1';
import {
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type PatternImportDxfPhaseEDraftCadBoundaryAnchorV1,
  type PatternImportDxfPhaseEDraftCadTargetV1,
  type SavedDraftDartPathBindingV1,
} from './draft-cad-session-v1';

const one = <T>(items: readonly T[]) => (items.length === 1 ? items[0] : undefined);
export function sameDartVertices(a: readonly PtMm[], b: readonly PtMm[]) {
  if (a.length !== b.length) return false;
  const other = authoredInternalVertices(b);
  return authoredInternalVertices(a).every((v, i) => v === other[i]);
}

export function canMoveSavedDartTipV1(previous: PtMm, next: PtMm) {
  return (
    [next.x, next.y].every((v) => Number.isFinite(v) && v === Number(v.toFixed(6))) &&
    !sameDartVertices([previous], [next])
  );
}

function selectSavedDartPiece(input: CompileInput, target: PatternImportDxfPhaseEDraftCadTargetV1) {
  const { scopeKey, sizeToken } = input.selection.selection;
  const scope = one(input.compileSource.scopes.filter((s) => s.target.scopeKey === scopeKey));
  const piece = one(
    scope?.writerReplay?.job.pieces.filter((p) => p.identity === target.pieceId) ?? [],
  );
  const size = one(piece?.sizes.filter((s) => s.sizeToken === sizeToken) ?? []);
  const projected = one(
    input.projection.pieces.filter(
      (p) => p.pieceId === target.pieceId && p.pieceLineKey === target.pieceLineKey,
    ),
  );
  return size && projected ? { scopeKey, sizeToken, size, projected } : null;
}

/** The open dart must still have both drawn feet on the same original straight cut edge. */
export function selectSavedDartTipV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
) {
  const selected = selectSavedDartPiece(input, target);
  if (!selected) return null;
  const { scopeKey, sizeToken, size, projected } = selected;
  const dart = one(size.internal.filter((p) => p.label === 'draft-cad:dart'));
  if (!dart || dart.graded || dart.closed || dart.pts.length !== 3) return null;
  const [left, apex, right] = dart.pts;
  const anchors: PatternImportDxfPhaseEDraftCadBoundaryAnchorV1[] = [];
  for (const contour of projected.contours.filter((c) => c.closed && c.role === 'cut-boundary')) {
    for (const [i, start] of contour.vertices.entries()) {
      const end = contour.vertices[(i + 1) % contour.vertices.length]!;
      const a = start.pointMm,
        b = end.pointMm,
        dx = b.x - a.x,
        dy = b.y - a.y,
        length = dx * dx + dy * dy;
      if (!length) continue;
      const t = (p: PtMm) => ((p.x - a.x) * dx + (p.y - a.y) * dy) / length;
      const onEdge = (p: PtMm) =>
        t(p) > 0 &&
        t(p) < 1 &&
        Math.hypot(a.x + t(p) * dx - p.x, a.y + t(p) * dy - p.y) <= 0.000001;
      if (onEdge(left!) && onEdge(right!) && t(left!) !== t(right!))
        anchors.push({
          contourId: contour.contourId,
          boundaryVertexIds: [start.vertexId, end.vertexId],
          progress: (t(left!) + t(right!)) / 2,
        });
    }
  }
  const base = one(anchors);
  return base
    ? {
        base,
        apexMm: apex!,
        intakeMm: Math.hypot(left!.x - right!.x, left!.y - right!.y),
        savedTip: {
          pieceId: target.pieceId,
          pieceLineKey: target.pieceLineKey,
          sourceSha256: input.session.source.phaseD.sourceSha256,
          scopeKey,
          sizeToken,
          sizeId: size.sizeId,
          rank: size.rank,
          index: size.internal.indexOf(dart),
          original: dart.pts,
        },
      }
    : null;
}

export function recordSavedDartTipV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
  apexMm: PtMm,
) {
  const candidate = selectSavedDartTipV1(input, target);
  if (input.session.cursor !== 0 || !candidate || !canMoveSavedDartTipV1(candidate.apexMm, apexMm))
    return null;
  const id = 'saved-dart-tip';
  return recordPatternImportDxfPhaseEDraftCadTransactionV1(input.session, {
    transactionId: id,
    label: 'Move saved dart tip',
    commands: [
      { tool: 'dart', commandId: id, target, payload: { entityId: id, ...candidate, apexMm } },
    ],
  });
}

function savedFishEyeCenter(points: readonly PtMm[]): PtMm | null {
  const [a, b, c, d] = points;
  if (points.length !== 4 || !a || !b || !c || !d) return null;
  const rounded = (value: number) => Number(value.toFixed(6));
  const center = { x: rounded((a.x + c.x) / 2), y: rounded((a.y + c.y) / 2) };
  const otherX = (b.x + d.x) / 2,
    otherY = (b.y + d.y) / 2;
  const ux = a.x - c.x,
    uy = a.y - c.y,
    vx = b.x - d.x,
    vy = b.y - d.y;
  const axis = Math.hypot(ux, uy),
    intake = Math.hypot(vx, vy);
  return authoredInternalVertices(points).every(Number.isSafeInteger) &&
    axis > 0.002 &&
    intake > 0.002 &&
    Math.hypot(center.x - otherX, center.y - otherY) <= 0.000002 &&
    Math.abs(ux * vx + uy * vy) <= 0.000004 * (axis + intake)
    ? center
    : null;
}

export function movedSavedFishEyePointsV1(original: readonly PtMm[], nextCenter: PtMm) {
  const center = savedFishEyeCenter(original);
  if (!center || !canMoveSavedDartTipV1(center, nextCenter)) return null;
  const [x, y, nx, ny] = authoredInternalVertices([center, nextCenter]);
  const dx = nx! - x!,
    dy = ny! - y!;
  const moved = original.map((point) => {
    const [vx, vy] = authoredInternalVertices([point]);
    return { x: (vx! + dx) / 1_000_000, y: (vy! + dy) / 1_000_000 };
  });
  return savedFishEyeCenter(moved) ? moved : null;
}

export function selectSavedFishEyeMoveV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
) {
  const selected = selectSavedDartPiece(input, target);
  if (!selected) return null;
  const { scopeKey, sizeToken, size } = selected;
  const dart = one(size.internal.filter((feature) => feature.label === 'draft-cad:fish-eye'));
  if (!dart || !dart.closed || dart.graded) return null;
  const range = one(dart.ranges);
  const centerMm = savedFishEyeCenter(dart.pts);
  if (!range || range.from !== 0 || range.to !== dart.pts.length || !centerMm) return null;
  const savedMove: SavedDraftDartPathBindingV1 & { sourcePathId: number } = {
    pieceId: target.pieceId,
    pieceLineKey: target.pieceLineKey,
    sourceSha256: input.session.source.phaseD.sourceSha256,
    scopeKey,
    sizeToken,
    sizeId: size.sizeId,
    rank: size.rank,
    index: size.internal.indexOf(dart),
    original: dart.pts,
    sourcePathId: range.path,
  };
  return { centerMm, savedMove };
}

export function recordSavedFishEyeMoveV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
  centerMm: PtMm,
) {
  const candidate = selectSavedFishEyeMoveV1(input, target);
  if (
    input.session.cursor !== 0 ||
    !candidate ||
    !movedSavedFishEyePointsV1(candidate.savedMove.original, centerMm)
  )
    return null;
  const id = 'saved-fish-eye-move';
  return recordPatternImportDxfPhaseEDraftCadTransactionV1(input.session, {
    transactionId: id,
    label: 'Move saved fish-eye',
    commands: [
      {
        tool: 'fish-eye',
        commandId: id,
        target,
        payload: { entityId: id, centerMm, savedMove: candidate.savedMove },
      },
    ],
  });
}
