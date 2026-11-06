// The neck as it is finished at the collar's step, read from the stored rows and not from notches:
// a fold that crosses the walk turns the stretch beyond its crease back onto the neck, a pleat fan
// closes the stretch between its two legs. Pure geometry on the walk as cut; doll.ts wires it in.
// Universal: lines and arcs only, no piece names. Nothing here scales a length.

import type { Pt2 } from 'lib/assembly-skeleton/types';
import { findPleatFans, pleatSideOf, type PleatLineLike } from 'lib/folds/pleat';

import type { Path, SeamRows } from './solve';

/** A fold line as cut, mm, the piece's own frame. */
export type NeckLine = { a: Pt2; b: Pt2 };

/** A pleat row as cut, mm: its line, its kind and the point that says which way it lies. */
export type NeckPleatLine = NeckLine & { kind: string; flipAt: Pt2 };

/** What a piece's rows do to a walk: the folds applied, the pleat rows as cut, mm. */
export type NeckRows = { turns: readonly NeckLine[]; pleatLines: readonly NeckPleatLine[] };

type FanLine = PleatLineLike & { kind: string; flipAt: Pt2 };

/** A stored pleat fan the walk crosses, leg to leg. */
export type NeckPleat = {
  panel: number;
  /** Arcs of the walk where the two legs cross it, ascending, and where the centre line does. */
  f0: number;
  f1: number;
  centre: number;
  /** Which arcs the closed intake lies over: past f1 (+1), before f0 (−1), its own (0, even). */
  lay: -1 | 0 | 1;
};

/** A vertex walk: its panel, the vertex as cut in its own piece, its arc along the walk. */
export type NeckWalk = {
  panel: readonly number[];
  cut: readonly Pt2[];
  s: readonly number[];
};

type Run = { i0: number; i1: number; s0: number; s1: number; panel: number };
type Crease = { s: number; run: number; atEnd: boolean };

export type NeckReading = {
  /** Length of the walk as cut, mm. */
  cutMm: number;
  /** Arc ranges a stored pleat closes (leg to leg), ascending. */
  closed: [number, number][];
  /** The pleats behind `closed`, same order. */
  pleats: NeckPleat[];
  /** The finished neck runs between these arcs; beyond them the stretch is turned back. */
  from: number;
  to: number;
  /** The finished length: to − from, less what the pleats close. */
  finishedMm: number;
  /** Creases on the walk with no walk end on their short side: read, not taken off. */
  unread: number[];
};

const runsOf = (w: NeckWalk): Run[] => {
  const runs: Run[] = [];
  for (let k = 0; k < w.panel.length; k++) {
    const last = runs[runs.length - 1];
    if (last && last.panel === w.panel[k]) {
      last.i1 = k;
      last.s1 = w.s[k];
    } else runs.push({ i0: k, i1: k, s0: w.s[k], s1: w.s[k], panel: w.panel[k] });
  }
  return runs;
};

/** Where a line crosses one run of the walk, by arc; `keep` narrows the crossing points. */
function crossings(w: NeckWalk, run: Run, l: NeckLine, keep?: (at: Pt2) => boolean): number[] {
  const dx = l.b[0] - l.a[0];
  const dy = l.b[1] - l.a[1];
  const side = (q: Pt2) => dx * (q[1] - l.a[1]) - dy * (q[0] - l.a[0]);
  const out: number[] = [];
  for (let k = run.i0; k < run.i1; k++) {
    const sp = side(w.cut[k]);
    const sq = side(w.cut[k + 1]);
    if (sp > 0 === sq > 0) continue;
    const t = sp / (sp - sq);
    const p = w.cut[k];
    const q = w.cut[k + 1];
    if (keep && !keep([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])) continue;
    out.push(w.s[k] + (w.s[k + 1] - w.s[k]) * t);
  }
  return out;
}

const pleatsOn = (w: NeckWalk, run: Run, lines: readonly NeckPleatLine[]): NeckPleat[] => {
  const fans = findPleatFans(
    lines.map((l): FanLine => ({ line: [l.a, l.b], kind: l.kind, flipAt: l.flipAt })),
  );
  const out: NeckPleat[] = [];
  for (const fan of fans) {
    // A leg only above its apex: the line runs on past the apex, as a line, not as the leg.
    const onLeg = (leg: FanLine) => {
      const far = fan.far.get(leg)!;
      const ray: Pt2 = [far[0] - fan.apex[0], far[1] - fan.apex[1]];
      return crossings(w, run, { a: leg.line[0], b: leg.line[1] }, (at) => {
        return (at[0] - fan.apex[0]) * ray[0] + (at[1] - fan.apex[1]) * ray[1] > 0;
      });
    };
    const neg = onLeg(fan.negative);
    const pos = onLeg(fan.positive);
    if (neg.length !== 1 || pos.length !== 1) continue;
    const mid = onLeg(fan.centre);
    const hidden = fan.centre.kind === 'pleat' ? 0 : pleatSideOf(fan, fan.centre.flipAt);
    const f0 = Math.min(neg[0], pos[0]);
    const f1 = Math.max(neg[0], pos[0]);
    out.push({
      panel: run.panel,
      f0,
      f1,
      centre: mid.length === 1 ? mid[0] : (f0 + f1) / 2,
      lay: hidden === 0 ? 0 : hidden > 0 === pos[0] > neg[0] ? 1 : -1,
    });
  }
  return out;
};

const creasesOn = (
  w: NeckWalk,
  runs: readonly Run[],
  rowsOf: (panel: number) => NeckRows | undefined,
): Crease[] => {
  const out: Crease[] = [];
  runs.forEach((run, r) => {
    for (const l of rowsOf(run.panel)?.turns ?? [])
      for (const s of crossings(w, run, l)) out.push({ s, run: r, atEnd: run.s1 - s < s - run.s0 });
  });
  return out;
};

/**
 * Where to open a walk that goes round the neck as a ring: the junction of two runs whose creases
 * stand on either side of it (the front edges meeting at the centre), as a vertex index. A ring
 * opens across from its centre back (`backAt`, an arc): a walk already open at the front only has
 * its shoulders to offer, and those stay shut. Zero when no stored fold says otherwise.
 */
export function openWalkAt(
  w: NeckWalk,
  rowsOf: (panel: number) => NeckRows | undefined,
  backAt: number,
): number {
  const runs = runsOf(w);
  const creases = creasesOn(w, runs, rowsOf);
  const endOf = (r: number) => creases.some((c) => c.run === r && c.atEnd);
  const startOf = (r: number) => creases.some((c) => c.run === r && !c.atEnd);
  if (startOf(0) && endOf(runs.length - 1)) return 0;
  const L = w.s[w.s.length - 1];
  const across = (s: number) => {
    const d = Math.abs(s - backAt);
    return Math.min(d, L - d) >= 0.3 * L;
  };
  let one = 0;
  for (let r = 0; r + 1 < runs.length; r++) {
    if (!across(runs[r + 1].s0)) continue;
    const a = endOf(r);
    const b = startOf(r + 1);
    if (a && b) return runs[r + 1].i0;
    if ((a || b) && !one) one = runs[r + 1].i0;
  }
  return one;
}

/** The walk as finished, or null when no stored row touches it (the notches read it, as ever). */
export function readFinishedNeck(
  w: NeckWalk,
  rowsOf: (panel: number) => NeckRows | undefined,
): NeckReading | null {
  const runs = runsOf(w);
  if (!runs.length) return null;
  const cutMm = w.s[w.s.length - 1];
  let from = 0;
  let to = cutMm;
  const unread: number[] = [];
  const last = runs.length - 1;
  const creases = creasesOn(w, runs, rowsOf);
  for (const c of creases) {
    // Only a stretch with a walk end on the crease's short side folds off the neck; what goes on
    // to another piece past the crease cannot be taken off by one line.
    if (!c.atEnd && c.run === 0) from = Math.max(from, c.s);
    else if (c.atEnd && c.run === last) to = Math.min(to, c.s);
    else unread.push(c.s);
  }
  const pleats: NeckPleat[] = [];
  for (const run of runs) {
    const lines = rowsOf(run.panel)?.pleatLines ?? [];
    if (lines.length >= 3) pleats.push(...pleatsOn(w, run, lines));
  }
  pleats.sort((x, y) => x.f0 - y.f0);
  const closed = pleats.map((p): [number, number] => [p.f0, p.f1]);
  if (!closed.length && !creases.length) return null;
  const finishedMm = to - from - closed.reduce((t, c) => t + c[1] - c[0], 0);
  return { cutMm, closed, pleats, from, to, finishedMm, unread };
}

/** The finished neck's arc for an arc as cut: a closed range collapses to one point. */
export const finishedArc = (r: NeckReading, s: number): number => {
  const c = Math.max(r.from, Math.min(r.to, s));
  let out = c - r.from;
  for (const [f0, f1] of r.closed) {
    if (c >= f1) out -= f1 - f0;
    else if (c > f0) out -= c - f0;
  }
  return out;
};

/**
 * Unit arc ↔ neck arc, anchors as `makeMap` and `anchoredRows` take them: the unit's run onto the
 * finished neck, its centre onto the neck's centre, one step over each closed pleat. Slope 1 where
 * the lengths agree; the unit is never scaled beyond what the two lengths themselves say.
 */
export function finishedAnchors(
  r: NeckReading,
  unit: { len: number; cb: number },
  neckCb: number,
): [number, number][] {
  const asCut = (e: number) => {
    let s = e + r.from;
    for (const [f0, f1] of r.closed) if (s >= f0) s += f1 - f0;
    return s;
  };
  const cbE = finishedArc(r, neckCb);
  const key: [number, number][] = [[0, 0]];
  if (unit.cb > 5 && unit.cb < unit.len - 5 && cbE > 5 && cbE < r.finishedMm - 5)
    key.push([unit.cb, cbE]);
  key.push([unit.len, r.finishedMm]);
  const xOfE = (e: number) => {
    let i = 0;
    while (i < key.length - 2 && key[i + 1][1] < e) i++;
    const [x0, e0] = key[i];
    const [x1, e1] = key[i + 1];
    return x0 + ((x1 - x0) * (e - e0)) / Math.max(1e-9, e1 - e0);
  };
  const steps = r.closed.map(([f0, f1]) => ({ x: xOfE(finishedArc(r, f0)), f0, f1 }));
  const out: [number, number][] = key
    .filter(([x]) => !steps.some((f) => Math.abs(x - f.x) <= 1))
    .map(([x, e]) => [x, x === 0 ? r.from : x === unit.len ? r.to : asCut(e)]);
  for (const f of steps) out.push([f.x - 0.3, f.f0], [f.x + 0.3, f.f1]);
  return out.sort((x, y) => x[0] - y[0]);
}

/** Where a closed pleat's intake lies on the walk: the arc of the stretch it covers. */
export const laidArc = (p: NeckPleat, s: number): number => {
  if (p.lay > 0) return s < p.centre ? p.f1 + (s - p.f0) : p.f1 + (p.f1 - s);
  return s < p.centre ? p.f0 - (s - p.f0) : p.f0 - (p.f1 - s);
};

/**
 * The seam's rows: unit and finished neck vertex by vertex, every ply of a turned stretch stitched
 * where it lies (over the crease, onto the stretch it covers). Inside a closed pleat nothing runs
 * along the seam: its two legs meet and the rest hangs in the fold.
 */
export function finishedRows(
  A: Path,
  B: Path,
  r: NeckReading,
  anchors: readonly [number, number][],
): SeamRows {
  const rows: SeamRows = { v: [], b0: [], b1: [], w: [] };
  const locate = (P: Path, s0: number) => {
    const s = Math.max(0, Math.min(P.len, s0));
    let lo = 0;
    let hi = P.v.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (P.s[m] <= s) lo = m;
      else hi = m;
    }
    const d = P.s[hi] - P.s[lo];
    return { i0: P.v[lo], i1: P.v[hi], w: d > 1e-9 ? (s - P.s[lo]) / d : 0 };
  };
  const push = (v: number, t: ReturnType<typeof locate>) => {
    if (v === t.i0 || v === t.i1) return;
    rows.v.push(v);
    rows.b0.push(t.i0);
    rows.b1.push(t.i1);
    rows.w.push(t.w);
  };
  const map = (x: number, from: 0 | 1) => {
    const to = 1 - from;
    let i = 0;
    while (i < anchors.length - 2 && anchors[i + 1][from] < x) i++;
    const a = anchors[i];
    const b = anchors[i + 1];
    return a[to] + ((b[to] - a[to]) * (x - a[from])) / Math.max(1e-9, b[from] - a[from]);
  };
  const inside = (s: number) => r.closed.find(([f0, f1]) => s > f0 + 1e-6 && s < f1 - 1e-6);
  const pleatAt = (s: number) => r.pleats.find((p) => s > p.f0 + 1e-6 && s < p.f1 - 1e-6);
  for (let k = 0; k < A.v.length; k++) {
    const s = map(Math.max(anchors[0][0], Math.min(anchors[anchors.length - 1][0], A.s[k])), 0);
    const pleat = inside(s);
    // The unit's vertex on the fold itself takes the nearer leg: the two legs meet there.
    push(A.v[k], locate(B, pleat ? (s - pleat[0] < pleat[1] - s ? pleat[0] : pleat[1]) : s));
  }
  for (let k = 0; k < B.v.length; k++) {
    const s = B.s[k];
    // Past the crease: mirrored over it, onto the stretch this ply lies on.
    const on = s < r.from ? 2 * r.from - s : s > r.to ? 2 * r.to - s : s;
    if (on < r.from || on > r.to) continue;
    const pl = pleatAt(on);
    if (pl && !pl.lay) continue;
    push(B.v[k], locate(A, map(pl ? laidArc(pl, on) : on, 1)));
  }
  return rows;
}
