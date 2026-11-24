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
//   ARMS     two straight solid strokes (1.5–8 mm), each continuing one own end of the SAME rank.
//            The stroke may start up to 8 mm ahead of the end, on its outward tangent (cosine
//            > 0.85, every point ≤ 0.4 mm off the line), in the rank's ink and in a width that
//            rank's own lines use. The wall keeps those printed points. A vertex the strokes do
//            not reach is the crossing of the two confirmed sides, and only when that crossing
//            lies ahead of both within 8 mm. One stroke, two strokes on the same end, or one
//            stroke continuing two ranks leaves the corner open. Another size's coordinates are
//            never copied.
//   EXTEND   no stub (a phase shift), on a sheet that shows the convention (≥ 10 stubs + ramps):
//            two own ends of one rank, 0.5–8 mm apart, ≥ 20° apart, whose tangents cross ahead of
//            both within 8 mm, are carried to the crossing (evidence 1) when that vertex lies where
//            the grading of the nearest ranks drawing the same corner puts it (evidence 2: ≤ 35 %
//            of one grade step off; nearest rank each side ≤ 3 away, or the step of two on one
//            side continued) and the new segments cross no line of the rank.
//            Evidence 2 may instead be drawn at the corner itself, on BOTH edges: CROSS (the edge
//            runs on through the vertex in a short solid piece of the size's ink and width) or
//            MARKS (the edge is drawn on into the vertex in the glyphs its own lines are made of).
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
  /** A WIDE extend (ends or vertex past `extendMaxMm`, up to this) needs the trend alone, carried
   * by at least `wideSupport` other sizes' same corner on one grading line (Leah size 4: its L
   * stub lost to another row, its ends 9 mm apart). */
  wideMaxMm: 15,
  wideSupport: 3,
  /** Stubs + ramps a sheet must show before an open corner is extended (the convention). */
  conventionMin: 10,
  minTurnDeg: 20,
  /** A neighbouring rank's same corner is searched this far from the vertex. */
  trendReachMm: 25,
  /** MARKS: a glyph is at most this big (bbox's longer side) and at least `markMinMm`… */
  markMaxMm: 2.5,
  markMinMm: 0.3,
  /** …and the glyphs filling an edge's gap stand at most this far apart (one missing glyph of a
   * 1.3 mm pen still passes). */
  markStepMm: 2.5,
};

/**
 * A glyph on the sheet (a small path: a pre-dashed pen draws a size line as circles / chevrons),
 * for MARKS. `path` ties it to the chains whose `ranges` use it.
 */
export type CornerMark = { path: number; c: PtMm; size: number; closed: boolean; style: number };

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
  rule: 'stub' | 'ramp' | 'extend' | 'arms';
  rank: number;
  /** The stub chain absorbed by a 'stub' link. */
  stub?: number;
  /** The two printed strokes an 'arms' link keeps. */
  arms?: number[];
};

export type CornerOut = {
  /** One derived wall per closed corner (stub arms, ramp, extended edges): see `CornerWall`. */
  walls: CornerWall[];
  stubs: number;
  ramps: number;
  extended: number;
  /** Of `extended`: corners whose second evidence was the crossing drawn at the vertex (CROSS). */
  crossed: number;
  /** Of `extended`: corners with at least one edge drawn into the vertex in the size's glyphs. */
  marked: number;
  /** Of `extended`: WIDE corners (ends or vertex past `extendMaxMm`), closed by the trend alone. */
  wide: number;
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
 * CORNER PROBE (dev loop, scripts only): the exact input of one `closeCorners` call plus its output,
 * for `scripts/pattern-import/corner-replay.ts` (dxf-shot CORNER_PROBES=1). Nothing is rounded: a
 * replay that is not bit-exact cannot judge a patch. The two closures are evaluated once per chain
 * (they are pure functions of the sizes step's state at the call); `rankOf` keeps its insertion
 * order (it fixes the order of ends and pairs, hence every tie); the `MOOD_*` env switches set at
 * the call are recorded because corners.ts reads some of them. Collected only when a sink is set.
 */
export type CornerProbe = {
  chains: Chain[];
  rankOf: [number, number][];
  styles: [number, Style][];
  own: boolean[];
  cand: boolean[];
  n: number;
  marks: CornerMark[];
  env: Record<string, string>;
  out: CornerOut;
};
let probeSink: ((p: CornerProbe) => void) | null = null;
export function setCornerProbeSink(fn: ((p: CornerProbe) => void) | null): void {
  probeSink = fn;
}

/** The corner step (see `closeCornersRun`); with a probe sink set it also hands over input + output. */
export function closeCorners(
  chains: Chain[],
  rankOf: Map<number, number>,
  styles: ReadonlyMap<number, Style>,
  own: (c: number) => boolean,
  cand: (c: number) => boolean,
  n: number,
  marks: readonly CornerMark[] = [],
): CornerOut {
  const out = closeCornersRun(chains, rankOf, styles, own, cand, n, marks);
  if (probeSink)
    probeSink({
      chains,
      rankOf: [...rankOf],
      styles: [...styles],
      own: chains.map((_, c) => own(c)),
      cand: chains.map((_, c) => cand(c)),
      n,
      marks: [...marks],
      env: Object.fromEntries(
        Object.entries(typeof process !== 'undefined' ? process.env : {}).filter(
          ([k, v]) => /^MOOD_/.test(k) && v !== undefined,
        ) as [string, string][],
      ),
      out,
    });
  return out;
}

/**
 * Close the corners of every rank (see the head of the file). `own(c)` = chain c is a line of its
 * rank by its own look; `cand(c)` = chain c may be a ramp / stub (not furniture, not ranked by its
 * look). Nothing is mutated: the closures come back as derived walls.
 */
/** The corner step itself: never calls the probe sink (a replay must not record itself). */
export function closeCornersRun(
  chains: Chain[],
  rankOf: Map<number, number>,
  styles: ReadonlyMap<number, Style>,
  own: (c: number) => boolean,
  cand: (c: number) => boolean,
  n: number,
  marks: readonly CornerMark[] = [],
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
  type Pair = { k0: number; k1: number; x: PtMm; cost: number; r: number; wide: boolean };
  const pairs: Pair[] = [];
  /**
   * the corners the trend may lean on: stubbed corners, corners drawn closed (two ends ≤ 0.5 mm
   * apart, or a sharp vertex of a line), and open corners that themselves qualify to be extended
   */
  const vertices: { r: number; v: PtMm; t0: PtMm; t1: PtMm }[] = [...stubVerts];
  const free = (k: number) => !usedEnd.has(ek(ends[k].c, ends[k].end));
  const cosTurn = angleCos(CORNER.minTurnDeg);
  ends.forEach((A, k0) => {
    endsNear(A.p, 2 * CORNER.wideMaxMm, (k1) => {
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
      if (gap > CORNER.wideMaxMm || x.a < 0 || x.b < 0) return;
      if (x.a > CORNER.wideMaxMm || x.b > CORNER.wideMaxMm) return;
      const wide = gap > CORNER.extendMaxMm || x.a > CORNER.extendMaxMm || x.b > CORNER.extendMaxMm;
      // a wide candidate is no support for the trend until it is accepted
      if (!wide) vertices.push({ r: A.rank, v: x.x, t0: A.t, t1: B.t });
      if (wide && typeof process !== 'undefined' && process.env?.MOOD_WIDE_OFF) return;
      if (!free(k0) || !free(k1)) return;
      pairs.push({ k0, k1, x: x.x, cost: x.a + x.b, r: A.rank, wide });
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
   * evidence 2: the vertex lies in the trend of the other ranks' same corner — the nearest rank on
   * each side that draws it, at any distance in the run (Leah: size 8's corner had only size 12
   * closed within 3 ranks, yet sizes 12…32 put it on the grade within 0.1 mm), the vertex where
   * the grading between them puts rank r (≤ 35 % of one step off, ≥ 0.5 mm); at an end of the
   * run, the step of the two nearest ranks on the one side continued. Returns the SUPPORT: how
   * many ranks' corners lie on that grading line (the two it is drawn through included), 0 when
   * the vertex is off it. Continuing a step past 3 ranks, or a wide extend, needs `wideSupport`.
   */
  const trendSupport = (r: number, x: PtMm, t0: PtMm, t1: PtMm): number => {
    const lo: { k: number; v: PtMm }[] = [];
    const hi: { k: number; v: PtMm }[] = [];
    for (let k = 0; k < n; k++) {
      if (k === r) continue;
      const d = Math.abs(k - r);
      const v = cornerOf(k, x, t0, t1, CORNER.trendReachMm * Math.min(d, 3));
      if (v) (k < r ? lo : hi).push({ k, v });
    }
    lo.sort((p, q) => q.k - p.k);
    hi.sort((p, q) => p.k - q.k);
    let a: { k: number; v: PtMm };
    let b: { k: number; v: PtMm };
    if (lo.length && hi.length) {
      a = lo[0];
      b = hi[0];
    } else if (lo.length >= 2 || hi.length >= 2) {
      [a, b] = lo.length >= 2 ? [lo[1], lo[0]] : [hi[1], hi[0]];
    } else return 0;
    // the grading line through a (rank a.k) and b (rank b.k)
    const step = dist(a.v, b.v) / Math.abs(b.k - a.k);
    const tol = Math.max(0.5, 0.35 * step);
    const on = (k: number, v: PtMm) => {
      const f = (k - a.k) / (b.k - a.k);
      return dist(v, { x: a.v.x + (b.v.x - a.v.x) * f, y: a.v.y + (b.v.y - a.v.y) * f }) <= tol;
    };
    if (!on(r, x)) return 0;
    const support = [...lo, ...hi].filter((w) => on(w.k, w.v)).length;
    // continuing a step from far away multiplies its noise: it needs a third witness
    const far = !(lo.length && hi.length) && Math.abs(r - b.k) > 3;
    return far && support < CORNER.wideSupport ? 0 : support;
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
  // ── ARMS: the printed stroke is already there. Keep it. A missing vertex is the crossing of
  // the two confirmed sides. A second continuation, or a stroke that continues two ranks, stops.
  // A sheet that already cuts corners into stubs and ramps keeps EXTEND for this; arms is the
  // sheet that has no such convention, where those strokes were being thrown out.
  if (stubs + ramps < CORNER.conventionMin) {
    const cosMin = 0.85;
    const rankWidths = new Map<number, number[]>();
    for (let c = 0; c < chains.length; c++) {
      const r = rankOf.get(c);
      const w = styleOf(c)?.widthMm;
      if (r === undefined || !own(c) || !(w && w > 0)) continue;
      const ws = rankWidths.get(r) ?? [];
      if (!ws.some((v) => Math.abs(v - w) < 1e-3)) ws.push(w);
      rankWidths.set(r, ws);
    }
    type ArmHit = { k: number; c: number; near: 0 | 1 };
    const hits: ArmHit[] = [];
    for (let c = 0; c < chains.length; c++) {
      if (rampOf.has(c) || !cand(c)) continue;
      const ch = chains[c];
      const st = styleOf(c);
      if (ch.closed || ch.pts.length < 2 || ch.lengthMm < 1.5 || ch.lengthMm > 8) continue;
      if (!st || st.fill || (st.dash && st.dash.some((v) => v > 0.01)) || !(st.widthMm > 0))
        continue;
      const a = ch.pts[0];
      const b = ch.pts[ch.pts.length - 1];
      const L = dist(a, b);
      if (L < 0.9 * ch.lengthMm || L < 1e-6) continue;
      for (const near of [0, 1] as const) {
        const p = near ? b : a;
        const q = near ? a : b;
        const dir = { x: (q.x - p.x) / L, y: (q.y - p.y) / L };
        endsNear(p, CORNER.extendMaxMm, (k) => {
          const E = ends[k];
          if (usedEnd.has(ek(E.c, E.end))) return;
          const dx = p.x - E.p.x;
          const dy = p.y - E.p.y;
          const along = dx * E.t.x + dy * E.t.y;
          const lat = Math.abs(dx * E.t.y - dy * E.t.x);
          // ahead of the end, on its line: a dash break, not a stroke beside it
          if (along < -0.5 || along > CORNER.extendMaxMm || lat > CORNER.armMm) return;
          if (dir.x * E.t.x + dir.y * E.t.y <= cosMin) return;
          if (!sameInk(c, E.c)) return;
          const wr = rankWidths.get(E.rank) ?? [];
          if (!wr.some((v) => Math.abs(v - st.widthMm) <= 0.03)) return;
          const off = (pt: PtMm) => Math.abs((pt.x - E.p.x) * E.t.y - (pt.y - E.p.y) * E.t.x);
          if (ch.pts.some((pt) => off(pt) > CORNER.armMm)) return;
          hits.push({ k, c, near });
        });
      }
    }
    const byEnd = new Map<number, ArmHit[]>();
    const ranksOf = new Map<number, Set<number>>();
    for (const h of hits) {
      const list = byEnd.get(h.k) ?? [];
      if (!list.some((o) => o.c === h.c)) list.push(h);
      byEnd.set(h.k, list);
      const rs = ranksOf.get(h.c) ?? new Set<number>();
      rs.add(ends[h.k].rank);
      ranksOf.set(h.c, rs);
    }
    const shared = new Set<number>();
    for (const [c, rs] of ranksOf) if (rs.size > 1) shared.add(c);
    if (shared.size) refuse('arms: two ranks');
    const armOf = new Map<number, ArmHit>();
    for (const [k, list] of byEnd) {
      const uniq = list.filter((h) => !shared.has(h.c));
      if (uniq.length === 1) armOf.set(k, uniq[0]);
      else if (uniq.length > 1) refuse('arms: two continuations');
    }
    /** Printed points of a stroke that lie strictly between the own end and `vertex`. */
    const along = (c: number, near: 0 | 1, vertex: PtMm, t: PtMm, tip: PtMm) => {
      const q = chains[c].pts;
      const pts = near ? q.slice().reverse() : q.slice();
      const reach = (vertex.x - tip.x) * t.x + (vertex.y - tip.y) * t.y;
      const out: PtMm[] = [];
      for (const p of pts) {
        const s = (p.x - tip.x) * t.x + (p.y - tip.y) * t.y;
        if (s <= 0.05 || s > reach + 0.05) continue;
        out.push(p);
      }
      return out;
    };
    type ArmPair = { k0: number; k1: number; x: PtMm; cost: number };
    const armPairs: ArmPair[] = [];
    for (const [k0, h0] of armOf) {
      const A = ends[k0];
      endsNear(A.p, 2 * CORNER.extendMaxMm, (k1) => {
        if (k1 <= k0) return;
        const h1 = armOf.get(k1);
        if (!h1 || h1.c === h0.c) return;
        const B = ends[k1];
        if (B.rank !== A.rank || (B.c === A.c && B.end === A.end)) return;
        if (-(A.t.x * B.t.x + A.t.y * B.t.y) > cosTurn) return;
        const x = rayCross(A.p, A.t, B.p, B.t);
        if (!x || x.a < -0.3 || x.b < -0.3) return;
        if (x.a > CORNER.extendMaxMm || x.b > CORNER.extendMaxMm) return;
        if (dist(A.p, B.p) <= 0.5) return;
        armPairs.push({ k0, k1, x: x.x, cost: Math.max(0, x.a) + Math.max(0, x.b) });
      });
    }
    armPairs.sort((p, q) => p.cost - q.cost);
    const taken = new Set<number>();
    for (const pr of armPairs) {
      const h0 = armOf.get(pr.k0);
      const h1 = armOf.get(pr.k1);
      if (!h0 || !h1 || taken.has(h0.c) || taken.has(h1.c)) continue;
      if (!free(pr.k0) || !free(pr.k1)) continue;
      const A = ends[pr.k0];
      const B = ends[pr.k1];
      if (crossesRank(A.p, pr.x, A.rank, new Set([A.c, B.c]))) {
        refuse('arms: crosses its rank');
        continue;
      }
      if (crossesRank(pr.x, B.p, A.rank, new Set([A.c, B.c]))) {
        refuse('arms: crosses its rank');
        continue;
      }
      const forward = along(h0.c, h0.near, pr.x, A.t, A.p);
      const back = along(h1.c, h1.near, pr.x, B.t, B.p).reverse();
      const via = [...forward];
      const last = via[via.length - 1];
      if (!last || dist(last, pr.x) > 0.05) via.push(pr.x);
      via.push(...back);
      usedEnd.add(ek(A.c, A.end));
      usedEnd.add(ek(B.c, B.end));
      taken.add(h0.c);
      taken.add(h1.c);
      links.push({
        a: { c: A.c, end: A.end },
        b: { c: B.c, end: B.end },
        via,
        rule: 'arms',
        rank: A.rank,
        arms: [h0.c, h1.c],
      });
    }
  }
  let extended = 0;
  let crossed = 0;
  pairs.sort((p, q) => p.cost - q.cost);
  // the phase-shift rule only where the sheet proves the convention: its corners are cut into
  // stubs and ramps (Mood/Illustrator "align dashes to corners") — a sheet without any is not
  // drawn that way, and its open corners are another matter (continuity, the operator)
  if (stubs + ramps < CORNER.conventionMin) {
    if (pairs.length) refused['extend: no stub/ramp convention on this sheet'] = pairs.length;
    pairs.length = 0;
  }
  // the pen widths each rank's own lines are drawn in (a pre-dashed pen may use two)
  const rankWidths = new Map<number, number[]>();
  for (let c = 0; c < chains.length; c++) {
    const r = rankOf.get(c);
    const w = styleOf(c)?.widthMm;
    if (r === undefined || !own(c) || !(w && w > 0)) continue;
    const ws = rankWidths.get(r) ?? [];
    if (!ws.some((v) => Math.abs(v - w) < 1e-3)) ws.push(w);
    rankWidths.set(r, ws);
  }
  // short solid pieces that may witness a corner drawn as a crossing (CROSS, below)
  const witGrid = new SegGrid(4);
  for (let c = 0; c < chains.length; c++) {
    if (!cand(c) || rampOf.has(c)) continue;
    const ch = chains[c];
    const st = styleOf(c);
    if (ch.closed || ch.pts.length < 2 || ch.lengthMm > CORNER.stubMaxMm) continue;
    if (!st || st.fill || (st.dash && st.dash.some((v) => v > 0.01)) || !(st.widthMm > 0)) continue;
    witGrid.addPolyline(c, ch.pts);
  }
  /**
   * CROSS (evidence 2 without the trend): the corner is inked as a crossing — on the edge of end E
   * a short solid piece in E's ink and in a width its rank's own lines use lies on E's line (≤ 15°, every point ≤ 0.4 mm off
   * it) and passes through the vertex (≤ 0.5 mm). Valentina's hem and side seam run on past
   * their corner in pieces of another graphic state, too short to be chains.
   */
  const witnessed = (E: End, x: PtMm, used: Set<number>): number | null => {
    let hit: number | null = null;
    const wr = rankWidths.get(rankOf.get(E.c) ?? -1) ?? [];
    witGrid.near(x, CORNER.vertexMm, (c) => {
      if (hit !== null || used.has(c) || c === E.c) return;
      const q = chains[c].pts;
      let d = Infinity;
      for (let i = 0; i + 1 < q.length; i++) d = Math.min(d, segNearest(x, q[i], q[i + 1]).d);
      if (d > CORNER.vertexMm) return;
      if (!sameInk(c, E.c)) return;
      const w = styleOf(c)?.widthMm ?? 0;
      if (!wr.some((v) => Math.abs(v - w) <= 0.03)) return;
      const a = q[0];
      const b = q[q.length - 1];
      const L = dist(a, b);
      if (L < 1e-6) return;
      if (Math.abs(((b.x - a.x) * E.t.x + (b.y - a.y) * E.t.y) / L) < angleCos(CORNER.rampAngleDeg))
        return;
      const off = (p: PtMm) => Math.abs((p.x - x.x) * E.t.y - (p.y - x.y) * E.t.x);
      if (q.some((p) => off(p) > CORNER.armMm)) return;
      hit = c;
    });
    return hit;
  };
  // ── MARKS: the glyphs each rank's own lines are made of, and who already took each glyph ──
  const markAt = new Map<number, number>();
  marks.forEach((m, i) => markAt.set(m.path, i));
  const markGrid = new SegGrid(4);
  marks.forEach((m, i) => markGrid.addSeg(i, 0, m.c, m.c));
  /** per glyph: the rank whose lines take it (-1: several ranks) */
  const takenBy = new Map<number, number>();
  const glyphsOf = new Map<number, { size: number; closed: boolean }[]>();
  if (marks.length)
    for (const [c, r] of rankOf)
      for (const g of chains[c].ranges) {
        const k = markAt.get(g.path);
        if (k === undefined) continue;
        takenBy.set(k, takenBy.has(k) && takenBy.get(k) !== r ? -1 : r);
        if (!own(c)) continue;
        const m = marks[k];
        const gs = glyphsOf.get(r) ?? [];
        if (!gs.some((s) => s.closed === m.closed && Math.abs(s.size - m.size) < 0.02))
          gs.push({ size: m.size, closed: m.closed });
        glyphsOf.set(r, gs);
      }
  /** one of the chains `cs` runs through p (≤ `armMm`) */
  const drawnBy = (p: PtMm, cs: readonly number[]): boolean => {
    let hit = false;
    rankGrid.near(p, CORNER.armMm, (c, s) => {
      if (hit || !cs.includes(c)) return;
      const q = chains[c].pts;
      if (q[s] && q[s + 1] && segNearest(p, q[s], q[s + 1]).d <= CORNER.armMm) hit = true;
    });
    return hit;
  };
  /**
   * MARKS (evidence 2 without the trend, like CROSS): the edge of end E is drawn on into the vertex
   * in its size's own glyphs — the shapes its own lines are made of (closed or not, size ±10 %),
   * its ink, taken by no other size's line nor (ahead of the end) by the two lines being joined —
   * lying on E's line (≤ 0.4 mm), none more than 2.5 mm after the last, from the end up to the
   * vertex (Valentina's L hem corner: the seam and the hem run their circles and chevrons into the
   * corner in another graphic state, no chain of them).
   */
  const marked = (E: End, x: PtMm, joined: readonly number[]): boolean => {
    const shapes = glyphsOf.get(E.rank);
    const ink = styleOf(E.c)?.strokeRgb;
    if (!shapes?.length || !ink) return false;
    const g = dist(E.p, x);
    const along: number[] = [];
    const mid = { x: (E.p.x + x.x) / 2, y: (E.p.y + x.y) / 2 };
    markGrid.near(mid, g / 2 + CORNER.markStepMm, (k) => {
      const m = marks[k];
      // another size's glyph is not this size's
      const by = takenBy.get(k);
      if (by !== undefined && by !== E.rank) return;
      const dx = m.c.x - E.p.x;
      const dy = m.c.y - E.p.y;
      const s = dx * E.t.x + dy * E.t.y;
      // a glyph ahead of the end that one of the two lines being joined passes through is that
      // line, already drawn there (Ambrosia 26: its own dash-dot line runs 2 mm back over its head,
      // its dots "marked" the line onto itself and cut a pocket). Judged by the line's geometry,
      // not by the glyph's PDF path: one path carries many glyphs, and a line made of part of it
      // does not own the rest (Estoril 3XL: three real corners lost that way)
      if (s > CORNER.vertexMm && drawnBy(m.c, joined)) return;
      if (s < -CORNER.vertexMm || s > g + CORNER.markStepMm) return;
      if (Math.abs(dx * E.t.y - dy * E.t.x) > CORNER.armMm) return;
      const mi = styles.get(m.style)?.strokeRgb;
      if (!mi || Math.hypot(mi[0] - ink[0], mi[1] - ink[1], mi[2] - ink[2]) > 30) return;
      const fits = (sh: { size: number; closed: boolean }) =>
        sh.closed === m.closed && Math.abs(sh.size - m.size) <= 0.1 * sh.size + 0.05;
      if (shapes.some(fits)) along.push(s);
    });
    if (along.length < 2) return false;
    along.sort((p, q) => p - q);
    let at = 0;
    for (const s of along) {
      if (s - at > CORNER.markStepMm) return false;
      at = Math.max(at, s);
      if (at >= g - CORNER.vertexMm) return true;
    }
    return false;
  };
  let marked_ = 0;
  let wide_ = 0;
  const wideLinks = new Set<number>(); // debug: which links are wide extends
  // passes until nothing new closes: a corner closed in one pass is the trend's neighbour in the
  // next (a size whose neighbours are all open waits for them, not refused at once)
  let todo = pairs;
  for (;;) {
    let progress = false;
    const pending: Pair[] = [];
    for (const pr of todo) {
      if (!free(pr.k0) || !free(pr.k1)) continue;
      const A = ends[pr.k0];
      const B = ends[pr.k1];
      if (!ownLike(A.c) || !ownLike(B.c)) continue;
      const wa = witnessed(A, pr.x, new Set());
      const wb = witnessed(B, pr.x, new Set(wa === null ? [] : [wa]));
      const ma = wa === null && marked(A, pr.x, [A.c, B.c]);
      const mb = wb === null && marked(B, pr.x, [A.c, B.c]);
      const crossing = (wa !== null || ma) && (wb !== null || mb);
      // a wide extend rests on the trend alone, and on more than two sizes
      const support = trendSupport(pr.r, pr.x, A.t, B.t);
      const onTrend = pr.wide ? support >= CORNER.wideSupport : crossing || support > 0;
      if (!onTrend) {
        // another corner closed later in this pass may still put it on the trend
        pending.push(pr);
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
      if (wa !== null && wb !== null) crossed++;
      else if (crossing) marked_++;
      if (pr.wide) wide_++;
      links.push({
        a: { c: A.c, end: A.end },
        b: { c: B.c, end: B.end },
        via: [pr.x],
        rule: 'extend',
        rank: pr.r,
      });
      // the closed corner is a neighbour the next pass's trend may lean on
      if (pr.wide) {
        wideLinks.add(links.length - 1);
        vertices.push({ r: pr.r, v: pr.x, t0: A.t, t1: B.t });
        vGrid.addSeg(vertices.length - 1, 0, pr.x, pr.x);
      }
      progress = true;
    }
    todo = pending;
    if (!progress) break;
  }
  for (const pr of todo) {
    if (!free(pr.k0) || !free(pr.k1)) continue;
    const A = ends[pr.k0];
    const B = ends[pr.k1];
    if (typeof process !== 'undefined' && process.env?.MOOD_F2_DEBUG) {
      const nb = [-2, -1, 1, 2].map((d) => {
        const k = pr.r + d;
        const v = k >= 0 && k < n ? cornerOf(k, pr.x, A.t, B.t, 25 * Math.abs(d)) : null;
        return v ? `${d}:${v.x.toFixed(1)},${v.y.toFixed(1)}` : `${d}:-`;
      });
      console.log(
        `F2T r${pr.r}${pr.wide ? ' wide' : ''} at ${pr.x.x.toFixed(1)},${pr.x.y.toFixed(1)} ${A.c}:${A.end}@${A.p.x.toFixed(1)},${A.p.y.toFixed(1)} ${B.c}:${B.end}@${B.p.x.toFixed(1)},${B.p.y.toFixed(1)} nb ${nb.join(' ')}`,
      );
    }
    refuse(pr.wide ? 'extend: wide, trend too thin' : 'extend: off the trend');
  }
  if (typeof process !== 'undefined' && process.env?.MOOD_F2_DEBUG)
    for (const [li, l] of links.entries())
      console.log(
        `F2 ${l.rule}${wideLinks.has(li) ? ' wide' : ''} r${l.rank} ${l.a.c}:${l.a.end} ${l.b.c}:${l.b.end} at ${(l.a.end ? chains[l.a.c].pts[chains[l.a.c].pts.length - 1] : chains[l.a.c].pts[0]).x.toFixed(1)},${(l.a.end ? chains[l.a.c].pts[chains[l.a.c].pts.length - 1] : chains[l.a.c].pts[0]).y.toFixed(1)} via ${l.via.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}${l.stub !== undefined ? ` stub ${l.stub}` : ''}`,
      );
  const res = { walls: wallsOf(chains, links, rampHost) };
  return { ...res, stubs, ramps, extended, crossed, marked: marked_, wide: wide_, refused };
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
      chains: l.arms ?? (l.stub !== undefined ? [l.stub] : []),
    });
  }
  return out;
}
