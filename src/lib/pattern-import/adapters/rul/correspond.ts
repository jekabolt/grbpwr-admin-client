// RUL · WRITE correspondence (SHAPE-KINK, 18.10). Our per-size outlines are the same shape in every
// size but not the same POINTS: simplification and offsets leave 42–87 vertices per line, a few
// more or fewer per size, so `packRul` refused every real import ("50 points in M but 52 in XS —
// no point-to-point grade"). Before packing, each graded line of a piece is brought to one point
// list in every size:
//   1. corners — vertices where the line turns > T over ±1.5 mm (T from 60° down to 25° until every
//      size has the same number, ≥ 2 on a closed line), non-maxima within 3 mm suppressed;
//   2. matching — a closed line's corners are matched by the cyclic shift whose turn signs agree
//      and whose positions (centroid-aligned) are nearest; a shift that is not clearly the best
//      (second within 1.5× the cost) refuses the line. An open line: its ends and its corners in order;
//   3. resampling — every edge between matched corners is cut at the UNION of every size's own
//      vertex fractions (arc length from 0 to 1), so each size keeps all of its own vertices
//      exactly and gains only points ON its own segments (fractions closer than 0.02 mm in every
//      size are merged);
//   4. fidelity — each resampled line is checked against the drawn one both ways (≤ FIDELITY_MM);
//      packRul's own proof then expands the RUL back against these lines (≤ its tolerance).
// Anything that cannot be matched is refused with the reason; the per-size DXF is unchanged.

import type { PtMm } from '../../types';
import { closestOnPolyline, dist, signedArea } from '../../semantics/geom';
import type { PlannedBlock } from '../../write/plan';

/** A resampled line may stray from the drawn one by at most this, mm. */
export const FIDELITY_MM = 0.05;
const MERGE_MM = 0.02;
const REACH_MM = 1.5;
const THRESHOLDS = [60, 45, 75, 35, 90, 30, 25];

function along(pts: readonly PtMm[], i: number, d: number, dir: 1 | -1, closed: boolean): PtMm {
  const n = pts.length;
  let k = i;
  let left = d;
  for (let s = 0; s < n; s++) {
    const j = k + dir;
    if (!closed && (j < 0 || j >= n)) return pts[k];
    const jj = (j + n) % n;
    const L = dist(pts[k], pts[jj]);
    if (L >= left && L > 0) {
      const t = left / L;
      return { x: pts[k].x + (pts[jj].x - pts[k].x) * t, y: pts[k].y + (pts[jj].y - pts[k].y) * t };
    }
    left -= L;
    k = jj;
  }
  return pts[k];
}

/** Signed turn (deg, + = left) at each vertex over ±REACH_MM. */
function turns(pts: readonly PtMm[], closed: boolean): number[] {
  return pts.map((p, i) => {
    if (!closed && (i === 0 || i === pts.length - 1)) return 0;
    const a = along(pts, i, REACH_MM, -1, closed);
    const b = along(pts, i, REACH_MM, 1, closed);
    const u = { x: p.x - a.x, y: p.y - a.y };
    const v = { x: b.x - p.x, y: b.y - p.y };
    const lu = Math.hypot(u.x, u.y);
    const lv = Math.hypot(v.x, v.y);
    if (lu < 1e-9 || lv < 1e-9) return 0;
    const c = Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / (lu * lv)));
    return ((u.x * v.y - u.y * v.x >= 0 ? 1 : -1) * Math.acos(c) * 180) / Math.PI;
  });
}

/** Corner vertex indices (ascending) at threshold T, local maxima ≥ 3 mm apart. */
function corners(
  pts: readonly PtMm[],
  tr: readonly number[],
  T: number,
  closed: boolean,
): number[] {
  const cand = tr
    .map((d, i) => ({ i, d: Math.abs(d) }))
    .filter((x) => x.d > T)
    .sort((a, b) => b.d - a.d);
  const keep: number[] = [];
  for (const c of cand) if (!keep.some((k) => dist(pts[k], pts[c.i]) < 3)) keep.push(c.i);
  if (!closed) keep.push(0, pts.length - 1);
  return [...new Set(keep)].sort((a, b) => a - b);
}

/** Cumulative arc fractions of the vertices from index a to b (forward, cyclic when closed). */
function edgeOf(pts: readonly PtMm[], a: number, b: number): { pts: PtMm[]; fr: number[] } {
  const n = pts.length;
  const out: PtMm[] = [pts[a]];
  for (let i = (a + 1) % n; ; i = (i + 1) % n) {
    out.push(pts[i]);
    if (i === b) break;
  }
  const cum = [0];
  for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + dist(out[i - 1], out[i]));
  const L = cum[cum.length - 1] || 1;
  return { pts: out, fr: cum.map((c) => c / L) };
}

function at(e: { pts: PtMm[]; fr: number[] }, f: number): PtMm {
  const k = e.fr.findIndex((x) => x >= f - 1e-12);
  if (k <= 0) return e.pts[0];
  const f0 = e.fr[k - 1];
  const f1 = e.fr[k];
  const t = f1 - f0 > 1e-15 ? (f - f0) / (f1 - f0) : 0;
  const a = e.pts[k - 1];
  const b = e.pts[k];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

const centroid = (pts: readonly PtMm[]) => ({
  x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
  y: pts.reduce((s, p) => s + p.y, 0) / pts.length,
});

/**
 * One graded line in every size (drawn order: index 0 = the base) → the same number of points in
 * each, point k of every size the same place of the shape; or the reason it cannot be matched.
 */
export function correspondLines(
  lines: readonly PtMm[][],
  closed: boolean,
): { ok: true; lines: PtMm[][] } | { ok: false; reason: string } {
  if (lines.some((l) => l.length < 2)) return { ok: false, reason: 'a line with < 2 points' };
  // one orientation (closed: counter-clockwise; open: the base's direction)
  let ls = lines.map((l) => {
    let p = [...l];
    if (closed && p.length > 2 && dist(p[0], p[p.length - 1]) < 1e-9) p = p.slice(0, -1);
    return closed && signedArea(p) < 0 ? p.reverse() : p;
  });
  if (!closed) {
    const b = ls[0];
    ls = ls.map((l) =>
      dist(l[0], b[0]) + dist(l[l.length - 1], b[b.length - 1]) >
      dist(l[l.length - 1], b[0]) + dist(l[0], b[b.length - 1])
        ? [...l].reverse()
        : l,
    );
  }
  const tr = ls.map((l) => turns(l, closed));
  let cs: number[][] | null = null;
  for (const T of THRESHOLDS) {
    const c = ls.map((l, i) => corners(l, tr[i], T, closed));
    if (c.every((x) => x.length === c[0].length) && c[0].length >= 2) {
      cs = c;
      break;
    }
  }
  // an open line whose sizes turn differently (a near-straight internal line): end to end
  if (!cs && !closed) cs = ls.map((l) => [0, l.length - 1]);
  if (!cs) return { ok: false, reason: 'its corners differ in number between sizes' };
  const K = cs[0].length;
  // closed: the cyclic shift of each size's corners onto the base's
  if (closed) {
    const c0 = centroid(ls[0]);
    const base = cs[0].map((i) => ({ p: ls[0][i], s: Math.sign(tr[0][i]) }));
    for (let z = 1; z < ls.length; z++) {
      const cz = centroid(ls[z]);
      const costs: { s: number; cost: number }[] = [];
      for (let s = 0; s < K; s++) {
        let cost = 0;
        let ok = true;
        for (let k = 0; k < K; k++) {
          const i = cs[z][(k + s) % K];
          if (Math.sign(tr[z][i]) !== base[k].s) {
            ok = false;
            break;
          }
          const q = ls[z][i];
          cost +=
            (q.x - cz.x - (base[k].p.x - c0.x)) ** 2 + (q.y - cz.y - (base[k].p.y - c0.y)) ** 2;
        }
        if (ok) costs.push({ s, cost });
      }
      costs.sort((a, b) => a.cost - b.cost);
      if (!costs.length) return { ok: false, reason: 'its corners turn differently between sizes' };
      if (costs[1] && costs[1].cost < 1.5 * costs[0].cost)
        return { ok: false, reason: 'its corners match more than one way (a symmetric line)' };
      const s = costs[0].s;
      cs[z] = cs[z].map((_, k) => cs![z][(k + s) % K]);
    }
  }
  // per edge, the union of every size's vertex fractions
  const out: PtMm[][] = ls.map(() => []);
  const edges = closed ? K : K - 1;
  for (let k = 0; k < edges; k++) {
    const es = ls.map((l, z) => edgeOf(l, cs![z][k], cs![z][(k + 1) % K]));
    const fr = [...new Set(es.flatMap((e) => e.fr))].sort((a, b) => a - b);
    // merge fractions that are one place in every size (≤ MERGE_MM apart)
    const keep: number[] = [];
    for (const f of fr) {
      const last = keep[keep.length - 1];
      if (last !== undefined && f !== 1 && es.every((e) => dist(at(e, last), at(e, f)) <= MERGE_MM))
        continue;
      if (
        last !== undefined &&
        last !== 0 &&
        f === 1 &&
        es.every((e) => dist(at(e, last), at(e, 1)) <= MERGE_MM)
      )
        keep.pop();
      keep.push(f);
    }
    es.forEach((e, z) => {
      const pts = keep.map((f) => at(e, f));
      // the edge's last point is the next edge's first (a closed line closes on itself)
      out[z].push(...(k < edges - 1 || closed ? pts.slice(0, -1) : pts));
    });
  }
  // fidelity, both ways
  for (let z = 0; z < ls.length; z++) {
    const a = out[z];
    const b = ls[z];
    const far =
      a.some((p) => closestOnPolyline(p, b, closed).d > FIDELITY_MM) ||
      b.some((p) => closestOnPolyline(p, a, closed).d > FIDELITY_MM);
    if (far) return { ok: false, reason: `resampled, size #${z} strays > ${FIDELITY_MM} mm` };
  }
  if (out.some((l) => l.length !== out[0].length))
    return { ok: false, reason: 'resampling left different point counts' };
  return { ok: true, lines: out };
}

/**
 * Every size's line is the base line point for point moved by one translation (≤ 0.01 mm apart):
 * the pairing by index is proven — nothing to match (an ungraded mark, a label box).
 */
function rigidCopies(ls: readonly PtMm[][]): boolean {
  const b = ls[0];
  return ls.every((l) => {
    if (l.length !== b.length) return false;
    const dx = l[0].x - b[0].x;
    const dy = l[0].y - b[0].y;
    return l.every((p, k) => Math.hypot(p.x - b[k].x - dx, p.y - b[k].y - dy) <= 0.01);
  });
}

/**
 * Every graded piece's lines (cut, seam, internal) brought to one point list per size, the base
 * size's first. Pieces whose lines already match point for point are left as they are; a line that
 * cannot be matched leaves its piece as it is and says why (packRul then refuses it as before).
 */
export function equalizeForRul(
  blocks: readonly PlannedBlock[],
  base: string,
): { blocks: PlannedBlock[]; notes: string[] } {
  const notes: string[] = [];
  const byId = new Map<string, PlannedBlock[]>();
  for (const b of blocks) {
    if (b.sizeToken === 'UNI') continue;
    byId.set(b.identity, [...(byId.get(b.identity) ?? []), b]);
  }
  const repl = new Map<PlannedBlock, PlannedBlock>();
  for (const [identity, bs0] of byId) {
    if (bs0.length < 2) continue;
    const bi = bs0.findIndex((b) => b.sizeToken === base);
    const bs = bi > 0 ? [bs0[bi], ...bs0.filter((_, i) => i !== bi)] : bs0;
    const next = bs.map((b) => ({ ...b, internal: b.internal.map((l) => ({ ...l })) }));
    let failed: string | null = null;
    const fit = (
      get: (b: PlannedBlock) => PtMm[] | null,
      closed: boolean,
      set: (b: PlannedBlock, p: PtMm[]) => void,
      what: string,
    ) => {
      if (failed) return;
      const ls = bs.map(get);
      if (ls.some((l) => !l)) return;
      // every line is matched by its corners, equal counts too (Codex r1/r2: an equal count is no
      // correspondence, and packRul's proof cannot tell a wrong pairing) — unmatched = refused
      // the same line moved whole (an ungraded mark copied into every size): point k is point k
      if (rigidCopies(ls as PtMm[][])) return;
      const r = correspondLines(ls as PtMm[][], closed);
      if (r.ok) next.forEach((b, z) => set(b, r.lines[z]));
      else failed = `${what}: ${r.reason}`;
    };
    fit(
      (b) => b.cut,
      true,
      (b, p) => (b.cut = p),
      'cut line',
    );
    fit(
      (b) => b.seam,
      true,
      (b, p) => (b.seam = p),
      'seam line',
    );
    const nInt = bs[0].internal.length;
    if (bs.every((b) => b.internal.length === nInt))
      for (let k = 0; k < nInt; k++)
        fit(
          (b) => b.internal[k].pts,
          bs[0].internal[k].closed,
          (b, p) => (b.internal[k] = { ...b.internal[k], pts: p }),
          `internal line ${k + 1}`,
        );
    if (failed) {
      notes.push(`${identity}: ${failed}`);
      continue;
    }
    bs.forEach((b, z) => repl.set(b, next[z]));
  }
  return { blocks: blocks.map((b) => repl.get(b) ?? b), notes };
}
