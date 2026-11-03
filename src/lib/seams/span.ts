import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import { orderSideAlongOutline, resolveEdge } from 'lib/assembly-skeleton/union';

/** One part of a seam side. No range = the whole target. Range = mm from the run's start, in the run's walk direction. */
export type SidePart = { target: string; range?: readonly [number, number] };

const WHOLE_TOL_MM = 0.05;

const clampedRange = (
  range: readonly [number, number] | undefined,
  length: number,
): readonly [number, number] | undefined => {
  if (!range || !(length > 0)) return undefined;
  const from = Math.max(0, Math.min(length, Math.min(range[0], range[1])));
  const to = Math.max(from, Math.min(length, Math.max(range[0], range[1])));
  return from <= WHOLE_TOL_MM && to >= length - WHOLE_TOL_MM ? undefined : [from, to];
};

/** Clamp real ranges and put one piece's contiguous targets in outline order. */
export function normalizeParts(
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
): SidePart[] {
  const normalized = parts.map((part) => {
    const edge = resolveEdge(part.target, geoms);
    const range = clampedRange(part.range, edge?.len ?? 0);
    return range ? { target: part.target, range } : { target: part.target };
  });
  const byPiece = new Map<string, SidePart[]>();
  for (const part of normalized) {
    const at = part.target.lastIndexOf('#');
    const piece = at < 0 ? part.target : part.target.slice(0, at);
    byPiece.set(piece, [...(byPiece.get(piece) ?? []), part]);
  }
  return [...byPiece.values()].flatMap((pieceParts) => {
    const ordered = orderSideAlongOutline(
      pieceParts.map((part) => part.target),
      geoms,
    );
    const remaining = [...pieceParts];
    return ordered.map((target) => {
      const index = remaining.findIndex((part) => part.target === target);
      return index < 0 ? { target } : remaining.splice(index, 1)[0];
    });
  });
}

/** One run part expanded to its individual edges, retaining only real per-edge ranges. */
export function expandSidePart(part: SidePart, geoms: ReadonlyMap<string, PieceGeom>): SidePart[] {
  const ids = edgeIdsOf(part.target);
  if (ids.length <= 1 || !part.range) return [part];
  const edges = ids.map((id) => resolveEdge(id, geoms));
  if (edges.some((edge) => !edge)) return [part];
  const out: SidePart[] = [];
  let at = 0;
  for (let index = 0; index < ids.length; index++) {
    const length = edges[index]!.len;
    const from = Math.max(0, part.range[0] - at);
    const to = Math.min(length, part.range[1] - at);
    if (to > from) {
      const range = clampedRange([from, to], length);
      out.push(range ? { target: ids[index], range } : { target: ids[index] });
    }
    at += length;
  }
  return out.length ? out : [part];
}

/** Candidate side as ordered ranged parts; composite chain ranges are expanded per edge. */
export function candidateSideParts(
  candidate: SeamCandidate,
  side: 'a' | 'b',
  geoms?: ReadonlyMap<string, PieceGeom>,
): SidePart[] {
  const ids = side === 'a' ? candidate.aParts ?? [candidate.a] : candidate.bParts ?? [candidate.b];
  const direct = ids.map((target): SidePart => {
    const range =
      candidate.partRange?.[target] ?? (ids.length === 1 ? candidate.range?.[side] : undefined);
    return range ? { target, range } : { target };
  });
  if (!geoms) return direct;
  return direct.flatMap((part) => {
    if (part.range) return expandSidePart(part, geoms);
    if (!candidate.partRange) return [part];
    const edges = edgeIdsOf(part.target);
    if (!edges.some((id) => candidate.partRange?.[id])) return [part];
    return edges.map((target) => {
      const range = candidate.partRange?.[target];
      return range ? { target, range } : { target };
    });
  });
}

/** The individual edge ids named by a side part (a chain names each member). */
export const sidePartEdges = (part: SidePart): EdgeId[] => edgeIdsOf(part.target);
