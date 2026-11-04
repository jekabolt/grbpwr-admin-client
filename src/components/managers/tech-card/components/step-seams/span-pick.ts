// THE SPAN HAND, PURE (asm-fixes T6, T7). Segments are virtual: neighbouring break points over the
// unchanged edges. A click takes a segment, a click on the next one extends it, a drag takes a free
// span. A side holds one range per edge; a second span of one edge is a second seam row. A click on a
// stored part selects that row and starts no pick.

import { breakPoints, type EdgeBreakPoint } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { expandSidePart, sidePartEdges, type SidePart } from 'lib/seams';

import { pickTarget } from './seam-focus';

export type SpanRange = readonly [number, number];
export type SpanSide = 'a' | 'b';
export type SidePick = {
  a: string[];
  b: string[];
  /** Mm from the edge's start; an edge with no entry is whole. */
  spans: { a: Readonly<Record<string, SpanRange>>; b: Readonly<Record<string, SpanRange>> };
};

export const NO_SPANS: SidePick['spans'] = { a: {}, b: {} };

const SAME_MM = 0.1;
const TOUCH_MM = 0.5;
const SNAP_MM = 4;
const MIN_SPAN_MM = 1;
const OVERLAP_MM = 1;

const edgeLen = (id: string, geoms: ReadonlyMap<string, PieceGeom>) =>
  resolveEdge(id, geoms)?.len ?? 0;

const isWhole = (range: SpanRange, length: number) =>
  range[0] <= TOUCH_MM && range[1] >= length - TOUCH_MM;

/** The edge's ends, notches and real turns, in mm from its start. */
export function edgeBreaks(id: string, geoms: ReadonlyMap<string, PieceGeom>): EdgeBreakPoint[] {
  const at = id.lastIndexOf('#');
  const geom = at < 0 ? undefined : geoms.get(id.slice(0, at));
  const edge = geom?.edges.find((candidate) => candidate.id === id);
  return geom && edge ? breakPoints(geom, edge) : [];
}

/** The segment under a point of the edge. */
export function segmentAt(
  breaks: readonly EdgeBreakPoint[],
  length: number,
  atMm: number,
): SpanRange {
  let from = 0;
  let to = length;
  for (const { atMm: point } of breaks) {
    if (point <= atMm && point > from) from = point;
    if (point > atMm && point < to) to = point;
  }
  return [from, to];
}

/** A free drag's end lands on a break point near it, and anywhere else as it is. */
export function snapToBreak(breaks: readonly EdgeBreakPoint[], atMm: number): number {
  let best = atMm;
  let bestGap = SNAP_MM;
  for (const { atMm: point } of breaks) {
    const gap = Math.abs(point - atMm);
    if (gap < bestGap) {
      best = point;
      bestGap = gap;
    }
  }
  return best;
}

/** A click on one more segment of a picked edge: extend, shrink back, or null when none is left. */
export function clickSegment(current: SpanRange, segment: SpanRange): SpanRange | null {
  const [from, to] = current;
  const [segFrom, segTo] = segment;
  if (Math.abs(from - segFrom) < SAME_MM && Math.abs(to - segTo) < SAME_MM) return null;
  if (Math.abs(to - segFrom) < TOUCH_MM) return [from, segTo];
  if (Math.abs(segTo - from) < TOUCH_MM) return [segFrom, to];
  if (segFrom >= from - SAME_MM && segTo <= to + SAME_MM) {
    if (Math.abs(segTo - to) < SAME_MM) return [from, segFrom];
    if (Math.abs(segFrom - from) < SAME_MM) return [segTo, to];
  }
  return segment;
}

const withoutDropped = (pick: SidePick): SidePick['spans'] => {
  const keep = (side: SpanSide) =>
    Object.fromEntries(Object.entries(pick.spans[side]).filter(([id]) => pick[side].includes(id)));
  return { a: keep('a'), b: keep('b') };
};

const withRange = (
  pick: SidePick,
  side: SpanSide,
  id: string,
  range: SpanRange,
  length: number,
): SidePick => {
  const own = Object.fromEntries(Object.entries(pick.spans[side]).filter(([key]) => key !== id));
  return {
    ...pick,
    spans: { ...pick.spans, [side]: isWhole(range, length) ? own : { ...own, [id]: range } },
  };
};

type PickRules = {
  isInner: (id: string) => boolean;
  pieceOf: (id: string) => string;
};

/** A click on an edge, by the segment under the pointer. */
export function pickSegment(
  pick: SidePick,
  side: SpanSide,
  id: string,
  segment: SpanRange,
  length: number,
  rules: PickRules,
): SidePick {
  if (pick[side].includes(id)) {
    const next = clickSegment(pick.spans[side][id] ?? [0, length], segment);
    if (next && next[1] - next[0] > SAME_MM) return withRange(pick, side, id, next, length);
    const dropped = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
    return { ...dropped, spans: withoutDropped(dropped) };
  }
  const added = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
  return withRange({ ...added, spans: withoutDropped(added) }, side, id, segment, length);
}

/** A finished drag: the edge's range on this side becomes exactly this one. */
export function pickFreeSpan(
  pick: SidePick,
  side: SpanSide,
  id: string,
  range: SpanRange,
  length: number,
  rules: PickRules,
): SidePick {
  const ordered: SpanRange = [Math.min(range[0], range[1]), Math.max(range[0], range[1])];
  if (ordered[1] - ordered[0] < MIN_SPAN_MM) return pick;
  if (pick[side].includes(id)) return withRange(pick, side, id, ordered, length);
  const added = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
  return withRange({ ...added, spans: withoutDropped(added) }, side, id, ordered, length);
}

/** One side as parts; an edge with no span stays a bare target. */
export function sideParts(
  ids: readonly string[],
  spans: Readonly<Record<string, SpanRange>>,
): SidePart[] {
  return ids.map((target) => {
    const range = spans[target];
    return range ? { target, range } : { target };
  });
}

/**
 * Which of the edges stacked under a click takes it. A repeat at the same spot walks down the stack,
 * except while the edge it last took is in hand: that click is that edge's, to shrink or to drop.
 */
export function repeatClickTarget(
  hits: readonly string[],
  id: string,
  last: { x: number; y: number; id: string } | null,
  at: Pt2,
  inHand: ReadonlySet<string>,
): string {
  const again =
    last && Math.hypot(last.x - at[0], last.y - at[1]) <= 4 ? hits.indexOf(last.id) : -1;
  if (again < 0 || hits.length < 2) return id;
  return inHand.has(hits[again]) ? hits[again] : hits[(again + 1) % hits.length];
}

/** Where a pointer falls along an edge drawn as `points`, in the edge's own mm. */
export function mmOnPoints(points: readonly Pt2[], at: Pt2, targetLength: number): number {
  let total = 0;
  let bestAt = 0;
  let bestGap = Infinity;
  for (let index = 1; index < points.length; index++) {
    const [ax, ay] = points[index - 1];
    const [bx, by] = points[index];
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.hypot(dx, dy);
    const share =
      length > 0
        ? Math.max(0, Math.min(1, ((at[0] - ax) * dx + (at[1] - ay) * dy) / (length * length)))
        : 0;
    const gap = Math.hypot(at[0] - ax - dx * share, at[1] - ay - dy * share);
    if (gap < bestGap) {
      bestGap = gap;
      bestAt = total + share * length;
    }
    total += length;
  }
  return total > 0 ? (bestAt / total) * targetLength : 0;
}

type StoredParts = { parts: { a: readonly SidePart[]; b: readonly SidePart[] } };

const pieces = (
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
): { edge: string; from: number; to: number }[] =>
  parts
    .flatMap((part) => expandSidePart(part, geoms))
    .flatMap((part) =>
      sidePartEdges(part).map((edge) => ({
        edge,
        from: part.range ? part.range[0] : 0,
        to: part.range ? part.range[1] : edgeLen(edge, geoms),
      })),
    );

/** The stored seam whose part is under a click, or -1; a free part of an edge is no seam. */
export function storedSeamAt(
  stored: readonly StoredParts[],
  id: string,
  atMm: number | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): number {
  return stored.findIndex(({ parts }) =>
    pieces([...parts.a, ...parts.b], geoms).some(
      (part) =>
        part.edge === id &&
        (atMm == null || (atMm >= part.from - TOUCH_MM && atMm <= part.to + TOUCH_MM)),
    ),
  );
}

const overlaps = (
  x: readonly SidePart[],
  y: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
) => {
  const ys = pieces(y, geoms);
  return pieces(x, geoms).some((one) =>
    ys.some(
      (other) =>
        one.edge === other.edge &&
        Math.min(one.to, other.to) - Math.max(one.from, other.from) > OVERLAP_MM,
    ),
  );
};

/** Whether this pick would sew again what a stored seam of the step already sews. */
export function repeatsStoredSeam(
  a: readonly SidePart[],
  b: readonly SidePart[],
  stored: readonly StoredParts[],
  geoms: ReadonlyMap<string, PieceGeom>,
): boolean {
  return stored.some(
    ({ parts }) =>
      (overlaps(a, parts.a, geoms) && overlaps(b, parts.b, geoms)) ||
      (overlaps(a, parts.b, geoms) && overlaps(b, parts.a, geoms)),
  );
}
