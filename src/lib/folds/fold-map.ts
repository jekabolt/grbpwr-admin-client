import type { Pt2 } from 'lib/assembly-skeleton/types';
import { add, mul, sideDist, sub } from './geom';
import { foldedOutline, inFoldBand, isFoldBounded, reflect, sideOf, type FlatFold } from './folded';
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

const mapPolylines = (
  lines: readonly (readonly Pt2[])[],
  folds: readonly FlatFold[],
  bounded: readonly boolean[],
) =>
  folds.reduce<Pt2[][]>(
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

const mapRing = (ring: readonly Pt2[], folds: readonly FlatFold[]): readonly Pt2[] => {
  const { outline, plies } = foldedOutline(ring, folds);
  if (outline.length) return outline;
  // Every ply moved (the line misses the contour on the fixed side): the piece is still there, turned.
  return plies.reduce<readonly Pt2[]>((m, y) => (area(y.poly) > area(m) ? y.poly : m), []);
};

/** Fold drawing geometry without changing its piece-local frame. */
export function foldMap(geometry: FoldMapGeometry, folds: readonly FlatFold[]): FoldMapGeometry {
  if (!folds.length) return geometry;
  const bounded = folds.map((fold) => geometry.rings.every((ring) => isFoldBounded(ring, fold)));
  return {
    rings: geometry.rings.map((ring) => mapRing(ring, folds)),
    edges: mapPolylines(geometry.edges, folds, bounded),
    marks: geometry.marks.map((mark) =>
      folds.reduce((point, fold, i) => mapPoint(point, fold, bounded[i]), mark),
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
