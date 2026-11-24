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
  // hot path (exterior / region floods over the whole sheet): no `within` → a test without it
  if (within) return floodWithin(g, wall, seeds, out, within);
  const W = g.W;
  const H = g.H;
  const stack: number[] = [];
  for (const s of seeds) if (!wall[s] && !out[s]) stack.push(s);
  let count = 0;
  while (stack.length) {
    const k = stack.pop()!;
    if (wall[k] || out[k]) continue;
    const y = (k / W) | 0;
    const row = y * W;
    let x = k - row;
    while (x > 0 && !wall[row + x - 1] && !out[row + x - 1]) x--;
    const up = y > 0 ? row - W : -1;
    const down = y + 1 < H ? row + W : -1;
    let upOpen = false;
    let downOpen = false;
    for (; x < W; x++) {
      const c = row + x;
      if (wall[c] || out[c]) break;
      out[c] = 1;
      count++;
      if (up >= 0) {
        const u = up + x;
        if (!wall[u] && !out[u]) {
          if (!upOpen) {
            stack.push(u);
            upOpen = true;
          }
        } else upOpen = false;
      }
      if (down >= 0) {
        const d = down + x;
        if (!wall[d] && !out[d]) {
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

function floodWithin(
  g: { W: number; H: number },
  wall: Uint8Array,
  seeds: number[],
  out: Uint8Array,
  within: Uint8Array,
): number {
  const W = g.W;
  const H = g.H;
  const ok = (k: number) => !wall[k] && !out[k] && within[k] === 1;
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

/**
 * Chebyshev dilation by r px (a (2r+1)² square): rows then columns, each a two-sweep running
 * distance — O(W·H) whatever r, the same pixels as stamping the square around every set pixel.
 */
export function dilateSquare(g: { W: number; H: number }, src: Uint8Array, r: number): Uint8Array {
  return dilateAxis(g, dilateAxis(g, src, r, 1), r, g.W);
}

/**
 * Vertical dilation only (each column grown by r px up and down). `box` (pixel rows/columns that
 * hold every set pixel of `src`) limits the work to that window grown by r.
 */
export function dilateColumns(
  g: { W: number; H: number },
  src: Uint8Array,
  r: number,
  box?: { x0: number; y0: number; x1: number; y1: number },
): Uint8Array {
  if (!box) return dilateAxis(g, src, r, g.W);
  const { W, H } = g;
  const dst = new Uint8Array(W * H);
  const x0 = Math.max(0, box.x0);
  const x1 = Math.min(W - 1, box.x1);
  const ya = Math.max(0, box.y0 - r);
  const yb = Math.min(H - 1, box.y1 + r);
  if (x1 < x0 || yb < ya) return dst;
  const last = new Int32Array(W).fill(-(r + 1) - H);
  for (let y = ya; y <= yb; y++) {
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      if (src[row + x]) last[x] = y;
      if (y - last[x] <= r) dst[row + x] = 1;
    }
  }
  last.fill(2 * H + r + 1);
  for (let y = yb; y >= ya; y--) {
    const row = y * W;
    for (let x = x0; x <= x1; x++) {
      if (src[row + x]) last[x] = y;
      if (last[x] - y <= r) dst[row + x] = 1;
    }
  }
  return dst;
}

/** Dilation along one axis (step 1 = rows, step W = columns) by r px. */
function dilateAxis(
  g: { W: number; H: number },
  src: Uint8Array,
  r: number,
  step: number,
): Uint8Array {
  const { W, H } = g;
  const dst = new Uint8Array(W * H);
  if (step === 1) {
    for (let y = 0; y < H; y++) {
      const row = y * W;
      let last = -Infinity;
      for (let x = 0; x < W; x++) {
        if (src[row + x]) last = x;
        if (x - last <= r) dst[row + x] = 1;
      }
      let next = Infinity;
      for (let x = W - 1; x >= 0; x--) {
        if (src[row + x]) next = x;
        if (next - x <= r) dst[row + x] = 1;
      }
    }
    return dst;
  }
  // columns, walked row by row (one running distance per column keeps the walk in memory order)
  const last = new Int32Array(W).fill(-(r + 1));
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (src[row + x]) last[x] = y;
      if (y - last[x] <= r) dst[row + x] = 1;
    }
  }
  last.fill(H + r + 1);
  for (let y = H - 1; y >= 0; y--) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      if (src[row + x]) last[x] = y;
      if (last[x] - y <= r) dst[row + x] = 1;
    }
  }
  return dst;
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
  const W = g.W;
  const n = g.W * g.H;
  // first / last set pixel bound the rows; inside them each row is scanned only from its ends
  // inwards, up to the extent already found (a region is small against the sheet raster)
  let first = 0;
  while (first < n && !mask[first]) first++;
  if (first === n) return { x0: g.W, y0: g.H, x1: -1, y1: -1 };
  let last = n - 1;
  while (!mask[last]) last--;
  const y0 = (first / W) | 0;
  const y1 = (last / W) | 0;
  let x0 = first - y0 * W;
  let x1 = last - y1 * W;
  if (x1 < x0) [x0, x1] = [x1, x0];
  for (let y = y0; y <= y1; y++) {
    const row = y * W;
    for (let x = 0; x < x0; x++)
      if (mask[row + x]) {
        x0 = x;
        break;
      }
    for (let x = W - 1; x > x1; x--)
      if (mask[row + x]) {
        x1 = x;
        break;
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
  // separable square, rows then columns; outside the window counts as 0. Each 1-D pass is a
  // two-sweep running distance to the nearest pixel of the other kind: erode keeps a pixel when no
  // 0 lies within r (the window edge is a 0), dilate sets it when a 1 lies within r.
  const line = (
    src: Uint8Array,
    dst: Uint8Array,
    o: number,
    n: number,
    st: number,
    erode: boolean,
  ) => {
    if (erode) {
      // keep a pixel when the nearest 0 (positions -1 and n count as 0) is further than r
      let last = -1;
      for (let i = 0; i < n; i++) {
        if (!src[o + i * st]) last = i;
        dst[o + i * st] = i - last > r ? 1 : 0;
      }
      let next = n;
      for (let i = n - 1; i >= 0; i--) {
        if (!src[o + i * st]) next = i;
        if (next - i <= r) dst[o + i * st] = 0;
      }
    } else {
      // set a pixel when a 1 lies within r
      let last = -Infinity;
      for (let i = 0; i < n; i++) {
        if (src[o + i * st]) last = i;
        dst[o + i * st] = i - last <= r ? 1 : 0;
      }
      let next = Infinity;
      for (let i = n - 1; i >= 0; i--) {
        if (src[o + i * st]) next = i;
        if (next - i <= r) dst[o + i * st] = 1;
      }
    }
  };
  const pass = (src: Uint8Array, erode: boolean) => {
    const tmp = new Uint8Array(w * h);
    const dst = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) line(src, tmp, y * w, w, 1, erode);
    for (let x = 0; x < w; x++) line(tmp, dst, x, h, w, erode);
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
    // largest component (first in scan order on a tie): label every component once
    const lab = new Int32Array(w * h);
    let best = 0;
    let bestLab = 0;
    let next = 0;
    const stack: number[] = [];
    for (let k = 0; k < w * h; k++) {
      if (!a[k] || lab[k]) continue;
      lab[k] = ++next;
      stack.push(k);
      let n = 0;
      while (stack.length) {
        const c = stack.pop()!;
        n++;
        const cx = c % w;
        const visit = (j: number) => {
          if (a[j] && !lab[j]) {
            lab[j] = next;
            stack.push(j);
          }
        };
        if (cx > 0) visit(c - 1);
        if (cx + 1 < w) visit(c + 1);
        if (c >= w) visit(c - w);
        if (c + w < w * h) visit(c + w);
      }
      if (n > best) {
        best = n;
        bestLab = next;
      }
    }
    if (bestLab) for (let k = 0; k < w * h; k++) comp[k] = lab[k] === bestLab ? 1 : 0;
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) if (comp[y * w + x]) out[(y + y0) * W + x + x0] = 1;
  return out;
}

/** One enclosed region of a raster (not wall, not exterior), for file-per-size correspondence. */
export type Comp = {
  id: number;
  count: number;
  box: BoxMm;
  /** Centroid, mm. */
  c: PtMm;
  /** A pixel of the region nearest its centroid (the seed to fill it again). */
  k: number;
};

/**
 * Every enclosed region inside `area` (4-connected, not wall, not exterior) of ≥ `minCount`
 * pixels; `labelAt(k)` gives a pixel's region id (−1 outside any). The flood never leaves `area`.
 */
export function components(
  g: Grid,
  wall: Uint8Array,
  ext: Uint8Array,
  area: BoxMm,
  minCount: number,
): { comps: Comp[]; labelAt: (k: number) => number } {
  const i0 = Math.max(0, g.ix(area.minX));
  const i1 = Math.min(g.W - 1, g.ix(area.maxX));
  const j0 = Math.max(0, g.iy(area.maxY));
  const j1 = Math.min(g.H - 1, g.iy(area.minY));
  const bw = i1 - i0 + 1;
  const bh = j1 - j0 + 1;
  if (bw <= 0 || bh <= 0) return { comps: [], labelAt: () => -1 };
  const lab = new Int32Array(bw * bh).fill(-1);
  const comps: Comp[] = [];
  const stack: number[] = [];
  let next = 0;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const k = j * g.W + i;
      const l = (j - j0) * bw + (i - i0);
      if (lab[l] !== -1 || wall[k] || ext[k]) continue;
      const id = next++;
      let count = 0;
      let sx = 0;
      let sy = 0;
      let mnx = i;
      let mxx = i;
      let mny = j;
      let mxy = j;
      lab[l] = id;
      stack.push(l);
      while (stack.length) {
        const q = stack.pop()!;
        const y = ((q / bw) | 0) + j0;
        const x = (q % bw) + i0;
        count++;
        sx += x;
        sy += y;
        if (x < mnx) mnx = x;
        if (x > mxx) mxx = x;
        if (y < mny) mny = y;
        if (y > mxy) mxy = y;
        const nb = [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ];
        for (const [nx, ny] of nb) {
          if (nx < i0 || nx > i1 || ny < j0 || ny > j1) continue;
          const nl = (ny - j0) * bw + (nx - i0);
          const nk = ny * g.W + nx;
          if (lab[nl] !== -1 || wall[nk] || ext[nk]) continue;
          lab[nl] = id;
          stack.push(nl);
        }
      }
      if (count < minCount) continue;
      const cx = sx / count;
      const cy = sy / count;
      let best = j * g.W + i;
      let bd = Infinity;
      for (let y = mny; y <= mxy; y++)
        for (let x = mnx; x <= mxx; x++) {
          if (lab[(y - j0) * bw + (x - i0)] !== id) continue;
          const d = (x - cx) ** 2 + (y - cy) ** 2;
          if (d < bd) {
            bd = d;
            best = y * g.W + x;
          }
        }
      const a = g.corner(mnx, mxy + 1);
      const b = g.corner(mxx + 1, mny);
      const cc = g.centre(Math.floor(cx), Math.floor(cy));
      comps.push({
        id,
        count,
        box: { minX: a.x, minY: a.y, maxX: b.x, maxY: b.y },
        c: cc,
        k: best,
      });
    }
  return {
    comps,
    labelAt: (k: number) => {
      const y = (k / g.W) | 0;
      const x = k - y * g.W;
      if (x < i0 || x > i1 || y < j0 || y > j1) return -1;
      return lab[(y - j0) * bw + (x - i0)];
    },
  };
}

/**
 * Two pieces drawn touching (a shared edge, or two edges 1–3 mm apart with a sliver between) are
 * one OUTER region. Split it by cells: the walls cut the region into cells (non-wall components);
 * each seed owns its own cell, and cells are handed out breadth-first across walls — a cell reached
 * by two seeds in the same step (the sliver between two pieces, a strip both border) belongs to
 * neither. Returns the seed `mine`'s cells (+ the wall pixels around them), or null when the seeds
 * share a cell (one piece holding two seeds — truly merged).
 */
export function splitByCells(
  g: Grid,
  wall: Uint8Array,
  mask: Uint8Array,
  seedKs: number[],
  mine: number,
  items: readonly { pts: readonly PtMm[]; closed?: boolean }[] = [],
): Uint8Array | null {
  const { x0, y0, x1, y1 } = maskBox(g, mask);
  if (x1 < x0) return null;
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const loc = (k: number) => {
    const y = (k / g.W) | 0;
    return (y - y0) * bw + (k - y * g.W - x0);
  };
  const lab = new Int32Array(bw * bh).fill(-1);
  let n = 0;
  const stack: number[] = [];
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = y * g.W + x;
      const l = (y - y0) * bw + (x - x0);
      if (lab[l] !== -1 || !mask[k] || wall[k]) continue;
      const id = n++;
      lab[l] = id;
      stack.push(l);
      while (stack.length) {
        const q = stack.pop()!;
        const qy = ((q / bw) | 0) + y0;
        const qx = (q % bw) + x0;
        for (const [nx, ny] of [
          [qx - 1, qy],
          [qx + 1, qy],
          [qx, qy - 1],
          [qx, qy + 1],
        ]) {
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nl = (ny - y0) * bw + (nx - x0);
          const nk = ny * g.W + nx;
          if (lab[nl] !== -1 || !mask[nk] || wall[nk]) continue;
          lab[nl] = id;
          stack.push(nl);
        }
      }
    }
  const cellOf = seedKs.map((k) => (k >= 0 && mask[k] && !wall[k] ? lab[loc(k)] : -1));
  const my = cellOf[mine];
  if (my < 0) return null;
  if (cellOf.some((c, i) => i !== mine && c === my)) return null;
  // which item drew each wall pixel (for contested cells), and wall pixels per (cell, item)
  const own = items.length ? ownerRaster(g, items, x0, y0, x1, y1) : null;
  const touch = new Map<number, Map<number, number>>();
  // cell adjacency across walls: labels within 2 px of a wall pixel touch each other
  const adj: Set<number>[] = Array.from({ length: n }, () => new Set<number>());
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = y * g.W + x;
      if (!mask[k] || !wall[k]) continue;
      const near = new Set<number>();
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const v = lab[(ny - y0) * bw + (nx - x0)];
          if (v >= 0) near.add(v);
        }
      if (near.size > 1) for (const a of near) for (const b of near) if (a !== b) adj[a].add(b);
      const o = own ? own[(y - y0) * bw + (x - x0)] : -1;
      if (o >= 0)
        for (const a of near) {
          let m = touch.get(a);
          if (!m) touch.set(a, (m = new Map()));
          m.set(o, (m.get(o) ?? 0) + 1);
        }
    }
  // breadth-first hand-out; -2 = contested
  const owner = new Int32Array(n).fill(-1);
  let front: number[] = [];
  cellOf.forEach((c, i) => {
    if (c < 0) return;
    owner[c] = owner[c] === -1 ? i : -2;
    front.push(c);
  });
  // a contested cell goes to the seed whose cells share MORE of its bounding lines (≥ 5 mm of
  // each): a facing strip between a back and a front drawn touching is bounded by the front's hem,
  // neckline and facing line but by only one line of the back; a sliver between two pieces is
  // bounded by one line of each and stays contested
  const linesOf = (c: number) => {
    const m = touch.get(c);
    return new Set(m ? [...m].filter(([, v]) => v >= 10).map(([o]) => o) : []);
  };
  const resolve = (d: number, by: Set<number>): number => {
    if (by.size === 1) return [...by][0];
    if (!own) return -2;
    const mineL = linesOf(d);
    const score = [...by].map((sd) => {
      const shared = new Set<number>();
      for (let c = 0; c < n; c++)
        if (owner[c] === sd) for (const o of linesOf(c)) if (mineL.has(o)) shared.add(o);
      return { sd, v: shared.size };
    });
    score.sort((a, b) => b.v - a.v);
    return score[0].v >= 2 && score[0].v > score[1].v ? score[0].sd : -2;
  };
  while (front.length) {
    const claim = new Map<number, Set<number>>();
    for (const c of front) {
      const o = owner[c];
      if (o < 0) continue;
      for (const d of adj[c]) {
        if (owner[d] !== -1) continue;
        let by = claim.get(d);
        if (!by) claim.set(d, (by = new Set()));
        by.add(o);
      }
    }
    front = [];
    const decided = [...claim].map(([d, by]) => [d, resolve(d, by)] as const);
    for (const [d, o] of decided) {
      owner[d] = o;
      if (o >= 0) front.push(d);
    }
  }
  const out = new Uint8Array(g.W * g.H);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = lab[(y - y0) * bw + (x - x0)];
      if (v >= 0 && owner[v] === mine) out[y * g.W + x] = 1;
    }
  // the walls round my cells (not the ones facing a contested or foreign cell)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const k = y * g.W + x;
      if (!mask[k] || !wall[k]) continue;
      let mineNear = false;
      let other = false;
      for (let dy = -2; dy <= 2 && !other; dy++)
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const v = lab[(ny - y0) * bw + (nx - x0)];
          if (v < 0) continue;
          if (owner[v] === mine) mineNear = true;
          else {
            other = true;
            break;
          }
        }
      if (mineNear && !other) out[k] = 1;
    }
  return out;
}

/** Item index per pixel inside the pixel box [x0..x1]×[y0..y1] (−1 none), stamped like walls. */
function ownerRaster(
  g: Grid,
  items: readonly { pts: readonly PtMm[]; closed?: boolean }[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Int32Array {
  const bw = x1 - x0 + 1;
  const out = new Int32Array(bw * (y1 - y0 + 1)).fill(-1);
  const bx0 = g.corner(x0 - 2, 0).x;
  const bx1 = g.corner(x1 + 3, 0).x;
  const by1 = g.corner(0, y0 - 2).y;
  const by0 = g.corner(0, y1 + 3).y;
  items.forEach((it, idx) => {
    const n = it.pts.length;
    if (!n) return;
    let inBox = false;
    for (const p of it.pts)
      if (p.x >= bx0 && p.x <= bx1 && p.y >= by0 && p.y <= by1) {
        inBox = true;
        break;
      }
    if (!inBox && n > 1) {
      // long segments may cross the box with no vertex inside
      const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const p of it.pts) {
        b.minX = Math.min(b.minX, p.x);
        b.maxX = Math.max(b.maxX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxY = Math.max(b.maxY, p.y);
      }
      inBox = b.maxX >= bx0 && b.minX <= bx1 && b.maxY >= by0 && b.minY <= by1;
    }
    if (!inBox) return;
    const stamp = (x: number, y: number) => {
      for (const [sx, sy] of [
        [x, y],
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ])
        if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) out[(sy - y0) * bw + (sx - x0)] = idx;
    };
    const seg = (a: PtMm, b: PtMm) => {
      let xa = g.ix(a.x);
      let ya = g.iy(a.y);
      const xb = g.ix(b.x);
      const yb = g.iy(b.y);
      if (
        (xa < x0 - 1 && xb < x0 - 1) ||
        (xa > x1 + 1 && xb > x1 + 1) ||
        (ya < y0 - 1 && yb < y0 - 1) ||
        (ya > y1 + 1 && yb > y1 + 1)
      )
        return;
      const dx = Math.abs(xb - xa);
      const sx = xa < xb ? 1 : -1;
      const dy = -Math.abs(yb - ya);
      const sy = ya < yb ? 1 : -1;
      let err = dx + dy;
      for (let guard = 0; guard < 4_000_000; guard++) {
        stamp(xa, ya);
        if (xa === xb && ya === yb) break;
        const e2 = 2 * err;
        if (e2 >= dy) {
          err += dy;
          xa += sx;
        }
        if (e2 <= dx) {
          err += dx;
          ya += sy;
        }
      }
    };
    for (let i = 0; i + 1 < n; i++) seg(it.pts[i], it.pts[i + 1]);
    if (it.closed && n > 2) seg(it.pts[n - 1], it.pts[0]);
  });
  return out;
}
