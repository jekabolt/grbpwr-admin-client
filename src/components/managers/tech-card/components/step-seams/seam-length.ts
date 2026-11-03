import type { PieceGeom } from 'lib/assembly-skeleton/types';
import { resolveEdge } from 'lib/assembly-skeleton/union';
import type { SidePart } from 'lib/seams';

export type SideLengthOptions = {
  /** Declared now for fold-aware length in T5. */
  activeFolds?: readonly unknown[];
};

const INNER = /^(.*):i(\d+)$/;
const LAYER_EDGE_REL = 0.01;

/** One seam side's length, including ranges and the identical stacked-layer rule. */
export function sideLengthMm(
  parts: readonly SidePart[],
  geoms: ReadonlyMap<string, PieceGeom>,
  innerLen: (piece: string, k: number) => number,
  opts: SideLengthOptions = {},
): number {
  void opts.activeFolds;
  const counted: Array<{ piece: string; k: number; len: number }> = [];
  return parts.reduce((sum, part) => {
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
    if (!part.range) return sum + edge.len;
    const from = Math.max(0, Math.min(edge.len, Math.min(part.range[0], part.range[1])));
    const to = Math.max(from, Math.min(edge.len, Math.max(part.range[0], part.range[1])));
    return sum + to - from;
  }, 0);
}
