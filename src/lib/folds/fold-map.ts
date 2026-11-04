import { Clipper, FillRule, Path64, Paths64, Point64 } from 'clipper2-js';
import type { Pt2 } from 'lib/assembly-skeleton/types';
import { add, inside, mul, sideDist, sub } from './geom';
import {
  foldedOutline,
  foldsCross,
  inFoldBand,
  insertCrease,
  isFoldBounded,
  reflect,
  sideOf,
  throughCreases,
  type FlatFold,
} from './folded';
import type { StoredFold } from './types';

export type FoldMapGeometry = {
  readonly rings: readonly (readonly Pt2[])[];
  readonly edges: readonly (readonly Pt2[])[];
  readonly marks: readonly Pt2[];
  readonly innerLines: readonly (readonly Pt2[])[];
};

export type FoldStep = { readonly foldKeys?: readonly string[] };

const EPS = 1e-9;

const pointSide = (point: Pt2, fold: FlatFold): 1 | -1 | null =>
  Math.abs(sideDist(fold.a, fold.b, point)) <= EPS ? null : sideOf(fold.a, fold.b, point);

const pointMoves = (point: Pt2, fold: FlatFold, bounded: boolean): boolean =>
  pointSide(point, fold) === sideOf(fold.a, fold.b, fold.flipAt) &&
  (!bounded || inFoldBand(point, fold));

const mapPoint = (point: Pt2, fold: FlatFold, bounded = false): Pt2 =>
  pointMoves(point, fold, bounded) ? reflect(point, fold.a, fold.b) : point;

/** The original infinite-line splitter, kept intact for full-width folds. */
function splitFullPolyline(line: readonly Pt2[], fold: FlatFold): Pt2[][] {
  if (line.length < 2) return line.length ? [[mapPoint(line[0], fold)]] : [];

  const parts: Pt2[][] = [];
  let part: Pt2[] = [line[0]];
  let partSide = pointSide(line[0], fold);
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    const pSide = pointSide(p, fold);
    const qSide = pointSide(q, fold);
    if (pSide && qSide && pSide !== qSide) {
      const pDist = sideDist(fold.a, fold.b, p);
      const qDist = sideDist(fold.a, fold.b, q);
      const cut = add(p, mul(sub(q, p), pDist / (pDist - qDist)));
      part.push(cut);
      parts.push(part.map((point) => mapPoint(point, fold)));
      part = [cut, q];
      partSide = qSide;
      continue;
    }
    if (!pSide && qSide && partSide && partSide !== qSide) {
      parts.push(part.map((point) => mapPoint(point, fold)));
      part = [p, q];
      partSide = qSide;
      continue;
    }
    part.push(q);
    partSide ??= pSide ?? qSide;
  }
  parts.push(part.map((point) => mapPoint(point, fold)));
  return parts;
}

const samePoint = (p: Pt2, q: Pt2) => Math.abs(p[0] - q[0]) <= EPS && Math.abs(p[1] - q[1]) <= EPS;

/** Split at the fold line and both perpendicular end planes, then move only the bounded cell. */
function splitBoundedPolyline(line: readonly Pt2[], fold: FlatFold): Pt2[][] {
  if (line.length < 2) return line.length ? [[mapPoint(line[0], fold, true)]] : [];
  const d = sub(fold.b, fold.a);
  const l2 = d[0] ** 2 + d[1] ** 2 || 1;
  const projection = (p: Pt2) => (sub(p, fold.a)[0] * d[0] + sub(p, fold.a)[1] * d[1]) / l2;
  const values = (p: Pt2) => [sideDist(fold.a, fold.b, p), projection(p), projection(p) - 1];
  const parts: Pt2[][] = [];
  let part: Pt2[] = [];
  let partMoves: boolean | null = null;
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    const pv = values(p);
    const qv = values(q);
    const cuts = [0, 1];
    for (let j = 0; j < pv.length; j++) {
      const den = pv[j] - qv[j];
      if (Math.abs(den) <= EPS) continue;
      const t = pv[j] / den;
      if (t > EPS && t < 1 - EPS) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    const unique = cuts.filter((t, j) => !j || Math.abs(t - cuts[j - 1]) > EPS);
    for (let j = 1; j < unique.length; j++) {
      const t0 = unique[j - 1];
      const t1 = unique[j];
      const a = add(p, mul(sub(q, p), t0));
      const b = add(p, mul(sub(q, p), t1));
      const mid = add(p, mul(sub(q, p), (t0 + t1) / 2));
      const moves = pointMoves(mid, fold, true);
      const ma = moves ? reflect(a, fold.a, fold.b) : a;
      const mb = moves ? reflect(b, fold.a, fold.b) : b;
      if (partMoves !== moves || (part.length && !samePoint(part[part.length - 1], ma))) {
        if (part.length > 1) parts.push(part);
        part = [ma, mb];
        partMoves = moves;
      } else if (!part.length) {
        part = [ma, mb];
        partMoves = moves;
      } else {
        part.push(mb);
      }
    }
  }
  if (part.length > 1) parts.push(part);
  return parts;
}

/** Where a flat point lands: only the folds it lies beyond on the flat piece move it. */
const landed = (point: Pt2, folds: readonly FlatFold[], bounded: readonly boolean[]): Pt2 =>
  throughCreases(
    point,
    folds.reduce<FlatFold[]>(
      (chain, fold, i) => (pointMoves(point, fold, bounded[i]) ? insertCrease(chain, fold) : chain),
      [],
    ),
  );

/** Cut a flat polyline at a fold's line and, when bounded, its end planes. Nothing moves yet. */
function cutFlat(line: readonly Pt2[], fold: FlatFold, bounded: boolean): Pt2[][] {
  if (line.length < 2) return [[...line]];
  const d = sub(fold.b, fold.a);
  const l2 = d[0] ** 2 + d[1] ** 2 || 1;
  const projection = (p: Pt2) => (sub(p, fold.a)[0] * d[0] + sub(p, fold.a)[1] * d[1]) / l2;
  const values = (p: Pt2) =>
    bounded
      ? [sideDist(fold.a, fold.b, p), projection(p), projection(p) - 1]
      : [sideDist(fold.a, fold.b, p)];
  const parts: Pt2[][] = [];
  let part: Pt2[] = [line[0]];
  let partMoves: boolean | null = null;
  for (let i = 1; i < line.length; i++) {
    const p = line[i - 1];
    const q = line[i];
    const pv = values(p);
    const qv = values(q);
    const cuts = [0, 1];
    for (let j = 0; j < pv.length; j++) {
      const den = pv[j] - qv[j];
      if (Math.abs(den) <= EPS) continue;
      const t = pv[j] / den;
      if (t > EPS && t < 1 - EPS) cuts.push(t);
    }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) {
      if (cuts[j] - cuts[j - 1] <= EPS) continue;
      const a = add(p, mul(sub(q, p), cuts[j - 1]));
      const b = add(p, mul(sub(q, p), cuts[j]));
      const moves = pointMoves(mul(add(a, b), 0.5), fold, bounded);
      if (partMoves !== null && partMoves !== moves) {
        parts.push(part);
        part = [a];
      }
      part.push(b);
      partMoves = moves;
    }
  }
  parts.push(part);
  return parts;
}

const mapPolylines = (
  lines: readonly (readonly Pt2[])[],
  folds: readonly FlatFold[],
  bounded: readonly boolean[],
) =>
  !foldsCross(folds)
    ? folds
        .reduce<Pt2[][]>(
          (cut, fold, i) => cut.flatMap((line) => cutFlat(line, fold, bounded[i])),
          lines.map((line) => [...line]),
        )
        .map((line) => {
          // A whole part lies on one side of every fold: its middle says how all of it moves.
          const mid: Pt2 = line.length < 2 ? line[0] : mul(add(line[0], line[1]), 0.5);
          const chain = folds.reduce<FlatFold[]>(
            (acc, fold, i) => (pointMoves(mid, fold, bounded[i]) ? insertCrease(acc, fold) : acc),
            [],
          );
          return line.map((point) => throughCreases(point, chain));
        })
    : folds.reduce<Pt2[][]>(
        (mapped, fold, i) =>
          mapped.flatMap((line) =>
            bounded[i] ? splitBoundedPolyline(line, fold) : splitFullPolyline(line, fold),
          ),
        lines.map((line) => [...line]),
      );

const area = (ring: readonly Pt2[]) =>
  Math.abs(
    ring.reduce((sum, [x, y], i) => {
      const [nx, ny] = ring[(i + 1) % ring.length];
      return sum + x * ny - nx * y;
    }, 0),
  );

const STICKS_OUT_MM = 1;
const UNION_SCALE = 1000;

const toRing = (point: Pt2, ring: readonly Pt2[]) =>
  ring.reduce((best, a, i) => {
    const b = ring[(i + 1) % ring.length];
    const ab = sub(b, a);
    const l2 = ab[0] * ab[0] + ab[1] * ab[1];
    const ap = sub(point, a);
    const t = l2 ? Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / l2)) : 0;
    return Math.min(best, Math.hypot(ap[0] - t * ab[0], ap[1] - t * ab[1]));
  }, Infinity);

/** The plies seen from above as one contour: what the piece covers once the larger part is turned. */
function silhouette(plies: readonly (readonly Pt2[])[]): Pt2[] {
  const paths = new Paths64();
  for (const ply of plies) {
    const path = new Path64();
    for (const [x, y] of ply)
      path.push(new Point64(Math.round(x * UNION_SCALE), Math.round(y * UNION_SCALE)));
    if (!Clipper.isPositive(path)) path.reverse();
    paths.push(path);
  }
  const rings = [...Clipper.Union(paths, undefined, FillRule.NonZero)].map((path) =>
    [...path].map((point): Pt2 => [point.x / UNION_SCALE, point.y / UNION_SCALE]),
  );
  return rings.reduce<Pt2[]>((m, y) => (area(y) > area(m) ? y : m), []);
}

const mapRing = (ring: readonly Pt2[], folds: readonly FlatFold[]): readonly Pt2[] => {
  const { outline, plies } = foldedOutline(ring, folds);
  // Every ply moved (the line misses the contour on the fixed side): the piece is still there, turned.
  if (!outline.length)
    return plies.reduce<readonly Pt2[]>((m, y) => (area(y.poly) > area(m) ? y.poly : m), []);
  // The never-moved ply is the footprint while the smaller part flips. When the larger part flips
  // it sticks out past that ply: the ring is what the plies cover.
  const sticksOut = plies.some(
    (ply) =>
      ply.by && ply.poly.some((p) => !inside(outline, p) && toRing(p, outline) > STICKS_OUT_MM),
  );
  return sticksOut ? silhouette(plies.map((ply) => ply.poly)) : outline;
};

/** Fold drawing geometry without changing its piece-local frame. */
export function foldMap(geometry: FoldMapGeometry, folds: readonly FlatFold[]): FoldMapGeometry {
  if (!folds.length) return geometry;
  const bounded = folds.map((fold) => geometry.rings.every((ring) => isFoldBounded(ring, fold)));
  return {
    rings: geometry.rings.map((ring) => mapRing(ring, folds)),
    edges: mapPolylines(geometry.edges, folds, bounded),
    marks: geometry.marks.map((mark) =>
      foldsCross(folds)
        ? folds.reduce((point, fold, i) => mapPoint(point, fold, bounded[i]), mark)
        : landed(mark, folds, bounded),
    ),
    innerLines: mapPolylines(geometry.innerLines, folds, bounded),
  };
}

/** Fold keys introduced on or before an operation index. */
export function activeFoldKeys(operations: readonly FoldStep[], stepIndex: number): string[] {
  return operations
    .slice(0, Math.max(0, stepIndex + 1))
    .flatMap((operation) => operation.foldKeys ?? []);
}

/** Declared fold rows introduced on or before an operation index. */
export function activeFoldRows(
  operations: readonly FoldStep[],
  stepIndex: number,
  rows: readonly StoredFold[],
): StoredFold[] {
  const keys = new Set(activeFoldKeys(operations, stepIndex));
  return rows.filter((row) => keys.has(row.foldKey));
}
