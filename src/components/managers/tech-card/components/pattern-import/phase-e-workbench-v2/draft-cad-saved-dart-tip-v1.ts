import { authoredInternalVertices } from 'lib/pattern-import/manifest/authored-internal';
import type { PtMm } from 'lib/pattern-import/types';
import type { PatternImportDxfPhaseEDraftCadGeometryCompileInputV1 as CompileInput } from './draft-cad-geometry-compile-v1';
import {
  recordPatternImportDxfPhaseEDraftCadTransactionV1,
  type PatternImportDxfPhaseEDraftCadBoundaryAnchorV1,
  type PatternImportDxfPhaseEDraftCadTargetV1,
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

/** Restrict the first edit to one drawn open dart whose two feet lie on one unambiguous cut edge. */
export function selectSavedDartTipV1(
  input: CompileInput,
  target: PatternImportDxfPhaseEDraftCadTargetV1,
) {
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
  if (!size || !projected) return null;
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
