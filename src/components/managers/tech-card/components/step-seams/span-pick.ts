// THE SPAN HAND, PURE (asm-fixes T6, T7). Segments are virtual: neighbouring break points over the
// unchanged edges. A click takes a segment, a click on the next one extends it, a click further along
// adds a span, a drag takes a free span. A side holds any number of spans per edge, ascending and
// disjoint: a long edge broken by a pocket is sewn above it and below it in one row. A click on a
// stored part selects that row and starts no pick.

import { breakPoints, type EdgeBreakPoint } from 'lib/assembly-skeleton/geometry';
import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { expandSidePart, mergedSpans, SEAMS, sidePartEdges, type SidePart } from 'lib/seams';

import { pickTarget } from './seam-focus';
import { closedInner, parseInner } from './step-seams-model';

export type SpanRange = readonly [number, number];
export type SpanSide = 'a' | 'b';
export type SidePick = {
  a: string[];
  b: string[];
  /** Mm from the edge's start, ascending and disjoint; an edge with no entry is whole. */
  spans: { a: SideSpans; b: SideSpans };
};
export type SideSpans = Readonly<Record<string, readonly SpanRange[]>>;

export const NO_SPANS: SidePick['spans'] = { a: {}, b: {} };

const SAME_MM = 0.1;

const spansSig = (spans: SideSpans) =>
  Object.entries(spans)
    .filter(([, ranges]) => ranges.length)
    .map(([id, ranges]) => `${id}:${ranges.map((r) => r.join('-')).join(',')}`)
    .sort()
    .join('|');

/** The same edges on the same sides, with the same stretches of them. */
export function samePick(x: SidePick, y: SidePick): boolean {
  const sameIds = (p: readonly string[], q: readonly string[]) =>
    p.length === q.length && p.every((id) => q.includes(id));
  return (
    sameIds(x.a, y.a) &&
    sameIds(x.b, y.b) &&
    spansSig(x.spans.a) === spansSig(y.spans.a) &&
    spansSig(x.spans.b) === spansSig(y.spans.b)
  );
}
/**
 * The side a surface seam's part sits on: the side opposite the one inner line in hand, or null
 * when the pick is not a surface (no inner line, or one on each side).
 */
export function surfacePartSide(
  sel: Pick<SidePick, 'a' | 'b'>,
  isInner: (id: string) => boolean,
): SpanSide | null {
  const a = sel.a.some(isInner);
  const b = sel.b.some(isInner);
  return a === b ? null : a ? 'b' : 'a';
}

/**
 * A surface seam lays one piece on a line, by whole edges (owner, Р5, 11.11): the part side drops its
 * stretches and keeps the edges of one piece — the one just clicked, else the first one in hand.
 */
export function surfacePick<T extends SidePick>(
  sel: T,
  isInner: (id: string) => boolean,
  pieceOf: (id: string) => string,
  clicked?: string,
): T {
  const side = surfacePartSide(sel, isInner);
  if (!side) return sel;
  const edges = sel[side].filter((id) => !isInner(id));
  const lead = clicked && edges.includes(clicked) ? clicked : edges[0];
  const piece = lead ? pieceOf(lead) : null;
  const kept = sel[side].filter((id) => isInner(id) || pieceOf(id) === piece);
  if (kept.length === sel[side].length && !Object.keys(sel.spans[side]).length) return sel;
  return { ...sel, [side]: kept, spans: { ...sel.spans, [side]: {} } };
}

const TOUCH_MM = 0.5;
const SNAP_MM = 4;
const MIN_SPAN_MM = 1;
const OVERLAP_MM = 1;

const edgeLen = (id: string, geoms: ReadonlyMap<string, PieceGeom>) =>
  resolveEdge(id, geoms)?.len ?? 0;

const isWhole = (range: SpanRange, length: number) =>
  range[0] <= TOUCH_MM && range[1] >= length - TOUCH_MM;

export type PickBreak = { atMm: number; kind: EdgeBreakPoint['kind'] | 'fold' };

const FOLD_NEAR_MM = 0.5;

/**
 * The edge's ends, notches and real turns, in mm from its start, and where a fold line of its piece
 * crosses it (`folds`): a folded placket's edge is picked by the stretches its folds cut.
 */
export function edgeBreaks(
  id: string,
  geoms: ReadonlyMap<string, PieceGeom>,
  folds: readonly number[] = [],
): PickBreak[] {
  const at = id.lastIndexOf('#');
  const geom = at < 0 ? undefined : geoms.get(id.slice(0, at));
  const edge = geom?.edges.find((candidate) => candidate.id === id);
  if (!geom || !edge) return [];
  const own: PickBreak[] = breakPoints(geom, edge);
  const end = own[own.length - 1]?.atMm ?? 0;
  const cuts = folds.filter(
    (mm) =>
      mm > FOLD_NEAR_MM &&
      mm < end - FOLD_NEAR_MM &&
      own.every((point) => Math.abs(point.atMm - mm) > FOLD_NEAR_MM),
  );
  return cuts.length
    ? [...own, ...cuts.map((atMm) => ({ atMm, kind: 'fold' as const }))].sort(
        (x, y) => x.atMm - y.atMm,
      )
    : own;
}

/** Corners of a closed inner contour, in millimetres from its stored vertex 0. */
export function innerBreaks(line: readonly Pt2[]): PickBreak[] {
  return (closedInner(line)?.cornersMm ?? []).map((atMm) => ({ atMm, kind: 'turn' }));
}

/** Physical target length: an outline run or an inner polyline. */
export function targetLenMm(
  id: string,
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLines?: ReadonlyMap<string, readonly (readonly Pt2[])[]>,
): number {
  const inner = parseInner(id);
  if (!inner) return resolveEdge(id, geoms)?.len ?? 0;
  const line = innerLines?.get(inner.piece)?.[inner.k] ?? [];
  return line.reduce(
    (sum, point, index) =>
      index ? sum + Math.hypot(point[0] - line[index - 1][0], point[1] - line[index - 1][1]) : sum,
    0,
  );
}

/** The segment under a point of the edge. */
export function segmentAt(
  breaks: readonly { atMm: number }[],
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

/** A closed side may be the two stretches on either side of stored vertex 0. */
export function segmentsAt(
  breaks: readonly { atMm: number }[],
  length: number,
  atMm: number,
  closed = false,
): SpanRange[] {
  const segment = segmentAt(breaks, length, atMm);
  if (!closed || breaks.some((point) => point.atMm <= SAME_MM || point.atMm >= length - SAME_MM))
    return [segment];
  const twin =
    segment[0] <= SAME_MM
      ? segmentAt(breaks, length, Math.max(0, length - SAME_MM))
      : segment[1] >= length - SAME_MM
        ? segmentAt(breaks, length, Math.min(length, SAME_MM))
        : null;
  return twin ? [segment, twin].sort((a, b) => a[0] - b[0]) : [segment];
}

/** A free drag's end lands on a break point near it, and anywhere else as it is. */
export function snapToBreak(breaks: readonly { atMm: number }[], atMm: number): number {
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

/**
 * A click on one more segment of a picked edge: the spans it leaves, none when the last one went.
 * The very span drops, a segment at a span's end shrinks it and one inside it splits it around that
 * segment; off every span the segment joins what it touches, or stands as a span of its own.
 */
export function clickSegment(current: readonly SpanRange[], segment: SpanRange): SpanRange[] {
  const [segFrom, segTo] = segment;
  const others = (range: SpanRange) => current.filter((span) => span !== range);
  const same = current.find(
    ([from, to]) => Math.abs(from - segFrom) < SAME_MM && Math.abs(to - segTo) < SAME_MM,
  );
  if (same) return others(same);
  const around = current.find(([from, to]) => segFrom >= from - SAME_MM && segTo <= to + SAME_MM);
  if (around) {
    const [from, to] = around;
    const left: SpanRange[] = [];
    if (segFrom - from >= SAME_MM) left.push([from, segFrom]);
    if (to - segTo >= SAME_MM) left.push([segTo, to]);
    return [...others(around), ...left].sort((x, y) => x[0] - y[0]);
  }
  return [...mergedSpans([...current, segment])];
}

const withoutDropped = (pick: SidePick): SidePick['spans'] => {
  const keep = (side: SpanSide) =>
    Object.fromEntries(Object.entries(pick.spans[side]).filter(([id]) => pick[side].includes(id)));
  return { a: keep('a'), b: keep('b') };
};

const withSpans = (
  pick: SidePick,
  side: SpanSide,
  id: string,
  spans: readonly SpanRange[],
  length: number,
): SidePick => {
  const own = Object.fromEntries(Object.entries(pick.spans[side]).filter(([key]) => key !== id));
  return {
    ...pick,
    spans: {
      ...pick.spans,
      [side]: spans.length === 1 && isWhole(spans[0], length) ? own : { ...own, [id]: spans },
    },
  };
};

/** Whether one more span would pass what a row can hold on this side. */
const sideIsFull = (pick: SidePick, side: SpanSide) =>
  sideParts(pick[side], pick.spans[side]).length >= SEAMS.maxAnchorsPerSide;

type PickRules = {
  isInner: (id: string) => boolean;
  pieceOf: (id: string) => string;
};

/**
 * A gap a fold made: exactly one stretch between neighbouring break points (no break inside it)
 * with a fold point at one of its ends at least. A gap between notches or corners — a pocket — is
 * not one.
 */
function isFoldGap(from: number, to: number, breaks: readonly PickBreak[]): boolean {
  if (to - from <= SAME_MM) return false;
  const at = (mm: number) => breaks.find((point) => Math.abs(point.atMm - mm) < SAME_MM);
  const [start, end] = [at(from), at(to)];
  if (!start || !end || (start.kind !== 'fold' && end.kind !== 'fold')) return false;
  return breaks.every((point) => point.atMm <= from + SAME_MM || point.atMm >= to - SAME_MM);
}

/** One more segment added beside a span with only a fold's stretch between them: the gap fills. */
function withFoldGapsFilled(
  spans: readonly SpanRange[],
  segment: SpanRange,
  breaks: readonly PickBreak[],
): SpanRange[] {
  const out = [...spans].sort((x, y) => x[0] - y[0]);
  const i = out.findIndex(
    ([from, to]) => segment[0] >= from - SAME_MM && segment[1] <= to + SAME_MM,
  );
  if (i < 0) return out;
  if (i + 1 < out.length && isFoldGap(out[i][1], out[i + 1][0], breaks))
    out.splice(i, 2, [out[i][0], out[i + 1][1]]);
  if (i > 0 && isFoldGap(out[i - 1][1], out[i][0], breaks))
    out.splice(i - 1, 2, [out[i - 1][0], out[i][1]]);
  return out;
}

/**
 * A click on an edge, by the segment under the pointer. With the edge's `breaks`, a segment added
 * one fold stretch away from a span closes that gap, so a stretch a fold cut off and the hand
 * skipped does not split the edge; a click inside a span still cuts it out.
 */
export function pickSegment(
  pick: SidePick,
  side: SpanSide,
  id: string,
  segment: SpanRange,
  length: number,
  rules: PickRules,
  breaks: readonly PickBreak[] = [],
): SidePick {
  if (pick[side].includes(id)) {
    const own = pick.spans[side][id];
    const current = own ?? [[0, length]];
    // An edge offered whole (a guess) narrows to the segment; spans picked by hand split around it.
    const inside = !own && segment[0] > SAME_MM && segment[1] < length - SAME_MM;
    const adds = !current.some(
      ([from, to]) => segment[0] >= from - SAME_MM && segment[1] <= to + SAME_MM,
    );
    const clicked = inside
      ? [segment]
      : clickSegment(current, segment).filter(([from, to]) => to - from > SAME_MM);
    const next = adds && breaks.length ? withFoldGapsFilled(clicked, segment, breaks) : clicked;
    if (next.length > current.length && sideIsFull(pick, side)) return pick;
    if (next.length)
      return own
        ? { ...pick, spans: { ...pick.spans, [side]: { ...pick.spans[side], [id]: next } } }
        : withSpans(pick, side, id, next, length);
    const dropped = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
    return { ...dropped, spans: withoutDropped(dropped) };
  }
  const added = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
  return withSpans({ ...added, spans: withoutDropped(added) }, side, id, [segment], length);
}

/** One contour-side click, including both stored spans when that side crosses vertex 0. */
export function pickSegments(
  pick: SidePick,
  side: SpanSide,
  id: string,
  segments: readonly SpanRange[],
  length: number,
  rules: PickRules,
  breaks: readonly PickBreak[] = [],
): SidePick {
  return segments.reduce(
    (current, segment) => pickSegment(current, side, id, segment, length, rules, breaks),
    pick,
  );
}

/**
 * A finished drag: one more span of the edge, joining what it overlaps. An edge in hand whole has no
 * free part to add to, so there the drag narrows it to exactly this range.
 */
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
  if (pick[side].includes(id)) {
    const current = pick.spans[side][id] ?? [];
    const next = mergedSpans([...current, ordered]);
    if (next.length > current.length && current.length && sideIsFull(pick, side)) return pick;
    return withSpans(pick, side, id, next, length);
  }
  const added = pickTarget(pick, side, id, rules.isInner, rules.pieceOf);
  return withSpans({ ...added, spans: withoutDropped(added) }, side, id, [ordered], length);
}

/** One side as parts: one per span; an edge with no span stays a bare target. */
export function sideParts(ids: readonly string[], spans: SideSpans): SidePart[] {
  return ids.flatMap((target): SidePart[] => {
    const own = spans[target];
    return own?.length ? own.map((range) => ({ target, range })) : [{ target }];
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
    .flatMap((part) => {
      if (!part.target.includes('#'))
        return [
          {
            edge: part.target,
            from: part.range ? part.range[0] : 0,
            to: part.range ? part.range[1] : Infinity,
          },
        ];
      return sidePartEdges(part).map((edge) => ({
        edge,
        from: part.range ? part.range[0] : 0,
        to: part.range ? part.range[1] : edgeLen(edge, geoms),
      }));
    });

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

/** The stored seam whose span overlaps this edge range, or -1. */
export function storedSeamOverlapping(
  stored: readonly StoredParts[],
  id: string,
  range: SpanRange | undefined,
  geoms: ReadonlyMap<string, PieceGeom>,
): number {
  const length = id.includes('#') ? edgeLen(id, geoms) : Infinity;
  const from = range ? Math.min(range[0], range[1]) : 0;
  const to = range ? Math.max(range[0], range[1]) : length;
  return stored.findIndex(({ parts }) =>
    pieces([...parts.a, ...parts.b], geoms).some(
      (part) => part.edge === id && Math.min(to, part.to) - Math.max(from, part.from) > OVERLAP_MM,
    ),
  );
}

/** Whether two lists of parts name one edge at all, any stretch of it (a chain counts by its members). */
export const sidePartsShareEdge = (
  x: readonly SidePart[],
  y: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
) => {
  const xs = new Set(pieces(x, geoms).map((part) => part.edge));
  return pieces(y, geoms).some((part) => xs.has(part.edge));
};

/** Whether two lists of parts share a stretch of any edge (a chain counts by its members). */
export const sidePartsOverlap = (
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
      (sidePartsOverlap(a, parts.a, geoms) && sidePartsOverlap(b, parts.b, geoms)) ||
      (sidePartsOverlap(a, parts.b, geoms) && sidePartsOverlap(b, parts.a, geoms)),
  );
}

/**
 * When the other side holds only garment-label edges, how long they are together (mm): the edge of
 * the garment the label goes onto is picked at that length by default. Null otherwise.
 */
export function labelSideLength(
  pick: SidePick,
  side: SpanSide,
  isLabel: (id: string) => boolean,
  edgeLength: (id: string) => number,
): number | null {
  const other: SpanSide = side === 'a' ? 'b' : 'a';
  const ids = pick[other];
  if (!ids.length || !ids.every(isLabel)) return null;
  let total = 0;
  for (const id of ids) {
    const spans = pick.spans[other][id];
    total += spans?.length
      ? spans.reduce((sum, [from, to]) => sum + (to - from), 0)
      : edgeLength(id);
  }
  return total > 0 ? total : null;
}

/** A span of `length` mm on an edge of `edgeLength`, centred on the click and kept on the edge. */
export function spanOfLength(length: number, edgeLength: number, atMm: number): SpanRange {
  const span = Math.min(length, edgeLength);
  const from = Math.min(Math.max(atMm - span / 2, 0), edgeLength - span);
  return [from, from + span];
}
