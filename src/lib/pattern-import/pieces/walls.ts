// pieces/ (F4) — which chains are walls for size rank r.
//
//   graded   walls(r) = common chains + the chains of size rank r (F3 classes, SizeRun order).
//            A rank whose line is missing locally makes its fill LEAK — never borrow a
//            neighbour's line silently. The only repair is the inner plug (pass B): + every chain
//            of the smaller ranks. Inner lines are invisible to the exterior flood wherever rank r
//            is drawn, and where rank r is not drawn because it coincides with a smaller size's
//            line, that line IS rank r's edge. Candidates closed this way say so (rankFrom).
//   single   one size (BLAZER M, or no class carries a chain): every line that is not page
//            furniture or a notch is a wall; the outer fill takes the outermost (the cut line).
//   file     file-per-size: rank r = the chains of file r (+ common); seeds move with the file.
import type { ChainId, ChainSet, IRText, LineClass, PtMm, SizeRun } from 'lib/pattern-import/types';

import { bboxOf, dist, SegGrid, segIntersect, segNearest } from './geom';
import type { WallItem } from './snap';

export type WallMode = 'graded' | 'single' | 'file';

export type WallModel = {
  mode: WallMode;
  /** Size count (1 for single). */
  n: number;
  common: ChainId[];
  /** byRank[r] = the chains of rank r. */
  byRank: ChainId[][];
  /** Ranks with no chain at all (F3 size-empty). */
  emptyRanks: number[];
  /** Chains of every size line + orphans — the local nesting fallback peels these. */
  graded: ChainId[];
  /** file mode: rank → FileId of that size's file. */
  fileOfRank: (string | null)[];
  /** Shared straight edges (fold lines) promoted to walls of every rank — also in `common`. */
  folds?: ChainId[];
  /** Closed loops ranked as one piece drawn once per size, and band ticks (never lone). */
  loopFamily?: Set<ChainId>;
  /** Band ladders: tick → rank (bandTicks). */
  bandTicks?: Map<ChainId, number>;
  /** The long edges of band ladders, walls of every rank (also in `common`). */
  bandEdges?: Set<ChainId>;
  /** Band rungs carried across the band (derived 'band-cut' walls of their rank). */
  bandCuts?: { rank: number; from: PtMm; to: PtMm; ticks: ChainId[] }[];
  /** Rank by continuity: chains moved to their outline's rank, and undecided components. */
  relinked?: { moved: number; conflicts: ChainId[]; labelled?: number };
};

/**
 * FOLD EDGES and other shared straight edges: a straight line (≥ 40 mm, ≤ 0.5 mm off its chord) on
 * which the lines of ≥ 3 different size ranks END is an edge every one of those sizes uses (reef
 * draws "cut 1 on fold" edges once per few sizes, in one size's dash, and the bottom and neck lines
 * of all nine sizes stop on them, across it, inside its length). Whatever F3 called it (a size, a dashed guide, an orphan), it
 * is a wall of every rank. Grain lines, guides and page rules have no size lines ending on them.
 */
export function sharedFolds(
  set: ChainSet,
  byRank: ChainId[][],
  common: ReadonlySet<ChainId>,
): ChainId[] {
  const rankOfChain = new Map<ChainId, number>();
  byRank.forEach((ids, r) => ids.forEach((id) => rankOfChain.set(id, r)));
  const cand: ChainId[] = [];
  for (const c of set.chains) {
    if (common.has(c.id) || c.closed || c.pts.length < 2 || c.lengthMm < 40) continue;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const L = dist(a, b);
    if (L < 40 || c.lengthMm > L * 1.01) continue;
    let dev = 0;
    for (const p of c.pts) dev = Math.max(dev, segNearest(p, a, b).d);
    if (dev <= 0.5) cand.push(c.id);
  }
  if (!cand.length) return [];
  const grid = new SegGrid(4);
  for (const id of cand) {
    const c = set.chains[id];
    grid.addPolyline(id, [c.pts[0], c.pts[c.pts.length - 1]]);
  }
  const ranksOn = new Map<ChainId, Set<number>>();
  for (const [id, r] of rankOfChain) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    const n = c.pts.length;
    for (const [p, inner] of [
      [c.pts[0], c.pts[Math.min(n - 1, 1)]],
      [c.pts[n - 1], c.pts[Math.max(0, n - 2)]],
    ] as [PtMm, PtMm][])
      grid.near(p, 1, (o) => {
        if (o === id || rankOfChain.get(o) === r) return;
        const q = set.chains[o].pts;
        const a = q[0];
        const b = q[q.length - 1];
        const h = segNearest(p, a, b);
        if (h.d > 1) return;
        // a T-landing: inside the edge (not at its ends) and across it (≥ 30°), not a collinear
        // overlap of nested straight hems
        const L = dist(a, b);
        if (h.u * L < 2 || (1 - h.u) * L < 2) return;
        const ex = p.x - inner.x;
        const ey = p.y - inner.y;
        const el = Math.hypot(ex, ey);
        if (el < 1e-6) return;
        const sin = Math.abs(ex * (b.y - a.y) - ey * (b.x - a.x)) / (el * L);
        if (sin < 0.5) return;
        let s = ranksOn.get(o);
        if (!s) ranksOn.set(o, (s = new Set()));
        s.add(r);
      });
  }
  // an edge is a BOUNDARY: size lines end on it from one side and none runs on across it (viola's
  // dashed "lengthen here" line has graded lines ending on it AND crossing it — not a fold)
  const sizeGrid = new SegGrid(8);
  const sized = [...rankOfChain.keys(), ...set.orphans].filter(
    (id) => set.chains[id] && set.chains[id].pts.length >= 2,
  );
  for (const id of sized) sizeGrid.addPolyline(id, set.chains[id].pts);
  const crossed = (id: ChainId) => {
    const c = set.chains[id];
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const L = dist(a, b);
    const seen = new Set<ChainId>();
    for (let t = 0; t <= L; t += 4)
      sizeGrid.near(
        { x: a.x + ((b.x - a.x) * t) / L, y: a.y + ((b.y - a.y) * t) / L },
        4,
        (o, sIdx) => {
          if (o === id || seen.has(o)) return;
          const q = set.chains[o].pts;
          const x = segIntersect(a, b, q[sIdx], q[sIdx + 1]);
          if (!x || x.t < 0.01 || x.t > 0.99) return;
          if (dist(x.p, q[0]) >= 2 && dist(x.p, q[q.length - 1]) >= 2) seen.add(o);
        },
      );
    return seen.size >= 2;
  };
  return cand.filter((id) => (ranksOn.get(id)?.size ?? 0) >= 3 && !crossed(id));
}

/**
 * Probe switches (node only; the browser worker has no `process`): F4_NOLABEL, F4_NOCONNECT,
 * F4_NOBANDS, F4_NOFOLDS turn one F4b repair off — the acceptance probe's negative controls compare
 * every family with and without them.
 */
function probeOff(k: string): boolean {
  return typeof process !== 'undefined' && !!process.env?.[k];
}

export function rankOf(c: LineClass): number | null {
  if (c.role !== 'size') return null;
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
}

export function wallModel(set: ChainSet, run: SizeRun, texts: readonly IRText[] = []): WallModel {
  const byId = new Map(set.classes.map((c) => [c.id, c]));
  const sizeClasses = set.classes.filter((c) => c.role === 'size');
  const common = set.classes.filter((c) => c.role === 'common').flatMap((c) => c.chains);
  const n = Math.max(1, run.sizes.length);
  const byRank: ChainId[][] = Array.from({ length: n }, () => []);
  const fileOfRank: (string | null)[] = Array.from({ length: n }, () => null);
  run.sizes.forEach((s, r) => {
    const c = s.classId != null ? byId.get(s.classId) : undefined;
    if (c && c.role === 'size') byRank[r] = c.chains.slice();
    const fe = c?.evidence.find((e) => e.kind === 'file');
    fileOfRank[r] = s.file ?? (fe && fe.kind === 'file' ? fe.file : null);
  });
  const sizeChains = byRank.reduce((a, b) => a + b.length, 0);
  const graded = [...new Set([...sizeClasses.flatMap((c) => c.chains), ...set.orphans])];
  if (run.encoding === 'single' || n === 1 || sizeChains === 0) {
    const skip = new Set(
      set.classes.filter((c) => c.role === 'ignore' || c.role === 'notch').flatMap((c) => c.chains),
    );
    const all = set.chains.filter((c) => !skip.has(c.id)).map((c) => c.id);
    return {
      mode: 'single',
      n: 1,
      common: all,
      byRank: [[]],
      emptyRanks: [],
      graded: [],
      fileOfRank: [run.sizes[0]?.file ?? null],
    };
  }
  const mode: WallMode = run.encoding === 'file-per-size' ? 'file' : 'graded';
  const base: WallModel = {
    mode,
    n,
    common,
    byRank,
    emptyRanks: [],
    graded,
    fileOfRank,
  };
  // orphans with their size printed beside them (r4454's band: one end tick per size, "44" … "54"
  // next to each) take that size
  const labelled =
    mode === 'graded' && !probeOff('F4_NOLABEL')
      ? labelRanks(set, run, texts)
      : new Map<ChainId, number>();
  for (const [id, r] of labelled) byRank[r].push(id);
  const cr = mode === 'graded' && !probeOff('F4_NOCONNECT') ? connectRanks(set, base) : null;
  const ranks = cr ? cr.byRank : byRank;
  // band ladders: their ticks are size ends (rank by order), never shared walls
  const notchIds = new Set(
    set.classes
      .filter((c) => c.role === 'notch' || c.role === 'ignore' || c.role === 'internal')
      .flatMap((c) => c.chains),
  );
  const band =
    mode === 'graded' && !probeOff('F4_NOBANDS')
      ? bandTicks(
          set,
          n,
          notchIds,
          new Map(ranks.flatMap((ids, r) => ids.map((id) => [id, r] as [ChainId, number]))),
        )
      : { ticks: new Map<ChainId, number>(), edges: new Set<ChainId>(), cuts: [] };
  const bands = band.ticks;
  for (const [id, r] of bands) {
    ranks.forEach((ids, k) => {
      if (k !== r && ids.includes(id)) ranks[k] = ids.filter((x) => x !== id);
    });
    if (!ranks[r].includes(id)) ranks[r].push(id);
  }
  const uncommon = new Set([...(cr?.uncommon ?? []), ...bands.keys()]);
  const kept0 = uncommon.size ? common.filter((id) => !uncommon.has(id)) : common;
  const kept = [...kept0, ...[...band.edges].filter((id) => !kept0.includes(id))];
  const folds =
    mode === 'graded' && !probeOff('F4_NOFOLDS') ? sharedFolds(set, ranks, new Set(kept)) : [];
  return {
    mode,
    n,
    common: [...kept, ...folds],
    folds,
    relinked: cr
      ? { moved: cr.moved, conflicts: cr.conflicts, labelled: labelled.size }
      : undefined,
    byRank: ranks,
    emptyRanks: ranks.map((b, r) => (b.length ? -1 : r)).filter((r) => r >= 0),
    // chains ranked here (continuity, labels, nesting) are size lines too
    graded: [...new Set([...graded, ...ranks.flat()])],
    loopFamily: new Set([...(cr?.loopFamily ?? []), ...bands.keys()]),
    bandTicks: bands.size ? bands : undefined,
    bandEdges: band.edges.size ? band.edges : undefined,
    bandCuts: band.cuts.length ? band.cuts : undefined,
    fileOfRank,
  };
}

export function itemsOf(set: ChainSet, ids: Iterable<ChainId>): WallItem[] {
  const out: WallItem[] = [];
  for (const id of ids) {
    const c = set.chains[id];
    // a loop drawn as an open chain whose ends meet is closed for snapping (a run may cross its seam)
    if (c && c.pts.length >= 2)
      out.push({
        chain: c.id,
        pts: c.pts,
        closed: c.closed || (c.pts.length > 3 && dist(c.pts[0], c.pts[c.pts.length - 1]) < 0.5),
      });
  }
  return out;
}

/**
 * LONE stretches of size lines: where a size line has no line of ANOTHER size beside it, every size
 * coincides there and it is drawn once, in one size's style (Burda draws a shared edge in the
 * largest size's rhythm). Such a stretch is a wall for every rank. "Beside" = a different-rank (or
 * unranked) size line within `sideMm`, roughly parallel, whose perpendicular foot lands inside it —
 * not on its end: just before a fork the diverging lines start at the fork point, so the shared
 * stretch up to the fork stays lone and the walls close there.
 */
export function lonePortions(set: ChainSet, m: WallModel, sideMm = 20): WallItem[] {
  if (m.mode === 'single') return [];
  const rank = new Map<ChainId, number>();
  m.byRank.forEach((ids, r) => ids.forEach((id) => rank.set(id, r)));
  const ids = m.graded.filter((id) => set.chains[id] && set.chains[id].pts.length >= 2);
  const grid = new SegGrid(8);
  for (const id of ids) grid.addPolyline(id, set.chains[id].pts);
  const out: WallItem[] = [];
  const step = 2;
  for (const id of ids) {
    const c = set.chains[id];
    const rc = rank.get(id) ?? -1;
    const pts = c.pts;
    // samples with their tangent and arc position
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const L = cum[cum.length - 1];
    if (L < 3) continue;
    // a closed outline of a one-loop-per-size family is that size's whole edge — nothing in it is
    // shared (a band drawn once per size: its end tick is 25 mm from the next size's, not
    // "beside" it, yet it is no other size's wall)
    if (m.loopFamily?.has(id)) continue;
    const lone: boolean[] = [];
    const at: number[] = [];
    let seg = 0;
    for (let s = 0; s <= L + 1e-9; s += step) {
      while (seg + 2 < pts.length && cum[seg + 1] < s) seg++;
      const a = pts[seg];
      const b = pts[seg + 1];
      const l = cum[seg + 1] - cum[seg] || 1;
      const u = (s - cum[seg]) / l;
      const p = { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
      const tx = (b.x - a.x) / l;
      const ty = (b.y - a.y) / l;
      // the nearest point of every other size line within reach (global per chain, not per segment)
      const best = new Map<number, { d: number; i: number; u: number }>();
      grid.near(p, sideMm, (o, i) => {
        if (o === id) return;
        const ro = rank.get(o) ?? -1;
        if (ro === rc && rc >= 0) return;
        const op = set.chains[o].pts;
        const r = segNearest(p, op[i], op[i + 1]);
        const b = best.get(o);
        if (!b || r.d < b.d) best.set(o, { d: r.d, i, u: r.u });
      });
      let beside = false;
      for (const [o, b] of best) {
        if (b.d > sideMm || b.d < 0.05) continue;
        const op = set.chains[o].pts;
        // the foot within 3 mm (along the line) of its end counts as the end: chains often finish
        // with a short hook (a zigzag's last tooth) that would otherwise look "beside"
        const fromEnd = Math.min(arcTo(op, b.i, b.u), arcFrom(op, b.i, b.u));
        if (fromEnd < 3) continue;
        const q0 = op[b.i];
        const q1 = op[b.i + 1];
        const ol = dist(q0, q1) || 1;
        const cos = Math.abs((tx * (q1.x - q0.x) + ty * (q1.y - q0.y)) / ol);
        if (cos < 0.8) continue;
        beside = true;
        break;
      }
      lone.push(!beside);
      at.push(s);
    }
    // runs of lone samples ≥ 3 mm → sub-polylines
    let i = 0;
    while (i < lone.length) {
      if (!lone[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < lone.length && lone[j + 1]) j++;
      const a = Math.max(0, at[i] - step / 2);
      const b = Math.min(L, at[j] + step / 2);
      if (b - a >= 3) out.push({ chain: id, pts: sub(pts, cum, a, b) });
      i = j + 1;
    }
  }
  return out;
}

function sub(pts: PtMm[], cum: number[], a: number, b: number): PtMm[] {
  const at = (s: number): PtMm => {
    let k = 0;
    while (k + 2 < cum.length && cum[k + 1] < s) k++;
    const l = cum[k + 1] - cum[k] || 1;
    const t = Math.max(0, Math.min(1, (s - cum[k]) / l));
    return {
      x: pts[k].x + (pts[k + 1].x - pts[k].x) * t,
      y: pts[k].y + (pts[k + 1].y - pts[k].y) * t,
    };
  };
  const out = [at(a)];
  for (let k = 0; k < pts.length; k++) if (cum[k] > a && cum[k] < b) out.push(pts[k]);
  out.push(at(b));
  return out;
}

/**
 * LANDINGS of rank r (pass B): a rank-r line that ends without touching another rank-r wall has
 * landed on another size's line — from there on rank r IS that line, up to where it meets a rank-r
 * wall again (a shared stretch, the common outline, rank r's own continuation). Each such stretch
 * is walked along the line landed on (in the direction rank r was heading) and returned as a plug.
 * This is narrower than "all smaller ranks": on a concave edge (neckline, armhole) a larger size
 * lies INSIDE a smaller one, and borrowing whole lines there would give a plausible wrong piece.
 */
export function landingPlugs(
  set: ChainSet,
  m: WallModel,
  r: number,
  lone: WallItem[],
  o: { attachMm?: number; landMm?: number; maxWalkMm?: number } = {},
): WallItem[] {
  const attach = o.attachMm ?? 0.8;
  const land = o.landMm ?? 0.8;
  const maxWalk = o.maxWalkMm ?? 400;
  if (m.mode === 'single') return [];
  const own = new Set(m.byRank[r] ?? []);
  // rank-r walls: common + own + lone stretches
  const wallLines: PtMm[][] = [];
  const wallOwner: number[] = [];
  for (const id of [...m.common, ...own]) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) {
      wallLines.push(c.closed ? [...c.pts, c.pts[0]] : c.pts);
      wallOwner.push(id);
    }
  }
  for (const it of lone) {
    wallLines.push(it.pts);
    wallOwner.push(-1);
  }
  const wg = new SegGrid(4);
  wallLines.forEach((pts, k) => wg.addPolyline(k, pts));
  const nearWall = (p: PtMm, skip: number) => {
    let d = Infinity;
    wg.near(p, attach, (k, i) => {
      if (wallOwner[k] === skip && skip >= 0) return;
      const pts = wallLines[k];
      const s = segNearest(p, pts[i], pts[i + 1]);
      if (s.d < d) d = s.d;
    });
    return d <= attach;
  };
  // landing targets: every other size line + orphans
  const others = m.graded.filter((id) => !own.has(id) && set.chains[id]?.pts.length >= 2);
  const og = new SegGrid(4);
  for (const id of others) og.addPolyline(id, set.chains[id].pts);
  const out: WallItem[] = [];
  const endsOf = (id: number) => {
    const c = set.chains[id];
    if (c.closed || c.pts.length < 2) return [];
    const p = c.pts;
    const tan = (a: PtMm, b: PtMm) => {
      const L = dist(a, b) || 1;
      return { x: (a.x - b.x) / L, y: (a.y - b.y) / L };
    };
    const back = (end: 0 | 1) => {
      // a point ~2 mm back along the chain for a stable tangent
      let acc = 0;
      let k = end ? p.length - 1 : 0;
      const step = end ? -1 : 1;
      while (k + step >= 0 && k + step < p.length && acc < 2) {
        acc += dist(p[k], p[k + step]);
        k += step;
      }
      return p[k];
    };
    return [
      { at: p[0], t: tan(p[0], back(0)) },
      { at: p[p.length - 1], t: tan(p[p.length - 1], back(1)) },
    ];
  };
  const walk = (start: PtMm, t: PtMm, from: number, depth: number) => {
    if (depth > 2) return;
    // nearest other line at the end
    let best: { id: number; i: number; u: number; d: number } | null = null;
    og.near(start, land, (id, i) => {
      if (id === from) return;
      const pts = set.chains[id].pts;
      const s = segNearest(start, pts[i], pts[i + 1]);
      if (s.d <= land && (!best || s.d < best.d)) best = { id, i, u: s.u, d: s.d };
    });
    const b = best as { id: number; i: number; u: number; d: number } | null;
    if (!b) return;
    const pts = set.chains[b.id].pts;
    const a0 = pts[b.i];
    const a1 = pts[b.i + 1];
    const L = dist(a0, a1) || 1;
    const dot = (t.x * (a1.x - a0.x) + t.y * (a1.y - a0.y)) / L;
    if (Math.abs(dot) < 0.3) return; // a T-junction, not a landing
    const dir = dot > 0 ? 1 : -1;
    const stretch: PtMm[] = [{ x: a0.x + (a1.x - a0.x) * b.u, y: a0.y + (a1.y - a0.y) * b.u }];
    let walked = 0;
    let k = dir > 0 ? b.i + 1 : b.i;
    let prev = stretch[0];
    while (k >= 0 && k < pts.length && walked < maxWalk) {
      const q = pts[k];
      const seg = dist(prev, q);
      // test along the segment every 0.5 mm for a rank-r wall
      const n = Math.max(1, Math.ceil(seg / 0.5));
      for (let j = 1; j <= n; j++) {
        const x = { x: prev.x + ((q.x - prev.x) * j) / n, y: prev.y + ((q.y - prev.y) * j) / n };
        if (walked + (seg * j) / n > 1.5 && nearWall(x, -1)) {
          stretch.push(x);
          out.push({ chain: b.id, pts: stretch });
          return;
        }
      }
      walked += seg;
      stretch.push(q);
      prev = q;
      k += dir;
    }
    if (walked >= maxWalk || stretch.length < 2) return;
    // ran off the end of the line landed on: it may land again
    out.push({ chain: b.id, pts: stretch });
    const e = stretch[stretch.length - 1];
    const pe = stretch[stretch.length - 2];
    const le = dist(e, pe) || 1;
    walk(e, { x: (e.x - pe.x) / le, y: (e.y - pe.y) / le }, b.id, depth + 1);
  };
  for (const id of own)
    for (const e of endsOf(id)) {
      if (nearWall(e.at, id)) continue;
      walk(e.at, e.t, id, 0);
    }
  return out;
}

/**
 * Lines F3 filed as page furniture ('ignore') that close an outline: long enough, both ends on a
 * wall (size line, common line, orphan). A straight ungraded edge between two graded corners — a
 * pocket side, a fold edge — looks like a frame line to a furniture classifier, but a frame or a
 * grid line ends on the page edge, not on two outline lines. Rescued lines are walls for every rank.
 */
export function rescuedIgnored(
  set: ChainSet,
  m: WallModel,
  reachMm = 1.5,
  minLenMm = 15,
  module: number[] = [],
  never: ReadonlySet<ChainId> = new Set(),
): ChainId[] {
  const ignore = set.classes.filter((c) => c.role === 'ignore').flatMap((c) => c.chains);
  if (!ignore.length) return [];
  const walls = new Set<ChainId>([...m.common, ...m.graded, ...m.byRank.flat()]);
  const grid = new SegGrid(4);
  for (const id of walls) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) grid.addPolyline(id, c.closed ? [...c.pts, c.pts[0]] : c.pts);
  }
  const onWall = (p: PtMm) => {
    let hit = false;
    grid.near(p, reachMm, (id, i) => {
      if (hit) return;
      const pts = set.chains[id].pts;
      const q1 = i + 1 < pts.length ? pts[i + 1] : pts[0];
      if (segNearest(p, pts[i], q1).d <= reachMm) hit = true;
    });
    return hit;
  };
  const cand: ChainId[] = [];
  for (const id of ignore) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < minLenMm || never.has(id)) continue;
    // a page-module rule (Redcafe's 1116 mm = 6 × 186 tile pitch grid line) is furniture even
    // when both its ends happen to touch a garment edge
    if (module.length && frameLike(c.pts, 60, module)) continue;
    if (onWall(c.pts[0]) && onWall(c.pts[c.pts.length - 1])) cand.push(id);
  }
  // a GRID (Redcafe's 1 cm grid ending on its page frames) is not an outline: straight frame-like
  // candidates with ≥ 4 parallel twins of the same length stay furniture
  const straight = cand.filter((id) => frameLike(set.chains[id].pts, minLenMm));
  const dirOf = (id: ChainId) => {
    const p = set.chains[id].pts;
    return Math.abs(p[p.length - 1].x - p[0].x) > Math.abs(p[p.length - 1].y - p[0].y) ? 0 : 1;
  };
  const grid2 = new Set<ChainId>();
  for (const id of straight) {
    const L = set.chains[id].lengthMm;
    const twins = straight.filter(
      (o) => o !== id && dirOf(o) === dirOf(id) && Math.abs(set.chains[o].lengthMm - L) <= 0.02 * L,
    );
    if (twins.length >= 4) grid2.add(id);
  }
  return cand.filter((id) => !grid2.has(id));
}

/**
 * A chain made only of long axis-aligned straight runs (a tile frame, a sheet border). With
 * `module` (the tile pitches and page sizes), every run must also measure a whole number of them —
 * a garment's straight centre-back or hem is axis-aligned too, but not 3 × 186 mm long.
 */
export function frameLike(pts: readonly PtMm[], minRunMm = 60, module: number[] = []): boolean {
  if (pts.length < 2) return false;
  let total = 0;
  let framed = 0;
  let runLen = 0;
  let runAxis = -1;
  const onModule = (L: number) =>
    !module.length ||
    module.some((P) => {
      const k = Math.round(L / P);
      // printed rules are exact; a garment hem of 294 mm is not a 297 mm page edge
      return k >= 1 && Math.abs(L - k * P) <= Math.max(1, 0.002 * L);
    });
  const flush = () => {
    if (runLen >= minRunMm && onModule(runLen)) framed += runLen;
    runLen = 0;
  };
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    const L = Math.hypot(dx, dy);
    total += L;
    if (L < 1e-6) continue;
    const axis = Math.abs(dy) <= 0.01 * L ? 0 : Math.abs(dx) <= 0.01 * L ? 1 : -1;
    if (axis < 0 || axis !== runAxis) flush();
    runAxis = axis;
    if (axis >= 0) runLen += L;
  }
  flush();
  return total >= minRunMm && framed >= 0.9 * total;
}

/** Arc length from the start of a polyline to (segment i, parameter u). */
function arcTo(pts: PtMm[], i: number, u: number): number {
  let L = 0;
  for (let k = 0; k < i; k++) L += dist(pts[k], pts[k + 1]);
  return L + u * dist(pts[i], pts[i + 1]);
}
/** Arc length from (segment i, parameter u) to the end of a polyline. */
function arcFrom(pts: PtMm[], i: number, u: number): number {
  let L = (1 - u) * dist(pts[i], pts[i + 1]);
  for (let k = i + 1; k + 1 < pts.length; k++) L += dist(pts[k], pts[k + 1]);
  return L;
}

/** Tile pitches and page sizes of a sheet (the lengths a frame line is made of). */
export function sheetModule(sheet: {
  poses: { toSheet: { e: number; f: number }; widthMm: number; heightMm: number }[];
}): number[] {
  const out = new Set<number>();
  const step = (v: number[]) => {
    const u = [...new Set(v.map((x) => Math.round(x * 10) / 10))].sort((a, b) => a - b);
    const d: number[] = [];
    for (let i = 1; i < u.length; i++) if (u[i] - u[i - 1] > 20) d.push(u[i] - u[i - 1]);
    d.sort((a, b) => a - b);
    return d.length ? d[d.length >> 1] : 0;
  };
  const px = step(sheet.poses.map((p) => p.toSheet.e));
  const py = step(sheet.poses.map((p) => p.toSheet.f));
  if (px) out.add(px);
  if (py) out.add(py);
  for (const p of sheet.poses) {
    out.add(Math.round(p.widthMm));
    out.add(Math.round(p.heightMm));
  }
  return [...out].filter((v) => v > 50);
}

/**
 * Rank by CONTINUITY (F4b, r4454): one size's outline is drawn as chains that meet end to end. Where
 * exactly two size-line ends meet (an L-junction no other line passes through), both chains belong
 * to the same size. Components of such links vote with their classified length; a member F3 put in
 * another rank (r4454's back neck "54" continuing the 44 shoulder) moves to the component's rank
 * when ≥ 60 % of the ranked length agrees. Orphans in a decided component get its rank. Components
 * without such a majority are left alone and returned as conflicts (the operator sees them).
 */
export function connectRanks(
  set: ChainSet,
  m: WallModel,
  tolMm = 0.5,
): {
  byRank: ChainId[][];
  moved: number;
  conflicts: ChainId[];
  uncommon: ChainId[];
  loopFamily: ChainId[];
} {
  const rankOf = new Map<ChainId, number>();
  m.byRank.forEach((ids, r) => ids.forEach((id) => rankOf.set(id, r)));
  const ids = [...new Set([...rankOf.keys(), ...set.orphans])].filter((id) => {
    const c = set.chains[id];
    return c && !c.closed && c.pts.length >= 2 && dist(c.pts[0], c.pts[c.pts.length - 1]) > tolMm;
  });
  const ends: { id: ChainId; p: PtMm }[] = [];
  for (const id of ids) {
    const p = set.chains[id].pts;
    ends.push({ id, p: p[0] }, { id, p: p[p.length - 1] });
  }
  const grid = new SegGrid(4);
  ids.forEach((id) => grid.addPolyline(id, set.chains[id].pts));
  const epGrid = new SegGrid(2);
  ends.forEach((e, i) => epGrid.addSeg(i, 0, e.p, e.p));
  const parent = new Map<ChainId, ChainId>(ids.map((id) => [id, id]));
  const find = (a: ChainId): ChainId => {
    while (parent.get(a) !== a) {
      parent.set(a, parent.get(parent.get(a)!)!);
      a = parent.get(a)!;
    }
    return a;
  };
  ends.forEach((e, i) => {
    const near: number[] = [];
    epGrid.near(e.p, tolMm, (j) => {
      if (j !== i && !near.includes(j) && dist(ends[j].p, e.p) <= tolMm) near.push(j);
    });
    if (near.length !== 1) return;
    const o = ends[near[0]];
    if (o.id === e.id || near[0] < i) return;
    // no third line passing through the junction (a T or a crossing is not a continuation)
    let through = false;
    grid.near(e.p, tolMm, (id, s) => {
      if (through || id === e.id || id === o.id) return;
      const q = set.chains[id].pts;
      if (segNearest(e.p, q[s], q[s + 1]).d <= tolMm) through = true;
    });
    if (!through) parent.set(find(e.id), find(o.id));
  });
  const comps = new Map<ChainId, ChainId[]>();
  for (const id of ids) {
    const r = find(id);
    const a = comps.get(r);
    if (a) a.push(id);
    else comps.set(r, [id]);
  }
  const byRank = m.byRank.map((a) => a.slice());
  let moved = 0;
  const conflicts: ChainId[] = [];
  const undecided: ChainId[][] = [];
  const commonIds = new Set(m.common);
  const uncommon: ChainId[] = [];
  const loopIds = new Set<ChainId>();
  const loopFamily: ChainId[] = [];
  for (const members of comps.values()) {
    if (members.length < 2) continue;
    const votes = new Map<number, number>();
    let total = 0;
    for (const id of members) {
      const r = rankOf.get(id);
      if (r === undefined) continue;
      votes.set(r, (votes.get(r) ?? 0) + set.chains[id].lengthMm);
      total += set.chains[id].lengthMm;
    }
    if (!total || votes.size === 0) continue;
    const [best, w] = [...votes].sort((a, b) => b[1] - a[1])[0];
    const mixed = votes.size > 1 || members.some((id) => !rankOf.has(id));
    if (!mixed) continue;
    if (w < 0.6 * total) {
      undecided.push(members);
      continue;
    }
    for (const id of members) {
      const r = rankOf.get(id);
      if (r === best) continue;
      if (r !== undefined) byRank[r] = byRank[r].filter((x) => x !== id);
      byRank[best].push(id);
      moved++;
    }
  }
  // undecided outlines (r4454's pocket: every size's top says one rank, its bottom the reverse)
  // that are one piece in n sizes — n of them, each box overlapping the next ≥ 80 % — take their
  // rank from their size order: the smallest outline is the smallest size
  const boxOf = (ms: ChainId[]) => bboxOf(ms.flatMap((id) => set.chains[id].pts));
  // closed outlines that overlap each other (kombinezon's bands: one closed rectangle per size,
  // each in its own dash, which F3 called size 6, size 20, common or ignore) are one piece in
  // several sizes: when two of them share a rank, or some of them have none, they all join the
  // undecided and are ranked by size order like the rest (only when exactly n of them nest)
  const notch = new Set(set.classes.filter((c) => c.role === 'notch').flatMap((c) => c.chains));
  const loops = set.chains
    .filter(
      (c) =>
        !notch.has(c.id) &&
        c.pts.length >= 3 &&
        c.lengthMm >= 50 &&
        (c.closed || dist(c.pts[0], c.pts[c.pts.length - 1]) <= tolMm),
    )
    .map((c) => ({ id: c.id, b: bboxOf(c.pts) }));
  const seenL = new Set<ChainId>();
  for (const l of loops) {
    if (seenL.has(l.id)) continue;
    const group = loops.filter((o) => o === l || iouOf(o.b, l.b) >= 0.5);
    if (group.length < 2) continue;
    const rs = group.map((g) => rankOf.get(g.id));
    if (!rs.some((r) => r !== undefined)) continue;
    const dupRank = rs.some((r, k) => r !== undefined && rs.indexOf(r) !== k);
    if (!dupRank && !rs.some((r) => r === undefined)) continue;
    for (const g of group)
      if (!seenL.has(g.id)) {
        seenL.add(g.id);
        loopIds.add(g.id);
        undecided.push([g.id]);
      }
  }
  const und = undecided.map((ms) => ({ ms, b: boxOf(ms) }));
  const area = (b: { minX: number; minY: number; maxX: number; maxY: number }) =>
    (b.maxX - b.minX) * (b.maxY - b.minY);
  // same piece, another size: boxes overlap heavily (r4454's pocket grows only in width and the
  // sizes step down the sheet 3.5 mm each, so the boxes are not strictly nested)
  const iou = (
    a: { minX: number; minY: number; maxX: number; maxY: number },
    b: { minX: number; minY: number; maxX: number; maxY: number },
  ) => {
    const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
    const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
    if (w <= 0 || h <= 0) return 0;
    return (w * h) / (area(a) + area(b) - w * h);
  };
  const usedU = new Set<number>();
  und
    .map((u, i) => ({ ...u, i }))
    .sort((a, b) => area(a.b) - area(b.b))
    .forEach((u0, _k, sorted) => {
      if (usedU.has(u0.i)) return;
      const chain = [u0];
      for (const u of sorted) {
        if (usedU.has(u.i) || chain.includes(u)) continue;
        const last = chain[chain.length - 1];
        if (
          area(u.b) > area(last.b) &&
          iou(last.b, u.b) >= 0.8 &&
          dist(
            { x: (u.b.minX + u.b.maxX) / 2, y: (u.b.minY + u.b.maxY) / 2 },
            { x: (last.b.minX + last.b.maxX) / 2, y: (last.b.minY + last.b.maxY) / 2 },
          ) < 40
        )
          chain.push(u);
      }
      if (chain.length !== m.n) return;
      chain.forEach((u, r) => {
        usedU.add(u.i);
        for (const id of u.ms) if (loopIds.has(id)) loopFamily.push(id);
        for (const id of u.ms) {
          const cur = rankOf.get(id);
          if (cur === r) continue;
          if (commonIds.has(id)) uncommon.push(id);
          if (cur !== undefined) byRank[cur] = byRank[cur].filter((x) => x !== id);
          byRank[r].push(id);
          moved++;
        }
      });
    });
  und.forEach((u, i) => {
    if (!usedU.has(i)) conflicts.push(...u.ms);
  });
  return { byRank, moved, conflicts, uncommon, loopFamily };
}

/**
 * Orphan chains labelled with a size: a text that IS a size label ("44", "XL") whose start (anchor)
 * lies ≤ 4 mm from exactly one orphan chain — the next orphan at least 1.5× farther. Labels are
 * written starting at their line; their far end may touch the neighbour's line, so the anchor
 * decides. A chain given two different sizes is left alone.
 */
export function labelRanks(
  set: ChainSet,
  run: SizeRun,
  texts: readonly IRText[],
  reachMm = 4,
): Map<ChainId, number> {
  const out = new Map<ChainId, number>();
  if (!texts.length || !set.orphans.length) return out;
  const rankOfLabel = new Map<string, number>();
  run.sizes.forEach((s, r) => rankOfLabel.set(s.label.trim().toUpperCase(), r));
  const grid = new SegGrid(4);
  for (const id of set.orphans) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) grid.addPolyline(id, c.closed ? [...c.pts, c.pts[0]] : c.pts);
  }
  const bad = new Set<ChainId>();
  for (const t of texts) {
    const r = rankOfLabel.get(t.text.trim().toUpperCase());
    if (r === undefined) continue;
    const best = new Map<ChainId, number>();
    grid.near(t.anchor, reachMm * 1.5 + 1, (id, s) => {
      const q = set.chains[id].pts;
      const b = s + 1 < q.length ? q[s + 1] : q[0];
      const d = segNearest(t.anchor, q[s], b).d;
      if (d < (best.get(id) ?? Infinity)) best.set(id, d);
    });
    const ds = [...best].sort((a, b) => a[1] - b[1]);
    if (!ds.length || ds[0][1] > reachMm) continue;
    if (ds.length > 1 && ds[1][1] < 1.5 * ds[0][1]) continue;
    const id = ds[0][0];
    const prev = out.get(id);
    if (prev !== undefined && prev !== r) bad.add(id);
    else out.set(id, r);
  }
  for (const id of bad) out.delete(id);
  return out;
}

function iouOf(
  a: { minX: number; minY: number; maxX: number; maxY: number },
  b: { minX: number; minY: number; maxX: number; maxY: number },
): number {
  const w = Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX);
  const h = Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY);
  if (w <= 0 || h <= 0) return 0;
  const ar = (x: typeof a) => (x.maxX - x.minX) * (x.maxY - x.minY);
  return (w * h) / (ar(a) + ar(b) - w * h);
}

/**
 * BAND FAMILIES (F4b): a band drawn once at the largest length with one end TICK per size (reef's
 * hem bands I/J: nine full-width ticks across one strip, F3 called five of them "common"; any
 * rank's fill stopped at the first tick). A ladder is n straight, parallel ticks of one length
 * (± 10 %) whose ends both land (≤ 2.5 mm) on lines running across them (the band's long edges), all
 * crossing the same strip, neighbours closer than the strip is wide, internal lines and notches
 * excluded (a size table's column rules are internal). Exactly n of them → tick k (counted from the end of the band without
 * ticks) is size k's end. Anything else — a ladder of buttonholes (ends on nothing), n − 2 ticks —
 * is left alone, and so is a ladder F3 already ranked in order (a graded piece's straight sides).
 * Returns tick → rank, the band's long edges and start end (shared walls), and rungs carried
 * across the band where they stop short (derived band-cuts).
 */
export function bandTicks(
  set: ChainSet,
  n: number,
  skip: ReadonlySet<ChainId>,
  rankOf: ReadonlyMap<ChainId, number> = new Map(),
): {
  ticks: Map<ChainId, number>;
  edges: Set<ChainId>;
  cuts: { rank: number; from: PtMm; to: PtMm; ticks: ChainId[] }[];
} {
  const out = new Map<ChainId, number>();
  const edges = new Set<ChainId>();
  const cuts: { rank: number; from: PtMm; to: PtMm; ticks: ChainId[] }[] = [];
  if (n < 3) return { ticks: out, edges, cuts };
  type Tick = { id: ChainId; a: PtMm; b: PtMm; L: number; dir: PtMm };
  const ticks: Tick[] = [];
  for (const c of set.chains) {
    if (skip.has(c.id) || c.closed || c.pts.length < 2 || c.lengthMm < 15 || c.lengthMm > 250)
      continue;
    const a = c.pts[0];
    const b = c.pts[c.pts.length - 1];
    const L = dist(a, b);
    if (L < 15 || c.lengthMm > L * 1.02) continue;
    let dev = 0;
    for (const p of c.pts) dev = Math.max(dev, segNearest(p, a, b).d);
    if (dev > 0.5) continue;
    ticks.push({ id: c.id, a, b, L, dir: { x: (b.x - a.x) / L, y: (b.y - a.y) / L } });
  }
  if (ticks.length < n) return { ticks: out, edges, cuts };
  // long edges: any chain passing within 1.5 mm of a tick end, running across the tick
  const grid = new SegGrid(4);
  for (const c of set.chains)
    if (c.pts.length >= 2 && !skip.has(c.id)) grid.addPolyline(c.id, c.pts);
  const across = (t: Tick, p: PtMm, found?: Set<ChainId>) => {
    let ok = false;
    grid.near(p, 2.5, (o, s) => {
      if ((ok && !found) || o === t.id) return;
      const q = set.chains[o].pts;
      const h = segNearest(p, q[s], q[s + 1]);
      if (h.d > 2.5) return;
      const dx = q[s + 1].x - q[s].x;
      const dy = q[s + 1].y - q[s].y;
      const l = Math.hypot(dx, dy) || 1;
      if (Math.abs((dx * t.dir.x + dy * t.dir.y) / l) < 0.2) {
        ok = true;
        found?.add(o);
      }
    });
    return ok;
  };
  const framedSet = new Set(ticks.filter((t) => across(t, t.a) && across(t, t.b)).map((t) => t.id));
  const framed = ticks;
  const used = new Set<ChainId>();
  for (const t0 of ticks.filter((t) => framedSet.has(t.id))) {
    if (used.has(t0.id)) continue;
    const nrm = { x: -t0.dir.y, y: t0.dir.x };
    const along = (p: PtMm) => p.x * t0.dir.x + p.y * t0.dir.y;
    const lo0 = Math.min(along(t0.a), along(t0.b));
    const hi0 = Math.max(along(t0.a), along(t0.b));
    const ladder = framed.filter((t) => {
      if (used.has(t.id)) return false;
      if (Math.abs(t.dir.x * t0.dir.x + t.dir.y * t0.dir.y) < 0.999) return false;
      if (Math.abs(t.L - t0.L) > 0.1 * t0.L) return false;
      const lo = Math.min(along(t.a), along(t.b));
      const hi = Math.max(along(t.a), along(t.b));
      return Math.min(hi, hi0) - Math.max(lo, lo0) >= 0.9 * Math.min(hi - lo, hi0 - lo0);
    });
    // positions across the strip; collinear ticks at one position are one (every size's start
    // end drawn on the same line)
    const pos = (t: Tick) => (t.a.x + t.b.x) * 0.5 * nrm.x + (t.a.y + t.b.y) * 0.5 * nrm.y;
    ladder.sort((x, y) => pos(x) - pos(y));
    const groups: Tick[][] = [];
    for (const t of ladder) {
      const g = groups[groups.length - 1];
      if (g && pos(t) - pos(g[g.length - 1]) <= 1.5) g.push(t);
      else groups.push([t]);
    }
    let rungs = groups;
    const gp = (g: Tick[]) => pos(g[0]);
    const gaps = rungs.slice(1).map((g, k) => gp(g) - gp(rungs[k]));
    // the band's own start end, far from the ladder, is not a size tick
    let start: Tick[] = [];
    if (rungs.length === n + 1 && gaps.length >= 2) {
      const inner = (xs: number[]) => Math.max(...xs);
      if (gaps[0] > 2 * inner(gaps.slice(1))) {
        start = rungs[0];
        rungs = rungs.slice(1);
      } else if (gaps[gaps.length - 1] > 2 * inner(gaps.slice(0, -1))) {
        start = rungs[rungs.length - 1];
        rungs = rungs.slice(0, -1);
      }
    }
    if (rungs.length !== n) continue;
    const members = rungs.flat();
    // all rungs but two land on the long edges at both ends (≤ 2.5 mm; reef's L tick stops 9 mm
    // short)
    if (rungs.filter((g) => g.some((t) => framedSet.has(t.id))).length < n - 2) continue;
    // a ladder: neighbours closer than the band is wide (marks spread along an edge are not one)
    let gapOk = true;
    for (let k = 1; k < n; k++) if (gp(rungs[k]) - gp(rungs[k - 1]) > 0.8 * t0.L) gapOk = false;
    if (!gapOk) continue;
    // where the band body lies: the long edges through the first rung's end run on to one side
    let bodyLow = 0;
    let bodyHigh = 0;
    grid.near(rungs[0][0].a, 1.5, (o) => {
      if (members.some((t) => t.id === o)) return;
      for (const p of set.chains[o].pts) {
        const v = p.x * nrm.x + p.y * nrm.y;
        if (v < gp(rungs[0]) - 10) bodyLow++;
        if (v > gp(rungs[n - 1]) + 10) bodyHigh++;
      }
    });
    if (bodyLow === bodyHigh) continue;
    const ordered = bodyLow > bodyHigh ? rungs : rungs.slice().reverse();
    // F3 already ranked every rung, in this order: a graded piece's own sides (reef's D: nine
    // straight side seams), nothing to repair — and its edges are graded, not shared
    if (ordered.every((g, r) => g.every((t) => rankOf.get(t.id) === r))) {
      for (const t of ladder) used.add(t.id);
      continue;
    }
    ordered.forEach((g, r) =>
      g.forEach((t) => {
        out.set(t.id, r);
        used.add(t.id);
      }),
    );
    for (const t of ladder) used.add(t.id);
    // the band's long edges (every chain the rungs land on) are shared by all its sizes: a size
    // with no edge of its own (reef's hairline S, M, XL) runs along the longer ones to its tick
    for (const t of members) {
      across(t, t.a, edges);
      across(t, t.b, edges);
    }
    // and so is its start end (every size's band starts on that one line)
    for (const t of start) edges.add(t.id);
    // a rung that stops short of an edge (reef's L tick, 9 mm) is carried across the band along
    // its own line to where the framed rungs end — a derived 'band-cut' the operator sees
    const ends = (side: 'a' | 'b') =>
      members.filter((t) => framedSet.has(t.id)).map((t) => along(t[side]));
    const ea = ends('a');
    const eb = ends('b');
    if (ea.length && eb.length) {
      const lo = Math.min(...ea, ...eb);
      const hi = Math.max(...ea, ...eb);
      ordered.forEach((g, r) => {
        if (g.some((t) => framedSet.has(t.id))) return;
        const t = g[0];
        const c0 = along(t.a);
        const base = { x: t.a.x - t0.dir.x * c0, y: t.a.y - t0.dir.y * c0 };
        cuts.push({
          rank: r,
          from: { x: base.x + t0.dir.x * lo, y: base.y + t0.dir.y * lo },
          to: { x: base.x + t0.dir.x * hi, y: base.y + t0.dir.y * hi },
          // the rung(s) this cut carries: its provenance, the only lines that may carry it (G15)
          ticks: g.map((x) => x.id),
        });
      });
    }
  }
  for (const id of out.keys()) edges.delete(id);
  return { ticks: out, edges, cuts };
}
