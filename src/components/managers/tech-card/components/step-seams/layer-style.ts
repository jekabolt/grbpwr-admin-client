import { Clipper, FillRule, Path64, Paths64, Point64, PointInPolygonResult } from 'clipper2-js';
import type { Affine, PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { apply } from 'lib/assembly-skeleton/union/affine';

import type { PictureActionGlyph } from './step-picture-view';

export type LayerTone = 0 | 1 | 2;

export type PieceLayerStyle = {
  key: string;
  depth: LayerTone;
  fullyCovered: boolean;
  visible: Pt2[][];
  covered: Pt2[][];
  coveredBy: string[];
};

export type MarkLayerStyle = {
  id: string;
  draw: 'solid' | 'dashed' | 'hidden';
  at: Pt2;
};

export type LayerStyle = {
  pieces: Map<string, PieceLayerStyle>;
  marks: Map<string, MarkLayerStyle>;
  lower: string[];
};

export type LayerStyleInput = {
  /** Bottom to top. Keys absent here are placed below these keys in transform-map order. */
  layers: readonly string[];
  T: ReadonlyMap<string, Affine>;
  geoms: ReadonlyMap<string, PieceGeom>;
  marks?: readonly PictureActionGlyph[];
  /** Explicit placement metadata; `layers` remains the authoritative drawing order. */
  flags?: ReadonlyMap<string, 'under' | 'over'>;
  mode: 'canvas' | 'thumb' | 'print';
};

type Box = { x0: number; y0: number; x1: number; y1: number };

type Piece = {
  key: string;
  ring: Pt2[];
  path: Path64;
  box: Box;
  area: number;
};

type OutlineRun = { covered: boolean; points: Pt2[] };

const SCALE = 1_000;
const EPS = 1e-8;
const COVER_SHARE = 0.3;
const EQUAL_AREA_SHARE = 0.9;
const EQUAL_OVERLAP_SHARE = 0.9;

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

const boxesOverlap = (a: Box, b: Box) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > EPS &&
  Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > EPS;

const boxesMeet = (a: Box, b: Box) =>
  a.x0 <= b.x1 + EPS && b.x0 <= a.x1 + EPS && a.y0 <= b.y1 + EPS && b.y0 <= a.y1 + EPS;

function intersectionArea(a: Piece, b: Piece): number {
  if (!boxesOverlap(a.box, b.box) || a.area <= EPS || b.area <= EPS) return 0;
  const intersection = Clipper.Intersect(pathsOf(a.path), pathsOf(b.path), FillRule.NonZero);
  return Math.abs(Clipper.areaPaths(intersection)) / (SCALE * SCALE);
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

function pointInPiece(point: Pt2, piece: Piece): boolean {
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

function outlineRuns(piece: Piece, above: readonly Piece[]): OutlineRun[] {
  const atoms: OutlineRun[] = [];
  for (let index = 0; index < piece.ring.length; index++) {
    const a = piece.ring[index];
    const b = piece.ring[(index + 1) % piece.ring.length];
    const cuts = [0, 1];
    for (const cover of above) {
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
      const covered = above.some((cover) => pointInPiece(midpoint, cover));
      const previous = atoms[atoms.length - 1];
      if (
        previous?.covered === covered &&
        samePoint(previous.points[previous.points.length - 1], first)
      )
        previous.points.push(last);
      else atoms.push({ covered, points: [first, last] });
    }
  }

  if (atoms.length > 1 && atoms[0].covered === atoms[atoms.length - 1].covered) {
    const first = atoms.shift()!;
    const last = atoms.pop()!;
    atoms.unshift({ covered: first.covered, points: [...last.points, ...first.points.slice(1)] });
  }
  return atoms;
}

function closedOutline(piece: Piece): Pt2[][] {
  return piece.ring.length >= 2 ? [[...piece.ring, [...piece.ring[0]]]] : [];
}

function orderedPieces(input: LayerStyleInput): Piece[] {
  const validInputOrder = [...input.T.keys()].filter((key) => input.geoms.has(key));
  const layerSet = new Set(input.layers);
  const orderedKeys = [
    ...validInputOrder.filter((key) => !layerSet.has(key)),
    ...input.layers.filter((key, index) => input.layers.indexOf(key) === index),
  ];
  const seen = new Set<string>();
  return orderedKeys.flatMap((key) => {
    if (seen.has(key)) return [];
    seen.add(key);
    const T = input.T.get(key);
    const geom = input.geoms.get(key);
    if (!T || !geom) return [];
    const ring = cleanRing(geom.rs.map((point) => apply(T, point)));
    if (ring.length < 3) return [];
    const path = pathOf(ring);
    const area = Math.abs(Clipper.area(path)) / (SCALE * SCALE);
    return [{ key, ring, path, box: boxOf(ring), area }];
  });
}

export function layerStyle(input: LayerStyleInput): LayerStyle {
  const ordered = orderedPieces(input);
  const indexByKey = new Map(ordered.map((piece, index) => [piece.key, index]));
  const covering = ordered.map(() => [] as number[]);
  const sameShapeCover = ordered.map(() => false);

  for (let lower = 0; lower < ordered.length; lower++) {
    for (let upper = lower + 1; upper < ordered.length; upper++) {
      const a = ordered[lower];
      const b = ordered[upper];
      const area = intersectionArea(a, b);
      const smaller = Math.min(a.area, b.area);
      if (smaller <= EPS || area / smaller + EPS < COVER_SHARE) continue;
      covering[lower].push(upper);
      const equalArea = smaller / Math.max(a.area, b.area) + EPS >= EQUAL_AREA_SHARE;
      if (equalArea && area / smaller + EPS >= EQUAL_OVERLAP_SHARE) sameShapeCover[lower] = true;
    }
  }

  const depths = ordered.map((): LayerTone => 0);
  for (let index = ordered.length - 1; index >= 0; index--) {
    if (!covering[index].length) continue;
    depths[index] = Math.min(
      2,
      Math.max(...covering[index].map((upper) => 1 + depths[upper])),
    ) as LayerTone;
  }

  const pieces = new Map<string, PieceLayerStyle>();
  for (let index = 0; index < ordered.length; index++) {
    const piece = ordered[index];
    const above = ordered.slice(index + 1);
    const runs = depths[index] > 0 ? outlineRuns(piece, above) : [];
    const visible =
      input.mode === 'thumb' || depths[index] === 0
        ? closedOutline(piece)
        : runs.filter((run) => !run.covered).map((run) => run.points);
    const covered =
      input.mode === 'thumb' ? [] : runs.filter((run) => run.covered).map((run) => run.points);
    pieces.set(piece.key, {
      key: piece.key,
      depth: depths[index],
      fullyCovered:
        depths[index] > 0 &&
        sameShapeCover[index] &&
        runs.length > 0 &&
        runs.every((run) => run.covered),
      visible,
      covered,
      coveredBy: covering[index].map((upper) => ordered[upper].key),
    });
  }

  const marks = new Map<string, MarkLayerStyle>();
  for (const mark of input.marks ?? []) {
    const pieceIndex = indexByKey.get(mark.piece);
    const T = input.T.get(mark.piece);
    if (pieceIndex == null || !T) continue;
    const at = apply(T, mark.point);
    const isCovered = ordered.slice(pieceIndex + 1).some((piece) => pointInPiece(at, piece));
    const draw: MarkLayerStyle['draw'] =
      mark.kind === 'buttonhole'
        ? 'solid'
        : mark.kind === 'label'
          ? isCovered
            ? 'hidden'
            : 'solid'
          : !isCovered
            ? 'solid'
            : input.mode === 'thumb'
              ? 'hidden'
              : 'dashed';
    marks.set(mark.id, { id: mark.id, draw, at });
  }

  return {
    pieces,
    marks,
    lower: ordered.filter((_, index) => depths[index] > 0).map((piece) => piece.key),
  };
}
