// pieces/ (P3) — file-per-size: a clicked seed is carried to the other size files by its FACE, not
// by its coordinate.
//
// The files of a size run are drawn on one frame (wm: XS…XXXL, each file one size) or side by side
// (fileShift aligns them). A click inside a piece of one size lies, on a smaller size's file, outside
// that piece (wm's sleeve click (390, 450) is inside L…XXXL and 5 mm past the XS–M cap: three leaks,
// though the same walls close from a point inside). So, per click and per size file where the
// carried coordinate is in no closed region:
//   reference   the click's region (the fill's region: not exterior, walls included) on the nearest
//               size file where it IS closed;
//   candidates  the regions of this file (≥ a piece's least area) whose centroid lies near the
//               reference's after the per-file alignment (10 mm + 12 % of the piece's side per size
//               step), whose area is within the grade spread (12 % per size step, + 5 %), and whose
//               shape matches (Hu moments 1–3, log distance ≤ 0.5);
//   hand        a left piece is not its right twin (Hu 1–3 do not see a mirror): the two outlines,
//               centred and scaled to their own size, overlap ≥ 80 % (IoU), and no better mirrored
//               (left–right or top–bottom); a symmetric silhouette (a mirror overlaps as well, ±0.02)
//               is told only by its internal marks (notches, drill holes, internal lines), which must
//               sit closer as drawn than mirrored — no marks, or marks that do not tell: not sure;
//   match       the best of them by (centroid distance / side + |log area ratio| + Hu distance), only
//               when sure: unique (no second candidate within twice its score), within an absolute
//               score bound (0.3 per size step), and RECIPROCAL — walked one size step at a time from
//               the reference, each step's match must find the previous step's region as its own
//               best match back;
//   seed        the match's interior point (the free pixel farthest from its walls).
// Not sure: the carried coordinate stays (today's behaviour, and its stop).
import type { BoxMm, PtMm, Seed } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import type { Grid } from './raster';

export type FaceCtx = { g: Grid; wall: Uint8Array; ext: Uint8Array };

/** Probe switches (mutation): the whole pass, the shape test, the uniqueness test. */
export type SeedFaceOpts = {
  off?: ReadonlySet<'all' | 'shape' | 'unique' | 'hand' | 'marks' | 'bound' | 'reciprocal'>;
};

const GRADE_STEP = 0.12;
const AREA_SLACK = 0.05;
const NEAR_MM = 10;
const NEAR_STEP = 0.12;
const HU_MAX = 0.5;
const UNIQUE = 2;
/** Absolute bound on one size step's score. */
const SCORE_MAX = 0.3;
/** Outline overlap (centred, scaled to its own size) of a match, and how much better than mirrored. */
const IOU_MIN = 0.8;
const HAND_EPS = 0.02;
/** Internal marks break a symmetric silhouette's tie: this much closer as drawn than mirrored. */
const MARK_EPS = 0.1;
/** Fewest inner wall pixels that count as marks. */
const MARK_MIN = 10;
/** Wall pixels this close to the outside are the outline's own rim, not marks. */
const RIM_PX = 3;
/** The overlap raster: OCC × OCC cells over the centroid ± OCC_SPAN · its standard deviation (per axis). */
const OCC = 24;
const OCC_SPAN = 2.2;

type Region = {
  label: number;
  count: number;
  areaMm2: number;
  c: PtMm;
  box: BoxMm;
  hu: [number, number, number];
  /** Standard deviation of its pixels along x and y, mm (the overlap raster's scale). */
  sd: { x: number; y: number };
  /** Occupancy of the region on an OCC × OCC raster centred on its centroid, scaled by its side. */
  occ: Uint8Array;
  /**
   * Its internal marks (notches, drill holes, internal lines: wall pixels inside it, not on its
   * outer rim) as a distribution on the same raster; null when it has fewer than MARK_MIN.
   */
  marks: Float32Array | null;
};

export type SeedFaceDiag = {
  seed: number;
  rank: number;
  from: number;
  verdict: 'moved' | 'no-match' | 'not-unique' | 'weak' | 'not-reciprocal';
  at?: PtMm;
  score?: number;
  second?: number;
};

/** Every region (4-connected NOT-exterior component) of a rank's raster, with its shape. */
function regionsOf(c: FaceCtx, minCount: number): { lab: Int32Array; regions: Region[] } {
  const { g, ext } = c;
  const W = g.W;
  const N = W * g.H;
  const lab = new Int32Array(N).fill(-1);
  const stack: number[] = [];
  const count: number[] = [];
  const sx: number[] = [];
  const sy: number[] = [];
  const bx: number[][] = [];
  let next = 0;
  for (let k0 = 0; k0 < N; k0++) {
    if (ext[k0] || lab[k0] !== -1) continue;
    const id = next++;
    let n = 0;
    let ax = 0;
    let ay = 0;
    let x0 = W;
    let x1 = -1;
    let y0 = g.H;
    let y1 = -1;
    lab[k0] = id;
    stack.push(k0);
    while (stack.length) {
      const k = stack.pop()!;
      const y = (k / W) | 0;
      const x = k - y * W;
      n++;
      ax += x;
      ay += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && !ext[k - 1] && lab[k - 1] === -1) (lab[k - 1] = id), stack.push(k - 1);
      if (x + 1 < W && !ext[k + 1] && lab[k + 1] === -1) (lab[k + 1] = id), stack.push(k + 1);
      if (y > 0 && !ext[k - W] && lab[k - W] === -1) (lab[k - W] = id), stack.push(k - W);
      if (y + 1 < g.H && !ext[k + W] && lab[k + W] === -1) (lab[k + W] = id), stack.push(k + W);
    }
    count.push(n);
    sx.push(ax / n);
    sy.push(ay / n);
    bx.push([x0, y0, x1, y1]);
  }
  // central moments of the regions big enough to be a piece (a second pass, centroids known)
  const keep = new Int32Array(next).fill(-1);
  const kept: number[] = [];
  for (let id = 0; id < next; id++)
    if (count[id] >= minCount) {
      keep[id] = kept.length;
      kept.push(id);
    }
  const mu = kept.map(() => new Float64Array(7)); // 20 11 02 30 21 12 03
  for (let k = 0; k < N; k++) {
    const id = lab[k];
    if (id < 0) continue;
    const j = keep[id];
    if (j < 0) continue;
    const y = (k / W) | 0;
    const dx = k - y * W - sx[id];
    const dy = y - sy[id];
    const m = mu[j];
    m[0] += dx * dx;
    m[1] += dx * dy;
    m[2] += dy * dy;
    m[3] += dx * dx * dx;
    m[4] += dx * dx * dy;
    m[5] += dx * dy * dy;
    m[6] += dy * dy * dy;
  }
  const regions = kept.map((id, j): Region => {
    const n = count[id];
    const m = mu[j];
    const e2 = n * n;
    const e3 = Math.pow(n, 2.5);
    const n20 = m[0] / e2;
    const n11 = m[1] / e2;
    const n02 = m[2] / e2;
    const n30 = m[3] / e3;
    const n21 = m[4] / e3;
    const n12 = m[5] / e3;
    const n03 = m[6] / e3;
    const h1 = n20 + n02;
    const h2 = (n20 - n02) ** 2 + 4 * n11 * n11;
    const h3 = (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2;
    const [x0, y0, x1, y1] = bx[id];
    const a = g.corner(x0, y1 + 1);
    const b = g.corner(x1 + 1, y0);
    return {
      label: id,
      count: n,
      areaMm2: n * g.cell * g.cell,
      c: {
        x: g.box.minX + (sx[id] - 1 + 0.5) * g.cell,
        y: g.box.maxY - (sy[id] - 1 + 0.5) * g.cell,
      },
      box: { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y },
      hu: [h1, h2, h3],
      sd: { x: Math.sqrt(m[0] / n) * g.cell, y: Math.sqrt(m[2] / n) * g.cell },
      occ: new Uint8Array(0),
      marks: null,
    };
  });
  for (const r of regions) {
    r.occ = occOf(c, lab, r);
    r.marks = marksOf(c, lab, r);
  }
  return { lab, regions };
}

/**
 * The occupancy raster's half extents about the centroid, per axis, from the region's spread (its
 * standard deviation — a notch stub sticking out does not rescale it, as a bounding box would).
 */
function halvesOf(r: Region) {
  return { hx: OCC_SPAN * Math.max(r.sd.x, 0.5), hy: OCC_SPAN * Math.max(r.sd.y, 0.5) };
}

/** The region's occupancy raster (see OCC): its outline centred and scaled to its own extent. */
function occOf(c: FaceCtx, lab: Int32Array, r: Region): Uint8Array {
  const { g } = c;
  const out = new Uint8Array(OCC * OCC);
  const { hx, hy } = halvesOf(r);
  for (let j = 0; j < OCC; j++)
    for (let i = 0; i < OCC; i++) {
      const x = g.ix(r.c.x - hx + ((i + 0.5) / OCC) * 2 * hx);
      const y = g.iy(r.c.y + hy - ((j + 0.5) / OCC) * 2 * hy);
      if (g.inside(x, y) && lab[y * g.W + x] === r.label) out[j * OCC + i] = 1;
    }
  return out;
}

/** The region's internal marks on the occupancy raster (see Region.marks). */
function marksOf(c: FaceCtx, lab: Int32Array, r: Region): Float32Array | null {
  const { g, wall, ext } = c;
  const W = g.W;
  const { hx, hy } = halvesOf(r);
  const out = new Float32Array(OCC * OCC);
  let n = 0;
  const i0 = Math.max(1, g.ix(r.box.minX));
  const i1 = Math.min(W - 2, g.ix(r.box.maxX));
  const j0 = Math.max(1, g.iy(r.box.maxY));
  const j1 = Math.min(g.H - 2, g.iy(r.box.minY));
  for (let y = j0; y <= j1; y++)
    for (let x = i0; x <= i1; x++) {
      const k = y * W + x;
      if (!wall[k] || lab[k] !== r.label) continue;
      // the outer rim (a wall drawn 3 px thick) lies within RIM_PX of the outside: not a mark
      let rim = false;
      for (let d = 1; d <= RIM_PX && !rim; d++)
        rim =
          (x - d >= 0 && !!ext[k - d]) ||
          (x + d < W && !!ext[k + d]) ||
          (y - d >= 0 && !!ext[k - d * W]) ||
          (y + d < g.H && !!ext[k + d * W]);
      if (rim) continue;
      const p = g.centre(x, y);
      const i = Math.floor(((p.x - (r.c.x - hx)) / (2 * hx)) * OCC);
      const j = Math.floor(((r.c.y + hy - p.y) / (2 * hy)) * OCC);
      if (i < 0 || j < 0 || i >= OCC || j >= OCC) continue;
      out[j * OCC + i]++;
      n++;
    }
  if (n < MARK_MIN) return null;
  for (let q = 0; q < out.length; q++) out[q] /= n;
  return out;
}

/** L1 distance of two mark distributions, b as drawn / mirrored left–right / top–bottom. */
function marksDist(a: Float32Array, b: Float32Array) {
  const d = (f: (i: number, j: number) => number) => {
    let s = 0;
    for (let j = 0; j < OCC; j++)
      for (let i = 0; i < OCC; i++) s += Math.abs(a[j * OCC + i] - b[f(i, j)]);
    return s;
  };
  return {
    direct: d((i, j) => j * OCC + i),
    mx: d((i, j) => j * OCC + (OCC - 1 - i)),
    my: d((i, j) => (OCC - 1 - j) * OCC + i),
  };
}

/**
 * Handedness: the outlines overlap as drawn (IoU ≥ IOU_MIN), no mirror overlaps better, and where a
 * mirror overlaps as well (a symmetric silhouette — a left and a right piece told apart only by
 * their marks) the internal marks must sit closer as drawn than mirrored; otherwise not sure.
 */
function sameHand(a: Region, b: Region, marks: boolean): boolean {
  const ov = overlap(a.occ, b.occ);
  if (ov.iou < IOU_MIN) return false;
  if (Math.max(ov.mx, ov.my) > ov.iou + HAND_EPS) return false;
  const tied = [ov.mx >= ov.iou - HAND_EPS, ov.my >= ov.iou - HAND_EPS];
  if (!tied[0] && !tied[1]) return true;
  if (!marks) return true;
  if (!a.marks || !b.marks) return false;
  const m = marksDist(a.marks, b.marks);
  return (!tied[0] || m.direct + MARK_EPS < m.mx) && (!tied[1] || m.direct + MARK_EPS < m.my);
}

/** IoU of two occupancy rasters, b as drawn, mirrored left–right, mirrored top–bottom. */
function overlap(a: Uint8Array, b: Uint8Array): { iou: number; mx: number; my: number } {
  const iou = (f: (i: number, j: number) => number) => {
    let and = 0;
    let or = 0;
    for (let j = 0; j < OCC; j++)
      for (let i = 0; i < OCC; i++) {
        const p = a[j * OCC + i];
        const q = b[f(i, j)];
        and += p & q;
        or += p | q;
      }
    return or ? and / or : 0;
  };
  return {
    iou: iou((i, j) => j * OCC + i),
    mx: iou((i, j) => j * OCC + (OCC - 1 - i)),
    my: iou((i, j) => (OCC - 1 - j) * OCC + i),
  };
}

/** Log distance of Hu invariants 1–3 (scale/rotation/mirror free; graded sizes ≈ 0). */
function huDist(a: Region['hu'], b: Region['hu']): number {
  const lg = (v: number) => Math.log10(Math.max(Math.abs(v), 1e-30));
  let d = 0;
  // the third invariant of a near-symmetric piece is noise around 0: weigh it by how big it is
  for (let i = 0; i < 3; i++) {
    const w = i < 2 ? 1 : Math.min(1, Math.max(Math.abs(a[i]), Math.abs(b[i])) / 1e-4);
    d += w * Math.abs(lg(a[i]) - lg(b[i]));
  }
  return d;
}

/** The free pixel of a region farthest from its walls (3-4 chamfer inside the region's box). */
function interiorOf(c: FaceCtx, lab: Int32Array, r: Region): PtMm {
  const { g, wall } = c;
  const W = g.W;
  const i0 = Math.max(0, g.ix(r.box.minX));
  const i1 = Math.min(W - 1, g.ix(r.box.maxX));
  const j0 = Math.max(0, g.iy(r.box.maxY));
  const j1 = Math.min(g.H - 1, g.iy(r.box.minY));
  const bw = i1 - i0 + 1;
  const bh = j1 - j0 + 1;
  const BIG = 1 << 30;
  const d = new Int32Array(bw * bh);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const k = (y + j0) * W + x + i0;
      d[y * bw + x] = lab[k] === r.label && !wall[k] ? BIG : 0;
    }
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= bw || y >= bh ? 0 : d[y * bw + x]);
  for (let y = 0; y < bh; y++)
    for (let x = 0; x < bw; x++) {
      const k = y * bw + x;
      if (!d[k]) continue;
      d[k] = Math.min(
        d[k],
        at(x - 1, y) + 3,
        at(x, y - 1) + 3,
        at(x - 1, y - 1) + 4,
        at(x + 1, y - 1) + 4,
      );
    }
  let best = -1;
  let bd = 0;
  for (let y = bh - 1; y >= 0; y--)
    for (let x = bw - 1; x >= 0; x--) {
      const k = y * bw + x;
      if (!d[k]) continue;
      d[k] = Math.min(
        d[k],
        at(x + 1, y) + 3,
        at(x, y + 1) + 3,
        at(x + 1, y + 1) + 4,
        at(x - 1, y + 1) + 4,
      );
      if (d[k] > bd) {
        bd = d[k];
        best = k;
      }
    }
  if (best < 0) return r.c;
  const y = (best / bw) | 0;
  return g.centre(best - y * bw + i0, y + j0);
}

/**
 * P3: per click seed and size file, where to seed it (key `${seed}:${rank}`), when the carried
 * coordinate is in no closed region there and the click's face has one unique match (see header).
 */
export function seedFaces(
  n: number,
  seeds: readonly Seed[],
  build: (r: number) => FaceCtx,
  pixel: (c: FaceCtx, p: PtMm) => number,
  shift: (p: PtMm, r: number) => PtMm,
  o: SeedFaceOpts = {},
): { at: Map<string, PtMm>; diag: SeedFaceDiag[] } {
  const off = o.off ?? new Set();
  const at = new Map<string, PtMm>();
  const diag: SeedFaceDiag[] = [];
  const clicks = seeds.filter((s) => s.origin === 'click');
  if (off.has('all') || n < 2 || !clicks.length) return { at, diag };
  // pass 1: every rank's regions, and the click's region on each
  const regs: Region[][] = [];
  const mine: (Region | null)[][] = clicks.map(() => []);
  for (let r = 0; r < n; r++) {
    const c = build(r);
    const { lab, regions } = regionsOf(c, PATIMPORT.minPieceAreaMm2 / (c.g.cell * c.g.cell));
    regs.push(regions);
    const byLabel = new Map(regions.map((x) => [x.label, x]));
    clicks.forEach((s, i) => {
      const k = pixel(c, shift(s.at, r));
      mine[i][r] = c.ext[k] ? null : byLabel.get(lab[k]) ?? null;
    });
  }
  // one size step: the candidates of rank `to` for a region of rank `from`, best first
  const step = (ref: Region, to: number) => {
    const side = Math.sqrt(ref.areaMm2);
    const p = shift(ref.c, to);
    const scored: { region: Region; score: number }[] = [];
    for (const x of regs[to]) {
      const dist = Math.hypot(x.c.x - p.x, x.c.y - p.y);
      if (dist > NEAR_MM + NEAR_STEP * side) continue;
      const ratio = Math.log(x.areaMm2 / ref.areaMm2);
      if (Math.abs(ratio) > Math.log(1 + GRADE_STEP) + Math.log(1 + AREA_SLACK)) continue;
      const hu = off.has('shape') ? 0 : huDist(ref.hu, x.hu);
      if (hu > HU_MAX) continue;
      // a left piece is not its right twin (see sameHand)
      if (!off.has('hand') && !sameHand(ref, x, !off.has('marks'))) continue;
      scored.push({ region: x, score: dist / side + Math.abs(ratio) + hu });
    }
    return scored.sort((a, b) => a.score - b.score);
  };
  const want = new Map<number, { i: number; region: Region }[]>();
  clicks.forEach((s, i) => {
    const closed = mine[i].map((x, r) => (x ? r : -1)).filter((r) => r >= 0);
    if (!closed.length || closed.length === n) return;
    for (let r = 0; r < n; r++) {
      if (mine[i][r]) continue;
      const h = closed.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
      // walk one size step at a time from the reference: every rank between h and r has the click
      // in no closed region either (h is the nearest that has)
      const dir = r > h ? 1 : -1;
      let cur = mine[i][h]!;
      let ok = true;
      let last: { score: number; second?: number } = { score: 0 };
      for (let q = h + dir; ok; q += dir) {
        const scored = step(cur, q);
        const [best, second] = scored;
        const why = ((): SeedFaceDiag['verdict'] | null => {
          if (!best) return 'no-match';
          if (!off.has('unique') && second && second.score < UNIQUE * Math.max(best.score, 1e-3))
            return 'not-unique';
          if (!off.has('bound') && best.score > SCORE_MAX) return 'weak';
          // reciprocal: from the match, the previous step's region is its best match back
          if (!off.has('reciprocal') && step(best.region, q - dir)[0]?.region !== cur)
            return 'not-reciprocal';
          return null;
        })();
        if (why) {
          diag.push({
            seed: s.id,
            rank: r,
            from: h,
            verdict: why,
            score: best?.score,
            second: second?.score,
          });
          ok = false;
          break;
        }
        cur = best.region;
        last = { score: best.score, second: second?.score };
        if (q === r) break;
      }
      if (!ok) continue;
      const list = want.get(r) ?? [];
      list.push({ i, region: cur });
      want.set(r, list);
      diag.push({ seed: s.id, rank: r, from: h, verdict: 'moved', ...last });
    }
  });
  // pass 2: the matches' interior points (the raster again, only for the ranks that need one)
  for (const [r, list] of want) {
    const c = build(r);
    const { lab } = regionsOf(c, Number.MAX_SAFE_INTEGER);
    for (const { i, region } of list) {
      const p = interiorOf(c, lab, region);
      at.set(`${clicks[i].id}:${r}`, p);
      const d = diag.find((x) => x.seed === clicks[i].id && x.rank === r);
      if (d) d.at = p;
    }
  }
  return { at, diag };
}
