import { edgeIdsOf } from 'lib/assembly-skeleton/geometry';
import type { EdgeId, Mm, PieceGeom, SeamCandidate } from 'lib/assembly-skeleton/types';
import { orderSideAlongOutline, resolveEdge } from 'lib/assembly-skeleton/union';

/** One part of a seam side. No range = the whole target. Range = mm from the run's start, in the run's walk direction. */
export type SidePart = { target: string; range?: readonly [number, number] };

const WHOLE_TOL_MM = 0.05;
/** Spans of one edge this close are one span: they touch, nothing lies between them. */
const TOUCH_MM = 0.5;

const clampedRange = (
  range: readonly [number, number] | undefined,
  length: number,
): readonly [number, number] | undefined => {
  if (!range || !(length > 0)) return undefined;
  const from = Math.max(0, Math.min(length, Math.min(range[0], range[1])));
  const to = Math.max(from, Math.min(length, Math.max(range[0], range[1])));
  return from <= WHOLE_TOL_MM && to >= length - WHOLE_TOL_MM ? undefined : [from, to];
};

/** Spans of one edge, ascending and disjoint: what overlaps or touches is one span. */
export function mergedSpans(
  spans: readonly (readonly [number, number])[],
): (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (const [from, to] of [...spans].sort((x, y) => x[0] - y[0] || x[1] - y[1])) {
    const last = out[out.length - 1];
    if (last && from <= last[1] + TOUCH_MM) last[1] = Math.max(last[1], to);
    else out.push([from, to]);
  }
  return out;
}

const pieceOfTarget = (target: string) => {
  const at = target.lastIndexOf('#');
  return at < 0 ? target : target.slice(0, at);
};

/** One edge named twice is never sent overlapping: its spans merge, a whole part takes them all. */
const withMergedSpans = (parts: readonly SidePart[], geoms: ReadonlyMap<string, PieceGeom>) => {
  const seen = new Set<string>();
  return parts.flatMap((part): SidePart[] => {
    if (seen.has(part.target)) return [];
    seen.add(part.target);
    const own = parts.filter((other) => other.target === part.target);
    if (own.length === 1) return [part];
    if (own.some((other) => !other.range)) return [{ target: part.target }];
    const length = resolveEdge(part.target, geoms)?.len ?? 0;
    return mergedSpans(own.map((other) => other.range!)).map((span) => {
      const range = clampedRange(span, length);
      return range ? { target: part.target, range } : { target: part.target };
    });
  });
};

const partLength = (part: SidePart, geoms: ReadonlyMap<string, PieceGeom>) =>
  part.range ? part.range[1] - part.range[0] : resolveEdge(part.target, geoms)?.len ?? 0;

/**
 * A side where an edge repeats: its spans in order along the edge, the other pieces between them.
 * Pieces are drawn flat in frames of their own, so where one of them belongs along the edge can only
 * be told by which gap it fits; with one gap they all belong there, in the order they were clicked.
 */
function walkOfGaps(parts: readonly SidePart[], geoms: ReadonlyMap<string, PieceGeom>): SidePart[] {
  const byPiece = new Map<string, SidePart[]>();
  for (const part of parts) {
    const piece = pieceOfTarget(part.target);
    byPiece.set(piece, [...(byPiece.get(piece) ?? []), part]);
  }
  const repeats = (own: readonly SidePart[]) =>
    new Set(own.map((part) => part.target)).size < own.length;
  const hosts = [...byPiece.values()].filter(repeats).map((own) => {
    const ordered = orderSideAlongOutline([...new Set(own.map((part) => part.target))], geoms);
    return ordered.flatMap((target) =>
      own
        .filter((part) => part.target === target)
        .sort((x, y) => (x.range?.[0] ?? 0) - (y.range?.[0] ?? 0)),
    );
  });
  // A gap: after this part of this host, it and the next being spans of one edge.
  const gaps = hosts.flatMap((host, hostIndex) =>
    host.flatMap((part, at) => {
      const next = host[at + 1];
      return part.range && next?.range && next.target === part.target
        ? [{ hostIndex, at, room: next.range[0] - part.range[1], laid: [] as SidePart[] }]
        : [];
    }),
  );
  for (const own of [...byPiece.values()].filter((group) => !repeats(group))) {
    const targets = orderSideAlongOutline(
      own.map((part) => part.target),
      geoms,
    );
    const group = targets.map((target) => own.find((part) => part.target === target)!);
    const length = group.reduce((sum, part) => sum + partLength(part, geoms), 0);
    const gap = gaps.reduce((best, candidate) =>
      Math.abs(candidate.room - length) < Math.abs(best.room - length) ? candidate : best,
    );
    gap.laid.push(...group);
    gap.room -= length;
  }
  return hosts.flatMap((host, hostIndex) =>
    host.flatMap((part, at) => [
      part,
      ...gaps.filter((gap) => gap.hostIndex === hostIndex && gap.at === at).flatMap((g) => g.laid),
    ]),
  );
}

/** Clamp real ranges and put one piece's contiguous targets in outline order. */
export function normalizeParts(
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
): SidePart[] {
  const normalized = withMergedSpans(
    parts.map((part) => {
      const edge = resolveEdge(part.target, geoms);
      const range = clampedRange(part.range, edge?.len ?? 0);
      return range ? { target: part.target, range } : { target: part.target };
    }),
    geoms,
  );
  if (new Set(normalized.map((part) => part.target)).size < normalized.length)
    return walkOfGaps(normalized, geoms);
  const byPiece = new Map<string, SidePart[]>();
  for (const part of normalized) {
    const piece = pieceOfTarget(part.target);
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

/**
 * Ordered parts as a candidate names them: each edge once, the hull of an edge's real stretches for
 * `partRange`, and the stretches themselves when an edge repeats.
 */
export function candidateSideOf(parts: readonly SidePart[]): {
  ids: EdgeId[];
  hull: Record<EdgeId, [Mm, Mm]>;
  walk?: readonly SidePart[];
} {
  const ids = [...new Set(parts.map((part) => part.target))];
  const hull: Record<EdgeId, [Mm, Mm]> = {};
  for (const part of parts) {
    if (!part.range) continue;
    const held = hull[part.target];
    hull[part.target] = held
      ? [Math.min(held[0], part.range[0]), Math.max(held[1], part.range[1])]
      : [part.range[0], part.range[1]];
  }
  return { ids, hull, ...(ids.length < parts.length ? { walk: [...parts] } : {}) };
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
  const walk = candidate.walk?.[side];
  if (walk) return geoms ? walk.flatMap((part) => expandSidePart(part, geoms)) : [...walk];
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
