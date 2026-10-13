// sizes/ — MOOD Ф2: closing a size line's CORNERS with its own pieces, never a neighbour's line.
//
// Mood (Illustrator, "align dashes to corners") cuts each size's outline at every corner into the
// main dashed path, short RAMPS (a sub-rhythm of the same pen: [0.35 1.04] out of
// [10.1 1.08 0.36 1.08 0.36 1.08]) and a SOLID L-STUB (same colour and width, no dash, 3–15 mm,
// its vertex = the piece's corner). Stub and ramps are shorter than the size-line floor (8 mm), so
// without this pass every corner of every size is a 3–15 mm hole and the fill closes it on a
// neighbouring size's line (a step / zigzag at the corner) or leaks.
//
// Rules (D3: auto only with ≥ 2 independent evidences, else the corner stays open — a leak, never
// a borrowed line). An OWN end = an end of a chain whose own look (unit) is its rank's.
//   RAMP     a dashed path ≤ 15 mm whose dash is a cyclic sub-array of the pen of the own line it
//            continues (evidence 1), lying on that line's continuation: end ≤ 1.5 mm from the own
//            end, tangent ≤ 15°, ≤ 0.35 mm off its line (evidence 2). Two ranks qualifying → none.
//   STUB     a solid path ≤ 15 mm with a turn, the own lines' colour and width, its two ends at two
//            own ends of ONE rank (a) — ≤ 1.5 mm, or the pen's gap + dot + gap when its dot is too
//            small to be a chain (≤ 3 mm) — and its vertex ≤ 0.5 mm from the crossing of those two
//            edges' tangents (b). Touching ends of several ranks (a dense corner bundle): only the
//            rank with (a)+(b), and only when exactly one rank has them — never by proximity.
//   EXTEND   no stub (a phase shift), on a sheet that shows the convention (≥ 10 stubs + ramps):
//            two own ends of one rank, 0.5–8 mm apart, ≥ 20° apart, whose tangents cross ahead of
//            both within 8 mm, are carried to the crossing (evidence 1) when that vertex lies where
//            the grading of the nearest ranks drawing the same corner puts it (evidence 2: ≤ 35 %
//            of one grade step off; nearest rank each side ≤ 3 away, or the step of two on one
//            side continued) and the new segments cross no line of the rank.
// Nothing is merged, extended or re-classed here: every closed corner is a DERIVED WALL of its
// rank (`CornerWall`, on the chain set), hung on its own lines; the wall model re-checks the rank
// and pen on the final lines and the fill draws it beside them (pieces/walls.ts, fill.ts).
import type { Chain, CornerWall, PtMm, Style } from 'lib/pattern-import/types';

export type { CornerWall };

import { dist, SegGrid, segNearest } from '../chains/geom';

export const CORNER = {
  touchMm: 1.5,
  /** A stub's end may stand off an own end by the pen's gap + dot + gap (the dot is too small to
   * be a chain): at most this. */
  touchMaxMm: 3,
  stubMaxMm: 15,
  rampMaxMm: 15,
  vertexMm: 0.5,
  /** Every point of a stub lies this close to the two edges' tangents. */
  armMm: 0.4,
  rampAngleDeg: 15,
  rampLateralMm: 0.35,
  extendMaxMm: 8,
  /** Stubs + ramps a sheet must show before an open corner is extended (the convention). */
  conventionMin: 10,
  minTurnDeg: 20,
  /** A neighbouring rank's same corner is searched this far from the vertex. */
  trendReachMm: 25,
};

type End = {
  /** Chain id. */
  c: number;
  end: 0 | 1;
  p: PtMm;
  /** Outward unit tangent. */
  t: PtMm;
  rank: number;
};

export type CornerLink = {
  a: { c: number; end: 0 | 1 };
  b: { c: number; end: 0 | 1 };
  /** Points between the two ends (stub points, or the vertex). */
  via: PtMm[];
  rule: 'stub' | 'ramp' | 'extend';
  rank: number;
  /** The stub chain absorbed by a 'stub' link. */
  stub?: number;
};

export type CornerOut = {
  /** One derived wall per closed corner (stub arms, ramp, extended edges): see `CornerWall`. */
  walls: CornerWall[];
  stubs: number;
  ramps: number;
  extended: number;
  /** Corners left open for want of a second evidence (per rule). */
  refused: Record<string, number>;
};

/** Outward unit tangent at one end, from ~2 mm back. */
function outward(pts: readonly PtMm[], end: 0 | 1): PtMm | null {
  const n = pts.length;
  if (n < 2) return null;
  const p = end ? pts[n - 1] : pts[0];
  let k = end ? n - 1 : 0;
  const step = end ? -1 : 1;
  let acc = 0;
  while (k + step >= 0 && k + step < n && acc < 2) {
    acc += dist(pts[k], pts[k + step]);
    k += step;
  }
  const q = pts[k];
  const L = dist(p, q);
  return L < 1e-6 ? null : { x: (p.x - q.x) / L, y: (p.y - q.y) / L };
}

/** Crossing of two rays p + a·t, q + b·u: a, b and the point (null when parallel). */
function rayCross(p: PtMm, t: PtMm, q: PtMm, u: PtMm) {
  const den = t.x * u.y - t.y * u.x;
  if (Math.abs(den) < 1e-9) return null;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const a = (dx * u.y - dy * u.x) / den;
  const b = (dx * t.y - dy * t.x) / den;
  return { a, b, x: { x: p.x + a * t.x, y: p.y + a * t.y } };
}

/** The dash period with an exact repeat folded ([a b a b] → [a b]); odd arrays doubled. */
function period(d: readonly number[]): number[] {
  const a = d.filter((_, i) => i < 64).slice();
  if (a.length % 2 === 1) a.push(...a);
  for (let p = 2; p < a.length; p += 2) {
    if (a.length % p) continue;
    let ok = true;
    for (let i = p; i < a.length && ok; i++)
      if (Math.abs(a[i] - a[i - p]) > 0.03 * Math.max(a[i], a[i - p]) + 0.01) ok = false;
    if (ok) return a.slice(0, p);
  }
  return a;
}

/** `sub` is a cyclic window of `pen` starting on a dash (both periods, ≤ 15 % + 0.03 mm apart). */
export function cyclicSubDash(sub: readonly number[], pen: readonly number[]): boolean {
  const s = period(sub);
  const p = period(pen);
  if (!s.length || !p.length || s.length > p.length) return false;
  if (!s.some((v) => v > 0.01)) return false;
  for (let k = 0; k < p.length; k += 2) {
    let ok = true;
    for (let j = 0; j < s.length && ok; j++) {
      const v = p[(k + j) % p.length];
      if (Math.abs(s[j] - v) > 0.15 * Math.max(s[j], v) + 0.03) ok = false;
    }
    if (ok) return true;
  }
  return false;
}

/** The interior point of a polyline farthest from its chord, with the turn there (degrees). */
function vertexOf(pts: readonly PtMm[]): { v: PtMm; turn: number } | null {
  if (pts.length < 3) return null;
  const a = pts[0];
  const b = pts[pts.length - 1];
  let best = -1;
  let bi = -1;
  for (let i = 1; i + 1 < pts.length; i++) {
    const d = segNearest(pts[i], a, b).d;
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  if (bi < 0) return null;
  const v = pts[bi];
  const la = dist(a, v);
  const lb = dist(v, b);
  if (la < 1e-6 || lb < 1e-6) return null;
  const cos = ((v.x - a.x) * (b.x - v.x) + (v.y - a.y) * (b.y - v.y)) / (la * lb);
  return { v, turn: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI };
}

const angleCos = (deg: number) => Math.cos((deg * Math.PI) / 180);

/**
 * Close the corners of every rank (see the head of the file). `own(c)` = chain c is a line of its
 * rank by its own look; `cand(c)` = chain c may be a ramp / stub (not furniture, not ranked by its
 * look). Nothing is mutated: the closures come back as derived walls.
 */
export function closeCorners(
  chains: Chain[],
  rankOf: Map<number, number>,
  styles: ReadonlyMap<number, Style>,
  own: (c: number) => boolean,
  cand: (c: number) => boolean,
  n: number,
): CornerOut {
  const refused: Record<string, number> = {};
  const refuse = (k: string) => (refused[k] = (refused[k] ?? 0) + 1);
  const T = CORNER.touchMm;
  // ── own ends ──
  const ends: End[] = [];
  const endGrid = new SegGrid(4);
  const addEnd = (e: End) => {
    endGrid.addSeg(ends.length, 0, e.p, e.p);
    ends.push(e);
  };
  for (const [c, r] of rankOf) {
    const ch = chains[c];
    if (!own(c) || ch.closed || ch.pts.length < 2) continue;
    for (const end of [0, 1] as const) {
      const t = outward(ch.pts, end);
      if (t) addEnd({ c, end, p: end ? ch.pts[ch.pts.length - 1] : ch.pts[0], t, rank: r });
    }
  }
  const endsNear = (p: PtMm, r: number, visit: (k: number) => void) =>
    endGrid.near(p, r, (k) => {
      if (dist(ends[k].p, p) <= r) visit(k);
    });
  const links: CornerLink[] = [];
  const usedEnd = new Set<string>();
  const ek = (c: number, end: 0 | 1) => `${c}:${end}`;
  const styleOf = (c: number) => styles.get(chains[c].style);
  const sameInk = (c: number, o: number) => {
    const s = styleOf(c);
    const so = styleOf(o);
    if (!s || !so || !s.strokeRgb || !so.strokeRgb) return false;
    const [r1, g1, b1] = s.strokeRgb;
    const [r2, g2, b2] = so.strokeRgb;
    return Math.hypot(r1 - r2, g1 - g2, b1 - b2) <= 30;
  };
  // ── RAMPS ──
  let ramps = 0;
  const rampOf = new Map<number, number>();
  /** ramp → the own end it continues (through other ramps) */
  const rampHost = new Map<number, { c: number; end: 0 | 1 }>();
  for (let round = 0; round < 2; round++) {
    const added: End[] = [];
    for (let c = 0; c < chains.length; c++) {
      if (rampOf.has(c) || !cand(c)) continue;
      const ch = chains[c];
      const st = styleOf(c);
      if (ch.closed || ch.pts.length < 2 || ch.lengthMm > CORNER.rampMaxMm) continue;
      if (!st || st.fill || !st.dash || !st.dash.some((v) => v > 0.01)) continue;
      const hits: { k: number; end: 0 | 1 }[] = [];
      for (const end of [0, 1] as const) {
        const p = end ? ch.pts[ch.pts.length - 1] : ch.pts[0];
        const inward = outward(ch.pts, end);
        if (!inward) continue;
        endsNear(p, T, (k) => {
          const E = ends[k];
          if (E.c === c || usedEnd.has(ek(E.c, E.end))) return;
          // the ramp runs on along E's tangent: its direction into the ramp = E's outward tangent
          if (-(inward.x * E.t.x + inward.y * E.t.y) < angleCos(CORNER.rampAngleDeg)) return;
          const lat = Math.abs((p.x - E.p.x) * E.t.y - (p.y - E.p.y) * E.t.x);
          if (lat > CORNER.rampLateralMm) return;
          const pen = styleOf(E.c)?.dash;
          if (!pen || !sameInk(c, E.c) || !cyclicSubDash(st.dash!, pen)) return;
          if (Math.abs((styleOf(E.c)?.widthMm ?? 0) - st.widthMm) > 0.03) return;
          hits.push({ k, end });
        });
      }
      const ranks = new Set(hits.map((h) => ends[h.k].rank));
      if (!hits.length) continue;
      if (ranks.size > 1) {
        refuse('ramp: two ranks');
        continue;
      }
      // one own end per ramp end; a ramp between two own ends of its rank joins both
      const byEnd = new Map<0 | 1, number>();
      const tip = (end: 0 | 1) => (end ? ch.pts[ch.pts.length - 1] : ch.pts[0]);
      for (const h of hits) {
        const prev = byEnd.get(h.end);
        if (prev === undefined || dist(ends[h.k].p, tip(h.end)) < dist(ends[prev].p, tip(h.end)))
          byEnd.set(h.end, h.k);
      }
      // two ramp ends on one own end (a ramp folded back): not a continuation
      if (byEnd.size === 2 && byEnd.get(0) === byEnd.get(1)) continue;
      const r = [...ranks][0];
      rampOf.set(c, r);
      const host = ends[[...byEnd.values()][0]];
      rampHost.set(c, rampHost.get(host.c) ?? { c: host.c, end: host.end });
      ramps++;
      for (const [end, k] of byEnd) {
        const E = ends[k];
        usedEnd.add(ek(E.c, E.end));
        usedEnd.add(ek(c, end));
        links.push({ a: { c: E.c, end: E.end }, b: { c, end }, via: [], rule: 'ramp', rank: r });
      }
      // the ramp's free end is an own end of r from now on
      for (const end of [0, 1] as const) {
        if (byEnd.has(end)) continue;
        const t = outward(ch.pts, end);
        if (t) added.push({ c, end, p: end ? ch.pts[ch.pts.length - 1] : ch.pts[0], t, rank: r });
      }
    }
    if (!added.length) break;
    for (const e of added) addEnd(e);
  }
  const ownLike = (c: number) => own(c) || rampOf.has(c);
  /**
   * How far a stub's end may stand off an end of line c: 1.5 mm, or the pen's longest blank run
   * (a gap, a dot < 0.6 mm too small to be a chain, a gap) + 0.3 mm, ≤ 3 mm.
   */
  const touchOf = (c: number) => {
    const d = styleOf(c)?.dash;
    if (!d || !d.some((v) => v > 0.01)) return T;
    const p = period(d);
    let run = 0;
    for (let i = 1; i < p.length; i += 2) {
      const dot = p[(i + 1) % p.length];
      run = Math.max(run, p[i] + (dot < 0.6 ? dot + p[(i + 2) % p.length] : 0));
    }
    return Math.min(CORNER.touchMaxMm, Math.max(T, run + 0.3));
  };
  // ── STUBS ──
  let stubs = 0;
  /** accepted stubs' vertices: corners the grading trend may lean on */
  const stubVerts: { r: number; v: PtMm; t0: PtMm; t1: PtMm }[] = [];
  for (let c = 0; c < chains.length; c++) {
    if (rampOf.has(c) || !cand(c)) continue;
    const ch = chains[c];
    const st = styleOf(c);
    if (ch.closed || ch.pts.length < 3 || ch.lengthMm > CORNER.stubMaxMm) continue;
    if (!st || st.fill || (st.dash && st.dash.some((v) => v > 0.01)) || !(st.widthMm > 0)) continue;
    const vx = vertexOf(ch.pts);
    if (!vx || vx.turn < CORNER.minTurnDeg) continue;
    const s0 = ch.pts[0];
    const s1 = ch.pts[ch.pts.length - 1];
    const near0: number[] = [];
    const near1: number[] = [];
    const free0 = (q: PtMm, into: number[]) =>
      endsNear(q, CORNER.touchMaxMm, (k) => {
        const E = ends[k];
        if (!usedEnd.has(ek(E.c, E.end)) && dist(E.p, q) <= touchOf(E.c)) into.push(k);
      });
    free0(s0, near0);
    free0(s1, near1);
    if (!near0.length && !near1.length) continue;
    const ok: { k0: number; k1: number; r: number; d: number; x: PtMm }[] = [];
    for (const k0 of near0)
      for (const k1 of near1) {
        const A = ends[k0];
        const B = ends[k1];
        if (A.rank !== B.rank || (A.c === B.c && A.end === B.end)) continue;
        // (a) both own ends of one rank, drawn in the stub's ink and width
        if (!ownLike(A.c) || !ownLike(B.c)) continue;
        if (!sameInk(c, A.c) || !sameInk(c, B.c)) continue;
        const wA = styleOf(A.c)?.widthMm ?? 0;
        const wB = styleOf(B.c)?.widthMm ?? 0;
        if (wA > 0 && Math.abs(wA - st.widthMm) > 0.03) continue;
        if (wB > 0 && Math.abs(wB - st.widthMm) > 0.03) continue;
        // (b) the stub's vertex is the crossing of the two edges' tangents
        const x = rayCross(A.p, A.t, B.p, B.t);
        if (!x || x.a < -0.5 || x.b < -0.5) continue;
        const d = dist(x.x, vx.v);
        if (d > CORNER.vertexMm) continue;
        // …and the whole stub is the two arms along those tangents (no bend of its own)
        const armA = { x: A.p.x - A.t.x * CORNER.touchMaxMm, y: A.p.y - A.t.y * CORNER.touchMaxMm };
        const armB = { x: B.p.x - B.t.x * CORNER.touchMaxMm, y: B.p.y - B.t.y * CORNER.touchMaxMm };
        const onArms = ch.pts.every(
          (q) => Math.min(segNearest(q, x.x, armA).d, segNearest(q, x.x, armB).d) <= CORNER.armMm,
        );
        if (!onArms) continue;
        ok.push({ k0, k1, r: A.rank, d, x: x.x });
      }
    if (!ok.length) {
      if (near0.length && near1.length) refuse('stub: no (a)+(b)');
      continue;
    }
    if (new Set(ok.map((o) => o.r)).size > 1) {
      refuse('stub: two ranks');
      continue;
    }
    const best = ok.sort((a, b) => a.d - b.d)[0];
    const A = ends[best.k0];
    const B = ends[best.k1];
    usedEnd.add(ek(A.c, A.end));
    usedEnd.add(ek(B.c, B.end));
    stubs++;
    stubVerts.push({ r: best.r, v: vx.v, t0: A.t, t1: B.t });
    links.push({
      a: { c: A.c, end: A.end },
      b: { c: B.c, end: B.end },
      // the stub as its two clean arms: end → the edges' crossing → end (no stray bend of its own)
      via: [s0, best.x, s1],
      rule: 'stub',
      rank: best.r,
      stub: c,
    });
  }
  // ── EXTEND (no stub) ──
  type Pair = { k0: number; k1: number; x: PtMm; cost: number; r: number };
  const pairs: Pair[] = [];
  /**
   * the corners the trend may lean on: stubbed corners, corners drawn closed (two ends ≤ 0.5 mm
   * apart, or a sharp vertex of a line), and open corners that themselves qualify to be extended
   */
  const vertices: { r: number; v: PtMm; t0: PtMm; t1: PtMm }[] = [...stubVerts];
  const free = (k: number) => !usedEnd.has(ek(ends[k].c, ends[k].end));
  const cosTurn = angleCos(CORNER.minTurnDeg);
  ends.forEach((A, k0) => {
    endsNear(A.p, 2 * CORNER.extendMaxMm, (k1) => {
      if (k1 <= k0) return;
      const B = ends[k1];
      if (B.rank !== A.rank || (B.c === A.c && B.end === A.end)) return;
      if (-(A.t.x * B.t.x + A.t.y * B.t.y) > cosTurn) return; // collinear: a mid-line gap
      const x = rayCross(A.p, A.t, B.p, B.t);
      if (!x || x.a < -0.3 || x.b < -0.3) return;
      if (x.a > CORNER.stubMaxMm || x.b > CORNER.stubMaxMm) return;
      // ends already touching (≤ 0.5 mm) are closed as drawn: a vertex off them is a spike
      const gap = dist(A.p, B.p);
      if (gap <= 0.5) {
        vertices.push({
          r: A.rank,
          v: { x: (A.p.x + B.p.x) / 2, y: (A.p.y + B.p.y) / 2 },
          t0: A.t,
          t1: B.t,
        });
        return;
      }
      if (gap > CORNER.extendMaxMm || x.a < 0 || x.b < 0) return;
      if (x.a > CORNER.extendMaxMm || x.b > CORNER.extendMaxMm) return;
      vertices.push({ r: A.rank, v: x.x, t0: A.t, t1: B.t });
      if (!free(k0) || !free(k1)) return;
      pairs.push({ k0, k1, x: x.x, cost: x.a + x.b, r: A.rank });
    });
  });
  // sharp vertices drawn continuously (a corner that has no gap in that size)
  for (const [c, r] of rankOf) {
    if (!own(c)) continue;
    const p = chains[c].pts;
    for (let i = 1; i + 1 < p.length; i++) {
      const a = p[i - 1];
      const v = p[i];
      const b = p[i + 1];
      const la = dist(a, v);
      const lb = dist(v, b);
      if (la < 0.3 || lb < 0.3) continue;
      const t0 = { x: (v.x - a.x) / la, y: (v.y - a.y) / la };
      const t1 = { x: (v.x - b.x) / lb, y: (v.y - b.y) / lb };
      if (-(t0.x * t1.x + t0.y * t1.y) > cosTurn) continue;
      vertices.push({ r, v, t0, t1 });
    }
  }
  const vGrid = new SegGrid(8);
  vertices.forEach((w, i) => vGrid.addSeg(i, 0, w.v, w.v));
  const sameDir = (u: PtMm, w: PtMm) => u.x * w.x + u.y * w.y >= angleCos(15);
  /** the same corner (both edge directions) in rank k nearest to `x` */
  const cornerOf = (k: number, x: PtMm, t0: PtMm, t1: PtMm, reach: number): PtMm | null => {
    let best: PtMm | null = null;
    let bd = Infinity;
    vGrid.near(x, reach, (i) => {
      const w = vertices[i];
      if (w.r !== k) return;
      const match =
        (sameDir(w.t0, t0) && sameDir(w.t1, t1)) || (sameDir(w.t0, t1) && sameDir(w.t1, t0));
      if (!match) return;
      const d = dist(w.v, x);
      if (d <= reach && d < bd) {
        bd = d;
        best = w.v;
      }
    });
    return best;
  };
  /**
   * evidence 2: the vertex lies in the trend of the neighbouring ranks' same corner — the nearest
   * rank on each side that draws it (≤ 3 ranks away: a neighbour drawn in beads may not show it),
   * the vertex where the grading between them puts rank r (≤ 35 % of one step off, ≥ 0.5 mm);
   * at an end of the run, the step of the two nearest ranks on the one side continued.
   */
  const inTrend = (r: number, x: PtMm, t0: PtMm, t1: PtMm): boolean => {
    const found = (dir: 1 | -1) => {
      const out: { k: number; v: PtMm }[] = [];
      for (let d = 1; d <= 3 && out.length < 2; d++) {
        const k = r + dir * d;
        if (k < 0 || k >= n) break;
        const v = cornerOf(k, x, t0, t1, CORNER.trendReachMm * d);
        if (v) out.push({ k, v });
      }
      return out;
    };
    const lo = found(-1);
    const hi = found(1);
    let a: { k: number; v: PtMm };
    let b: { k: number; v: PtMm };
    if (lo.length && hi.length) {
      a = lo[0];
      b = hi[0];
    } else if (lo.length >= 2 || hi.length >= 2) {
      [a, b] = lo.length >= 2 ? [lo[1], lo[0]] : [hi[1], hi[0]];
    } else return false;
    // the grading line through a (rank a.k) and b (rank b.k), at rank r
    const f = (r - a.k) / (b.k - a.k);
    const e = { x: a.v.x + (b.v.x - a.v.x) * f, y: a.v.y + (b.v.y - a.v.y) * f };
    const step = dist(a.v, b.v) / Math.abs(b.k - a.k);
    return dist(x, e) <= Math.max(0.5, 0.35 * step);
  };
  // the rank's lines, for "the new segments cross no line of the rank"
  const rankGrid = new SegGrid(4);
  for (const [c] of rankOf) if (chains[c].pts.length >= 2) rankGrid.addPolyline(c, chains[c].pts);
  const crossesRank = (a: PtMm, b: PtMm, r: number, skip: Set<number>) => {
    let hit = false;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    rankGrid.near(mid, dist(a, b) / 2 + 0.5, (c, s) => {
      if (hit || skip.has(c) || rankOf.get(c) !== r) return;
      const p = chains[c].pts;
      const q0 = p[s];
      const q1 = p[s + 1];
      if (!q0 || !q1) return;
      const den = (b.x - a.x) * (q1.y - q0.y) - (b.y - a.y) * (q1.x - q0.x);
      if (Math.abs(den) < 1e-12) return;
      const t = ((q0.x - a.x) * (q1.y - q0.y) - (q0.y - a.y) * (q1.x - q0.x)) / den;
      const u = ((q0.x - a.x) * (b.y - a.y) - (q0.y - a.y) * (b.x - a.x)) / den;
      if (t > 0.02 && t < 0.98 && u >= 0 && u <= 1) hit = true;
    });
    return hit;
  };
  let extended = 0;
  pairs.sort((p, q) => p.cost - q.cost);
  // the phase-shift rule only where the sheet proves the convention: its corners are cut into
  // stubs and ramps (Mood/Illustrator "align dashes to corners") — a sheet without any is not
  // drawn that way, and its open corners are another matter (continuity, the operator)
  if (stubs + ramps < CORNER.conventionMin) {
    if (pairs.length) refused['extend: no stub/ramp convention on this sheet'] = pairs.length;
    pairs.length = 0;
  }
  for (const pr of pairs) {
    if (!free(pr.k0) || !free(pr.k1)) continue;
    const A = ends[pr.k0];
    const B = ends[pr.k1];
    if (!ownLike(A.c) || !ownLike(B.c)) continue;
    if (!inTrend(pr.r, pr.x, A.t, B.t)) {
      if (typeof process !== 'undefined' && process.env?.MOOD_F2_DEBUG) {
        const nb = [-2, -1, 1, 2].map((d) => {
          const k = pr.r + d;
          const v = k >= 0 && k < n ? cornerOf(k, pr.x, A.t, B.t, 25 * Math.abs(d)) : null;
          return v ? `${d}:${v.x.toFixed(1)},${v.y.toFixed(1)}` : `${d}:-`;
        });
        console.log(`F2T r${pr.r} at ${pr.x.x.toFixed(1)},${pr.x.y.toFixed(1)} nb ${nb.join(' ')}`);
      }
      refuse('extend: off the trend');
      continue;
    }
    const skip = new Set([A.c, B.c]);
    if (crossesRank(A.p, pr.x, pr.r, skip) || crossesRank(pr.x, B.p, pr.r, skip)) {
      refuse('extend: crosses its rank');
      continue;
    }
    usedEnd.add(ek(A.c, A.end));
    usedEnd.add(ek(B.c, B.end));
    extended++;
    links.push({
      a: { c: A.c, end: A.end },
      b: { c: B.c, end: B.end },
      via: [pr.x],
      rule: 'extend',
      rank: pr.r,
    });
  }
  if (typeof process !== 'undefined' && process.env?.MOOD_F2_DEBUG)
    for (const l of links)
      console.log(
        `F2 ${l.rule} r${l.rank} ${l.a.c}:${l.a.end} ${l.b.c}:${l.b.end} at ${(l.a.end ? chains[l.a.c].pts[chains[l.a.c].pts.length - 1] : chains[l.a.c].pts[0]).x.toFixed(1)},${(l.a.end ? chains[l.a.c].pts[chains[l.a.c].pts.length - 1] : chains[l.a.c].pts[0]).y.toFixed(1)} via ${l.via.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}${l.stub !== undefined ? ` stub ${l.stub}` : ''}`,
      );
  const res = { walls: wallsOf(chains, links, rampHost) };
  return { ...res, stubs, ramps, extended, refused };
}

/**
 * The links as derived walls. The chains are never touched: a closed corner is a wall item of its
 * rank, drawn by the fill beside the rank's lines (a merged or extended line would change how the
 * rest of the sizes step reads them). Each item names the own lines it hangs on (`own`: the rank
 * is re-checked on them where the walls are built) and the ends it closes (`ends`).
 */
function wallsOf(
  chains: Chain[],
  links: CornerLink[],
  rampHost: ReadonlyMap<number, { c: number; end: 0 | 1 }>,
): CornerWall[] {
  const tip = (x: { c: number; end: 0 | 1 }) =>
    x.end ? chains[x.c].pts[chains[x.c].pts.length - 1] : chains[x.c].pts[0];
  /** a ramp's end → the own end its ramp continues */
  const anchor = (x: { c: number; end: 0 | 1 }) => rampHost.get(x.c) ?? x;
  const out: CornerWall[] = [];
  for (const l of links) {
    if (l.rule === 'ramp') {
      // own end → the ramp, along it to its far end
      const q = chains[l.b.c].pts;
      const along = l.b.end === 0 ? q : q.slice().reverse();
      const A = anchor(l.a);
      out.push({
        rule: 'ramp',
        pts: [tip(l.a), ...along],
        own: [A.c],
        ends: [`${A.c}:${A.end}`],
        chains: [l.b.c],
      });
      continue;
    }
    const pa = tip(l.a);
    const v = l.via;
    const via =
      v.length >= 2 && dist(v[0], pa) > dist(v[v.length - 1], pa) ? v.slice().reverse() : v;
    const A = anchor(l.a);
    const B = anchor(l.b);
    out.push({
      rule: l.rule,
      pts: [pa, ...via, tip(l.b)],
      own: [A.c, B.c],
      ends: [`${A.c}:${A.end}`, `${B.c}:${B.end}`],
      chains: l.stub !== undefined ? [l.stub] : [],
    });
  }
  return out;
}
