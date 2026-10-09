// pieces/ (F4) — local size ranks from cross-sections ("bundleRank"), for lines F3 left without a
// usable rank: orphans (size lines with no class) and common lines that are really graded.
//
// At a sample of a line, the normal through it crosses the neighbouring lines; the run of
// near-parallel crossings with gaps ≤ `gapMm` is the local bundle. When it has exactly n lines, the
// line's place in it is its rank — read in the direction its classified neighbours agree on (on a
// hem the largest size is outermost, on a neckline innermost: the direction is per section, never
// assumed). Votes along the line → rank when ≥ 3 votes and ≥ 70 % agree. A common line sitting
// in a full bundle is a graded line F3 called shared; left as a wall for every rank it would give
// every size the same edge there — a plausible wrong piece.
import type { ChainId, ChainSet, PtMm } from 'lib/pattern-import/types';

import { dist, SegGrid, segIntersect } from './geom';
import type { WallModel } from './walls';

export type LocalRank = { rank: number; votes: number; agree: number };

export function localRanks(
  set: ChainSet,
  m: WallModel,
  o: { sectionMm?: number; gapMm?: number; stepMm?: number; minVotes?: number } = {},
): Map<ChainId, LocalRank> {
  const section = o.sectionMm ?? 40;
  const gap = o.gapMm ?? 10;
  const step = o.stepMm ?? 4;
  const minVotes = o.minVotes ?? 3;
  const out = new Map<ChainId, LocalRank>();
  if (m.mode !== 'graded' || m.n < 2) return out;
  // ranks with lines at all (viola's 34 coincides with 36: 7 lines per bundle, not 8)
  const present = m.byRank.map((ids, r) => (ids.length ? r : -1)).filter((r) => r >= 0);
  const n = present.length;
  if (n < 2) return out;
  const rank = new Map<ChainId, number>();
  // rank as a position among the present ranks
  m.byRank.forEach((ids, r) => ids.forEach((id) => rank.set(id, present.indexOf(r))));
  const lines = [...new Set([...m.graded, ...m.common])].filter(
    (id) => set.chains[id] && set.chains[id].pts.length >= 2,
  );
  const commonSet = new Set(m.common);
  const grid = new SegGrid(8);
  for (const id of lines) grid.addPolyline(id, set.chains[id].pts);
  // every line is checked: orphans get a rank, a classified line whose bundles disagree with its
  // class is re-ranked, a "common" line inside full bundles is demoted
  const candidates = lines.filter((id) => set.chains[id].lengthMm >= 10);
  for (const id of candidates) {
    const pts = set.chains[id].pts;
    const votes = new Map<number, number>();
    let total = 0;
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const L = dist(a, b);
      if (L < 1e-9) continue;
      const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
      const nrm = { x: -t.y, y: t.x };
      for (let s = (step - acc) % step; s < L; s += step) {
        const p: PtMm = { x: a.x + t.x * s, y: a.y + t.y * s };
        const v = sectionVote(set, grid, rank, commonSet, id, p, t, nrm, section, gap, n);
        if (v !== null) {
          votes.set(v, (votes.get(v) ?? 0) + 1);
          total++;
        }
      }
      acc = (acc + L) % step;
    }
    if (total < minVotes) continue;
    const [best, cnt] = [...votes].sort((x, y) => y[1] - x[1])[0];
    if (cnt / total < 0.7) continue;
    const r = present[best];
    const cur = rank.get(id);
    if (cur !== undefined && present[cur] === r) continue;
    out.set(id, { rank: r, votes: total, agree: cnt / total });
  }
  return out;
}

function sectionVote(
  set: ChainSet,
  grid: SegGrid,
  rank: Map<ChainId, number>,
  common: Set<ChainId>,
  self: ChainId,
  p: PtMm,
  t: PtMm,
  nrm: PtMm,
  section: number,
  gap: number,
  n: number,
): number | null {
  const A = { x: p.x - nrm.x * section, y: p.y - nrm.y * section };
  const B = { x: p.x + nrm.x * section, y: p.y + nrm.y * section };
  const seen = new Map<string, { id: ChainId; s: number }>();
  for (let k = -section; k <= section; k += 8) {
    const q = { x: p.x + nrm.x * k, y: p.y + nrm.y * k };
    grid.near(q, 8, (id, i) => {
      const key = `${id}:${i}`;
      if (seen.has(key)) return;
      const pts = set.chains[id].pts;
      const x = segIntersect(A, B, pts[i], pts[i + 1]);
      if (!x) {
        seen.set(key, { id: -1, s: 0 });
        return;
      }
      const L = dist(pts[i], pts[i + 1]) || 1;
      const cos = Math.abs((t.x * (pts[i + 1].x - pts[i].x) + t.y * (pts[i + 1].y - pts[i].y)) / L);
      seen.set(
        key,
        cos >= 0.85
          ? { id, s: x.t * 2 * section - section }
          : { id: -2, s: x.t * 2 * section - section },
      );
    });
  }
  const xs = [...seen.values()].filter((c) => c.id !== -1).sort((a, b) => a.s - b.s);
  // one crossing per chain per section (closest to the line's own crossing wins)
  const iSelf = xs.findIndex((c) => c.id === self && Math.abs(c.s) < 0.5);
  if (iSelf < 0) return null;
  let lo = iSelf;
  let hi = iSelf;
  while (
    lo > 0 &&
    xs[lo - 1].id >= 0 &&
    xs[lo].s - xs[lo - 1].s <= gap &&
    xs[lo].s - xs[lo - 1].s > 0.2
  )
    lo--;
  while (
    hi + 1 < xs.length &&
    xs[hi + 1].id >= 0 &&
    xs[hi + 1].s - xs[hi].s <= gap &&
    xs[hi + 1].s - xs[hi].s > 0.2
  )
    hi++;
  const cl = xs.slice(lo, hi + 1);
  if (new Set(cl.map((c) => c.id)).size !== cl.length) return null;
  if (cl.length !== n) return null;
  const idx = iSelf - lo;
  let asc = 0;
  let desc = 0;
  let wrong = 0;
  cl.forEach((c, i) => {
    if (c.id === self) return;
    const r = rank.get(c.id);
    if (r === undefined) {
      if (common.has(c.id)) wrong++;
      return;
    }
    if (r === i) asc++;
    if (r === n - 1 - i) desc++;
  });
  void wrong;
  const known = asc + desc;
  if (!known || asc === desc) return null;
  const up = asc > desc;
  if ((up ? asc : desc) < Math.max(1, Math.floor((n - 1) / 2))) return null;
  return up ? idx : n - 1 - idx;
}
