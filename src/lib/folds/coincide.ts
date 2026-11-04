import type { Pt2 } from 'lib/assembly-skeleton/types';
import type { PieceFrame } from 'lib/seams/frame';
import { reflect } from './folded';
import { fromUV, sideDist } from './geom';
import { pleatFanGeometry, type PleatFanGeometry } from './pleat';
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
    if (fold.kind === 'pleat') continue;
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

type LocatedPleatLine = { row: StoredFold; line: [Pt2, Pt2] };

function pleatsByPiece(
  activeFolds: readonly StoredFold[],
  frameOf: (piece: string) => PieceFrame | null,
): Map<string, PleatFanGeometry<LocatedPleatLine>[]> {
  const out = new Map<string, PleatFanGeometry<LocatedPleatLine>[]>();
  const byPiece = new Map<string, StoredFold[]>();
  for (const row of activeFolds) {
    if (row.kind !== 'pleat') continue;
    byPiece.set(row.pieceKey, [...(byPiece.get(row.pieceKey) ?? []), row]);
  }
  for (const [piece, rows] of byPiece) {
    const frame = frameOf(piece);
    if (!frame) continue;
    const sorted = [...rows].sort((a, b) => a.seq - b.seq || a.foldKey.localeCompare(b.foldKey));
    for (let index = 0; index + 2 < sorted.length; ) {
      const triple = sorted.slice(index, index + 3);
      if (triple[1].seq !== triple[0].seq + 1 || triple[2].seq !== triple[0].seq + 2) {
        index++;
        continue;
      }
      const located = triple.map((row) => ({
        row,
        line: [fromUV(frame, row.line[0]), fromUV(frame, row.line[1])] as [Pt2, Pt2],
      })) as [LocatedPleatLine, LocatedPleatLine, LocatedPleatLine];
      const fan = pleatFanGeometry(located);
      if (fan) {
        out.set(piece, [...(out.get(piece) ?? []), fan]);
        index += 3;
      } else index++;
    }
  }
  return out;
}

const polylineLength = (points: readonly Pt2[]) =>
  points
    .slice(1)
    .reduce(
      (sum, point, index) =>
        sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]),
      0,
    );

const inPleatIntake = (point: Pt2, fan: PleatFanGeometry<LocatedPleatLine>) => {
  const centreFar = fan.far.get(fan.centre)!;
  const ray = [centreFar[0] - fan.apex[0], centreFar[1] - fan.apex[1]] as Pt2;
  const at = [point[0] - fan.apex[0], point[1] - fan.apex[1]] as Pt2;
  if (ray[0] * at[0] + ray[1] * at[1] <= 0) return false;
  return [fan.negative, fan.positive].every((leg) => {
    const centreSide = Math.sign(sideDist(leg.line[0], leg.line[1], centreFar));
    const pointSide = Math.sign(sideDist(leg.line[0], leg.line[1], point));
    return !pointSide || pointSide === centreSide;
  });
};

/** Length left on the closed contour: the flat stretch between both PLEAT legs is internal. */
function visiblePleatLength(
  points: readonly Pt2[],
  fans: readonly PleatFanGeometry<LocatedPleatLine>[],
): number {
  let total = 0;
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const cuts = [0, 1];
    for (const fan of fans)
      for (const leg of [fan.negative, fan.positive]) {
        const da = sideDist(leg.line[0], leg.line[1], a);
        const db = sideDist(leg.line[0], leg.line[1], b);
        if (da * db < -SIDE_EPS_MM) cuts.push(da / (da - db));
      }
    cuts.sort((left, right) => left - right);
    for (let cut = 1; cut < cuts.length; cut++) {
      const t0 = cuts[cut - 1];
      const t1 = cuts[cut];
      if (t1 - t0 <= SIDE_EPS_MM) continue;
      const mid = (t0 + t1) / 2;
      const point: Pt2 = [a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid];
      if (fans.some((fan) => inPleatIntake(point, fan))) continue;
      total += Math.hypot(b[0] - a[0], b[1] - a[1]) * (t1 - t0);
    }
  }
  return total;
}

/** The guard: count once only if the other side matches the single length better than the sum. */
export function foldedSideLengthMm(
  parts: readonly SidePart[],
  otherSideMm: number | null,
  activeFolds: readonly StoredFold[],
  frameOf: (piece: string) => PieceFrame | null,
): number {
  const plain = parts.reduce((sum, part) => sum + part.lenMm, 0);
  if (activeFolds.length === 0) return plain;

  const pleats = pleatsByPiece(activeFolds, frameOf);
  const adjusted = parts.map((part) => {
    const fans = pleats.get(part.piece);
    if (!fans?.length) return part;
    const sampled = polylineLength(part.pts);
    const visible = visiblePleatLength(part.pts, fans);
    return {
      ...part,
      lenMm: sampled > SIDE_EPS_MM ? (part.lenMm * visible) / sampled : part.lenMm,
    };
  });
  const pleatLength = adjusted.reduce((sum, part) => sum + part.lenMm, 0);
  const hasPleatIntake = pleatLength < plain - SIDE_EPS_MM;
  if (otherSideMm === null) return hasPleatIntake ? pleatLength : plain;

  const partById = new Map(adjusted.map((part) => [part.id, part]));
  const once = coincidentGroups(adjusted, activeFolds, frameOf).reduce((total, group) => {
    const lengths = group.map((id) => partById.get(id)!.lenMm);
    return total + lengths.reduce((sum, length) => sum + length, 0) / lengths.length;
  }, 0);
  return Math.abs(once - otherSideMm) < Math.abs(plain - otherSideMm) ? once : plain;
}
