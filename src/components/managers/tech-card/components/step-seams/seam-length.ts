import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import {
  foldedSideLengthMm,
  foldMap,
  isPleatKind,
  resolveFolds,
  type FlatFold,
  type StoredFold,
} from 'lib/folds';
import { frameOf as foldFrameOf, fromUV } from 'lib/folds/geom';
import { frameOf, type SidePart } from 'lib/seams';
import { sampleAt } from 'lib/seams/frame';

export type SideLengthOptions = {
  /** The fold rows closed at this step: a folded stretch counts as long as it lies once folded. */
  activeFolds?: readonly StoredFold[];
  grainDeg?: number | ReadonlyMap<string, number> | null;
};

/** A step that states no tolerance: 51 / 50 is the same seam, 52 / 50 is not. */
export const DEFAULT_SEAM_TOLERANCE_MM = 1;

/** The step's stored tolerance, form string: empty means the default, and 0 is a real value. */
export function seamToleranceOf(raw: string | undefined): number {
  const value = Number.parseFloat((raw ?? '').trim().replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_SEAM_TOLERANCE_MM;
}

/** The sides as printed: whole mm are compared, so the numbers on the card explain the verdict. */
export function lengthsDiffer(a: number, b: number, toleranceMm: number): boolean {
  return Math.abs(Math.round(a) - Math.round(b)) > toleranceMm;
}

const INNER = /^(.*):i(\d+)$/;
const LAYER_EDGE_REL = 0.01;
const FOLD_SAMPLES = 9;

/** One seam side's length, including ranges and the identical stacked-layer rule. */
export function sideLengthMm(
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLen: (piece: string, k: number) => number,
  opts: SideLengthOptions = {},
): number {
  const counted: Array<{ piece: string; k: number; len: number }> = [];
  const foldable: Array<{ id: string; piece: string; pts: Pt2[]; lenMm: number }> = [];
  const sum = parts.reduce((sum, part) => {
    const inner = INNER.exec(part.target);
    if (inner) return sum + innerLen(inner[1], Number(inner[2]));
    const edge = resolveEdge(part.target, geoms);
    if (!edge) return sum;
    const ks = part.target
      .slice(part.target.lastIndexOf('#') + 1)
      .split('+')
      .map(Number);
    const duplicate =
      ks.length === 1 &&
      counted.some(
        (candidate) =>
          candidate.k === ks[0] &&
          candidate.piece !== edge.pieceKey &&
          !!geoms
            .get(candidate.piece)
            ?.twinOf.some((twin) => twin.key === edge.pieceKey && twin.kind === 'identical') &&
          Math.abs(candidate.len - edge.len) <=
            LAYER_EDGE_REL * Math.max(candidate.len, edge.len, 1),
      );
    if (duplicate) return sum;
    if (ks.length === 1) counted.push({ piece: edge.pieceKey, k: ks[0], len: edge.len });
    const from = part.range
      ? Math.max(0, Math.min(edge.len, Math.min(part.range[0], part.range[1])))
      : 0;
    const to = part.range
      ? Math.max(from, Math.min(edge.len, Math.max(part.range[0], part.range[1])))
      : edge.len;
    foldable.push({
      id: part.target,
      piece: edge.pieceKey,
      pts: part.range
        ? sampleAt(
            edge.pts,
            Array.from({ length: FOLD_SAMPLES }, (_, i) =>
              edge.len > 0 ? (from + ((to - from) * i) / (FOLD_SAMPLES - 1)) / edge.len : 0,
            ),
          )
        : edge.pts,
      lenMm: to - from,
    });
    return sum + to - from;
  }, 0);
  if (!opts.activeFolds?.length) return sum;
  const grainOf = (piece: string) =>
    typeof opts.grainDeg === 'number' ? opts.grainDeg : opts.grainDeg?.get(piece) ?? 0;
  const plainOf = (list: readonly { lenMm: number }[]) =>
    list.reduce((total, part) => total + part.lenMm, 0);
  const pleatPieces = new Set(
    opts.activeFolds
      .filter((fold) => isPleatKind(fold.kind))
      .map((fold) => fold.pieceKey.toUpperCase()),
  );
  // A pleat's intake is internal: the pleat rule, never matched to the other side.
  const pleated = foldable.filter((part) => pleatPieces.has(part.piece.toUpperCase()));
  let out = sum;
  if (pleated.length)
    out +=
      foldedSideLengthMm(pleated, null, opts.activeFolds, (piece) => {
        const geom = geoms.get(piece);
        return geom ? frameOf(geom, grainOf(piece)) : null;
      }) - plainOf(pleated);
  const flat = flatFoldsOf(
    opts.activeFolds.filter((fold) => !isPleatKind(fold.kind)),
    geoms,
    grainOf,
  );
  const folded = foldable.filter(
    (part) => !pleatPieces.has(part.piece.toUpperCase()) && flat.has(part.piece),
  );
  if (folded.length) out += visibleFoldedLength(folded, flat, geoms) - plainOf(folded);
  return out;
}

/** Ordinary folds laid on the flat pieces, per piece key, in seq order. */
function flatFoldsOf(
  rows: readonly StoredFold[],
  geoms: ReadonlyMap<string, PieceGeom>,
  grainOf: (piece: string) => number,
): Map<string, FlatFold[]> {
  const out = new Map<string, FlatFold[]>();
  if (!rows.length) return out;
  const pieces = [...geoms.values()];
  const grainDeg = new Map(pieces.map((piece) => [piece.pieceKey, grainOf(piece.pieceKey)]));
  const { folds } = resolveFolds(rows, pieces, { grainDeg });
  for (const [piece, list] of Object.entries(folds)) {
    const geom = geoms.get(piece);
    if (!geom || !list.length) continue;
    const frame = foldFrameOf(geom, grainOf(piece));
    out.set(
      piece,
      [...list]
        .sort((x, y) => x.seq - y.seq)
        .map((fold) => ({
          a: fromUV(frame, fold.a),
          b: fromUV(frame, fold.b),
          flipAt: fromUV(frame, fold.flipAt),
          kind: fold.kind,
        })),
    );
  }
  return out;
}

const STEP_MM = 0.5;
const STACK_MM = 1;
const cellOf = (p: Pt2) => [Math.floor(p[0] / STACK_MM), Math.floor(p[1] / STACK_MM)];

/**
 * The picked stretches as they lie once folded: each stretch is walked through the folds, and what
 * lands on a stretch already counted (plies stacked by the fold) is not counted again.
 */
export function visibleFoldedLength(
  parts: readonly { piece: string; pts: readonly Pt2[]; lenMm: number }[],
  flat: ReadonlyMap<string, readonly FlatFold[]>,
  geoms: ReadonlyMap<string, PieceGeom>,
): number {
  let total = 0;
  const byPiece = new Map<string, typeof parts>();
  for (const part of parts) byPiece.set(part.piece, [...(byPiece.get(part.piece) ?? []), part]);
  for (const [piece, own] of byPiece) {
    const folds = flat.get(piece);
    const ring = geoms.get(piece)?.rs;
    if (!folds?.length || !ring) {
      total += own.reduce((sum, part) => sum + part.lenMm, 0);
      continue;
    }
    // A step lies on another when it is near it folded but was not near it flat: a ply on a ply.
    const laid = new Map<string, { at: Pt2; flat: Pt2 }[]>();
    for (const part of own) {
      const dense = densify(part.pts);
      const drawn = polylineLen(dense);
      if (!(drawn > 0)) continue;
      const scale = part.lenMm / drawn;
      const moved = foldMap({ rings: [ring], edges: [], marks: dense, innerLines: [] }, folds)
        .marks as Pt2[];
      for (let i = 1; i < moved.length; i++) {
        const step = Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]);
        const at: Pt2 = [(moved[i][0] + moved[i - 1][0]) / 2, (moved[i][1] + moved[i - 1][1]) / 2];
        const flatAt: Pt2 = [
          (dense[i][0] + dense[i - 1][0]) / 2,
          (dense[i][1] + dense[i - 1][1]) / 2,
        ];
        const [cx, cy] = cellOf(at);
        let stacked = false;
        for (let dx = -1; dx <= 1 && !stacked; dx++)
          for (let dy = -1; dy <= 1 && !stacked; dy++)
            stacked = (laid.get(`${cx + dx},${cy + dy}`) ?? []).some((hit) => {
              const folded = Math.hypot(hit.at[0] - at[0], hit.at[1] - at[1]);
              const apart = Math.hypot(hit.flat[0] - flatAt[0], hit.flat[1] - flatAt[1]);
              return folded < STACK_MM && apart - folded > STACK_MM / 2;
            });
        if (stacked) continue;
        total += step * scale;
        const key = `${cx},${cy}`;
        laid.set(key, [...(laid.get(key) ?? []), { at, flat: flatAt }]);
      }
    }
  }
  return total;
}

const polylineLen = (pts: readonly Pt2[]) =>
  pts.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

function densify(pts: readonly Pt2[]): Pt2[] {
  const out: Pt2[] = pts.length ? [pts[0]] : [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP_MM));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}
