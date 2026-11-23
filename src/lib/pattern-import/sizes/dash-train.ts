// sizes/ — dashes of a size line that the linker left apart (`fragment < 8 mm`), ranked by evidence.
//
// A size line whose dashes are 6 mm long and 4–8 mm apart reaches the sizes step as chains of a
// few dashes each and a row of single dashes between them. Chains under 8 mm are not candidates
// of anything (`cand` in recover.ts), so those dashes stay in no row and the size's outline is
// open there. Joining them by geometry alone (same pen, collinear) was tried and made 12 files
// worse: the line of one size runs out, and the dash ahead of it is the line of ANOTHER size
// (Leah: 24 of 58 collinear dashes at the free ends of ranked lines are another key's pen).
//
// The proof is the rhythm of the size's own pen, the one the drawing's key named. A dash is
// taken into rank r when
//   1  its length is a dash of r's rhythm (±6 %: tile scale moves a dash a few percent), and the
//      gap from the end it continues is not longer than r's longest gap;
//   2  when another key's rhythm has the same dash length (Cassandra: sizes 10 and 30 are both
//      6.0 mm dashes), the gap decides: it must be a gap of r's rhythm and of no rival's
//      (7.75 against 6.75);
//   3  it is a train: at least two dashes in a row at one pitch — or one dash whose far end meets
//      another end of the same rank (it closes a hole between two lines of one size).
//   4  it does not run up to a line of ANOTHER size (within the fill's 3 mm): a dash that sits on the
//      joint of two sizes' lines is the joint, not the line of either (Reims: a dash between the end
//      of size 2 and the start of size 18).
// "Near" in 3 and 4 is about lines the end RUNS INTO, not lines beside it. In a nested drawing the
// neighbouring sizes run 1–3 mm apart, so a plain 3 mm radius finds one at nearly every end (Leah,
// size 18: every long hole was a train refused that way). A line counts when it touches the point
// (≤ `touchMm`) or crosses the line of the end within `landedMm` ahead; a line running along the
// end more than `lateralMm` across it is the nest and counts only by its own END (the Reims joint).
// Geometry (on the line of the end, ≤ 0.4 mm off it, within 18°) is only the precondition.
//
// A train proves more than a dash. When at least `trainProofMin` dashes of one length follow at one
// pitch, two refusals made for a lone dash no longer hold (Leah, sizes 18 and 24):
//   - a rival with the same dash but a pen of SEVERAL draws (size 6: 3.75, 3, 1.75) cannot have
//     drawn a row of identical dashes, and the gap need not be one of the key's gaps: where the pen
//     has dots, the sheet often has none, so the gap between two dashes is any length up to the
//     pen's span from one draw to the next (size 24: key 3.75 / 3.5·1·1·1.5, sheet 3.57 / 4.93);
//   - a nest neighbour whose END sits beside a dash after the first two, with the train going on
//     past it, is where that neighbour's line breaks too, not a joint (the Reims joint is the first
//     dash after the host's end, or the last one of the train).
import type { Chain, PtMm } from 'lib/pattern-import/types';

import { dist, endTangent, PtGrid, SegGrid, segNearest } from '../chains/geom';

export const DASH_TRAIN = {
  /** A dash starts at most this far ahead of the end (or of the dash before it). */
  aheadMm: 12,
  lateralMm: 0.4,
  cosMin: 0.95,
  /** chord / length: a dash is straight. */
  straightMin: 0.9,
  minDashMm: 1,
  maxDashMm: 8,
  /** A size line shorter than this is not a host (its end may be a mark). */
  minHostMm: 8,
  lenTolRel: 0.06,
  lenTolAbs: 0.15,
  gapTolMm: 0.4,
  gapTolRel: 0.03,
  /** Gaps between the dashes of one train differ by at most this. */
  pitchSpreadMm: 0.6,
  maxTrain: 16,
  /** The far end of a lone dash meets another end of the rank within this. */
  closeMm: 6,
  /** An end with a line within this is already closed by the fill (`wallBridges`, 3 mm), not open. */
  landedMm: 3,
  /** A line this close to an end touches it, whatever its direction. */
  touchMm: 1,
  /** A lone dash proves nothing when it is a bead of the pen (draws under this are ticks / dots). */
  loneMinMm: 3,
  /** Dashes of one length at one pitch that prove the pen as a train (see the header). */
  trainProofMin: 3,
  /** A beside neighbour's end stops the train only while it holds fewer dashes than this. */
  besideEndAfter: 2,
};

/**
 * The draws (dashes, ≥ 1 mm) and the gaps of one pen's repeat, mm; `span` is the longest way from
 * the end of one draw to the start of the next (the gaps and dots between them).
 */
export type Rhythm = { draws: number[]; gaps: number[]; span?: number };

/** `[draw, gap, draw, gap, …]` as the signature carries it → what the rule compares with. */
export function rhythmOfMotif(motif: readonly number[] | null | undefined): Rhythm | null {
  if (!motif || motif.length < 2) return null;
  const draws: number[] = [];
  const gaps: number[] = [];
  for (let i = 0; i + 1 < motif.length; i += 2) {
    if (motif[i] >= DASH_TRAIN.minDashMm) draws.push(motif[i]);
    if (motif[i + 1] > 0.05) gaps.push(motif[i + 1]);
  }
  if (!draws.length || !gaps.length) return null;
  // walk the repeat twice (it is cyclic): the span from each draw's end to the next draw
  const n = motif.length - (motif.length % 2);
  let span = 0;
  let run = -1;
  for (let k = 0; k < 2 * n; k++) {
    const v = motif[k % n];
    if (k % 2 === 0 && v >= DASH_TRAIN.minDashMm) {
      if (run >= 0) span = Math.max(span, run);
      run = 0;
    } else if (run >= 0) run += v;
  }
  return { draws, gaps, span: span || Math.max(...gaps) };
}

/**
 * The rhythm of each rank, from the chains the drawing's key named (not from nesting): per rank
 * the repeat that most of its length is drawn in (rounded to 0.5 mm, so tile scale does not split
 * one pen into several).
 */
export function rankRhythms(
  ranked: Iterable<[chain: number, rank: number]>,
  keyed: (chain: number) => boolean,
  motifOf: (chain: number) => readonly number[] | null | undefined,
  lengthOf: (chain: number) => number,
): Map<number, Rhythm> {
  const byRank = new Map<number, Map<string, { len: number; motif: readonly number[] }>>();
  for (const [c, r] of ranked) {
    if (!keyed(c)) continue;
    const m = motifOf(c);
    if (!m || m.length < 2) continue;
    const key = m.map((v) => (Math.round(v * 2) / 2).toFixed(1)).join('/');
    let g = byRank.get(r);
    if (!g) byRank.set(r, (g = new Map()));
    const e = g.get(key);
    if (e) e.len += lengthOf(c);
    else g.set(key, { len: lengthOf(c), motif: m });
  }
  const out = new Map<number, Rhythm>();
  for (const [r, g] of byRank) {
    let best: { len: number; motif: readonly number[] } | null = null;
    for (const e of g.values()) if (!best || e.len > best.len) best = e;
    const rh = best ? rhythmOfMotif(best.motif) : null;
    if (rh) out.set(r, rh);
  }
  return out;
}

export type DashTrainInput = {
  chains: Chain[];
  /** chain → rank; the hosts are extended in place (like `bridgeSameRank`). */
  rankOf: ReadonlyMap<number, number>;
  rhythms: ReadonlyMap<number, Rhythm>;
  /** May this chain be taken in (not furniture, not a size line of its own)? */
  candidate: (chain: number) => boolean;
  /** `DT_DEBUG`: why each free end of a ranked line stops where it does. */
  debug?: (rank: number, line: string) => void;
};

/** Dashes taken into a size line: dash chain → host chain. The host's `pts` now run over them. */
export function adoptDashTrains(inp: DashTrainInput): Map<number, number> {
  const { chains, rankOf, rhythms, candidate, debug } = inp;
  const T = DASH_TRAIN;
  const adopted = new Map<number, number>();
  if (!rhythms.size) return adopted;

  const usable = (i: number) => {
    const c = chains[i];
    if (c.closed || c.pts.length < 2 || rankOf.has(i) || !candidate(i)) return false;
    if (c.lengthMm < T.minDashMm || c.lengthMm >= T.maxDashMm) return false;
    return dist(c.pts[0], c.pts[c.pts.length - 1]) >= T.straightMin * c.lengthMm;
  };
  const frags = new Set<number>();
  chains.forEach((_, i) => {
    if (usable(i)) frags.add(i);
  });
  if (!frags.size) return adopted;

  const endsOf = new PtGrid(T.aheadMm);
  for (const f of frags) {
    endsOf.add(f * 2, chains[f].pts[0]);
    endsOf.add(f * 2 + 1, chains[f].pts[chains[f].pts.length - 1]);
  }
  const walls = new SegGrid(4);
  // the geometry `walls` indexes: a host that runs over a train at its START gets new points in
  // front, so its `pts[si]` is no longer segment si — wall lookups read this, never `chains[o]`
  const wallPts = chains.map((c) => c.pts);
  chains.forEach((c, i) => {
    if (!frags.has(i) && c.lengthMm >= 3) walls.addPolyline(i, c.pts);
  });
  const hostEnds = new PtGrid(T.closeMm);
  for (const [c, r] of rankOf) {
    const ch = chains[c];
    if (!rhythms.has(r) || ch.closed || ch.lengthMm < T.minHostMm) continue;
    hostEnds.add(c * 2, ch.pts[0]);
    hostEnds.add(c * 2 + 1, ch.pts[ch.pts.length - 1]);
  }

  const fits = (r: number, len: number) =>
    rhythms.get(r)?.draws.some((d) => Math.abs(len - d) <= T.lenTolRel * d + T.lenTolAbs) ?? false;
  const gapIs = (r: number, g: number) =>
    rhythms.get(r)?.gaps.some((x) => Math.abs(g - x) <= T.gapTolMm + T.gapTolRel * x) ?? false;
  const gapMax = (r: number) => Math.max(...(rhythms.get(r)?.gaps ?? [0]));
  /** A pen with draws of different lengths (one of them does not fit `len`) cannot draw a row of
   *  identical `len` dashes. */
  const severalDraws = (k: number, len: number) =>
    rhythms.get(k)?.draws.some((d) => Math.abs(len - d) > T.lenTolRel * d + T.lenTolAbs) ?? false;
  const spanOf = (r: number) => {
    const rh = rhythms.get(r);
    return rh ? rh.span ?? Math.max(...rh.gaps) : 0;
  };
  /** Could a dash `len` long, `gap` after the end, be r's when a train proves it (see the header)? */
  const ownsAsTrain = (r: number, len: number, gap: number) =>
    fits(r, len) && gap <= spanOf(r) + T.gapTolMm + T.gapTolRel * spanOf(r);
  /** Does a dash `len` long, `gap` after the end, belong to the pen of rank r and to no rival's? */
  const owns = (r: number, len: number, gap: number) => {
    if (!fits(r, len) || gap > gapMax(r) + T.gapTolMm + T.gapTolRel * gapMax(r)) return false;
    const rivals = [...rhythms.keys()].filter((k) => k !== r && fits(k, len));
    return !rivals.length || (gapIs(r, gap) && !rivals.some((k) => gapIs(k, gap)));
  };
  /** Segment ab runs along t and sits more than `lateralMm` across the line of p: a nest neighbour. */
  const besideAlong = (p: PtMm, a: PtMm, b: PtMm, t: PtMm) => {
    const L = dist(a, b);
    if (L < 1e-9 || Math.abs(((b.x - a.x) * t.x + (b.y - a.y) * t.y) / L) < T.cosMin) return false;
    const { u } = segNearest(p, a, b);
    const qx = a.x + u * (b.x - a.x) - p.x;
    const qy = a.y + u * (b.y - a.y) - p.y;
    return Math.abs(qx * t.y - qy * t.x) > T.lateralMm;
  };
  /** Does p run into segment ab: does ab touch p, or cross the ray p + s·t (s ≤ landedMm)? */
  const runsInto = (p: PtMm, t: PtMm, a: PtMm, b: PtMm) => {
    const d = segNearest(p, a, b).d;
    if (d > T.landedMm) return false;
    if (d <= T.touchMm) return true;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const den = t.x * ey - t.y * ex;
    if (Math.abs(den) < 1e-9) return false;
    const s = ((a.x - p.x) * ey - (a.y - p.y) * ex) / den;
    const u = ((a.x - p.x) * t.y - (a.y - p.y) * t.x) / den;
    return s >= -0.3 && s <= T.landedMm && u >= 0 && u <= 1;
  };
  const endNear = (o: number, p: PtMm) => {
    const oc = chains[o].pts;
    return Math.min(dist(p, oc[0]), dist(p, oc[oc.length - 1])) <= T.landedMm;
  };
  /** Does dash f pass within `touchMm` of a line of rank r other than the host? */
  const touchesRank = (f: number, host: number, r: number) => {
    const fp = chains[f].pts;
    for (let i = 0; i + 1 < fp.length; i++) {
      const n = Math.max(1, Math.ceil(dist(fp[i], fp[i + 1]) / 0.25));
      for (let k = 0; k <= n; k++) {
        const s = {
          x: fp[i].x + ((fp[i + 1].x - fp[i].x) * k) / n,
          y: fp[i].y + ((fp[i + 1].y - fp[i].y) * k) / n,
        };
        let hit = false;
        walls.near(s, T.touchMm, (o, si) => {
          if (hit || o === host || o === f || rankOf.get(o) !== r) return;
          const op = wallPts[o];
          if (segNearest(s, op[si], op[si + 1]).d <= T.touchMm) hit = true;
        });
        if (hit) return true;
      }
    }
    return false;
  };
  /** Does the end p (heading t) already run into a line — is the fill's bridge there? */
  const landed = (p: PtMm, host: number, t: PtMm) => {
    let hit = false;
    walls.near(p, T.landedMm, (o, si) => {
      if (hit || o === host) return;
      const a = wallPts[o][si];
      const b = wallPts[o][si + 1];
      if (!besideAlong(p, a, b, t) && runsInto(p, t, a, b)) hit = true;
    });
    return hit;
  };

  /**
   * Does a dash end p (on a line heading ±t) meet a line of another size? 'into' — it runs into
   * that line or its end; 'beside-end' — only a nest neighbour's end sits beside it.
   */
  let intoBy = '';
  const nearOtherRank = (p: PtMm, r: number, t: PtMm): 'into' | 'beside-end' | null => {
    const back = { x: -t.x, y: -t.y };
    let hit: 'into' | 'beside-end' | null = null;
    walls.near(p, T.landedMm, (o, si) => {
      if (hit === 'into') return;
      const ro = rankOf.get(o);
      if (ro === undefined || ro === r) return;
      const a = wallPts[o][si];
      const b = wallPts[o][si + 1];
      if (segNearest(p, a, b).d > T.landedMm) return;
      if (besideAlong(p, a, b, t)) {
        if (endNear(o, p)) hit = 'beside-end';
        return;
      }
      const ends = endNear(o, p);
      if (!ends && !runsInto(p, t, a, b) && !runsInto(p, back, a, b)) return;
      const cos = Math.abs(((b.x - a.x) * t.x + (b.y - a.y) * t.y) / (dist(a, b) || 1));
      hit = 'into';
      intoBy = `${ro} (line ${o}, ${((Math.acos(Math.min(1, cos)) * 180) / Math.PI).toFixed(0)}°${ends ? ', its end' : ''})`;
    });
    return hit;
  };
  /** Does the way p → q cross another line (not the host)? An end that meets a line is landed. */
  const crosses = (p: PtMm, q: PtMm, host: number) => {
    let hit = false;
    const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
    walls.near(mid, dist(p, q) / 2 + 1, (o, si) => {
      if (hit || o === host) return;
      const a = wallPts[o][si];
      const b = wallPts[o][si + 1];
      const d1x = q.x - p.x;
      const d1y = q.y - p.y;
      const d2x = b.x - a.x;
      const d2y = b.y - a.y;
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-12) return;
      const u = ((a.x - p.x) * d2y - (a.y - p.y) * d2x) / den;
      const v = ((a.x - p.x) * d1y - (a.y - p.y) * d1x) / den;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) hit = true;
    });
    return hit;
  };

  /** ≥ `trainProofMin` dashes of one length (r's draw) at one pitch, and no rival with a pen of
   *  one draw of that length whose gap is this pitch. */
  const trainProves = (r: number, train: readonly { f: number; gap: number }[]) => {
    if (train.length < T.trainProofMin) return false;
    const lens = train.map((d) => chains[d.f].lengthMm);
    const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
    const tol = T.lenTolRel * mean + T.lenTolAbs;
    if (Math.max(...lens) - Math.min(...lens) > tol || !fits(r, mean)) return false;
    const pitch = train.slice(1).reduce((a, d) => a + d.gap, 0) / (train.length - 1);
    return ![...rhythms.keys()].some(
      (k) =>
        k !== r && fits(k, mean) && !severalDraws(k, mean) && gapIs(k, pitch) && !gapIs(r, pitch),
    );
  };

  for (const [host, r] of rankOf) {
    if (!rhythms.has(r) || adopted.has(host)) continue;
    for (const end of [0, 1] as const) {
      const hc = chains[host];
      if (hc.closed || hc.lengthMm < T.minHostMm) continue;
      let t = endTangent(hc.pts, end, 5);
      if (!t) continue;
      let p = end ? hc.pts[hc.pts.length - 1] : hc.pts[0];
      const where = `host ${host} end ${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      if (landed(p, host, t)) continue;
      let why = 'nothing ahead';
      const train: {
        f: number;
        from: PtMm;
        to: PtMm;
        gap: number;
        byTrain: boolean;
        besideEnd: boolean;
      }[] = [];
      while (train.length < T.maxTrain) {
        let best: { f: number; e: number; al: number } | null = null;
        endsOf.near(p, T.aheadMm, (id) => {
          const f = id >> 1;
          const e = id & 1;
          if (adopted.has(f) || train.some((x) => x.f === f)) return;
          const q = e ? chains[f].pts[chains[f].pts.length - 1] : chains[f].pts[0];
          const far = e ? chains[f].pts[0] : chains[f].pts[chains[f].pts.length - 1];
          const dx = q.x - p.x;
          const dy = q.y - p.y;
          const al = dx * t!.x + dy * t!.y;
          if (al < -0.3 || al > T.aheadMm || Math.abs(dx * t!.y - dy * t!.x) > T.lateralMm) return;
          const L = dist(q, far) || 1;
          if (((far.x - q.x) * t!.x + (far.y - q.y) * t!.y) / L < T.cosMin) return;
          if (!best || al < best.al) best = { f, e, al };
        });
        if (!best) break;
        const { f, e, al } = best as { f: number; e: number; al: number };
        why = `#${f} ${chains[f].lengthMm.toFixed(2)} mm, gap ${al.toFixed(2)}: `;
        // a dash the rule for one dash refuses may still be r's as part of a proven train
        let byTrain = false;
        if (!owns(r, chains[f].lengthMm, Math.max(0, al))) {
          if (!ownsAsTrain(r, chains[f].lengthMm, Math.max(0, al))) {
            why += 'not the pen';
            break;
          }
          byTrain = true;
        }
        const startPt = chains[f].pts[e ? chains[f].pts.length - 1 : 0];
        if (crosses(p, startPt, host)) {
          why += 'crosses a line';
          break;
        }
        const farPt = chains[f].pts[e ? 0 : chains[f].pts.length - 1];
        const other = [nearOtherRank(startPt, r, t), nearOtherRank(farPt, r, t)];
        if (other.includes('into')) {
          why += `runs into rank ${intoBy}`;
          break;
        }
        const besideEnd = other.includes('beside-end');
        if (besideEnd) {
          if (train.length < T.besideEndAfter) {
            why += 'another size ends beside it';
            break;
          }
          byTrain = true;
        }
        const fp = chains[f].pts;
        const from = e ? fp[fp.length - 1] : fp[0];
        const to = e ? fp[0] : fp[fp.length - 1];
        // the dashes of one train keep one pitch: the gaps after the first differ by little
        const gap = Math.max(0, al);
        if (train.length >= 2 && Math.abs(gap - train[1].gap) > T.pitchSpreadMm) {
          why += 'off the pitch';
          break;
        }
        train.push({ f, from, to, gap, byTrain, besideEnd });
        const L = dist(from, to) || 1;
        t = { x: (to.x - from.x) / L, y: (to.y - from.y) / L };
        p = to;
      }
      // dashes taken on the train's evidence stay only when the train proves the pen: enough
      // dashes of one length, and no rival that draws such a row at this pitch; else cut the
      // train before the first of them
      // a train that ENDS at a neighbour's end runs up to a joint (Reims): it ends before that dash
      while (train.length && train[train.length - 1].besideEnd) train.pop();
      const firstByTrain = train.findIndex((d) => d.byTrain);
      if (firstByTrain >= 0 && !trainProves(r, train)) {
        why = `train of ${train.length} does not prove the pen; ` + why;
        train.length = firstByTrain;
      }
      debug?.(r, `${where}: ${train.length} taken, stop ${why}`);
      if (!train.length) continue;
      // one dash alone proves nothing, unless it closes a hole between two lines of the rank.
      // The hole must lie AHEAD of the dash: an end beside it is a line coming onto the host's
      // side at a corner, and running the host past it turns a corner the fill closed into a T
      // (Memoir A, Pickleball).
      if (train.length < 2) {
        if (chains[train[0].f].lengthMm < T.loneMinMm) continue;
        let closes = false;
        const tt = t;
        hostEnds.near(p, T.closeMm, (id) => {
          const o = id >> 1;
          if (o === host || rankOf.get(o) !== r) return;
          const oc = chains[o];
          const q = id & 1 ? oc.pts[oc.pts.length - 1] : oc.pts[0];
          const d = dist(p, q);
          if (d > T.closeMm) return;
          if (d <= T.touchMm || ((q.x - p.x) * tt.x + (q.y - p.y) * tt.y) / d >= T.cosMin) {
            closes = true;
          }
        });
        // ...or when the dash reaches the rank's other line itself: it passes within `touchMm` of
        // its body, a T-join (Leah: the partner's pen ran to the dash and doubled back, so its END
        // sits beside, but the hole is gone).
        if (!closes) closes = touchesRank(train[0].f, host, r);
        if (!closes) {
          debug?.(r, `${where}: lone dash closes no hole`);
          continue;
        }
      }
      // the host runs over the dashes
      const add: PtMm[] = [];
      let extra = 0;
      let at = end ? hc.pts[hc.pts.length - 1] : hc.pts[0];
      const ranges = [];
      for (const d of train) {
        const fc = chains[d.f];
        const fwd = dist(fc.pts[0], d.from) <= dist(fc.pts[fc.pts.length - 1], d.from);
        add.push(...(fwd ? fc.pts : fc.pts.slice().reverse()));
        extra += dist(at, d.from) + fc.lengthMm;
        at = d.to;
        ranges.push(...fc.ranges);
        adopted.set(d.f, host);
      }
      chains[host] = {
        ...hc,
        pts: end ? hc.pts.concat(add) : add.reverse().concat(hc.pts),
        lengthMm: hc.lengthMm + extra,
        ranges: end ? hc.ranges.concat(ranges) : ranges.concat(hc.ranges),
      };
    }
  }
  return adopted;
}
