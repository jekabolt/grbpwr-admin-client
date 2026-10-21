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
import type {
  ChainId,
  ChainSet,
  IRText,
  LineClass,
  PtMm,
  SizeRun,
  Style,
} from 'lib/pattern-import/types';

import { bboxOf, dist, SegGrid, segIntersect, segNearest } from './geom';
import { chainLook, onPen, rankGuard, rankLooks, type RankGuard } from './identity';
import type { WallItem } from './snap';
import { endTicks, type EndTick } from './ticks';
import {
  OVERLAY_MIN_PENS,
  overlayAt,
  overlayShare,
  walkOverlay,
  type OverlayLines,
} from '../sizes/overlay';

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
  /** MOOD Ф2: corners closed by a size's own stub / ramps / extended edges — walls of `rank`. */
  corners?: { rank: number; pts: PtMm[]; chains: ChainId[] }[];
  /** MOOD TICKS: a size's proven end tick across a strip — a knife of its rank (pieces/ticks.ts). */
  endTicks?: EndTick[];
};

/**
 * MOOD Ф2: the corner walls recover found (sizes/corners.ts), kept only where they still hang on
 * lines of ONE rank of the final model drawn with that rank's pen (the legend step may have moved
 * a line since): the rank's identity, re-checked.
 */
function cornerWalls(
  set: ChainSet,
  run: SizeRun,
  ranks: ChainId[][],
  styles: ReadonlyMap<number, Style> | undefined,
): Pick<WallModel, 'corners'> {
  if (!set.cornerWalls?.length || !styles || probeOff('MOOD_F2_OFF')) return {};
  const { identity, looks } = rankLooks(set, run, styles);
  if (!identity) return {};
  const rankOfChain = new Map<ChainId, number>();
  ranks.forEach((ids, r) => ids.forEach((id) => rankOfChain.set(id, r)));
  const corners: NonNullable<WallModel['corners']> = [];
  for (const w of set.cornerWalls) {
    const rs = new Set(w.own.map((id) => rankOfChain.get(id)));
    if (rs.size !== 1) continue;
    const r = [...rs][0];
    if (r === undefined || !looks[r]?.length) continue;
    const onOwnPen = w.own.every((id) => {
      const c = set.chains[id];
      const l = c ? chainLook(c, styles) : null;
      return !!l && onPen(l, looks[r]);
    });
    if (!onOwnPen) continue;
    corners.push({ rank: r, pts: w.pts, chains: w.chains });
  }
  return corners.length ? { corners } : {};
}

/** MOOD Ф2: the stub / ramp chains a validated corner wall stands for — no rescue, no foreign line. */
/**
 * LINEFIX: the operator's per-line answers (`ChainSet.assigned`, chains/assign.ts) — `all` every
 * answered line, `ignored` the lines he called no size line (a row of role 'ignore'). No heuristic
 * here re-reads an answered line: never rescued, never a fold / lone / band / corner wall of other
 * sizes, an ignored one never a continuity wall.
 */
export function answeredLines(set: ChainSet): { all: Set<ChainId>; ignored: Set<ChainId> } {
  const all = new Set<ChainId>();
  const ignored = new Set<ChainId>();
  if (!set.assigned?.length) return { all, ignored };
  const role = new Map(set.classes.map((c) => [c.id, c.role]));
  for (const a of set.assigned) {
    all.add(a.chain);
    if (a.classes.length && a.classes.every((k) => role.get(k) === 'ignore')) ignored.add(a.chain);
  }
  return { all, ignored };
}

/** LINEFIX: per answered line, the run ranks of its rows (none: a common / ignore row). */
function pinnedRanksOf(set: ChainSet, run: SizeRun): Map<ChainId, Set<number>> {
  const rankOfClass = new Map<number, number>();
  run.sizes.forEach((z, r) => {
    if (z.classId != null) rankOfClass.set(z.classId, r);
  });
  const out = new Map<ChainId, Set<number>>();
  for (const a of set.assigned ?? [])
    out.set(
      a.chain,
      new Set(a.classes.flatMap((k) => (rankOfClass.has(k) ? [rankOfClass.get(k)!] : []))),
    );
  return out;
}

export function cornerSources(m: WallModel): Set<ChainId> {
  return new Set((m.corners ?? []).flatMap((k) => k.chains));
}

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
  const answered = answeredLines(set).all;
  const cand: ChainId[] = [];
  for (const c of set.chains) {
    if (common.has(c.id) || c.closed || c.pts.length < 2 || c.lengthMm < 40) continue;
    // LINEFIX: a line the operator put in a row is that row's, never every size's fold
    if (answered.has(c.id)) continue;
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

/**
 * `styles` (the sheet's): under an identity encoding continuity ranking moves a chain only into a
 * rank drawn with its own pen (MOOD Ф0 R3, `pieces/identity.ts`). Absent = no pen check.
 */
export function wallModel(
  set: ChainSet,
  run: SizeRun,
  texts: readonly IRText[] = [],
  styles?: ReadonlyMap<number, Style>,
): WallModel {
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
  const guard = mode === 'graded' && !probeOff('F4_NOLOOK') ? rankGuard(set, run, styles) : null;
  const cr =
    mode === 'graded' && !probeOff('F4_NOCONNECT') ? connectRanks(set, base, 0.5, guard) : null;
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
  // LINEFIX: a line the operator put in a row keeps it — never a band tick of another rank, nor a
  // band edge every size shares
  const answered = answeredLines(set).all;
  if (answered.size) {
    for (const id of answered) {
      band.ticks.delete(id);
      band.edges.delete(id);
    }
    // nor a rung carried across the band (a derived wall of the tick's rank)
    const keep = band.cuts.filter((c) => !c.ticks.some((id) => answered.has(id)));
    band.cuts.splice(0, band.cuts.length, ...keep);
  }
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
  // MOOD Ф2: a stub or ramp read as rank r's corner is r's alone — never a common wall nor
  // another rank's line (Codex r2: another size closing on r's stub)
  const cw0 = mode === 'graded' ? cornerWalls(set, run, ranks, styles) : {};
  // LINEFIX: a corner drawn through a line the operator put elsewhere (another size, no size line)
  // is no corner of this rank — its derived wall goes with it
  const pins = answered.size ? pinnedRanksOf(set, run) : null;
  const cw =
    pins && cw0.corners
      ? {
          ...cw0,
          corners: cw0.corners.filter((k) =>
            k.chains.every((id) => !pins.has(id) || pins.get(id)!.has(k.rank)),
          ),
        }
      : cw0;
  const owner = new Map<ChainId, number>();
  for (const k of cw.corners ?? []) for (const id of k.chains) owner.set(id, k.rank);
  const commonF = [...kept, ...folds].filter((id) => !owner.has(id));
  const ranks0 = owner.size
    ? ranks.map((ids, r) => ids.filter((id) => (owner.get(id) ?? r) === r))
    : ranks;
  // MOOD Ф3.1 (R5): a line without a pen lying on an overlay is no size's and nobody's common wall
  // (sizes/recover) — but where the sizes BELOW and ABOVE rank r both run on it, r runs there too
  // (nested outlines: r's edge lies between theirs, and theirs coincide): a wall of those ranks
  const brk = guard?.lookless && !probeOff('MOOD_F3_OFF') ? bracketWalls(set, ranks0, guard) : null;
  const ranksF = brk?.size
    ? ranks0.map((ids, r) => {
        const add = brk.get(r);
        return add ? [...ids, ...add.filter((id) => !ids.includes(id))] : ids;
      })
    : ranks0;
  // MOOD TICKS: each size's end tick across a strip, read as that size's end (≥ 2 evidences) — a
  // knife of its rank in the fill; the stretches carried past a drawn tick are derived band cuts
  // there (G15), never walls
  const ticks = mode === 'graded' ? endTicks(set, run, ranksF, styles) : [];
  return {
    mode,
    n,
    common: commonF,
    folds,
    relinked: cr
      ? { moved: cr.moved, conflicts: cr.conflicts, labelled: labelled.size }
      : undefined,
    byRank: ranksF,
    ...cw,
    emptyRanks: ranksF.map((b, r) => (b.length ? -1 : r)).filter((r) => r >= 0),
    // chains ranked here (continuity, labels, nesting) are size lines too
    graded: [...new Set([...graded, ...ranks.flat()])],
    loopFamily: new Set([...(cr?.loopFamily ?? []), ...bands.keys()]),
    bandTicks: bands.size ? bands : undefined,
    bandEdges: band.edges.size ? band.edges : undefined,
    bandCuts: band.cuts.length ? band.cuts : undefined,
    ...(ticks.length ? { endTicks: ticks } : {}),
    fileOfRank,
  };
}

/**
 * Cause E: the ranks a sheet lists but does NOT draw — from the ORIGINAL source evidence only. A
 * rank is not drawn when its own size class carried no chain as read (before continuity, labels
 * or bundles moved any line to it), it is still empty after them, other ranks are drawn, and no
 * verified family covers it: a piece drawn once for every size (a closed common outline, piece
 * sized — ≥ `minAreaMm2`, 50 cm²: a collar, a pocket, not a buttonhole, a label or a mark — and not
 * a page frame) or drawn identically in every drawn size layer. A rank that originally carried
 * chains is never "not drawn".
 */
export function undrawnRanks(
  set: ChainSet,
  run: SizeRun,
  texts: readonly IRText[] = [],
  module: number[] = [],
  minAreaMm2 = 5000,
  styles?: ReadonlyMap<number, Style>,
): number[] {
  if (run.encoding === 'single' || run.sizes.length < 2) return [];
  const byId = new Map(set.classes.map((c) => [c.id, c]));
  const origDrawn = run.sizes.map((s) => {
    const c = s.classId != null ? byId.get(s.classId) : undefined;
    return !!c && c.role === 'size' && c.chains.length > 0;
  });
  const drawnN = origDrawn.filter(Boolean).length;
  if (!drawnN) return [];
  const empty = new Set(wallModel(set, run, texts, styles).emptyRanks);
  const cand = run.sizes.map((_, r) => r).filter((r) => !origDrawn[r] && empty.has(r));
  if (!cand.length) return [];
  // a verified family covering every size: a closed common outline, or a loop drawn alike in
  // every drawn size layer
  const role = new Map<ChainId, string>();
  for (const k of set.classes) for (const id of k.chains) role.set(id, k.role);
  const loops = set.chains.filter(
    (c) =>
      c.pts.length > 3 &&
      (c.closed || dist(c.pts[0], c.pts[c.pts.length - 1]) <= 0.5) &&
      Math.abs(polyArea(c.pts)) >= minAreaMm2 &&
      !frameLike(c.pts, 60, module),
  );
  if (loops.some((c) => role.get(c.id) === 'common')) return [];
  const sized = loops.filter((c) => role.get(c.id) === 'size');
  for (const c of sized) {
    const b = bboxOf(c.pts);
    let copies = 0;
    for (const o of sized) {
      if (Math.abs(o.lengthMm - c.lengthMm) > 0.2) continue;
      const q = bboxOf(o.pts);
      if (
        Math.abs(q.minX - b.minX) < 0.2 &&
        Math.abs(q.minY - b.minY) < 0.2 &&
        Math.abs(q.maxX - b.maxX) < 0.2 &&
        Math.abs(q.maxY - b.maxY) < 0.2
      )
        copies++;
    }
    if (copies >= drawnN) return [];
  }
  return cand;
}

function polyArea(p: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i].x * q.y - q.x * p[i].y;
  }
  return a / 2;
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
 * stretch up to the fork stays lone and the walls close there. "Parallel" = the single segments
 * are, OR the lines' chords over ±2.5 mm are: a size drawn as a motif polyline (polupalto's 44
 * crosses) turns every few tenths of a mm, and a tooth's direction made the line lone beside the
 * other sizes, so it walled them all (region 10's neckline). The chord only ADDS "beside": a
 * stretch lone here was lone by segments too (a chord alone cuts a corner and parted a line from
 * the parallel size beside it — leonie's junk face seeds).
 */
export function lonePortions(set: ChainSet, m: WallModel, sideMm = 20): WallItem[] {
  if (m.mode === 'single') return [];
  const rank = new Map<ChainId, number>();
  m.byRank.forEach((ids, r) => ids.forEach((id) => rank.set(id, r)));
  const ids = m.graded.filter((id) => set.chains[id] && set.chains[id].pts.length >= 2);
  const grid = new SegGrid(8);
  for (const id of ids) grid.addPolyline(id, set.chains[id].pts);
  const answered = answeredLines(set).all;
  const out: WallItem[] = [];
  const step = 2;
  const chordMm = 2.5;
  const cums = new Map<ChainId, number[]>();
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
    // LINEFIX: a line the operator put in a size is that size's — no stretch of it is every size's
    if (answered.has(id)) continue;
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
      const t = chordDir(pts, cum, s, chordMm);
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
        if (Math.abs((tx * (q1.x - q0.x) + ty * (q1.y - q0.y)) / ol) < 0.8) {
          let oc = cums.get(o);
          if (!oc) cums.set(o, (oc = cumOf(op)));
          const q = chordDir(op, oc, oc[b.i] + (oc[b.i + 1] - oc[b.i]) * b.u, chordMm);
          if (Math.abs(t.x * q.x + t.y * q.y) < 0.8) continue;
        }
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

/** The point at arc length `s` along a polyline (`cum` its cumulative lengths), clamped to it. */
function arcPt(pts: readonly PtMm[], cum: readonly number[], s: number): PtMm {
  let lo = 0;
  let hi = cum.length - 2;
  while (lo < hi) {
    const k = (lo + hi + 1) >> 1;
    if (cum[k] <= s) lo = k;
    else hi = k - 1;
  }
  const l = cum[lo + 1] - cum[lo] || 1;
  const t = Math.max(0, Math.min(1, (s - cum[lo]) / l));
  return {
    x: pts[lo].x + (pts[lo + 1].x - pts[lo].x) * t,
    y: pts[lo].y + (pts[lo + 1].y - pts[lo].y) * t,
  };
}

/** Unit direction of a polyline at arc `s`: the chord over ±`h` mm of arc (clamped to its ends). */
function chordDir(pts: readonly PtMm[], cum: readonly number[], s: number, h: number): PtMm {
  const L = cum[cum.length - 1];
  const a = arcPt(pts, cum, Math.max(0, s - h));
  const b = arcPt(pts, cum, Math.min(L, s + h));
  const l = dist(a, b) || 1;
  return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
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
  /** hold back an ignored line lying wholly on one size's line (the faces' weak walls, below) */
  holdSizeLine = false,
): ChainId[] {
  // LINEFIX: a line the operator answered is never rescued (his "not a size line" stands)
  const answered = answeredLines(set).all;
  const ignore = set.classes
    .filter((c) => c.role === 'ignore')
    .flatMap((c) => c.chains)
    .filter((id) => !answered.has(id));
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
  // LEAKS: an ignored line lying wholly ON one size's line (a piece recovery joined into that line —
  // sizes/land bridgeSameRank — or a copy of it) is that size's stretch, not a weak wall of the
  // faces: there it walled Mood's bead rows into blobs read as background (whole pieces' labels
  // held). Only for the faces (`holdSizeLine`): the fill's continuity closures keep it as before
  // (palto 25·80 closes through such a line; the merged-strip seam fixture is refused through it)
  const ranked = rankedGrid(set, m);
  // ALL of it — every vertex and every 0.5 mm between, ends included — within 0.3 mm of ONE ranked
  // line (Codex: a line that leaves the size's line anywhere, even for a short excursion, draws
  // something of its own there and stays rescuable)
  const onOneSizeLine = (c: { pts: PtMm[] }) => wholeOnRanked(set, ranked, c) !== null;
  const cand: ChainId[] = [];
  for (const id of ignore) {
    const c = set.chains[id];
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < minLenMm || never.has(id)) continue;
    if (holdSizeLine && !probeOff('LEAKS_RESCUE_ON_LINE') && onOneSizeLine(c)) continue;
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

/** The ranked (size) lines of a model on a segment grid. */
function rankedGrid(set: ChainSet, m: WallModel): SegGrid {
  const ranked = new SegGrid(4);
  for (const id of m.byRank.flat()) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) ranked.addPolyline(id, c.closed ? [...c.pts, c.pts[0]] : c.pts);
  }
  return ranked;
}

/**
 * The ranked lines a line lies WHOLLY on — every vertex and every 0.5 mm between within 0.3 mm of
 * each of them — or null when it leaves them anywhere.
 */
function wholeOnRanked(set: ChainSet, ranked: SegGrid, c: { pts: PtMm[] }): Set<ChainId> | null {
  let live: Set<ChainId> | null = null;
  const probe = (p: PtMm) => {
    const here = new Set<ChainId>();
    ranked.near(p, 0.3, (rid, i) => {
      if (here.has(rid) || (live && !live.has(rid))) return;
      const q = set.chains[rid].pts;
      const q1 = i + 1 < q.length ? q[i + 1] : q[0];
      if (segNearest(p, q[i], q1).d <= 0.3) here.add(rid);
    });
    live = here;
    return here.size > 0;
  };
  for (let i = 0; i < c.pts.length; i++) {
    if (!probe(c.pts[i])) return null;
    if (i + 1 >= c.pts.length) break;
    const a = c.pts[i];
    const b = c.pts[i + 1];
    const k = Math.ceil(dist(a, b) / 0.5);
    for (let j = 1; j < k; j++)
      if (!probe({ x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k })) return null;
  }
  return live;
}

/**
 * COPY RANKS (polupalto): a rescued line lying wholly on the line(s) of ONE size rank is that
 * size's line drawn twice (a tile fragment's copy) — id → that rank. Other lines are absent.
 */
export function copyRanks(
  set: ChainSet,
  m: WallModel,
  ids: readonly ChainId[],
): Map<ChainId, number> {
  const out = new Map<ChainId, number>();
  if (m.mode !== 'graded' || probeOff('M_COPY_RANK_OFF')) return out;
  const rank = new Map<ChainId, number>();
  m.byRank.forEach((rids, r) => rids.forEach((id) => rank.set(id, r)));
  const ranked = rankedGrid(set, m);
  for (const id of ids) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    const on = wholeOnRanked(set, ranked, c);
    if (!on?.size) continue;
    const rs = new Set([...on].map((rid) => rank.get(rid)));
    const r = [...rs][0];
    if (rs.size === 1 && r !== undefined) out.set(id, r);
  }
  return out;
}

/** How far beside a copy its two sides are probed in s's raster, mm (a wall pixel is 0.5 mm). */
const SIDE_PROBE_MM = 1;
/**
 * A line on the copy's far side (inside s's piece for a larger r, outside it for a smaller one)
 * this close is the same edge drawn twice, mm: stacked strokes drift 0.1–0.5 mm.
 */
const FAR_SIDE_MM = 1;
/** How far beside a copy r's own edge (its own line or a common one) shows r's side, mm. */
const EDGE_SIDE_MM = 3;

/**
 * Rank r's walls of a copy of rank s's line (`copyRanks`). Where a line of r — or of a size between
 * r and s — runs beside the copy, r is drawn apart from s there (sizes grade in order: r cannot
 * coincide with s where a size between them does not), so the copy is s's line, no wall of r. As a
 * wall it closed the strip between r's own line and s's into r's piece (polupalto: 44 on 46's
 * copies, 52 on 54's — each piece a strip too wide, read as right). Where no such line is beside,
 * r coincides with s and the copy stays r's wall (the shared edge drawn once, as s). "Beside" as
 * for the lone stretches: within `sideMm`, roughly parallel (chords over ±2.5 mm: a motif pen is
 * a zigzag), foot not within 3 mm of that line's end — and not ON the copy (> `onMm`, the
 * tolerance a copy lies on its line with): a size drawn apart by any amount is apart (polupalto's
 * back facing grades its neckline ~0.7 mm per size).
 * Which side: `outsideOf(s)` tells a point outside every closed piece of s (null on a wall).
 * r's side of the copy is outside s's piece when r is larger, inside when smaller. A line there
 * counts. A line on the far side counts only past FAR_SIDE_MM: closer, it is this edge drawn twice
 * (zhaket's sleeve extension has 40's line 0.4 mm inside 36's side edge; counted, it took the edge
 * from 42, and 42 closed on its hem fold); further, sizes cross there (reef's side seam fans out:
 * 3XL and 4XL run 1.4–3.4 mm outside 5XL's edge copy; not counted, the copy walled them and they
 * took 5XL's piece). Nor where r's own edge (its own line or a common one) runs on the far side
 * within EDGE_SIDE_MM: the grading turns inward there, the far side is r's. zhaket's cuff corner
 * has 44's own line 0.7–1.1 mm inside 36's copy (skipped, the copy walled 44 and it took the strip
 * between); palto's front shoulder has 76 and 80 0.3–1 mm inside 72's copy with the common
 * shoulder line beyond them (skipped, 72's copy walled 84 and 88 and they ran on 72's line).
 * Either way the line must belong to the copy's own piece: the way over keeps to that side of s's
 * outline (no other piece of s between). Where the side cannot be told (s's piece not closed
 * there), every line counts.
 */
export function copyWallsOf(
  set: ChainSet,
  m: WallModel,
  copies: ReadonlyMap<ChainId, number>,
  ids: readonly ChainId[],
  r: number,
  outsideOf?: (s: number) => ((p: PtMm) => boolean | null) | null,
  sideMm = 20,
  onMm = 0.3,
): WallItem[] {
  const out: WallItem[] = [];
  // r's own edge: its own lines and the common ones (walls of every rank)
  const edgeGrid = new SegGrid(8);
  for (const id of [...(m.byRank[r] ?? []), ...m.common]) {
    const c = set.chains[id];
    if (c && c.pts.length >= 2) edgeGrid.addPolyline(id, c.pts);
  }
  const grids = new Map<number, SegGrid>();
  const gridFor = (s: number) => {
    let g = grids.get(s);
    if (g) return g;
    g = new SegGrid(8);
    const lo = Math.min(r, s);
    const hi = Math.max(r, s);
    for (let t = lo; t <= hi; t++) {
      if (t === s) continue;
      for (const id of m.byRank[t] ?? []) {
        const c = set.chains[id];
        if (c && c.pts.length >= 2) g.addPolyline(id, c.pts);
      }
    }
    grids.set(s, g);
    return g;
  };
  const step = 1;
  // Directions are chords over ±2.5 mm of arc, not one segment's: a motif pen (crosses) is a
  // zigzag polyline whose segments cross the line's run.
  const chordMm = 2.5;
  const cums = new Map<ChainId, number[]>();
  for (const id of ids) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    const s = copies.get(id);
    if (s === undefined || s === r) {
      out.push(...itemsOf(set, [id]));
      continue;
    }
    const grid = gridFor(s);
    const outS = outsideOf?.(s) ?? null;
    const pts = c.pts;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + dist(pts[i - 1], pts[i]));
    const L = cum[cum.length - 1];
    const keep: boolean[] = [];
    const at: number[] = [];
    let seg = 0;
    for (let a = 0; a <= L + 1e-9; a += step) {
      while (seg + 2 < pts.length && cum[seg + 1] < a) seg++;
      const p0 = pts[seg];
      const p1 = pts[seg + 1];
      const l = cum[seg + 1] - cum[seg] || 1;
      const u = (a - cum[seg]) / l;
      const p = { x: p0.x + (p1.x - p0.x) * u, y: p0.y + (p1.y - p0.y) * u };
      const t = chordDir(pts, cum, a, chordMm);
      const best = new Map<number, { d: number; i: number; u: number }>();
      grid.near(p, sideMm, (o, i) => {
        const op = set.chains[o].pts;
        const q = segNearest(p, op[i], op[i + 1]);
        const b = best.get(o);
        if (!b || q.d < b.d) best.set(o, { d: q.d, i, u: q.u });
      });
      // r's side of the copy here: +1 the normal's, −1 the other, 0 unknown (every line counts)
      const n = { x: -t.y, y: t.x };
      let want = 0;
      if (outS && best.size) {
        const sideAt = (k: number) => {
          for (let e = SIDE_PROBE_MM; e <= SIDE_PROBE_MM + 1.5; e += 0.5) {
            const v = outS({ x: p.x + k * n.x * e, y: p.y + k * n.y * e });
            if (v !== null) return v;
          }
          return null;
        };
        const a = sideAt(1);
        const b = sideAt(-1);
        if (a !== null && b !== null && a !== b) want = (a ? 1 : -1) * (r > s ? 1 : -1);
      }
      // r's own edge beside on the far side (as "beside" above, within EDGE_SIDE_MM)
      let edgeFar: boolean | undefined;
      const farEdge = () => {
        if (edgeFar !== undefined) return edgeFar;
        edgeFar = false;
        const near = new Map<number, { d: number; i: number; u: number }>();
        edgeGrid.near(p, EDGE_SIDE_MM, (o, i) => {
          const op = set.chains[o].pts;
          const q = segNearest(p, op[i], op[i + 1]);
          const b = near.get(o);
          if (!b || q.d < b.d) near.set(o, { d: q.d, i, u: q.u });
        });
        for (const [o, b] of near) {
          if (b.d > EDGE_SIDE_MM || b.d <= onMm) continue;
          const op = set.chains[o].pts;
          let oc = cums.get(o);
          if (!oc) cums.set(o, (oc = cumOf(op)));
          const foot = oc[b.i] + (oc[b.i + 1] - oc[b.i]) * b.u;
          if (Math.min(foot, oc[oc.length - 1] - foot) < 3) continue;
          const q = chordDir(op, oc, foot, chordMm);
          if (Math.abs(t.x * q.x + t.y * q.y) < 0.8) continue;
          const f = {
            x: op[b.i].x + (op[b.i + 1].x - op[b.i].x) * b.u,
            y: op[b.i].y + (op[b.i + 1].y - op[b.i].y) * b.u,
          };
          if (Math.sign((f.x - p.x) * n.x + (f.y - p.y) * n.y) === -want) return (edgeFar = true);
        }
        return edgeFar;
      };
      let beside = false;
      for (const [o, b] of best) {
        if (b.d > sideMm || b.d <= onMm) continue;
        const op = set.chains[o].pts;
        let oc = cums.get(o);
        if (!oc) cums.set(o, (oc = cumOf(op)));
        const foot = oc[b.i] + (oc[b.i + 1] - oc[b.i]) * b.u;
        if (Math.min(foot, oc[oc.length - 1] - foot) < 3) continue;
        const q = chordDir(op, oc, foot, chordMm);
        if (Math.abs(t.x * q.x + t.y * q.y) < 0.8) continue;
        if (want && outS) {
          const f = {
            x: op[b.i].x + (op[b.i + 1].x - op[b.i].x) * b.u,
            y: op[b.i].y + (op[b.i + 1].y - op[b.i].y) * b.u,
          };
          const v = { x: f.x - p.x, y: f.y - p.y };
          const own = Math.sign(v.x * n.x + v.y * n.y) === want; // on r's side
          if (!own && b.d <= FAR_SIDE_MM && !farEdge()) continue; // the same edge drawn twice
          // the same piece: the way over stays on that side of s's outline
          const outside = own === r > s;
          let same = true;
          for (let e = SIDE_PROBE_MM; e <= b.d - 0.5 && same; e += 0.5) {
            const w = outS({ x: p.x + (v.x * e) / b.d, y: p.y + (v.y * e) / b.d });
            if (w !== null && w !== outside) same = false;
          }
          if (!same) continue;
        }
        beside = true;
        break;
      }
      keep.push(!beside);
      at.push(a);
    }
    if (keep.every(Boolean)) {
      out.push(...itemsOf(set, [id]));
      continue;
    }
    let i = 0;
    while (i < keep.length) {
      if (!keep[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < keep.length && keep[j + 1]) j++;
      const a = Math.max(0, at[i] - step / 2);
      const b = j === keep.length - 1 ? L : Math.min(L, at[j] + step / 2);
      if (b - a >= 1) out.push({ chain: id, pts: sub(pts, cum, a, b) });
      i = j + 1;
    }
  }
  return out;
}

/**
 * SANDWICH (zhaket): where a smaller size's line and a larger size's line run ON each other, every
 * size between runs there too — sizes nest, and a point on both outlines is on every outline
 * between them — so that stretch is a wall of r, drawn in r's pen or not. zhaket's sleeve
 * extension draws each size's side edge from its own hem fold down, stacked on one place; 42's is
 * drawn only by 40's and 44's, and 42 closed on its hem fold. "On" = within `onMm` (stacked
 * strokes measure 0.1–0.5 mm apart there), chords over ±2.5 mm parallel (cos ≥ 0.95: a crossing
 * is no shared edge), over ≥ 3 mm. Only where no line of a size between the two, nor a line of
 * no known size (an orphan of `m.graded`, or a rescued line: `rescued` id → its size, null
 * unknown), runs BESIDE the stretch (off it, within `sideMm`, parallel, foot not at that line's
 * end): there sizes do not nest — reef's hem has XS's and 2XL's lines on each other with S's own
 * 2.2 mm inside, viola's 38 and 48 lines meet with 40's (an orphan) 1.1 mm inside — and a wall
 * outside r's line would hand r the strip between. Nor where r's own line runs there, on the
 * stack or beside: r has its edge, and the wall (b's line, up to `onMm` off it) only moved r's
 * outline off its own line (kombinezon P01 8 and FP 10: 60–90 mm runs, G3 held them). Returned as
 * stretches of the larger size's line.
 */
export function sandwichWalls(
  set: ChainSet,
  m: WallModel,
  r: number,
  rescued: ReadonlyMap<ChainId, number | null> = new Map(),
  onMm = 0.6,
  sideMm = 20,
): WallItem[] {
  const out: WallItem[] = [];
  if (m.mode !== 'graded' || r <= 0 || r >= m.byRank.length - 1 || probeOff('M_SANDWICH_OFF'))
    return out;
  // every size line (and rescued line) with its size; null = a size not known
  const rankOf = new Map<ChainId, number | null>();
  m.byRank.forEach((ids, k) => ids?.forEach((id) => rankOf.set(id, k)));
  for (const [id, k] of rescued) if (!rankOf.has(id)) rankOf.set(id, k);
  for (const id of m.graded) if (!rankOf.has(id)) rankOf.set(id, null);
  const all = new SegGrid(8);
  let lowerAny = false;
  for (const [id, k] of rankOf) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2) continue;
    all.addPolyline(id, c.pts);
    if (k != null && k < r) lowerAny = true;
  }
  if (!lowerAny) return out;
  const step = 1;
  const chordMm = 2.5;
  const cums = new Map<ChainId, number[]>();
  const cumFor = (o: ChainId) => {
    let oc = cums.get(o);
    if (!oc) cums.set(o, (oc = cumOf(set.chains[o].pts)));
    return oc;
  };
  const dirAt = (o: ChainId, i: number, u: number) => {
    const op = set.chains[o].pts;
    const oc = cumFor(o);
    const foot = oc[i] + (oc[i + 1] - oc[i]) * u;
    return { foot, len: oc[oc.length - 1], d: chordDir(op, oc, foot, chordMm) };
  };
  // the largest size below r whose line runs on p (−1: none)
  const lowerOn = (p: PtMm, t: PtMm) => {
    let s = -1;
    all.near(p, onMm, (o, i) => {
      const k = rankOf.get(o);
      if (k == null || k >= r || k <= s) return;
      const op = set.chains[o].pts;
      const q = segNearest(p, op[i], op[i + 1]);
      if (q.d > onMm) return;
      const { d } = dirAt(o, i, q.u);
      if (Math.abs(t.x * d.x + t.y * d.y) >= 0.95) s = k;
    });
    return s;
  };
  // a line of a size strictly between s and b (or of no known size) beside p, off the stack; or
  // r's own line anywhere near, on the stack included
  const between = (p: PtMm, t: PtMm, s: number, b: number) => {
    let found = false;
    all.near(p, sideMm, (o, i) => {
      if (found) return;
      const k = rankOf.get(o);
      if (k != null && (k <= s || k >= b)) return;
      const op = set.chains[o].pts;
      const q = segNearest(p, op[i], op[i + 1]);
      // r's own line on the stretch too: r has its edge there, the wall would only move it
      if (q.d > sideMm || (q.d <= onMm && k !== r)) return;
      const { foot, len, d } = dirAt(o, i, q.u);
      if (Math.min(foot, len - foot) < 3) return;
      if (Math.abs(t.x * d.x + t.y * d.y) >= 0.8) found = true;
    });
    return found;
  };
  for (let b = r + 1; b < m.byRank.length; b++)
    for (const id of m.byRank[b] ?? []) {
      const c = set.chains[id];
      if (!c || c.pts.length < 2) continue;
      const pts = c.pts;
      const cum = cumOf(pts);
      const L = cum[cum.length - 1];
      if (L < 3) continue;
      const on: boolean[] = [];
      const at: number[] = [];
      for (let a = 0; a <= L + 1e-9; a += step) {
        const p = arcPt(pts, cum, a);
        const t = chordDir(pts, cum, a, chordMm);
        const s = lowerOn(p, t);
        on.push(s >= 0 && !between(p, t, s, b));
        at.push(a);
      }
      let i = 0;
      while (i < on.length) {
        if (!on[i]) {
          i++;
          continue;
        }
        let j = i;
        while (j + 1 < on.length && on[j + 1]) j++;
        const a0 = Math.max(0, at[i] - step / 2);
        const b0 = Math.min(L, at[j] + step / 2);
        if (b0 - a0 >= 3) out.push({ chain: id, pts: sub(pts, cum, a0, b0) });
        i = j + 1;
      }
    }
  return out;
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

/** One continuity wall of a rank (P1): an already drawn line closing two of its dangling ends. */
export type ContinuityWall = WallItem & {
  /** R0 a chain path joining two ends; R1 the stretch of one line both ends lie on; R2 a spine. */
  rule: 'R0' | 'R1' | 'R2';
  /** The drawn chains the wall runs along (R0: every chain of the path). */
  chains: ChainId[];
  /** R0 through an ignore / unclassified line: the closure needs anchor ranks on both sides. */
  bracket?: boolean;
  /** MOOD Ф3.2: an R1 stretch walked along an overlay of ≥ 3 other sizes' lines. */
  overlay?: boolean;
};

export type ContinuityOpts = {
  /** An end touches a line / two lines join: ≤ this, mm. */
  junctionMm?: number;
  /** R0: tangent continuity at every junction, degrees. */
  angleDeg?: number;
  /** R1 / R2: the longest stretch of a foreign line taken, mm. */
  maxStretchMm?: number;
  /** R0: the most chains one path joins, and its longest length, mm. */
  maxPathChains?: number;
  maxPathMm?: number;
  /**
   * HARD: a continuity wall never runs where an effective wall of rank r lies beside it (within
   * `sideMm`, roughly parallel, the foot inside that wall — more than one 2 mm sample of it): where
   * r draws an edge a few mm away, the foreign line is another size's edge, not r's.
   */
  sideMm?: number;
  /** Further effective walls of r for that test (lines reranked to r, the operator's lines). */
  beside?: readonly WallItem[];
  /**
   * MOOD Ф3.2 (identity runs only): the size lines as overlay evidence — R1 then also walks an
   * overlay (≥ 3 other sizes' pens in one place) between two of r's dangling ends.
   */
  overlay?: OverlayLines | null;
};

/**
 * Roles an R0 path may never run on: inside a piece, not its edge — and a notch, whose whole
 * interior a path would take (a V or U mark is a tooth).
 */
export const NOT_EDGE_ROLES = new Set(['notch', 'internal', 'grain', 'seam']);
/**
 * Roles an R1 stretch / R2 spine may never run on. A notch-class line may carry one: the stretch is
 * only the part between the rank's own feet on it, smooth (no tooth) — the tile-seam trims a sheet
 * classes as notch marks (palto's 25) are pieces of an edge.
 */
export const NOT_SPAN_ROLES = new Set(['internal', 'grain', 'seam']);

type End = { item: number; at: PtMm; t: PtMm; arc: number };

/** Arc positions along a polyline. */
function cumOf(pts: readonly PtMm[]): number[] {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + dist(pts[i - 1], pts[i]));
  return c;
}

/** Unit direction leaving a polyline at one end (from ~2 mm back along it to the end point). */
function endTangent(pts: readonly PtMm[], end: 0 | 1, backMm = 2): PtMm {
  const n = pts.length;
  const p = end ? pts[n - 1] : pts[0];
  let k = end ? n - 1 : 0;
  const step = end ? -1 : 1;
  let acc = 0;
  while (k + step >= 0 && k + step < n && acc < backMm) {
    acc += dist(pts[k], pts[k + step]);
    k += step;
  }
  const q = pts[k];
  const L = dist(p, q) || 1;
  return { x: (p.x - q.x) / L, y: (p.y - q.y) / L };
}

/**
 * CONTINUITY WALLS of rank r (P1): the rank closes only through lines the source already draws,
 * between its OWN dangling ends — nothing is drawn in empty space. Where every size's line ends on
 * one edge drawn once (leonie's pocket bag: each size's top line stops on the shared side drawn in
 * the largest size's pen; the lone-portion test drops that side wherever other sizes' lines run
 * beside it), rank r's walls stop short of each other on that edge.
 *   R0  a chain path joins two dangling ends of r: every junction ≤ `junctionMm`, tangent within
 *       `angleDeg` at both ends and at each join; never a notch / internal / grain / seam line; the
 *       path stays by the chord between the two ends (≤ 1 mm + 2 % of it off, ≤ 2 % + 1 mm longer:
 *       no excursion, no tooth); through an ignore / unclassified line it is `bracket`ed;
 *   R1  two dangling ends of r lie on the same foreign line L (≤ `junctionMm`): the stretch of L
 *       between them (the shorter way round a loop), smooth (no tooth) — refused when it crosses
 *       r's walls; never on an internal / grain / seam line (a notch-class line may carry it);
 *   R2  a SPINE: from r's end along a foreign line L to r's nearest wall (the shorter way) — only
 *       when L is a proven boundary there (`sharedFolds`' tests): ≥ 2 other ranks END on it across
 *       (T-landings), all from ONE side, r too; no rank line crosses or continues through it; L is
 *       no grain / internal / seam line.
 * No wall runs beside an effective wall of r (`sideMm`, hard). `items` are rank r's walls as the
 * fill draws them; `skip` chains are never walls (frames, the operator's exclusions). A dangling
 * end = an end of an open wall item with no other wall reaching within `junctionMm` and leaving it
 * within 3 mm. Per-rank additions, never a reclassification; the fill keeps a closure through them
 * only when the family's anchors agree (fill.ts `continuityVerdicts`).
 */
export function continuityWalls(
  set: ChainSet,
  m: WallModel,
  r: number,
  items: readonly WallItem[],
  skip: ReadonlySet<ChainId> = new Set(),
  o: ContinuityOpts = {},
): ContinuityWall[] {
  if (m.mode !== 'graded') return [];
  const J = o.junctionMm ?? 1;
  const cosA = Math.cos(((o.angleDeg ?? 15) * Math.PI) / 180);
  const maxStretch = o.maxStretchMm ?? 600;
  const maxPath = o.maxPathChains ?? 8;
  const maxPathMm = o.maxPathMm ?? 600;
  const roleOf = new Map<ChainId, string>();
  for (const k of set.classes) for (const id of k.chains) roleOf.set(id, k.role);
  // LINEFIX: a line the operator called no size line closes no size
  const opIgnored = answeredLines(set).ignored;
  const wg = new SegGrid(4);
  const cums: number[][] = [];
  items.forEach((it, i) => {
    wg.addPolyline(i, it.pts, it.closed);
    cums.push(cumOf(it.pts));
  });
  const segOf = (i: number, s: number): [PtMm, PtMm] => {
    const p = items[i].pts;
    return [p[s], s + 1 < p.length ? p[s + 1] : p[0]];
  };
  const dItem = (q: PtMm, i: number) => {
    let d = Infinity;
    const p = items[i].pts;
    for (let s = 0; s + 1 < p.length; s++) d = Math.min(d, segNearest(q, p[s], p[s + 1]).d);
    return d;
  };
  // ── dangling ends ──
  const ends: End[] = [];
  items.forEach((it, i) => {
    if (it.closed || it.pts.length < 2) return;
    const cum = cums[i];
    const L = cum[cum.length - 1];
    if (L < 1) return;
    for (const e of [0, 1] as const) {
      const p = e ? it.pts[it.pts.length - 1] : it.pts[0];
      const arc = e ? L : 0;
      let touch = false;
      wg.near(p, 3, (j, s) => {
        if (touch) return;
        const [a, b] = segOf(j, s);
        const h = segNearest(p, a, b);
        if (h.d > 3) return;
        if (j === i) {
          // the item's own far part (a loop that does not quite close) counts as another wall
          const at = (cums[j][s] ?? 0) + h.u * dist(a, b);
          if (Math.abs(at - arc) < 5 || h.d > J) return;
          touch = true;
          return;
        }
        // another wall reaches the end AND leaves the item within 3 mm (a duplicate of the item
        // lying on it — a lone stretch of the same line — is no junction)
        let near = false;
        let off = false;
        const n = Math.max(1, Math.ceil(dist(a, b) / 0.5));
        for (let k = 0; k <= n && !(near && off); k++) {
          const q = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n };
          const dq = dist(q, p);
          if (dq > 3) continue;
          if (dq <= J) near = true;
          if (dItem(q, i) > 0.6) off = true;
        }
        if ((h.d <= J || near) && off) touch = true;
      });
      if (!touch) ends.push({ item: i, at: p, t: endTangent(it.pts, e), arc });
    }
  });
  if (!ends.length) return [];
  // ── foreign lines: every chain that is not already one of r's whole walls ──
  const whole = new Set<ChainId>();
  for (const it of items) {
    const c = set.chains[it.chain];
    if (c && it.pts === c.pts) whole.add(c.id);
  }
  const fg = new SegGrid(4);
  const foreign: ChainId[] = [];
  for (const c of set.chains) {
    if (!c || c.pts.length < 2 || whole.has(c.id) || skip.has(c.id) || opIgnored.has(c.id))
      continue;
    foreign.push(c.id);
    fg.addPolyline(c.id, c.pts, c.closed);
  }
  const fcum = new Map<ChainId, number[]>();
  const cumF = (id: ChainId) => {
    let v = fcum.get(id);
    if (!v) {
      const c = set.chains[id];
      v = cumOf(c.closed ? [...c.pts, c.pts[0]] : c.pts);
      fcum.set(id, v);
    }
    return v;
  };
  const ptsF = (id: ChainId) => {
    const c = set.chains[id];
    return c.closed ? [...c.pts, c.pts[0]] : c.pts;
  };
  // ── HARD beside test: every effective wall of r (incl. reranked and operator lines) ──
  const sideMm = o.sideMm ?? 20;
  const bw: WallItem[] = [...items, ...(o.beside ?? [])];
  const bg = new SegGrid(8);
  bw.forEach((it, k) => bg.addPolyline(k, it.pts, it.closed));
  const bcum = bw.map((it) => cumOf(it.pts));
  /**
   * length of `pts` with one of r's walls beside it, mm: a wall of another chain than the stretch's
   * own (`self`), roughly parallel, its perpendicular foot inside it (not a corner it converges on),
   * more than `junctionMm` off (closer is the same edge drawn twice, not a neighbouring one)
   */
  const besideMm = (pts: readonly PtMm[], self: ReadonlySet<ChainId>) => {
    let acc = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const l = dist(a, b);
      if (l < 1e-6) continue;
      const tx = (b.x - a.x) / l;
      const ty = (b.y - a.y) / l;
      const n = Math.max(1, Math.ceil(l / 2));
      for (let k = 0; k < n; k++) {
        const p = {
          x: a.x + (b.x - a.x) * ((k + 0.5) / n),
          y: a.y + (b.y - a.y) * ((k + 0.5) / n),
        };
        let beside = false;
        bg.near(p, sideMm, (w, sIdx) => {
          if (beside || self.has(bw[w].chain)) return;
          const q = bw[w].pts;
          const q1 = sIdx + 1 < q.length ? q[sIdx + 1] : q[0];
          const h = segNearest(p, q[sIdx], q1);
          if (h.d > sideMm || h.d <= J) return;
          const ql = dist(q[sIdx], q1) || 1;
          const along =
            ((p.x - q[sIdx].x) * (q1.x - q[sIdx].x) + (p.y - q[sIdx].y) * (q1.y - q[sIdx].y)) / ql;
          if (along < -0.5 || along > ql + 0.5) return; // a corner it converges on, not beside
          if (Math.abs((tx * (q1.x - q[sIdx].x) + ty * (q1.y - q[sIdx].y)) / ql) < 0.8) return;
          const cum = bcum[w];
          const at = (cum[sIdx] ?? 0) + h.u * ql;
          if (!bw[w].closed && (at < 3 || cum[cum.length - 1] - at < 3)) return;
          beside = true;
        });
        if (beside) acc += l / n;
      }
    }
    return acc;
  };
  /** nothing of r's beside it, beyond one 2 mm sample (sampling epsilon only) */
  const lonely = (pts: readonly PtMm[], self: Iterable<ChainId>) =>
    besideMm(pts, new Set(self)) <= 2.01;
  /**
   * No tooth or excursion: over every 10 mm of the stretch the line is at most 15 % longer than
   * its chord there (a curve stays well under; a zigzag link or a tooth does not)
   */
  const smooth = (pts: readonly PtMm[]) => {
    const cum = cumOf(pts);
    const L = cum[cum.length - 1];
    if (L < 4) return true;
    const win = Math.min(10, L);
    for (let a = 0; a + win <= L + 1e-9; a += 1) {
      const s0 = sub(pts as PtMm[], cum, a, a + win);
      const chord = dist(s0[0], s0[s0.length - 1]);
      if (win > 1.15 * chord + 0.5) return false;
    }
    return true;
  };
  const out: ContinuityWall[] = [];
  const used = new Set<number>();
  /**
   * MOOD Ф3.2: a stretch lying on an overlay of ≥ 3 other sizes' pens (≥ 80 % of it). The hops
   * from r's ends onto the line (the first and last segment of an R1 / R2 stretch) are not judged;
   * a stretch shorter than 2 mm is judged at its middle.
   */
  const onOverlay = (pts: readonly PtMm[]) => {
    if (!o.overlay || pts.length < 2) return false;
    const core = pts.length > 3 ? pts.slice(1, -1) : pts;
    let len = 0;
    for (let i = 0; i + 1 < core.length; i++) len += dist(core[i], core[i + 1]);
    if (len >= 2) return overlayShare(core, o.overlay, r) >= OVERLAY_ON_SHARE;
    const a = core[0];
    const b = core[core.length - 1];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return overlayAt(mid, null, o.overlay, r).ranks.size >= OVERLAY_MIN_PENS;
  };
  // ── R0: chain paths joining two dangling ends ──
  const endGrid = new SegGrid(2);
  ends.forEach((e, k) => endGrid.addSeg(k, 0, e.at, e.at));
  const chainEnds = new SegGrid(2);
  for (const id of foreign) {
    const c = set.chains[id];
    if (c.closed || NOT_EDGE_ROLES.has(roleOf.get(id) ?? '')) continue;
    chainEnds.addSeg(id, 0, c.pts[0], c.pts[0]);
    chainEnds.addSeg(id, 1, c.pts[c.pts.length - 1], c.pts[c.pts.length - 1]);
  }
  const starts = (p: PtMm, t: PtMm, not: ReadonlySet<ChainId>) => {
    const res: [ChainId, 0 | 1][] = [];
    chainEnds.near(p, J, (id, e) => {
      if (not.has(id) || res.some(([x, y]) => x === id && y === e)) return;
      const c = set.chains[id];
      const q = e ? c.pts[c.pts.length - 1] : c.pts[0];
      if (dist(q, p) > J) return;
      const ot = endTangent(c.pts, e as 0 | 1);
      if (-(ot.x * t.x + ot.y * t.y) >= cosA) res.push([id, e as 0 | 1]);
    });
    return res;
  };
  /** the path (as one polyline, oriented from `a`) stays by the chord a→b: no excursion, no tooth */
  const byChord = (a: PtMm, b: PtMm, path: { id: ChainId; rev: boolean }[]) => {
    const poly: PtMm[] = [a];
    for (const { id, rev } of path) {
      const q = set.chains[id].pts;
      poly.push(...(rev ? q.slice().reverse() : q));
    }
    poly.push(b);
    const chord = dist(a, b);
    let len = 0;
    let dev = 0;
    for (let i = 0; i < poly.length; i++) {
      if (i) len += dist(poly[i - 1], poly[i]);
      dev = Math.max(dev, segNearest(poly[i], a, b).d);
    }
    return dev <= 1 + 0.02 * chord && len <= 1.02 * chord + 1;
  };
  ends.forEach((e0, k0) => {
    if (used.has(k0)) return;
    type Node = { path: { id: ChainId; rev: boolean }[]; at: PtMm; t: PtMm; len: number };
    const stack: Node[] = [{ path: [], at: e0.at, t: e0.t, len: 0 }];
    let found: { path: Node['path']; k: number } | null = null;
    while (stack.length && !found) {
      const nd = stack.pop()!;
      if (nd.path.length >= maxPath) continue;
      for (const [id, e] of starts(nd.at, nd.t, new Set(nd.path.map((x) => x.id)))) {
        const c = set.chains[id];
        const far = e ? c.pts[0] : c.pts[c.pts.length - 1];
        const ft = endTangent(c.pts, e ? 0 : 1);
        const len = nd.len + c.lengthMm;
        if (len > maxPathMm) continue;
        const path = [...nd.path, { id, rev: e === 1 }];
        let hit = -1;
        endGrid.near(far, J, (k) => {
          if (hit >= 0 || k === k0 || used.has(k)) return;
          const e2 = ends[k];
          if (dist(e2.at, far) > J) return;
          if (-(ft.x * e2.t.x + ft.y * e2.t.y) >= cosA) hit = k;
        });
        if (hit >= 0 && byChord(e0.at, ends[hit].at, path)) {
          found = { path, k: hit };
          break;
        }
        stack.push({ path, at: far, t: ft, len });
      }
    }
    if (!found) return;
    const ids = found.path.map((x) => x.id);
    if (!ids.every((id) => lonely(set.chains[id].pts, ids))) return;
    used.add(k0);
    used.add(found.k);
    // through an ignore / unclassified line: the closure needs anchors on both sides
    const bracket = ids.some((id) => {
      const role = roleOf.get(id);
      return role === undefined || role === 'ignore';
    });
    for (const id of ids)
      out.push({
        chain: id,
        pts: set.chains[id].pts,
        ...(onOverlay(set.chains[id].pts) ? { overlay: true } : {}),
        rule: 'R0',
        chains: [...ids],
        ...(bracket ? { bracket } : {}),
      });
  });
  // ── feet of the remaining ends on foreign lines ──
  type Foot = { k: number; id: ChainId; s: number; q: PtMm };
  const feet: Foot[] = [];
  ends.forEach((e, k) => {
    if (used.has(k)) return;
    const best = new Map<ChainId, { d: number; s: number; q: PtMm }>();
    fg.near(e.at, J, (id, s) => {
      const p = ptsF(id);
      if (s + 1 >= p.length) return;
      const h = segNearest(e.at, p[s], p[s + 1]);
      if (h.d > J) return;
      const b = best.get(id);
      if (!b || h.d < b.d)
        best.set(id, { d: h.d, s: cumF(id)[s] + h.u * dist(p[s], p[s + 1]), q: h.q });
    });
    for (const [id, b] of best)
      if (!NOT_SPAN_ROLES.has(roleOf.get(id) ?? '')) feet.push({ k, id, s: b.s, q: b.q });
  });
  const stretch = (id: ChainId, a: number, b: number) => sub(ptsF(id), cumF(id), a, b);
  /** a stretch crosses r's walls (a proper crossing ≥ 20°, away from its two ends) */
  const crosses = (pts: PtMm[]) => {
    const cum = cumOf(pts);
    const L = cum[cum.length - 1];
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      let hit = false;
      wg.near(mid, dist(a, b) / 2 + 0.01, (j, s) => {
        if (hit) return;
        const [c, d] = segOf(j, s);
        const x = segIntersect(a, b, c, d);
        if (!x) return;
        const at = cum[i] + x.t * dist(a, b);
        if (at < 1.5 || at > L - 1.5) return;
        const l1 = dist(a, b) || 1;
        const l2 = dist(c, d) || 1;
        const sin = Math.abs((b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x)) / (l1 * l2);
        if (sin >= Math.sin((20 * Math.PI) / 180)) hit = true;
      });
      if (hit) return true;
    }
    return false;
  };
  // ── R1: two ends on one line, the shortest stretches first ──
  const byLine = new Map<ChainId, Foot[]>();
  for (const f of feet) {
    const a = byLine.get(f.id);
    if (a) a.push(f);
    else byLine.set(f.id, [f]);
  }
  type Pair = { a: Foot; b: Foot; pts: PtMm[]; len: number };
  const pairs: Pair[] = [];
  for (const [id, fs] of byLine) {
    if (fs.length < 2) continue;
    const c = set.chains[id];
    const per = cumF(id)[cumF(id).length - 1];
    for (let i = 0; i < fs.length; i++)
      for (let j = i + 1; j < fs.length; j++) {
        const [a, b] = fs[i].s <= fs[j].s ? [fs[i], fs[j]] : [fs[j], fs[i]];
        if (a.k === b.k) continue;
        let pts = stretch(id, a.s, b.s);
        let len = b.s - a.s;
        if (c.closed && per - len < len) {
          pts = [...stretch(id, b.s, per), ...stretch(id, 0, a.s).slice(1)];
          len = per - len;
        }
        if (len > maxStretch || len < 0.3) continue;
        pairs.push({ a, b, pts, len });
      }
  }
  pairs.sort((x, y) => x.len - y.len);
  for (const p of pairs) {
    if (used.has(p.a.k) || used.has(p.b.k)) continue;
    if (crosses(p.pts) || !smooth(p.pts) || !lonely(p.pts, [p.a.id])) continue;
    used.add(p.a.k);
    used.add(p.b.k);
    const ea = ends[p.a.k].at;
    const eb = ends[p.b.k].at;
    const first = dist(ea, p.pts[0]) <= dist(eb, p.pts[0]) ? ea : eb;
    const last = first === ea ? eb : ea;
    const pts = [first, ...p.pts, last];
    out.push({
      chain: p.a.id,
      pts,
      rule: 'R1',
      chains: [p.a.id],
      ...(onOverlay(pts) ? { overlay: true } : {}),
    });
  }
  // ── R1 over an OVERLAY (MOOD Ф3.2): a stretch where r draws nothing of its own (a motif whose
  //    beads are not read there) but ≥ 3 other sizes draw their lines in one place, each in its own
  //    pen — the edge is proven there. From one dangling end of r the walk follows the overlay (from
  //    one of its lines to the next where one stops), every millimetre proven again, to another
  //    dangling end of r; the stretch is then judged like R1's (no crossing, smooth, nothing of r's
  //    beside it), and the closure by the family's anchors (fill.ts `continuityVerdicts`) ──
  if (o.overlay) {
    const L = o.overlay;
    const at = (k: number) => {
      const e = ends[k];
      const ov = overlayAt(e.at, null, L, r, J);
      return ov.ranks.size >= OVERLAY_MIN_PENS ? ov.dir : null;
    };
    const onOv = new Map<number, PtMm>();
    ends.forEach((_, k) => {
      if (used.has(k)) return;
      const d = at(k);
      if (d) onOv.set(k, d);
    });
    type OvPair = { a: number; b: number; pts: PtMm[]; runs: { chain: ChainId; pts: PtMm[] }[] };
    const found: OvPair[] = [];
    for (const [k, d] of onOv) {
      const e = ends[k];
      let best: OvPair | null = null;
      for (const sgn of [1, -1]) {
        const dir = { x: d.x * sgn, y: d.y * sgn };
        // not back into r's own line: the walk leaves the end along or across it, never against it
        if (dir.x * e.t.x + dir.y * e.t.y < -0.5) continue;
        let hit = -1;
        const w = walkOverlay(e.at, dir, L, r, maxStretch, (q) => {
          endGrid.near(q, J, (k2) => {
            if (hit >= 0 || k2 === k || used.has(k2) || !onOv.has(k2)) return;
            if (dist(ends[k2].at, q) <= J) hit = k2;
          });
          return hit >= 0;
        });
        if (!w.arrived || hit < 0 || !w.runs.length) continue;
        const pts = [e.at, ...w.runs.flatMap((x) => x.pts.slice(1)), ends[hit].at];
        if (!best || pts.length < best.pts.length) {
          const runs = w.runs.map((x) => ({ chain: x.chain, pts: x.pts.slice() }));
          runs[runs.length - 1].pts.push(ends[hit].at);
          best = { a: k, b: hit, pts, runs };
        }
      }
      if (best) found.push(best);
    }
    found.sort((x, y) => x.pts.length - y.pts.length);
    for (const p of found) {
      if (used.has(p.a) || used.has(p.b)) continue;
      const lines = p.runs.map((x) => x.chain);
      // every run long enough for gate G21 to find it on the line it names (it trims 1.2 mm off
      // each end of a stretch): a shorter hop between two lines is proven by nothing it checks
      if (p.runs.some((x) => polyLen(x.pts) < OVERLAY_RUN_MIN_MM)) continue;
      if (crosses(p.pts) || !smooth(p.pts) || !lonely(p.pts, lines)) continue;
      used.add(p.a);
      used.add(p.b);
      // one R1 wall per line walked on: each stretch lies on the one line it names (gate G21)
      for (const x of p.runs)
        out.push({ chain: x.chain, pts: x.pts, rule: 'R1', chains: [x.chain], overlay: true });
    }
  }
  // ── R2: spines — a proven boundary several sizes end on ──
  const rest = feet.filter((f) => !used.has(f.k));
  if (!rest.length) return out;
  const rankOfChain = new Map<ChainId, number>();
  m.byRank.forEach((ids, k) => ids.forEach((id) => rankOfChain.set(id, k)));
  const ranked = [...rankOfChain.keys()].filter((id) => set.chains[id]?.pts.length >= 2);
  const rg = new SegGrid(4);
  for (const id of ranked) rg.addPolyline(id, set.chains[id].pts, set.chains[id].closed);
  const contact = (q: PtMm, self: End) => {
    let hit = false;
    wg.near(q, J, (j, s) => {
      if (hit) return;
      const [a, b] = segOf(j, s);
      const h = segNearest(q, a, b);
      if (h.d > J) return;
      if (j === self.item) {
        const at = (cums[j][s] ?? 0) + h.u * dist(a, b);
        if (Math.abs(at - self.arc) < 5) return;
      }
      hit = true;
    });
    return hit;
  };
  /**
   * `sharedFolds`' boundary tests on the used stretch of L (±20 mm): ranked lines T-land on it (a
   * foot inside L, ≥ 30° across), ≥ 2 ranks other than r, every one from ONE side (r included);
   * and no ranked line crosses it away from its own ends.
   */
  const boundary = (id: ChainId, lo: number, hi: number) => {
    const pts = ptsF(id);
    const cum = cumF(id);
    const per = cum[cum.length - 1];
    const sides = new Map<number, Set<number>>([
      [1, new Set()],
      [-1, new Set()],
    ]);
    const seen = new Set<ChainId>();
    for (const cid of ranked) {
      if (cid === id) continue;
      const c = set.chains[cid];
      if (c.closed) continue;
      const k = rankOfChain.get(cid)!;
      for (const e of [0, 1] as const) {
        const p = e ? c.pts[c.pts.length - 1] : c.pts[0];
        const t = endTangent(c.pts, e);
        let best: { d: number; s: number; i: number } | null = null;
        for (let i = 0; i + 1 < pts.length; i++) {
          const h = segNearest(p, pts[i], pts[i + 1]);
          if (h.d <= J && (!best || h.d < best.d))
            best = { d: h.d, s: cum[i] + h.u * dist(pts[i], pts[i + 1]), i };
        }
        if (!best || best.s < lo - 20 || best.s > hi + 20) continue;
        if (!c.closed && !set.chains[id].closed && (best.s < 2 || per - best.s < 2)) continue;
        const a = pts[best.i];
        const b = pts[best.i + 1];
        const L = dist(a, b) || 1;
        const cross = ((b.x - a.x) * t.y - (b.y - a.y) * t.x) / L;
        if (Math.abs(cross) < 0.5) continue; // along L, not across it
        // the line comes FROM the side opposite to where its end points
        sides.get(cross > 0 ? -1 : 1)!.add(k);
      }
      // a ranked line crossing the stretch away from its own ends
      if (seen.has(cid)) continue;
      const q = c.pts;
      for (let i = 0; i + 1 < pts.length && !seen.has(cid); i++) {
        if (cum[i + 1] < lo - 20 || cum[i] > hi + 20) continue;
        for (let j = 0; j + 1 < q.length; j++) {
          const x = segIntersect(pts[i], pts[i + 1], q[j], q[j + 1]);
          if (!x) continue;
          if (dist(x.p, q[0]) >= 2 && dist(x.p, q[q.length - 1]) >= 2) {
            seen.add(cid);
            break;
          }
        }
      }
    }
    if (seen.size) return false;
    const pos = sides.get(1)!;
    const neg = sides.get(-1)!;
    if (pos.size && neg.size) return false;
    const one = pos.size ? pos : neg;
    one.delete(r);
    return one.size >= 2;
  };
  for (const f of rest) {
    if (used.has(f.k)) continue;
    const e = ends[f.k];
    const pts = ptsF(f.id);
    const cum = cumF(f.id);
    const per = cum[cum.length - 1];
    const closed = set.chains[f.id].closed;
    let best: { a: number; b: number; len: number } | null = null;
    for (const dir of [1, -1]) {
      for (let w = 1.5; w <= maxStretch; w += 0.5) {
        let s2 = f.s + dir * w;
        if (closed) s2 = ((s2 % per) + per) % per;
        else if (s2 < 0 || s2 > per) break;
        const q = sub(pts, cum, s2, s2)[0];
        if (dist(q, e.at) < 1.5) continue;
        if (contact(q, e)) {
          if (!best || w < best.len) best = { a: f.s, b: f.s + dir * w, len: w };
          break;
        }
      }
    }
    if (!best) continue;
    const lo = Math.min(best.a, best.b);
    const hi = Math.max(best.a, best.b);
    if (closed && (lo < 0 || hi > per)) continue; // across a loop's seam: not proven here
    if (!boundary(f.id, lo, hi)) continue;
    let st = stretch(f.id, lo, hi);
    if (best.b < best.a) st = st.slice().reverse();
    if (!smooth(st) || !lonely(st, [f.id])) continue;
    used.add(f.k);
    const wp = [e.at, ...st];
    out.push({
      chain: f.id,
      pts: wp,
      rule: 'R2',
      chains: [f.id],
      ...(onOverlay(wp) ? { overlay: true } : {}),
    });
  }
  return out;
}

/** MOOD Ф3: a line this much (by length) on an overlay of other sizes' lines lies on it. */
const OVERLAY_ON_SHARE = 0.8;
/** MOOD Ф3.2: a walked run on one line at least this long (G21 checks it), mm. */
const OVERLAY_RUN_MIN_MM = 3;
const polyLen = (pts: readonly PtMm[]) => {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += dist(pts[i], pts[i + 1]);
  return L;
};

/** MOOD Ф3: the size lines of a wall model as overlay evidence (sizes/overlay.ts). */
export function overlayLines(set: ChainSet, byRank: readonly ChainId[][]): OverlayLines {
  const g = new SegGrid(2);
  const rank = new Map<ChainId, number>();
  byRank.forEach((ids, r) =>
    ids.forEach((id) => {
      const c = set.chains[id];
      if (!c || c.pts.length < 2) return;
      rank.set(id, r);
      g.addPolyline(id, c.pts, c.closed);
    }),
  );
  return { grid: g, pts: (id) => set.chains[id]?.pts, rank: (id) => rank.get(id) };
}

/** A bracketed overlay line: this share of its samples on the overlay, between ranks below and above r. */
const BRACKET_SHARE = 0.95;

/**
 * MOOD Ф3.1 (R5, bracketed): the orphan lines without a pen (`guard.lookless`) that lie on an
 * overlay (≥ 3 other sizes' lines in one place, `BRACKET_SHARE` of the line), given to each rank
 * r for which, along `BRACKET_SHARE` of the line, the overlay holds a rank below r AND a rank above
 * it. Two evidences: three pens prove the edge; nesting puts r's edge between two of them.
 */
export function bracketWalls(
  set: ChainSet,
  byRank: readonly ChainId[][],
  guard: RankGuard,
): Map<number, ChainId[]> {
  const out = new Map<number, ChainId[]>();
  const n = byRank.length;
  if (n < 3 || !guard.lookless) return out;
  let L: OverlayLines | null = null;
  for (const id of set.orphans) {
    const c = set.chains[id];
    if (!c || c.pts.length < 2 || !guard.lookless(id)) continue;
    L ??= overlayLines(set, byRank);
    const pts = c.closed ? [...c.pts, c.pts[0]] : c.pts;
    let total = 0;
    for (let i = 0; i + 1 < pts.length; i++) total += dist(pts[i], pts[i + 1]);
    if (total < 1e-6) continue;
    const step = Math.max(1, total / 400);
    const lo: number[] = [];
    const hi: number[] = [];
    let m = 0;
    let next = step / 2;
    let s0 = 0;
    for (let i = 0; i + 1 < pts.length; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const l = dist(a, b);
      if (l < 1e-9) continue;
      const t = { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
      for (; next <= s0 + l; next += step) {
        const k = next - s0;
        m++;
        const ov = overlayAt({ x: a.x + t.x * k, y: a.y + t.y * k }, t, L, null);
        if (ov.ranks.size < OVERLAY_MIN_PENS) continue;
        const rs = [...ov.ranks];
        lo.push(Math.min(...rs));
        hi.push(Math.max(...rs));
      }
      s0 += l;
    }
    // the whole line on the overlay (a line that veers off it is not this edge)
    if (!m || lo.length < BRACKET_SHARE * m) continue;
    for (let r = 1; r + 1 < n; r++) {
      let k = 0;
      for (let j = 0; j < lo.length; j++) if (lo[j] < r && hi[j] > r) k++;
      if (k < BRACKET_SHARE * m) continue;
      const a = out.get(r);
      if (a) a.push(id);
      else out.set(r, [id]);
    }
  }
  return out;
}

/** MOOD Ф3: the size CLASSES' lines (by their nesting-order rank) as overlay evidence. */
export function classOverlayLines(set: ChainSet, n: number): OverlayLines {
  const byRank: ChainId[][] = Array.from({ length: Math.max(0, n) }, () => []);
  for (const k of set.classes) {
    if (k.role !== 'size') continue;
    const r = rankOf(k);
    if (r != null && r >= 0 && r < byRank.length) byRank[r].push(...k.chains);
  }
  return overlayLines(set, byRank);
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
 *
 * `guard` (MOOD Ф0 R3, identity encodings): ends meeting is ONE evidence, the pen is the other. A
 * chain drawn with another pen than the rank's never moves into it — by the vote or by size order:
 * it stays where F3 put it, an orphan stays unranked, and the chain is returned as a conflict. A
 * pen not known on either side proves nothing (gate G22 holds such a rank). Mood Paris: the strap's
 * narrow end, where the lines of all 18 sizes meet, linked 00's lines to 16's: "16" was size 00.
 */
export function connectRanks(
  set: ChainSet,
  m: WallModel,
  tolMm = 0.5,
  guard: RankGuard | null = null,
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
  let ovl: OverlayLines | null = null;
  const overlaid = (id: ChainId) => {
    if (!ovl) ovl = overlayLines(set, m.byRank);
    return overlayShare(set.chains[id].pts, ovl) >= OVERLAY_ON_SHARE;
  };
  let moved = 0;
  const conflicts: ChainId[] = [];
  const undecided: ChainId[][] = [];
  const commonIds = new Set(m.common);
  const uncommon: ChainId[] = [];
  const loopIds = new Set<ChainId>();
  const loopFamily: ChainId[] = [];
  const cleanLoops = new Set<ChainId>();
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
      if (guard && !guard.ok(id, best)) {
        conflicts.push(id);
        continue;
      }
      // MOOD Ф3 (R5): an unranked line of no pen lying on an overlay — where ≥ 3 other sizes'
      // lines run — touches the ends of every one of them: its ends meeting one rank's is no
      // evidence of that rank (ONE evidence, and the pen says nothing): it stays asked
      if (guard?.lookless?.(id) && r === undefined && !probeOff('MOOD_F3_OFF') && overlaid(id)) {
        conflicts.push(id);
        continue;
      }
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
    if (!dupRank && !rs.some((r) => r === undefined)) {
      // KINKS (ULMUS-DIAG F2): one closed loop for EVERY size of the run (≥ 3), each its own rank
      // (evidence 1: the pen), nested by size — area growing with the rank (evidence 2): every size
      // draws its WHOLE edge, so no stretch of one is another size's lone wall (Ulmus' ruffle:
      // where the sizes' tips fan out > 20 mm apart the larger sizes' lines were "lone", walls of
      // every rank, and walked the smaller ranks' outlines 22–61 mm off their own loops). A group
      // of loops that misses a size is not that: the sizes without a loop may run on them
      if (group.length >= 3 && group.length === m.n && !probeOff('KINKS_LOOPS_OFF')) {
        const byR = group
          .map((g, k) => ({ id: g.id, r: rs[k]!, a: Math.abs(loopArea(set.chains[g.id].pts)) }))
          .sort((x, y) => x.r - y.r);
        if (byR.every((x, k) => !k || x.a > byR[k - 1].a))
          for (const x of byR) if (!seenL.has(x.id)) cleanLoops.add(x.id);
      }
      continue;
    }
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
        for (const id of u.ms) {
          const cur = rankOf.get(id);
          // R3: a loop drawn with another pen than rank r's is not rank r's loop
          const held = cur !== r && !!guard && !guard.ok(id, r);
          if (loopIds.has(id) && !held) loopFamily.push(id);
          if (cur === r) continue;
          if (held) {
            conflicts.push(id);
            continue;
          }
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
  return {
    byRank,
    moved,
    conflicts,
    uncommon,
    loopFamily: [...loopFamily, ...[...cleanLoops].filter((id) => !loopFamily.includes(id))],
  };
}

/** Shoelace area of a polyline read as a ring, mm² (signed). */
function loopArea(pts: readonly PtMm[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
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
