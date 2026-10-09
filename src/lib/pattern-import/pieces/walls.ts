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
import type { ChainId, ChainSet, LineClass, PtMm, SizeRun } from 'lib/pattern-import/types';

import { dist, SegGrid, segNearest } from './geom';
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
};

export function rankOf(c: LineClass): number | null {
  if (c.role !== 'size') return null;
  for (const e of c.evidence) if (e.kind === 'nesting-order') return e.rank;
  return null;
}

export function wallModel(set: ChainSet, run: SizeRun): WallModel {
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
  return {
    mode: run.encoding === 'file-per-size' ? 'file' : 'graded',
    n,
    common,
    byRank,
    emptyRanks: byRank.map((b, r) => (b.length ? -1 : r)).filter((r) => r >= 0),
    graded,
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
    if (!c || c.closed || c.pts.length < 2 || c.lengthMm < minLenMm) continue;
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
      return k >= 1 && Math.abs(L - k * P) <= Math.max(2, 0.02 * L);
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
