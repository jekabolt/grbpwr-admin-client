// chains/ (F3) — page furniture to ignore, and "looks": clusters of chains drawn alike.
//
// A look is NOT a size: palto's 5 sizes show up as more looks (one style fragments when dash phase
// or decorations differ) and two sizes can share a look; viola draws 8 sizes in ~8 looks of 3
// line weights. Looks are evidence; sizes are decided in sizes/recover.ts with bundles.
import type {
  Chain,
  ClassEvidence,
  LineClass,
  PagePose,
  PtMm,
  Style,
} from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import { bboxOf, dist, SegGrid, segNearest } from './geom';
import { normDash } from './link';
import { cosine, type Signature } from './motif';

export const LOOK = { minCos: 0.88, attachCos: 0.93 };

function straightAxis(c: Chain): { axis: 'x' | 'y' | null; straight: boolean } {
  const a = c.pts[0];
  const b = c.pts[c.pts.length - 1];
  const L = dist(a, b);
  if (L < 1e-6) return { axis: null, straight: false };
  let dev = 0;
  for (const p of c.pts) {
    const d = Math.abs((p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x)) / L;
    if (d > dev) dev = d;
  }
  const straight = dev < 0.3 && c.lengthMm < L * 1.01;
  const ang = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI)) % 180;
  const axis = ang < 0.3 || ang > 179.7 ? 'x' : Math.abs(ang - 90) < 0.3 ? 'y' : null;
  return { axis, straight };
}

/**
 * Page furniture per chain (null = line work): sheet grids and watermarks (light grey), tile
 * frames (axis-aligned rectangles or straight lines repeated ≥ 3 times with the same size — every
 * tile prints one), dashed guides (long axis-aligned dashed lines, thin).
 */
export function furniture(
  chains: Chain[],
  styles: Map<number, Style>,
  poses: PagePose[] = [],
): (string | null)[] {
  const out: (string | null)[] = chains.map(() => null);
  pageMarginLines(chains, poses, out);
  for (const i of lettering(chains)) out[i] = out[i] ?? 'lettering';
  const rects = new Map<string, number[]>();
  const lines = new Map<string, number[]>();
  // pens that also draw curves are garment pens: reef draws every size dashed (dash-dot, dash-dot-
  // dot…), so a size's straight fold edge or band edge is NOT a dashed guide
  const pen = (st: Style | undefined) =>
    st
      ? `${st.strokeRgb?.join(',')}|${st.widthMm.toFixed(2)}|${(st.dash ? normDash(st.dash) : [])
          .map((v) => (Math.round(v * 2) / 2).toFixed(1))
          .join('/')}`
      : '';
  const curvedPens = new Set<string>();
  chains.forEach((c) => {
    if (c.lengthMm < 40) return;
    if (!straightAxis(c).straight) curvedPens.add(pen(styles.get(c.style)));
  });
  chains.forEach((c, i) => {
    const st = styles.get(c.style);
    if (st?.strokeRgb) {
      const [r, g, b] = st.strokeRgb;
      const mn = Math.min(r, g, b);
      const mx = Math.max(r, g, b);
      if (mn >= 140 && mx - mn < 40) {
        out[i] = 'light grey (grid / watermark)';
        return;
      }
    }
    const { axis, straight } = straightAxis(c);
    if (straight && axis && c.lengthMm >= 40) {
      if (st?.dash && (st.widthMm <= 0.2 || c.lengthMm >= 150) && !curvedPens.has(pen(st))) {
        out[i] = 'dashed guide';
        return;
      }
      if (c.lengthMm >= 100) {
        const k = `${axis}|${Math.round(c.lengthMm)}`;
        const a = lines.get(k);
        if (a) a.push(i);
        else lines.set(k, [i]);
      }
      return;
    }
    // closed axis-aligned rectangle
    const bb = bboxOf(c.pts);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    if (w < 80 || h < 80) return;
    const onBox = c.pts.every(
      (p) =>
        Math.min(Math.abs(p.x - bb.minX), Math.abs(p.x - bb.maxX)) < 0.3 ||
        Math.min(Math.abs(p.y - bb.minY), Math.abs(p.y - bb.maxY)) < 0.3,
    );
    const a0 = c.pts[0];
    const a1 = c.pts[c.pts.length - 1];
    if (onBox && dist(a0, a1) < 1 && Math.abs(c.lengthMm - 2 * (w + h)) < 2) {
      const k = `${Math.round(w)}x${Math.round(h)}`;
      const a = rects.get(k);
      if (a) a.push(i);
      else rects.set(k, [i]);
    }
  });
  for (const a of rects.values()) if (a.length >= 3) for (const i of a) out[i] = 'tile frame';
  // straight rules of one length: tile frames and cut marks repeat per PAGE, far apart; a ladder of
  // equal-length lines 1–3 mm apart is a graded edge (r4454's pocket sides: every size 208 mm long,
  // graded only in width) — a member with a twin ≤ 15 mm across it is line work
  for (const [k, a] of lines) {
    if (a.length < 3) continue;
    const ax = k.startsWith('x') ? 'x' : 'y';
    const at = (i: number) => {
      const b = bboxOf(chains[i].pts);
      return ax === 'x'
        ? { v: (b.minY + b.maxY) / 2, lo: b.minX, hi: b.maxX }
        : { v: (b.minX + b.maxX) / 2, lo: b.minY, hi: b.maxY };
    };
    const lone = a.filter((i) => {
      const p = at(i);
      return !a.some((j) => {
        if (j === i) return false;
        const q = at(j);
        return Math.abs(q.v - p.v) <= 15 && Math.min(p.hi, q.hi) - Math.max(p.lo, q.lo) > 0;
      });
    });
    if (lone.length >= 3) for (const i of lone) out[i] = 'tile frame / cut mark';
  }
  return out;
}

/**
 * Lettering drawn as line work (wm's "WWW.PAFAVERO.PL" watermark, 60 mm outline glyphs in every
 * size file; "ID: 1 PRZÓD" stencil text): chain indices. Small chains (≤ 120 mm across) that touch
 * form glyph clusters; a TEXT LINE is ≥ 4 clusters of one height (± 15 %) on one baseline band,
 * each within 1.2 heights of the next, along x or (rotated text) along y — and not all of one width
 * (a row of identical belt loops or labels is not text), and glyphs are two-dimensional (median
 * width ≥ ¼ height, lower median: a legend's stacked line swatches are not) and turn (median ≥ 3 rad per glyph: band
 * end ticks are straight). Smaller clusters inside a text line's band
 * between its glyphs (the dot of ".PL") go with it.
 */
export function lettering(chains: Chain[]): number[] {
  const small: number[] = [];
  const bb = chains.map((c) => bboxOf(c.pts));
  chains.forEach((c, i) => {
    const b = bb[i];
    if (c.pts.length >= 2 && Math.max(b.maxX - b.minX, b.maxY - b.minY) <= 120) small.push(i);
  });
  if (small.length < 4) return [];
  const grid = new SegGrid(4);
  for (const i of small) grid.addPolyline(i, chains[i].pts);
  const parent = new Map<number, number>(small.map((i) => [i, i]));
  const find = (i: number): number => {
    let r = i;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let j = i;
    while (parent.get(j) !== r) {
      const n = parent.get(j)!;
      parent.set(j, r);
      j = n;
    }
    return r;
  };
  for (const i of small) {
    const pts = chains[i].pts;
    for (const p of [pts[0], pts[pts.length - 1]])
      grid.near(p, 0.6, (o, sIdx) => {
        if (o === i) return;
        const q = chains[o].pts;
        if (segNearest(p, q[sIdx], q[sIdx + 1]).d <= 0.6) parent.set(find(o), find(i));
      });
  }
  // total turning of a chain (rad): glyphs are full of corners and bowls, rules and ticks are not
  const turn = (i: number) => {
    const p = chains[i].pts;
    let t = 0;
    for (let k = 1; k + 1 < p.length; k++) {
      const a = Math.atan2(p[k].y - p[k - 1].y, p[k].x - p[k - 1].x);
      const b = Math.atan2(p[k + 1].y - p[k].y, p[k + 1].x - p[k].x);
      let d = Math.abs(b - a);
      if (d > Math.PI) d = 2 * Math.PI - d;
      t += d;
    }
    return t;
  };
  type Cl = {
    ids: number[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    turn: number;
  };
  const cls = new Map<number, Cl>();
  for (const i of small) {
    const r = find(i);
    const b = bb[i];
    const c = cls.get(r);
    if (!c) cls.set(r, { ids: [i], ...b, turn: turn(i) });
    else {
      c.ids.push(i);
      c.turn += turn(i);
      c.minX = Math.min(c.minX, b.minX);
      c.minY = Math.min(c.minY, b.minY);
      c.maxX = Math.max(c.maxX, b.maxX);
      c.maxY = Math.max(c.maxY, b.maxY);
    }
  }
  const all = [...cls.values()].filter((c) => Math.max(c.maxX - c.minX, c.maxY - c.minY) <= 110);
  const text = new Set<number>();
  for (const along of ['x', 'y'] as const) {
    // glyph frame: u along the line, v across (height)
    const g = all.map((c) => {
      const u0 = along === 'x' ? c.minX : c.minY;
      const u1 = along === 'x' ? c.maxX : c.maxY;
      const v0 = along === 'x' ? c.minY : c.minX;
      const v1 = along === 'x' ? c.maxY : c.maxX;
      return { c, u0, u1, v0, v1, h: v1 - v0, w: u1 - u0, vc: (v0 + v1) / 2 };
    });
    const tall = g.filter((x) => x.h >= 3).sort((a, b) => a.u0 - b.u0);
    const used = new Set<(typeof g)[number]>();
    for (const start of tall) {
      if (used.has(start)) continue;
      const run = [start];
      let last = start;
      for (const x of tall) {
        if (x.u0 <= last.u0 || used.has(x)) continue;
        if (Math.abs(x.h - start.h) > 0.15 * start.h) continue;
        if (Math.abs(x.vc - start.vc) > 0.2 * start.h) continue;
        const gap = x.u0 - last.u1;
        if (gap > 1.2 * start.h) continue;
        if (gap < -0.2 * start.h) continue;
        run.push(x);
        last = x;
      }
      if (run.length < 4) continue;
      const ws = run.map((x) => x.w);
      if (Math.max(...ws) < 1.15 * Math.min(...ws)) continue;
      // glyphs are two-dimensional: a legend's stacked line swatches are flat
      const med = (v: number[]) => v.slice().sort((a, b) => a - b)[(v.length - 1) >> 1];
      if (med(ws) < 0.25 * start.h) continue;
      // and they turn: median ≥ 3 rad per glyph (an "E" stroke has four corners, an "O" a
      // full turn); a row of straight ticks or swatches does not turn at all
      if (med(run.map((x) => x.c.turn)) < 3) continue;
      for (const x of run) used.add(x);
      const u0 = run[0].u0;
      const u1 = last.u1;
      const v0 = Math.min(...run.map((x) => x.v0));
      const v1 = Math.max(...run.map((x) => x.v1));
      for (const x of g)
        if (x.u0 >= u0 - 0.5 && x.u1 <= u1 + 0.5 && x.v0 >= v0 - 0.5 && x.v1 <= v1 + 0.5)
          for (const i of x.c.ids) text.add(i);
    }
  }
  return [...text];
}

/** A page's rectangle in sheet frame (bbox of its transformed corners). */
function pageRect(p: PagePose): { minX: number; minY: number; maxX: number; maxY: number } {
  const t = p.toSheet;
  const cs = [
    [0, 0],
    [p.widthMm, 0],
    [0, p.heightMm],
    [p.widthMm, p.heightMm],
  ].map(([x, y]) => ({ x: t.a * x + t.c * y + t.e, y: t.b * x + t.d * y + t.f }));
  return bboxOf(cs);
}

/**
 * Page margin lines (Redcafe: a 589 mm rule 12 mm inside every page row, with a 15 mm glue hook,
 * drawn in the size pen so F3 took it for size 44). A thin axis-aligned band (≤ 2.5 mm across,
 * ≥ 100 mm along) whose ends both stop at page edges, lying within 15 mm inside a parallel page
 * edge, at a page-relative offset that ≥ 3 such chains share (every page / file prints one). Garment lines are not repeated at one
 * page-relative offset, so they never collect 3 votes.
 */
function pageMarginLines(chains: Chain[], poses: PagePose[], out: (string | null)[]): void {
  if (!poses.length) return;
  const rects = poses.map(pageRect);
  const byKey = new Map<string, Set<number>>();
  chains.forEach((c, i) => {
    if (out[i]) return;
    const bb = bboxOf(c.pts);
    const w = bb.maxX - bb.minX;
    const h = bb.maxY - bb.minY;
    const axis = h <= 2.5 && w >= 100 ? 'x' : w <= 2.5 && h >= 100 ? 'y' : null;
    if (!axis) return;
    // the band's own coordinate: where most of its length lies (the long run, not the hook)
    let best = 0;
    let at = 0;
    for (let k = 1; k < c.pts.length; k++) {
      const a = c.pts[k - 1];
      const b = c.pts[k];
      const L = axis === 'x' ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
      if (L > best) {
        best = L;
        at = axis === 'x' ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
      }
    }
    // both ends of the band stop at page edges (a margin rule runs page edge to page edge; a
    // garment edge parked on the margin — wm's fold lines at x = 12 — ends mid-page)
    const a0 = axis === 'x' ? bb.minX : bb.minY;
    const a1 = axis === 'x' ? bb.maxX : bb.maxY;
    const atEdge = (v: number) =>
      rects.some((r) =>
        (axis === 'x' ? [r.minX, r.maxX] : [r.minY, r.maxY]).some((e) => Math.abs(v - e) <= 15),
      );
    if (!atEdge(a0) || !atEdge(a1)) return;
    for (const r of rects) {
      const lo = axis === 'x' ? Math.max(bb.minX, r.minX) : Math.max(bb.minY, r.minY);
      const hi = axis === 'x' ? Math.min(bb.maxX, r.maxX) : Math.min(bb.maxY, r.maxY);
      if (hi - lo < 50) continue;
      const e0 = axis === 'x' ? r.minY : r.minX;
      const e1 = axis === 'x' ? r.maxY : r.maxX;
      for (const off of [at - e0, e1 - at]) {
        if (off < -0.5 || off > 15) continue;
        const k = `${axis}|${Math.round(off * 2) / 2}`;
        const s = byKey.get(k);
        if (s) s.add(i);
        else byKey.set(k, new Set([i]));
      }
    }
  });
  for (const s of byKey.values())
    if (s.size >= 3) for (const i of s) out[i] = out[i] ?? 'page margin line';
}

/** Chain ids that are page margin lines (pieces/ keeps them out of rescued walls). */
export function pageMarginIds(chains: Chain[], poses: PagePose[]): Set<number> {
  const out: (string | null)[] = chains.map(() => null);
  pageMarginLines(chains, poses, out);
  for (const i of lettering(chains)) out[i] = out[i] ?? 'lettering';
  const ids = new Set<number>();
  out.forEach((w, i) => w && ids.add(chains[i].id));
  return ids;
}

/** Greedy cosine clustering, longest reliable chains first. Returns look per chain (-1 = none). */
export function clusterLooks(
  chains: Chain[],
  sigs: Signature[],
  include: boolean[],
): { look: number[]; centroids: Float64Array[]; weight: number[] } {
  const look = new Array(chains.length).fill(-1);
  const centroids: Float64Array[] = [];
  const weight: number[] = [];
  const order = chains
    .map((_, i) => i)
    .filter((i) => include[i] && sigs[i].reliable)
    .sort((a, b) => chains[b].lengthMm - chains[a].lengthMm);
  for (const i of order) {
    const v = sigs[i].vec;
    let best = -1;
    let bc = 0;
    centroids.forEach((c, k) => {
      const s = cosine(v, c);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.minCos) {
      const w = weight[best];
      const L = chains[i].lengthMm;
      const c = centroids[best];
      for (let k = 0; k < c.length; k++) c[k] = (c[k] * w + v[k] * L) / (w + L);
      weight[best] = w + L;
      look[i] = best;
    } else {
      centroids.push(Float64Array.from(v));
      weight.push(chains[i].lengthMm);
      look[i] = centroids.length - 1;
    }
  }
  // unreliable chains join a look only when they match it closely
  chains.forEach((c, i) => {
    if (!include[i] || look[i] >= 0) return;
    let best = -1;
    let bc = 0;
    centroids.forEach((cc, k) => {
      const s = cosine(sigs[i].vec, cc);
      if (s > bc) {
        bc = s;
        best = k;
      }
    });
    if (best >= 0 && bc >= LOOK.attachCos) look[i] = best;
  });
  return { look, centroids, weight };
}

/**
 * Public, data-only classification (contract `classifyChains`): chains drawn with the same style and
 * the same (quantised) motif form one class. No roles are guessed here beyond 'internal'; the
 * pipeline (buildChains) assigns sizes and common lines with bundles and evidence.
 */
export function classifyChains(chains: Chain[]): LineClass[] {
  const groups = new Map<string, Chain[]>();
  for (const c of chains) {
    const m = c.motif
      ? c.motif
          .map((v) => (Math.round(v / PATIMPORT.motifQuantMm) * PATIMPORT.motifQuantMm).toFixed(2))
          .join('/')
      : 'solid';
    const k = `${c.style}|${m}`;
    const g = groups.get(k);
    if (g) g.push(c);
    else groups.set(k, [c]);
  }
  let id = 0;
  return [...groups.values()]
    .map((g) => {
      const ev: ClassEvidence[] = g[0].motif
        ? [{ kind: 'recovered-motif', motif: g[0].motif }]
        : [];
      return {
        id: id++,
        role: 'internal' as const,
        sizeLabel: null,
        chains: g.map((c) => c.id),
        totalLengthMm: g.reduce((a, c) => a + c.lengthMm, 0),
        evidence: ev,
        confidence: 0.3,
      };
    })
    .sort((a, b) => b.totalLengthMm - a.totalLengthMm);
}

/** Declared dash clusters (3 % tolerance, Ф0: reef 4.88/4.89/4.90 are one style). */
export function dashCluster(
  dashes: { dash: number[]; len: number }[],
): { rep: number[]; members: number[]; len: number }[] {
  const out: { rep: number[]; members: number[]; len: number }[] = [];
  const order = dashes.map((_, i) => i).sort((a, b) => dashes[b].len - dashes[a].len);
  for (const i of order) {
    const d = normDash(dashes[i].dash);
    const hit = out.find(
      (c) =>
        c.rep.length === d.length &&
        c.rep.every((v, k) => Math.abs(v - d[k]) <= Math.max(0.06, 0.03 * Math.max(v, d[k]))),
    );
    if (hit) {
      hit.members.push(i);
      hit.len += dashes[i].len;
    } else out.push({ rep: d, members: [i], len: dashes[i].len });
  }
  return out;
}

export function midPoint(c: Chain): PtMm {
  return c.pts[Math.floor(c.pts.length / 2)];
}

export { bboxOf };
