// chains/ — a legend row's real look (MOOD-F1): ≈ 40 mm of the row's own drawing, 1:1.
//
// A dash sample built from the recovered motif cannot show a Mood pen: 18 different looks in one
// colour and one width, nine of them rows of filled triangles, dots and capsules. The swatch is a
// straight-as-possible stretch of the row's longest chains cut out of the sheet with everything
// drawn there by the row's own pen — its paths (with their declared dash and phase) and the loose
// beads along it that no other chain owns — in a local frame: x along the stretch 0 … lengthMm,
// y across it (−halfMm … +halfMm). The UI draws it as is; nothing is re-styled.
import type {
  Chain,
  ChainId,
  ChainSet,
  ClassId,
  IRPath,
  LineSwatch,
  PathId,
  PtMm,
  Sheet,
  Style,
} from 'lib/pattern-import/types';

import { dist, resample } from './geom';

export const SWATCH = { lengthMm: 40, halfMm: 1.8, straightMm: 0.8, tries: 8 };

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A window of `len` mm along `pts` whose points stay within `tol` of its chord; null = none. */
function straightWindow(pts: PtMm[], len: number, tol: number) {
  const smp = resample(pts, 1);
  if (smp.length < 2) return null;
  const total = smp[smp.length - 1].s;
  if (total < len) return null;
  // middle first: the ends of a size line run into corners and shared edges
  const starts: number[] = [];
  const mid = Math.max(0, Math.floor((total - len) / 2));
  for (let d = 0; d <= total - len; d += 2) {
    if (mid - d >= 0) starts.push(mid - d);
    if (d && mid + d <= total - len) starts.push(mid + d);
  }
  for (const s0 of starts) {
    const win = smp.filter((x) => x.s >= s0 && x.s <= s0 + len);
    if (win.length < 2) continue;
    const a = win[0].p;
    const b = win[win.length - 1].p;
    const L = dist(a, b);
    if (L < 0.9 * len) continue;
    const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    const ok = win.every((x) => Math.abs((x.p.x - a.x) * u.y - (x.p.y - a.y) * u.x) <= tol);
    if (ok) return { a, u, L };
  }
  return null;
}

/** The longest-chain window of the row (straight if any chain has one, else the longest chord). */
function pickWindow(chains: Chain[], ids: readonly number[]) {
  const order = ids
    .filter((i) => chains[i])
    .sort((a, b) => chains[b].lengthMm - chains[a].lengthMm)
    .slice(0, SWATCH.tries);
  for (const len of [SWATCH.lengthMm, 25, 12])
    for (const i of order) {
      const w = straightWindow(chains[i].pts, len, SWATCH.straightMm);
      if (w) return { chain: i, ...w };
    }
  // nothing straight: the chord of the longest chain's first ≤ 40 mm
  const i = order[0];
  if (i == null) return null;
  const pts = chains[i].pts;
  const a = pts[0];
  const smp = resample(pts, 1);
  const end = smp.find((x) => x.s >= SWATCH.lengthMm)?.p ?? pts[pts.length - 1];
  const L = dist(a, end);
  if (L < 3) return null;
  return { chain: i, a, u: { x: (end.x - a.x) / L, y: (end.y - a.y) / L }, L };
}

export type SwatchIndex = {
  pathById: Map<PathId, IRPath>;
  styleById: Map<number, Style>;
  /** Paths some chain is made of: only the row's own and nobody's loose beads go in a swatch. */
  claimed: Set<PathId>;
  /** Loose (unclaimed) small paths by 10 mm cell, for the beads along a stretch. */
  loose: Map<string, IRPath[]>;
};

export function swatchIndex(sheet: Sheet, chains: Chain[]): SwatchIndex {
  const claimed = new Set<PathId>();
  for (const c of chains) for (const r of c.ranges) claimed.add(r.path);
  const loose = new Map<string, IRPath[]>();
  for (const p of sheet.paths) {
    if (claimed.has(p.id) || p.background || p.pts.length < 2) continue;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const q of p.pts) {
      minX = Math.min(minX, q.x);
      minY = Math.min(minY, q.y);
      maxX = Math.max(maxX, q.x);
      maxY = Math.max(maxY, q.y);
    }
    if (maxX - minX > 4 || maxY - minY > 4) continue; // a bead or a mark, not a line
    const k = `${Math.floor((minX + maxX) / 20)},${Math.floor((minY + maxY) / 20)}`;
    const a = loose.get(k);
    if (a) a.push(p);
    else loose.set(k, [p]);
  }
  return {
    pathById: new Map(sheet.paths.map((p) => [p.id, p])),
    styleById: new Map(sheet.styles.map((s) => [s.id, s])),
    claimed,
    loose,
  };
}

/** ≈ 40 mm of the drawing of chains `ids` (one row), in the stretch's own frame; null = none. */
export function lineSwatch(
  ix: SwatchIndex,
  chains: Chain[],
  ids: readonly number[],
): LineSwatch | null {
  const w = pickWindow(chains, ids);
  if (!w) return null;
  const { a, u, L } = w;
  const H = SWATCH.halfMm;
  const loc = (p: PtMm) => ({
    x: (p.x - a.x) * u.x + (p.y - a.y) * u.y,
    y: (p.x - a.x) * u.y - (p.y - a.y) * u.x,
  });
  const shapes: LineSwatch['shapes'] = [];
  const inside = (q: { x: number; y: number }) =>
    q.x >= -0.5 && q.x <= L + 0.5 && Math.abs(q.y) <= H;
  const own = new Set<PathId>();
  for (const i of ids) {
    const c = chains[i];
    if (!c) continue;
    // only chains passing through the window (a long row: its other chains are elsewhere)
    for (const r of c.ranges) own.add(r.path);
  }
  const addPath = (p: IRPath) => {
    const st = ix.styleById.get(p.style);
    if (!st) return;
    const q = p.pts.map(loc);
    const fill = !!st.fill && st.widthMm === 0;
    // a mark (a filled dot, a capsule, a ring) is drawn whole; a closed OUTLINE (Paris draws each
    // size's contour as one closed path) is a stroke like any other
    let w = 0;
    let h = 0;
    {
      const xs = q.map((v) => v.x);
      const ys = q.map((v) => v.y);
      w = Math.max(...xs) - Math.min(...xs);
      h = Math.max(...ys) - Math.min(...ys);
    }
    const mark = Math.max(w, h) <= 8;
    if ((fill || (p.closed && q.length > 2)) && mark) {
      // a filled mark or a closed bead: whole, when its centre is in the window
      const cx = q.reduce((s, v) => s + v.x, 0) / q.length;
      const cy = q.reduce((s, v) => s + v.y, 0) / q.length;
      if (!inside({ x: cx, y: cy })) return;
      shapes.push({
        pts: q.flatMap((v) => [r2(v.x), r2(v.y)]),
        closed: true,
        fill,
        widthMm: r2(st.widthMm),
        dash: null,
        dashOffset: 0,
      });
      return;
    }
    // a stroked path: the runs of it inside the window, with the dash phase they start at
    let s = 0;
    let run: number[] = [];
    let runStart = 0;
    const flush = () => {
      if (run.length >= 4)
        shapes.push({
          pts: run,
          closed: false,
          fill: false,
          widthMm: r2(st.widthMm),
          dash: st.dash && st.dash.some((v) => v > 0.01) ? st.dash.map(r2) : null,
          dashOffset: r2(runStart),
        });
      run = [];
    };
    const n = p.closed ? q.length : q.length - 1;
    for (let k = 0; k < n; k++) {
      const p0 = q[k];
      const p1 = q[(k + 1) % q.length];
      const segL = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      // clip the segment to the window's x range (lines leave the corridor only at its ends)
      const t0 = p1.x === p0.x ? 0 : Math.max(0, Math.min(1, (0 - p0.x) / (p1.x - p0.x)));
      const t1 = p1.x === p0.x ? 1 : Math.max(0, Math.min(1, (L - p0.x) / (p1.x - p0.x)));
      const lo = Math.min(t0, t1);
      const hi = Math.max(t0, t1);
      const A = { x: p0.x + (p1.x - p0.x) * lo, y: p0.y + (p1.y - p0.y) * lo };
      const B = { x: p0.x + (p1.x - p0.x) * hi, y: p0.y + (p1.y - p0.y) * hi };
      const okSeg =
        hi > lo &&
        Math.abs(A.y) <= H &&
        Math.abs(B.y) <= H &&
        A.x >= -0.01 &&
        B.x <= L + 0.01 &&
        (p0.x <= L || p1.x <= L) &&
        (p0.x >= 0 || p1.x >= 0);
      if (okSeg) {
        if (!run.length) {
          runStart = s + segL * lo;
          run.push(r2(A.x), r2(A.y));
        }
        run.push(r2(B.x), r2(B.y));
      } else flush();
      s += segL;
    }
    flush();
  };
  for (const id of own) {
    const p = ix.pathById.get(id);
    if (p) addPath(p);
  }
  // loose beads along the stretch (decor of the row's chains: dots, triangles, rings)
  const seen = new Set<PathId>();
  for (let x = 0; x <= L + 10; x += 10) {
    const c = { x: a.x + u.x * x, y: a.y + u.y * x };
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        const k = `${Math.floor(c.x / 10) + dx},${Math.floor(c.y / 10) + dy}`;
        for (const p of ix.loose.get(k) ?? []) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          addPath(p);
        }
      }
  }
  if (!shapes.length) return null;
  return { lengthMm: r2(L), halfMm: H, shapes, chain: w.chain };
}

/** Every legend row's swatch (by class id) and every key sample's (by its chain id). */
export function legendSwatches(
  sheet: Sheet,
  set: ChainSet,
): { swatches: Record<ClassId, LineSwatch>; keySwatches: Record<ChainId, LineSwatch> } {
  const swatches: Record<ClassId, LineSwatch> = {};
  const keySwatches: Record<ChainId, LineSwatch> = {};
  if (!sheet.paths.length) return { swatches, keySwatches };
  const ix = swatchIndex(sheet, set.chains);
  for (const c of set.classes) {
    const sw = lineSwatch(ix, set.chains, c.chains);
    if (sw) swatches[c.id] = sw;
    for (const e of c.evidence)
      if (e.kind === 'legend-sample' && !(e.chain in keySwatches)) {
        const k = lineSwatch(ix, set.chains, [e.chain]);
        if (k) keySwatches[e.chain] = k;
      }
  }
  return { swatches, keySwatches };
}
