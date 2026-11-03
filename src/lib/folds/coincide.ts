import type { Pt2 } from 'lib/assembly-skeleton/types';
import type { PieceFrame } from 'lib/seams/frame';
import { reflect } from './folded';
import { fromUV, sideDist } from './geom';
import type { StoredFold } from './types';

type SidePart = {
  id: string;
  piece: string;
  pts: readonly Pt2[];
  lenMm: number;
};

const COINCIDENT_GAP_MM = 3;
const SIDE_EPS_MM = 1e-6;

function distanceToPolyline(p: Pt2, pts: readonly Pt2[]): number {
  if (pts.length === 0) return Infinity;
  if (pts.length === 1) return Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]);

  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy));
  }
  return best;
}

function meanDistance(from: readonly Pt2[], to: readonly Pt2[]): number {
  if (from.length === 0 || to.length === 0) return Infinity;
  return from.reduce((sum, p) => sum + distanceToPolyline(p, to), 0) / from.length;
}

function partSide(pts: readonly Pt2[], a: Pt2, b: Pt2): -1 | 0 | 1 {
  let positive = false;
  let negative = false;
  for (const p of pts) {
    const d = sideDist(a, b, p);
    if (d > SIDE_EPS_MM) positive = true;
    if (d < -SIDE_EPS_MM) negative = true;
  }
  if (positive === negative) return 0;
  return positive ? 1 : -1;
}

function coincideAcrossFold(left: SidePart, right: SidePart, [a, b]: readonly [Pt2, Pt2]): boolean {
  if (partSide(left.pts, a, b) * partSide(right.pts, a, b) !== -1) return false;
  const mirrored = left.pts.map((p) => reflect(p, a, b));
  return (
    Math.max(meanDistance(mirrored, right.pts), meanDistance(right.pts, mirrored)) <
    COINCIDENT_GAP_MM
  );
}

/**
 * Which parts of one seam side lie on each other once this step's active folds are closed.
 * Each returned group is counted once in the side's length; every part is in exactly one group.
 */
export function coincidentGroups(
  parts: readonly SidePart[],
  activeFolds: readonly StoredFold[],
  frameOf: (piece: string) => PieceFrame | null,
): string[][] {
  const frames = new Map<string, PieceFrame | null>();
  const linesByPiece = new Map<string, [Pt2, Pt2][]>();
  for (const fold of activeFolds) {
    if (!frames.has(fold.pieceKey)) frames.set(fold.pieceKey, frameOf(fold.pieceKey));
    const frame = frames.get(fold.pieceKey);
    if (!frame) continue;
    const line: [Pt2, Pt2] = [fromUV(frame, fold.line[0]), fromUV(frame, fold.line[1])];
    if (Math.hypot(line[1][0] - line[0][0], line[1][1] - line[0][1]) <= SIDE_EPS_MM) continue;
    const lines = linesByPiece.get(fold.pieceKey) ?? [];
    lines.push(line);
    linesByPiece.set(fold.pieceKey, lines);
  }

  const parent = parts.map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const join = (a: number, b: number) => {
    const ra = root(a);
    const rb = root(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < parts.length; i++) {
    const lines = linesByPiece.get(parts[i].piece);
    if (!lines?.length) continue;
    for (let j = i + 1; j < parts.length; j++) {
      if (parts[i].piece !== parts[j].piece) continue;
      // Multiple declared folds are alternatives here: try each alone, never compose reflections.
      if (lines.some((line) => coincideAcrossFold(parts[i], parts[j], line))) join(i, j);
    }
  }

  const groups = new Map<number, string[]>();
  for (let i = 0; i < parts.length; i++) {
    const r = root(i);
    const group = groups.get(r) ?? [];
    group.push(parts[i].id);
    groups.set(r, group);
  }
  return [...groups.values()];
}

/** The guard: count once only if the other side matches the single length better than the sum. */
export function foldedSideLengthMm(
  parts: readonly SidePart[],
  otherSideMm: number | null,
  activeFolds: readonly StoredFold[],
  frameOf: (piece: string) => PieceFrame | null,
): number {
  const plain = parts.reduce((sum, part) => sum + part.lenMm, 0);
  if (otherSideMm === null || activeFolds.length === 0) return plain;

  const partById = new Map(parts.map((part) => [part.id, part]));
  const once = coincidentGroups(parts, activeFolds, frameOf).reduce((total, group) => {
    const lengths = group.map((id) => partById.get(id)!.lenMm);
    return total + lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  }, 0);
  return Math.abs(once - otherSideMm) < Math.abs(plain - otherSideMm) ? once : plain;
}
