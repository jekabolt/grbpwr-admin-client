// WHO COVERS WHOM IN ONE PICTURE, AND ON WHICH LEVEL EACH PIECE LIES. Two pieces stack when their
// overlap reaches COVER_SHARE of the smaller one, so seam allowance never counts.
// The order (bottom to top, the owner's choice) says which of a stack is covered: its contour is
// dashed there. The level says the colour and reads the shapes alone: a piece lying on a larger one
// is a level above it, a seam adds no level. No flag, row or order enters it, so two pockets sewn the
// same keep one colour whichever way round their layers are, and on every later step.
// The step picture and the unit pictogram both read this one rule.

import { Clipper, FillRule, Path64, Paths64, Point64, PointInPolygonResult } from 'clipper2-js';

import type { Pt2 } from '../types';

export const COVER_SHARE = 0.3;

const SCALE = 1_000;
const EPS = 1e-8;
const EQUAL_AREA_SHARE = 0.9;
const EQUAL_OVERLAP_SHARE = 0.9;

/** One level, one colour: level 0 is the cloth itself, each level above one step darker. */
const LEVEL_FILLS = ['var(--color-bgColor)', '#d9d9d9', '#b8b8b8', '#9c9c9c', '#858585'];

export const levelFill = (level: number) => LEVEL_FILLS[Math.min(level, LEVEL_FILLS.length - 1)];

type Box = { x0: number; y0: number; x1: number; y1: number };

export type CoverPiece = {
  key: string;
  ring: Pt2[];
  path: Path64;
  box: Box;
  area: number;
};

export type OutlineRun = { state: 'solid' | 'dashed'; points: Pt2[] };

export type CoverOrder = {
  /** Per piece, the indexes of the pieces above that cover it. */
  covers: number[][];
  /** Per piece: an upper piece of its own shape and place lies on it. */
  sameShape: boolean[];
  /** Per piece its level: 0 lies on nothing, else one above the highest larger piece it lies on. */
  levels: number[];
};

const samePoint = (a: Pt2, b: Pt2) => Math.abs(a[0] - b[0]) <= EPS && Math.abs(a[1] - b[1]) <= EPS;

function cleanRing(points: readonly Pt2[]): Pt2[] {
  const ring: Pt2[] = [];
  for (const point of points) {
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    if (!ring.length || !samePoint(ring[ring.length - 1], point)) ring.push([...point]);
  }
  if (ring.length > 1 && samePoint(ring[0], ring[ring.length - 1])) ring.pop();
  return ring;
}

function pathOf(ring: readonly Pt2[]): Path64 {
  const path = new Path64();
  for (const [x, y] of ring) path.push(new Point64(Math.round(x * SCALE), Math.round(y * SCALE)));
  if (path.length >= 3 && !Clipper.isPositive(path)) path.reverse();
  return path;
}

function pathsOf(path: Path64): Paths64 {
  const paths = new Paths64();
  paths.push(path);
  return paths;
}

function boxOf(points: readonly Pt2[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const [x, y] of points) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return { x0, y0, x1, y1 };
}

const boxesMeet = (a: Box, b: Box) =>
  a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS;

/** The area two boxes share: an upper bound of what their pieces can share. */
const boxOverlap = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

/** A piece ready for the cover test, or null when its ring has no area to speak of. */
export function coverPiece(key: string, points: readonly Pt2[]): CoverPiece | null {
  const ring = cleanRing(points);
  if (ring.length < 3) return null;
  const path = pathOf(ring);
  const area = Math.abs(Clipper.area(path)) / (SCALE * SCALE);
  return { key, ring, path, box: boxOf(ring), area };
}

/** One pass over the bottom-to-top pieces: the covers, which read the order, and the levels, which do not. */
export function coverOrder(ordered: readonly CoverPiece[]): CoverOrder {
  const covers = ordered.map(() => [] as number[]);
  const stacks = ordered.map(() => [] as number[]);
  const sameShape = ordered.map(() => false);
  for (let lower = 0; lower < ordered.length; lower++) {
    const a = ordered[lower];
    for (let upper = lower + 1; upper < ordered.length; upper++) {
      const b = ordered[upper];
      const smaller = Math.min(a.area, b.area);
      // The boxes bound the overlap: neighbours along a seam never reach the clipper.
      if (smaller <= EPS || boxOverlap(a.box, b.box) / smaller + EPS < COVER_SHARE) continue;
      const overlap = Clipper.Intersect(pathsOf(a.path), pathsOf(b.path), FillRule.NonZero);
      const area = Math.abs(Clipper.areaPaths(overlap)) / (SCALE * SCALE);
      if (area / smaller + EPS < COVER_SHARE) continue;
      covers[lower].push(upper);
      stacks[lower].push(upper);
      stacks[upper].push(lower);
      if (
        smaller / Math.max(a.area, b.area) + EPS >= EQUAL_AREA_SHARE &&
        area / smaller + EPS >= EQUAL_OVERLAP_SHARE
      )
        sameShape[lower] = true;
    }
  }
  return { covers, sameShape, levels: levelsOf(ordered, stacks) };
}

/** Largest first, so a piece's level is known before any smaller piece reads it. */
function levelsOf(pieces: readonly CoverPiece[], stacks: readonly number[][]): number[] {
  const bySize = pieces
    .map((_, index) => index)
    .sort(
      (a, b) =>
        pieces[b].area - pieces[a].area ||
        (pieces[a].key < pieces[b].key ? -1 : pieces[a].key > pieces[b].key ? 1 : 0),
    );
  const levels = pieces.map(() => 0);
  const seen = new Set<number>();
  for (const index of bySize) {
    for (const other of stacks[index])
      if (seen.has(other)) levels[index] = Math.max(levels[index], levels[other] + 1);
    seen.add(index);
  }
  return levels;
}

const cross = (a: Pt2, b: Pt2) => a[0] * b[1] - a[1] * b[0];

const subtract = (a: Pt2, b: Pt2): Pt2 => [a[0] - b[0], a[1] - b[1]];

const pointAlong = (a: Pt2, b: Pt2, t: number): Pt2 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];

function segmentIntersectionTs(a: Pt2, b: Pt2, c: Pt2, d: Pt2): number[] {
  const r = subtract(b, a);
  const s = subtract(d, c);
  const denominator = cross(r, s);
  const fromA = subtract(c, a);
  if (Math.abs(denominator) > EPS) {
    const t = cross(fromA, s) / denominator;
    const u = cross(fromA, r) / denominator;
    return t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS
      ? [Math.max(0, Math.min(1, t))]
      : [];
  }
  if (Math.abs(cross(fromA, r)) > EPS) return [];

  const length2 = r[0] * r[0] + r[1] * r[1];
  if (length2 <= EPS) return [];
  const t0 = (fromA[0] * r[0] + fromA[1] * r[1]) / length2;
  const fromAToD = subtract(d, a);
  const t1 = (fromAToD[0] * r[0] + fromAToD[1] * r[1]) / length2;
  const lo = Math.max(0, Math.min(t0, t1));
  const hi = Math.min(1, Math.max(t0, t1));
  return hi < lo - EPS ? [] : [lo, hi];
}

function uniqueSorted(values: readonly number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => index === 0 || Math.abs(value - sorted[index - 1]) > EPS);
}

export function pointInPiece(point: Pt2, piece: CoverPiece): boolean {
  if (
    point[0] < piece.box.x0 - EPS ||
    point[0] > piece.box.x1 + EPS ||
    point[1] < piece.box.y0 - EPS ||
    point[1] > piece.box.y1 + EPS
  )
    return false;
  const result = Clipper.pointInPolygon(
    new Point64(Math.round(point[0] * SCALE), Math.round(point[1] * SCALE)),
    piece.path,
  );
  return result !== PointInPolygonResult.IsOutside;
}

function runsAlong(
  points: readonly Pt2[],
  closed: boolean,
  covers: readonly CoverPiece[],
): OutlineRun[] {
  const atoms: OutlineRun[] = [];
  const segments = closed ? points.length : points.length - 1;
  for (let index = 0; index < segments; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const cuts = [0, 1];
    for (const cover of covers) {
      if (!boxesMeet(boxOf([a, b]), cover.box)) continue;
      for (let edge = 0; edge < cover.ring.length; edge++)
        cuts.push(
          ...segmentIntersectionTs(
            a,
            b,
            cover.ring[edge],
            cover.ring[(edge + 1) % cover.ring.length],
          ),
        );
    }
    const stops = uniqueSorted(cuts);
    for (let stop = 1; stop < stops.length; stop++) {
      const start = stops[stop - 1];
      const end = stops[stop];
      if (end - start <= EPS) continue;
      const first = pointAlong(a, b, start);
      const last = pointAlong(a, b, end);
      const midpoint = pointAlong(a, b, (start + end) / 2);
      const state = covers.some((cover) => pointInPiece(midpoint, cover)) ? 'dashed' : 'solid';
      const previous = atoms[atoms.length - 1];
      if (
        previous?.state === state &&
        samePoint(previous.points[previous.points.length - 1], first)
      )
        previous.points.push(last);
      else atoms.push({ state, points: [first, last] });
    }
  }

  if (closed && atoms.length > 1 && atoms[0].state === atoms[atoms.length - 1].state) {
    const first = atoms.shift()!;
    const last = atoms.pop()!;
    atoms.unshift({ state: first.state, points: [...last.points, ...first.points.slice(1)] });
  }
  return atoms;
}

/** A piece's contour cut where it passes under the pieces above. */
export const outlineRuns = (piece: CoverPiece, covers: readonly CoverPiece[]) =>
  runsAlong(piece.ring, true, covers);

/** The parts of an open line (a dart, a slit) that no piece above lies on. */
export const uncoveredRuns = (line: readonly Pt2[], above: readonly CoverPiece[]) =>
  above.length
    ? runsAlong(line, false, above)
        .filter((run) => run.state === 'solid')
        .map((run) => run.points)
    : line.length >= 2
      ? [[...line]]
      : [];

export function closedOutline(piece: CoverPiece): Pt2[][] {
  return piece.ring.length >= 2 ? [[...piece.ring, [...piece.ring[0]]]] : [];
}
