// Lettering strokes vs a dashed construction line — shared by the gate (G16/G18, on the written
// layer 8) and the worker (A1: an arrowhead among lettering is not an arrowhead).
import type { PtMm } from '../types';
import { PATIMPORT } from '../types';

/** A stroke as the glyph tests count it. */
export type GlyphStroke = { pts: PtMm[]; closed: boolean; lengthMm: number };

/** The absolute 60 mm cell a point falls in (the glyph density grid). */
export const glyphCellKey = (p: PtMm) =>
  `${Math.floor(p.x / PATIMPORT.glyphCellMm)},${Math.floor(p.y / PATIMPORT.glyphCellMm)}`;

/**
 * Codex (G16 review): a dashed construction line (pocket placement, pleat, fold guide) drawn as
 * separate dashes is many short strokes too. A dash belongs to a run of straight strokes on one
 * line (direction ±3°, offset ≤ 0.5 mm) with lengths within ±30 % and gaps ≤ 3 × the dash — even
 * spacing lettering does not have (≥ 4 dashes, gaps within ±35 % of their median); those runs are
 * not counted as lettering.
 */
export function undashed<T extends GlyphStroke>(short: T[]): T[] {
  if (short.length > 2000) return short;
  type Seg = { a: PtMm; ux: number; uy: number; len: number; t0: number; t1: number };
  const segs: (Seg | null)[] = short.map((s) => {
    const a = s.pts[0];
    const b = s.pts[s.pts.length - 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    // straight only: the chord carries the stroke's length
    if (s.closed || !(len > 0.5) || len < 0.97 * s.lengthMm) return null;
    return { a, ux: (b.x - a.x) / len, uy: (b.y - a.y) / len, len, t0: 0, t1: len };
  });
  const dash = new Set<number>();
  const cosTol = Math.cos((3 * Math.PI) / 180);
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (!s || dash.has(i)) continue;
    // members on s's line, as intervals along it
    const run: { i: number; t0: number; t1: number }[] = [{ i, t0: 0, t1: s.len }];
    for (let j = 0; j < segs.length; j++) {
      const o = segs[j];
      if (!o || j === i) continue;
      if (Math.abs(s.ux * o.ux + s.uy * o.uy) < cosTol) continue;
      if (Math.abs(o.len / s.len - 1) > 0.3) continue;
      const dx = o.a.x - s.a.x;
      const dy = o.a.y - s.a.y;
      if (Math.abs(dx * -s.uy + dy * s.ux) > 0.5) continue;
      const ta = dx * s.ux + dy * s.uy;
      const tb = ta + o.len * (s.ux * o.ux + s.uy * o.uy);
      run.push({ i: j, t0: Math.min(ta, tb), t1: Math.max(ta, tb) });
    }
    if (run.length < 3) continue;
    run.sort((x, y) => x.t0 - y.t0);
    // keep the longest stretch whose gaps stay ≤ 3 × the dash
    let best: typeof run = [];
    let cur: typeof run = [run[0]];
    for (let k = 1; k < run.length; k++) {
      const gap = run[k].t0 - cur[cur.length - 1].t1;
      if (gap >= -0.5 && gap <= 3 * s.len) cur.push(run[k]);
      else {
        if (cur.length > best.length) best = cur;
        cur = [run[k]];
      }
    }
    if (cur.length > best.length) best = cur;
    if (best.length < 4) continue;
    // a dash pattern repeats: the gaps agree (lettering baselines do not)
    const gaps = best.slice(1).map((m, k) => m.t0 - best[k].t1);
    const sorted = [...gaps].sort((x, y) => x - y);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (sorted[sorted.length - 1] - sorted[0] > 0.35 * Math.max(med, 0) + 0.5) continue;
    for (const m of best) dash.add(m.i);
  }
  return dash.size ? short.filter((_, k) => !dash.has(k)) : short;
}
