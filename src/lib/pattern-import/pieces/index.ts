// pieces/ (F4) — public API: seeds, fill, operator edits, and the two gate measures.
import type { Chain, PieceCandidate, ProposeSeedsFn, PtMm } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { quantile, resample, SegGrid, segNearest } from './geom';
import { proposeSeedsFrom } from './seeds';

export { fillPieces, fillPiecesDetailed, isMonotone, type FillDiag } from './fill';
export { applyPieceEdits } from './edits';
export { proposeVariants, variantKnives, type VariantOption } from './variants';
export { labelOf, seedLabel, textSeeds, variantLabels } from './seeds';
export { wallModel, type WallModel } from './walls';

/** Seeds from the sheet's text (piece numbers / names). Clicks and AI marks are added by the wizard. */
export const proposeSeeds: ProposeSeedsFn = (sheet, set) => proposeSeedsFrom(sheet, set);

function distanceTo(grid: SegGrid, lines: PtMm[][], p: PtMm, reach: number): number {
  let d = Infinity;
  grid.near(p, reach, (k, i) => {
    const pts = lines[k];
    const r = segNearest(p, pts[i], pts[(i + 1) % pts.length]);
    if (r.d < d) d = r.d;
  });
  return d;
}

/**
 * Source-edge coverage (gate G3 on the pieces step): share of the candidate's outline length lying
 * within `snapMm` of the given wall chains.
 */
export function coverage(
  cand: Pick<PieceCandidate, 'outer'>,
  walls: readonly Pick<Chain, 'pts' | 'closed'>[],
  snapMm: number = PATIMPORT.snapMm,
): number {
  if (cand.outer.length < 3) return 0;
  const grid = new SegGrid(4);
  const lines = walls.map((w) => (w.closed && w.pts.length > 2 ? [...w.pts, w.pts[0]] : w.pts));
  lines.forEach((pts, k) => grid.addPolyline(k, pts));
  const s = resample(cand.outer, 0.5, true);
  if (!s.length) return 0;
  return s.filter((p) => distanceTo(grid, lines, p, snapMm + 0.01) <= snapMm).length / s.length;
}

/** Symmetric p95 Hausdorff distance between two closed outlines (sampled every 0.5 mm), mm. */
export function hausdorffP95(a: readonly PtMm[], b: readonly PtMm[]): number {
  if (a.length < 2 || b.length < 2) return Infinity;
  const one = (from: readonly PtMm[], to: readonly PtMm[]) => {
    const grid = new SegGrid(8);
    const line = [...to, to[0]];
    grid.addPolyline(0, line);
    return resample(from, 0.5, true).map((p) => {
      for (const r of [4, 16, 64, 256]) {
        const d = distanceTo(grid, [line], p, r);
        if (d <= r) return d;
      }
      return 1e6;
    });
  };
  return quantile([...one(a, b), ...one(b, a)], 0.95);
}
