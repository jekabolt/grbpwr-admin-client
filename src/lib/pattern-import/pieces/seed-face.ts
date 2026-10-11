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
//   match       the best of them by (centroid distance / side + |log area ratio| + Hu distance), only
//               when unique — no second candidate within twice its score;
//   seed        the match's interior point (the free pixel farthest from its walls).
// No unique match: the carried coordinate stays (today's behaviour, and its stop).
import type { BoxMm, PtMm, Seed } from 'lib/pattern-import/types';
import { PATIMPORT } from 'lib/pattern-import/types';

import type { Grid } from './raster';

export type FaceCtx = { g: Grid; wall: Uint8Array; ext: Uint8Array };

/** Probe switches (mutation): the whole pass, the shape test, the uniqueness test. */
export type SeedFaceOpts = { off?: ReadonlySet<'all' | 'shape' | 'unique'> };

const GRADE_STEP = 0.12;
const AREA_SLACK = 0.05;
const NEAR_MM = 10;
const NEAR_STEP = 0.12;
const HU_MAX = 0.5;
const UNIQUE = 2;

type Region = {
  label: number;
  count: number;
  areaMm2: number;
  c: PtMm;
  box: BoxMm;
  hu: [number, number, number];
};

export type SeedFaceDiag = {
  seed: number;
  rank: number;
  from: number;
  verdict: 'moved' | 'no-match' | 'not-unique';
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
    };
  });
  return { lab, regions };
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
  // the matches
  const want = new Map<number, { i: number; region: Region }[]>();
  clicks.forEach((s, i) => {
    const closed = mine[i].map((x, r) => (x ? r : -1)).filter((r) => r >= 0);
    if (!closed.length || closed.length === n) return;
    for (let r = 0; r < n; r++) {
      if (mine[i][r]) continue;
      const h = closed.reduce((a, b) => (Math.abs(b - r) < Math.abs(a - r) ? b : a));
      const ref = mine[i][h]!;
      const steps = Math.abs(r - h);
      const side = Math.sqrt(ref.areaMm2);
      const p = shift(ref.c, r);
      const scored: { region: Region; score: number }[] = [];
      for (const x of regs[r]) {
        const dist = Math.hypot(x.c.x - p.x, x.c.y - p.y);
        if (dist > NEAR_MM + NEAR_STEP * side * steps) continue;
        const ratio = Math.log(x.areaMm2 / ref.areaMm2);
        if (Math.abs(ratio) > steps * Math.log(1 + GRADE_STEP) + Math.log(1 + AREA_SLACK)) continue;
        const hu = off.has('shape') ? 0 : huDist(ref.hu, x.hu);
        if (hu > HU_MAX) continue;
        scored.push({ region: x, score: dist / side + Math.abs(ratio) + hu });
      }
      scored.sort((a, b) => a.score - b.score);
      const [best, second] = scored;
      if (!best) {
        diag.push({ seed: s.id, rank: r, from: h, verdict: 'no-match' });
        continue;
      }
      if (!off.has('unique') && second && second.score < UNIQUE * Math.max(best.score, 1e-3)) {
        diag.push({
          seed: s.id,
          rank: r,
          from: h,
          verdict: 'not-unique',
          score: best.score,
          second: second.score,
        });
        continue;
      }
      const list = want.get(r) ?? [];
      list.push({ i, region: best.region });
      want.set(r, list);
      diag.push({
        seed: s.id,
        rank: r,
        from: h,
        verdict: 'moved',
        score: best.score,
        second: second?.score,
      });
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
