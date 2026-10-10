// assemble (F2) — public surface: page segmentation and global sheet assembly.
// Contract (types.ts §3): classifyPages, assembleSheet, registerPair, solvePoses. Worker graph only.

import type { IRPage, PagePose, PairTransform } from 'lib/pattern-import/types';

import { recurrenceLinks } from './recurrence';
import { buildRegPage, pageKey } from './regpage';
import { accepted, stitchFree } from './stitch';

export { classifyPages, pageFeatures } from './classify';
export type { PageFeatures } from './classify';
export { assembleSheet, assembleSheetDetailed, manualPoses } from './sheet';
export type { SheetReport } from './sheet';
export { solvePoses, solvePosesDetailed } from './solve';
export type { SolveResult } from './solve';
export { assembleGroup } from './group';
export type { GroupResult, Pitch } from './group';
export { placePages } from './place';
export { detectLattice } from './overview';

/**
 * Contract `registerPair(a, b)`: every way b can sit next to a, best first — recurrence (exact,
 * any offset) and edge stitching with b right of / below a, or a right of / below b. Each
 * transform is t_b − t_a. The global solve, not this, decides which ones hold.
 */
export function registerPair(a: IRPage, b: IRPage): PairTransform[] {
  const A = buildRegPage(a, 0, 0);
  const B = buildRegPage(b, 1, 0);
  const out: PairTransform[] = [];
  const pair = (
    dx: number,
    dy: number,
    method: PairTransform['method'],
    n: number,
    n2: number,
  ): PairTransform => ({
    from: { file: a.file, page: a.page },
    to: { file: b.file, page: b.page },
    dxMm: dx,
    dyMm: dy,
    rotDeg: 0,
    method,
    score: n,
    secondBestRatio: n ? n2 / n : 0,
  });
  for (const l of recurrenceLinks([A, B])) out.push(pair(l.dx, l.dy, 'recurrence', l.n, l.n2));
  for (const rel of ['right', 'below'] as const) {
    const ab = stitchFree(A, B, rel, undefined, 'all');
    if (accepted(ab)) out.push(pair(ab.dx, ab.dy, 'edge-stitch', ab.n, ab.n2));
    const ba = stitchFree(B, A, rel, undefined, 'all');
    if (accepted(ba)) out.push(pair(-ba.dx, -ba.dy, 'edge-stitch', ba.n, ba.n2));
  }
  return out.sort((x, y) => y.score - x.score);
}

/** Residual of every pair against given poses (translation part): |t_to − t_from − d|, mm. */
export function pairResiduals(poses: PagePose[], pairs: PairTransform[]): number[] {
  const m = new Map(poses.map((p) => [pageKey(p.file, p.page), p.toSheet]));
  return pairs.map((p) => {
    const f = m.get(pageKey(p.from.file, p.from.page));
    const t = m.get(pageKey(p.to.file, p.to.page));
    if (!f || !t) return NaN;
    return Math.hypot(t.e - f.e - p.dxMm, t.f - f.f - p.dyMm);
  });
}
