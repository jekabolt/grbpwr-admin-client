/**
 * PAINT THE PARTS · the drawing's own regions — a pure port of the Ф0 probe
 * (`tmp/plans/paint-parts/f0/probe.py`: `ink_mask`, `silhouette_of`, `regions`, `grow_into`).
 *
 *   ink        Otsu on grey (guarded: a pure b/w sheet degenerates, then mid-scale), the smaller
 *              class is the ink; transparent pixels are white paper.
 *   silhouette everything the outside flood cannot reach through the ink dilated by `rs`.
 *   regions    the free space between lines after closing gaps of radius `r`; the background
 *              (touching the sheet edge) and specks under 0.05 % of the sheet are dropped; then
 *              every free pixel inside the silhouette is given back to its nearest region.
 *
 * Radii are measured on a 1024 sheet (Ф0: r = 3 closes gaps without eating thin parts) and scale
 * with the long side, never below 3.
 */

export type FlatRegions = {
  w: number;
  h: number;
  /** 1 = ink (a line of the drawing). */
  ink: Uint8Array;
  /** 1 = inside the garment's outline (lines included). */
  silhouette: Uint8Array;
  /** Region id per pixel, 1..count; 0 = ink or outside. */
  labels: Int32Array;
  count: number;
};

/**
 * The cutter's revision: the numbers of the regions (and so a cached auto-parts answer) hold only
 * for the same algorithm on the same flat. Bump on ANY change to how `analyseFlat` numbers regions.
 */
export const REGIONS_ALGO_REV = 'regions.v1';

const INF = 1e20;

/** Radius on this sheet for a radius measured on a 1024 sheet. */
export const scaledRadius = (w: number, h: number, at1024 = 3): number =>
  Math.max(at1024, Math.round((at1024 * Math.max(w, h)) / 1024));

/** Ink mask of an RGBA raster (alpha composited over white). */
export function inkMask(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Uint8Array {
  const n = w * h;
  const grey = new Uint8Array(n);
  const hist = new Float64Array(256);
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const a = rgba[p + 3] / 255;
    const r = rgba[p] * a + 255 * (1 - a);
    const g = rgba[p + 1] * a + 255 * (1 - a);
    const b = rgba[p + 2] * a + 255 * (1 - a);
    const v = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    grey[i] = v;
    hist[v] += 1;
  }
  const t = otsu(hist, n);
  const thr = t > 30 && t < 230 ? t : 128;
  const ink = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (grey[i] < thr) {
      ink[i] = 1;
      count += 1;
    }
  }
  // The paint is the smaller class: a flat on a dark ground is inverted.
  if (count > n / 2) for (let i = 0; i < n; i += 1) ink[i] = ink[i] ? 0 : 1;
  return ink;
}

function otsu(hist: Float64Array, n: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i += 1) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let at = 0;
  for (let t = 0; t < 256; t += 1) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = n - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      at = t;
    }
  }
  return at;
}

/**
 * Squared Euclidean distance to the nearest seed and that seed's index (Felzenszwalb–Huttenlocher,
 * two separable passes). `nearest` is -1 where there is no seed at all.
 */
export function distanceTransform(
  seed: Uint8Array,
  w: number,
  h: number,
): { d2: Float64Array; nearest: Int32Array } {
  const n = w * h;
  const g = new Float64Array(n);
  const gy = new Int32Array(n);
  const len = Math.max(w, h);
  const f = new Float64Array(len);
  const d = new Float64Array(len);
  const arg = new Int32Array(len);
  const v = new Int32Array(len);
  const z = new Float64Array(len + 1);

  const dt1 = (count: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < count; q += 1) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k -= 1;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k += 1;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < count; q += 1) {
      while (z[k + 1] < q) k += 1;
      const dq = q - v[k];
      d[q] = dq * dq + f[v[k]];
      arg[q] = v[k];
    }
  };

  for (let x = 0; x < w; x += 1) {
    for (let y = 0; y < h; y += 1) f[y] = seed[y * w + x] ? 0 : INF;
    dt1(h);
    for (let y = 0; y < h; y += 1) {
      g[y * w + x] = d[y];
      gy[y * w + x] = arg[y];
    }
  }
  const d2 = new Float64Array(n);
  const nearest = new Int32Array(n);
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) f[x] = g[row + x];
    dt1(w);
    for (let x = 0; x < w; x += 1) {
      const dist = d[x];
      d2[row + x] = dist;
      if (dist >= INF / 2) nearest[row + x] = -1;
      else {
        const sx = arg[x];
        nearest[row + x] = gy[row + sx] * w + sx;
      }
    }
  }
  return { d2, nearest };
}

/** `mask` grown by a disc of radius r (≈ cv2's elliptic kernel of 2r+1). */
export function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return mask.slice();
  const { d2 } = distanceTransform(mask, w, h);
  const lim = (r + 0.5) * (r + 0.5);
  const out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i += 1) out[i] = d2[i] <= lim ? 1 : 0;
  return out;
}

/** Everything the outside cannot reach through the dilated ink. */
export function silhouetteOf(ink: Uint8Array, w: number, h: number, rs: number): Uint8Array {
  const wall = dilate(ink, w, h, rs);
  const outside = new Uint8Array(w * h);
  const stack = new Int32Array(w * h);
  let top = 0;
  const push = (i: number) => {
    if (outside[i]) return;
    outside[i] = 1;
    stack[top++] = i;
  };
  // The sheet's edge counts as open (the probe forces the border free before its flood).
  for (let x = 0; x < w; x += 1) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0 && !wall[i - 1]) push(i - 1);
    if (x < w - 1 && !wall[i + 1]) push(i + 1);
    if (y > 0 && !wall[i - w]) push(i - w);
    if (y < h - 1 && !wall[i + w]) push(i + w);
  }
  const sil = new Uint8Array(w * h);
  for (let i = 0; i < sil.length; i += 1) sil[i] = outside[i] ? 0 : 1;
  return sil;
}

/** 4-connected components of `free`; returns labels (0 = not free) and the count. */
function components(free: Uint8Array, w: number, h: number): { lab: Int32Array; n: number } {
  const lab = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let n = 0;
  for (let s = 0; s < lab.length; s += 1) {
    if (!free[s] || lab[s]) continue;
    n += 1;
    let top = 0;
    lab[s] = n;
    stack[top++] = s;
    while (top > 0) {
      const i = stack[--top];
      const x = i % w;
      if (x > 0 && free[i - 1] && !lab[i - 1]) {
        lab[i - 1] = n;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && free[i + 1] && !lab[i + 1]) {
        lab[i + 1] = n;
        stack[top++] = i + 1;
      }
      if (i >= w && free[i - w] && !lab[i - w]) {
        lab[i - w] = n;
        stack[top++] = i - w;
      }
      if (i + w < lab.length && free[i + w] && !lab[i + w]) {
        lab[i + w] = n;
        stack[top++] = i + w;
      }
    }
  }
  return { lab, n };
}

/** Regions between the lines after closing gaps of radius r. */
export function regionsOf(
  ink: Uint8Array,
  w: number,
  h: number,
  r: number,
  silhouette?: Uint8Array,
): { labels: Int32Array; count: number } {
  const n = w * h;
  const wall = r > 0 ? dilate(ink, w, h, r) : ink;
  const free = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) free[i] = wall[i] ? 0 : 1;
  const { lab, n: total } = components(free, w, h);

  const drop = new Uint8Array(total + 1);
  // The background: anything touching the sheet's edge.
  for (let x = 0; x < w; x += 1) {
    drop[lab[x]] = 1;
    drop[lab[(h - 1) * w + x]] = 1;
  }
  for (let y = 0; y < h; y += 1) {
    drop[lab[y * w]] = 1;
    drop[lab[y * w + w - 1]] = 1;
  }
  // Specks under 0.05 % of the sheet.
  const size = new Int32Array(total + 1);
  for (let i = 0; i < n; i += 1) size[lab[i]] += 1;
  const minPx = n * 0.0005;
  for (let id = 1; id <= total; id += 1) if (size[id] < minPx) drop[id] = 1;
  drop[0] = 1;
  for (let i = 0; i < n; i += 1) if (drop[lab[i]]) lab[i] = 0;

  // Give back the strip the dilation ate: every free pixel inside the silhouette to its nearest region.
  if (r > 0) {
    const sil = silhouette ?? silhouetteOf(ink, w, h, 3);
    const seed = new Uint8Array(n);
    let any = false;
    for (let i = 0; i < n; i += 1)
      if (lab[i] > 0) {
        seed[i] = 1;
        any = true;
      }
    if (any) {
      const { nearest } = distanceTransform(seed, w, h);
      for (let i = 0; i < n; i += 1) {
        if (lab[i] === 0 && sil[i] && !ink[i] && nearest[i] >= 0) lab[i] = lab[nearest[i]];
      }
    }
  }

  // Compact ids in first-seen order.
  const map = new Int32Array(total + 1);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    const id = lab[i];
    if (!id) continue;
    if (!map[id]) map[id] = ++count;
    lab[i] = map[id];
  }
  return { labels: lab, count };
}

/** The whole analysis of one flat raster (RGBA, already at canvas size). */
export function analyseFlat(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  opts: { r?: number } = {},
): FlatRegions {
  const ink = inkMask(rgba, w, h);
  const rs = scaledRadius(w, h, 3);
  const silhouette = silhouetteOf(ink, w, h, rs);
  const r = opts.r ?? scaledRadius(w, h, 3);
  const { labels, count } = regionsOf(ink, w, h, r, silhouette);
  return { w, h, ink, silhouette, labels, count };
}
