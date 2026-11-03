import type { PieceGeom, Pt2 } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import { foldedSideLengthMm, type StoredFold } from 'lib/folds';
import { frameOf, type SidePart } from 'lib/seams';
import { sampleAt } from 'lib/seams/frame';

export type SideLengthOptions = {
  /** The fold rows closed at this step. Parts that lie on each other across one count once. */
  activeFolds?: readonly StoredFold[];
  /** The other side's length: without it a folded side keeps its plain sum. */
  otherSideMm?: number | null;
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
  if (!opts.activeFolds?.length || opts.otherSideMm == null) return sum;
  const plain = foldable.reduce((total, part) => total + part.lenMm, 0);
  const rest = sum - plain;
  return (
    rest +
    foldedSideLengthMm(foldable, opts.otherSideMm - rest, opts.activeFolds, (piece) => {
      const geom = geoms.get(piece);
      const grainDeg =
        typeof opts.grainDeg === 'number' ? opts.grainDeg : opts.grainDeg?.get(piece) ?? 0;
      return geom ? frameOf(geom, grainDeg) : null;
    })
  );
}
