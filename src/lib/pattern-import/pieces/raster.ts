// pieces/ (F4) — the fill raster: walls drawn at `cellMm` per pixel, exterior flood from the border,
// the seed's component, and the outer boundary traced along pixel edges.
//
// Raster frame: pixel (i, j) covers x ∈ [minX + i·c, minX + (i+1)·c], y ∈ [maxY − (j+1)·c, maxY − j·c]
// (row 0 at the top, y-up sheet frame). Floods are 4-connected scanline fills; walls are drawn as
// 8-connected Bresenham lines thickened by one pixel in the four directions, which closes sub-mm
// gaps (dash ends, 0.3 mm snap error) and is impassable for a 4-connected flood.
import type { BoxMm, PtMm } from 'lib/pattern-import/types';

export class Grid {
  readonly W: number;
  readonly H: number;
  constructor(
    readonly box: BoxMm,
    readonly cell: number,
  ) {
    this.W = Math.max(3, Math.ceil((box.maxX - box.minX) / cell) + 2);
    this.H = Math.max(3, Math.ceil((box.maxY - box.minY) / cell) + 2);
  }
  ix(x: number) {
    return Math.floor((x - this.box.minX) / this.cell) + 1;
  }
  iy(y: number) {
    return Math.floor((this.box.maxY - y) / this.cell) + 1;
  }
  /** Pixel centre in mm. */
  centre(i: number, j: number): PtMm {
    return {
      x: this.box.minX + (i - 1 + 0.5) * this.cell,
      y: this.box.maxY - (j - 1 + 0.5) * this.cell,
    };
  }
  /** Pixel corner (lattice point) in mm. */
  corner(i: number, j: number): PtMm {
    return { x: this.box.minX + (i - 1) * this.cell, y: this.box.maxY - (j - 1) * this.cell };
  }
  inside(i: number, j: number) {
    return i >= 0 && j >= 0 && i < this.W && j < this.H;
  }
}

/** Draw a polyline into `buf` (value 1), 8-connected core + 4-neighbour thickening. */
export function drawPolyline(g: Grid, buf: Uint8Array, pts: readonly PtMm[], closed = false) {
  const n = pts.length;
  if (!n) return;
  const W = g.W;
  const H = g.H;
  const stamp = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const k = y * W + x;
    buf[k] = 1;
    if (x > 0) buf[k - 1] = 1;
    if (x + 1 < W) buf[k + 1] = 1;
    if (y > 0) buf[k - W] = 1;
    if (y + 1 < H) buf[k + W] = 1;
  };
  const seg = (a: PtMm, b: PtMm) => {
    let x0 = g.ix(a.x);
    let y0 = g.iy(a.y);
    const x1 = g.ix(b.x);
    const y1 = g.iy(b.y);
    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 4_000_000; guard++) {
      stamp(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  };
  if (n === 1) stamp(g.ix(pts[0].x), g.iy(pts[0].y));
  for (let i = 0; i + 1 < n; i++) seg(pts[i], pts[i + 1]);
  if (closed && n > 2) seg(pts[n - 1], pts[0]);
}

/**
 * Scanline 4-connected flood: marks `out[k] = 1` for every pixel reachable from the seeds through
 * pixels where `wall[k] === 0` (and, when `within` is given, `within[k] === 1`).
 */
export function flood(
  g: { W: number; H: number },
  wall: Uint8Array,
  seeds: number[],
  out: Uint8Array,
  within?: Uint8Array,
): number {
  const W = g.W;
  const H = g.H;
  const ok = (k: number) => !wall[k] && !out[k] && (!within || within[k] === 1);
  const stack: number[] = [];
  for (const s of seeds) if (ok(s)) stack.push(s);
  let count = 0;
  while (stack.length) {
    const k = stack.pop()!;
    if (!ok(k)) continue;
    const y = (k / W) | 0;
    let x = k - y * W;
    const row = y * W;
    while (x > 0 && ok(row + x - 1)) x--;
    let upOpen = false;
    let downOpen = false;
    for (; x < W && ok(row + x); x++) {
      out[row + x] = 1;
      count++;
      if (y > 0) {
        const u = row - W + x;
        if (ok(u)) {
          if (!upOpen) {
            stack.push(u);
            upOpen = true;
          }
        } else upOpen = false;
      }
      if (y + 1 < H) {
        const d = row + W + x;
        if (ok(d)) {
          if (!downOpen) {
            stack.push(d);
            downOpen = true;
          }
        } else downOpen = false;
      }
    }
  }
  return count;
}

/** Exterior = everything reachable from the raster border without crossing a wall. */
export function exterior(g: Grid, wall: Uint8Array): Uint8Array {
  const W = g.W;
  const H = g.H;
  const seeds: number[] = [];
  for (let x = 0; x < W; x++) seeds.push(x, (H - 1) * W + x);
  for (let y = 0; y < H; y++) seeds.push(y * W, y * W + W - 1);
  const ext = new Uint8Array(W * H);
  flood(g, wall, seeds, ext);
  return ext;
}

/**
 * The seed's region: the 4-connected component of NOT-exterior pixels (walls included) holding
 * pixel k. Internal lines cannot split it (they are inside); returns the mask, area and bbox.
 */
export function regionOf(g: Grid, ext: Uint8Array, k: number) {
  const mask = new Uint8Array(g.W * g.H);
  // flood over "not exterior": flood() with the exterior as the wall
  const area = flood(g, ext, [k], mask);
  return { mask, area };
}

/** Bounding box of a mask in pixel coordinates. */
export function maskBox(g: Grid, mask: Uint8Array) {
  let x0 = g.W;
  let y0 = g.H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.H; y++) {
    const row = y * g.W;
    for (let x = 0; x < g.W; x++)
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  }
  return { x0, y0, x1, y1 };
}

/**
 * Outer boundary of the mask's component that holds its top-most, left-most pixel, as lattice
 * corners in mm (crack following, mask kept on the right; diagonal contacts are not followed).
 */
export function traceOuter(g: Grid, mask: Uint8Array): PtMm[] {
  const W = g.W;
  const H = g.H;
  let start = -1;
  for (let k = 0; k < W * H; k++)
    if (mask[k]) {
      start = k;
      break;
    }
  if (start < 0) return [];
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x] === 1;
  const sy = (start / W) | 0;
  const sx = start - sy * W;
  // corner lattice: corner (x, y) is the top-left corner of pixel (x, y)
  const DX = [1, 0, -1, 0];
  const DY = [0, 1, 0, -1];
  let x = sx;
  let y = sy;
  let d = 0;
  const out: PtMm[] = [];
  const corner = (cx: number, cy: number): PtMm => ({
    x: g.box.minX + (cx - 1) * g.cell,
    y: g.box.maxY - (cy - 1) * g.cell,
  });
  out.push(corner(x, y));
  for (let guard = 0; guard < 8 * (W + H) * 64; guard++) {
    x += DX[d];
    y += DY[d];
    // pixels ahead-left / ahead-right of the walk at corner (x, y)
    let fl: boolean;
    let fr: boolean;
    if (d === 0) {
      fl = at(x, y - 1);
      fr = at(x, y);
    } else if (d === 1) {
      fl = at(x, y);
      fr = at(x - 1, y);
    } else if (d === 2) {
      fl = at(x - 1, y);
      fr = at(x - 1, y - 1);
    } else {
      fl = at(x - 1, y - 1);
      fr = at(x, y - 1);
    }
    const prev = d;
    if (!fr) d = (d + 1) % 4;
    else if (fl) d = (d + 3) % 4;
    if (x === sx && y === sy && d === 0) break;
    if (d !== prev) out.push(corner(x, y));
  }
  return out;
}

/**
 * Morphological opening of `mask` by a (2r+1)² square inside its bbox (+margin): removes spurs and
 * hairlines up to 2r px wide (a grain line or a landing overshoot sticking out of the outline),
 * then keeps the 4-connected component holding pixel `keep` (or the largest one when it was cut).
 * Returns a NEW full-size mask.
 */
export function openMask(g: Grid, mask: Uint8Array, r: number, keep: number): Uint8Array {
  const b = maskBox(g, mask);
  const W = g.W;
  const out = new Uint8Array(g.W * g.H);
  if (b.x1 < 0) return out;
  const x0 = Math.max(0, b.x0 - r - 1);
  const y0 = Math.max(0, b.y0 - r - 1);
  const x1 = Math.min(g.W - 1, b.x1 + r + 1);
  const y1 = Math.min(g.H - 1, b.y1 + r + 1);
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  let a = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) a[y * w + x] = mask[(y + y0) * W + x + x0];
  const pass = (src: Uint8Array, erode: boolean) => {
    // separable square: rows then columns; outside the window counts as 0
    const tmp = new Uint8Array(w * h);
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const xx = x + k;
          const s = xx < 0 || xx >= w ? 0 : src[y * w + xx];
          if (erode ? !s : s) {
            v = erode ? 0 : 1;
            break;
          }
        }
        tmp[y * w + x] = v;
      }
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let v = erode ? 1 : 0;
        for (let k = -r; k <= r; k++) {
          const yy = y + k;
          const s = yy < 0 || yy >= h ? 0 : tmp[yy * w + x];
          if (erode ? !s : s) {
            v = erode ? 0 : 1;
            break;
          }
        }
        dst[y * w + x] = v;
      }
    return dst;
  };
  a = pass(pass(a, true), false);
  // keep the component holding `keep` (or the largest)
  const sub = { W: w, H: h };
  const inv = new Uint8Array(w * h);
  for (let k = 0; k < w * h; k++) inv[k] = a[k] ? 0 : 1;
  const ky = ((keep / W) | 0) - y0;
  const kx = (keep % W) - x0;
  let comp = new Uint8Array(w * h);
  let got = 0;
  if (kx >= 0 && ky >= 0 && kx < w && ky < h && a[ky * w + kx])
    got = flood(sub, inv, [ky * w + kx], comp);
  if (!got) {
    // largest component
    const seen = new Uint8Array(w * h);
    let best = 0;
    for (let k = 0; k < w * h; k++) {
      if (!a[k] || seen[k]) continue;
      const c = new Uint8Array(w * h);
      const n = flood(sub, inv, [k], c);
      for (let j = 0; j < w * h; j++) if (c[j]) seen[j] = 1;
      if (n > best) {
        best = n;
        comp = c;
      }
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (comp[y * w + x]) out[(y + y0) * W + x + x0] = 1;
  return out;
}
