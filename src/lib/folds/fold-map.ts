import type { Pt2 } from 'lib/assembly-skeleton/types';
import { add, mul, sideDist, sub } from './geom';
import { foldedOutline, reflect, sideOf, type FlatFold } from './folded';
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

const mapPoint = (point: Pt2, fold: FlatFold): Pt2 =>
  pointSide(point, fold) === sideOf(fold.a, fold.b, fold.flipAt)
    ? reflect(point, fold.a, fold.b)
    : point;

function splitPolyline(line: readonly Pt2[], fold: FlatFold): Pt2[][] {
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

const mapPolylines = (lines: readonly (readonly Pt2[])[], folds: readonly FlatFold[]) =>
  folds.reduce<Pt2[][]>(
    (mapped, fold) => mapped.flatMap((line) => splitPolyline(line, fold)),
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
  return {
    rings: geometry.rings.map((ring) => mapRing(ring, folds)),
    edges: mapPolylines(geometry.edges, folds),
    marks: geometry.marks.map((mark) => folds.reduce(mapPoint, mark)),
    innerLines: mapPolylines(geometry.innerLines, folds),
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
