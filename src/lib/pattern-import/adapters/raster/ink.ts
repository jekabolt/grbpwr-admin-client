// Ink vs paper, and ink → colour classes.
//
// Model: on white paper W a tint of ink C at coverage α reads p = W − α(W − C). The absorption
// a = W − p therefore keeps its DIRECTION along a line's anti-aliased flank and only its length
// falls off. Pixels are clustered on the unit absorption DIRECTION only (a hue class). Strength is
// not a pixel feature: for a 1–2 px line the peak depends on the sub-pixel phase, so black and
// 70 % grey are indistinguishable per pixel; trace.ts splits a hue class by COMPONENT strength.
// Flanks inherit the label of the 3×3 peak they hang on. Each pixel stores only a strength byte
// and a label byte (2 B/px).

import type { InkClass, RasterImage, TraceOpts } from './types';

export type InkField = {
  w: number;
  h: number;
  /** Ink strength 0..255 = max channel absorption over the local paper. */
  s: Uint8Array;
  /** Local paper colour at block resolution (3 floats per block) and block size, px. */
  paper: Float32Array;
  bw: number;
  bh: number;
  block: number;
};

/** RGB of pixel i, alpha composited over white. */
export function rgbAt(img: RasterImage, i: number, out: number[]): void {
  const d = img.data;
  if (img.channels === 1) {
    const g = d[i];
    out[0] = g;
    out[1] = g;
    out[2] = g;
  } else if (img.channels === 3) {
    const k = i * 3;
    out[0] = d[k];
    out[1] = d[k + 1];
    out[2] = d[k + 2];
  } else {
    const k = i * 4;
    const al = d[k + 3] / 255;
    out[0] = 255 - al * (255 - d[k]);
    out[1] = 255 - al * (255 - d[k + 1]);
    out[2] = 255 - al * (255 - d[k + 2]);
  }
}

/**
 * Paper colour per block (≈4 mm): per channel 80th percentile, then a 3×3 median over blocks and
 * a floor against the global paper so a block filled by a letter does not become "paper".
 */
export function estimatePaper(img: RasterImage, pxPerMm: number): InkField {
  const { width: w, height: h } = img;
  const block = Math.max(8, Math.round(4 * pxPerMm));
  const bw = Math.ceil(w / block);
  const bh = Math.ceil(h / block);
  const raw = new Float32Array(bw * bh * 3);
  const hist = new Uint32Array(256 * 3);
  const px = [0, 0, 0];
  const gHist = new Uint32Array(256 * 3);
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      hist.fill(0);
      const x0 = bx * block;
      const y0 = by * block;
      const x1 = Math.min(w, x0 + block);
      const y1 = Math.min(h, y0 + block);
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          rgbAt(img, y * w + x, px);
          hist[px[0] | 0]++;
          hist[256 + (px[1] | 0)]++;
          hist[512 + (px[2] | 0)]++;
          n++;
        }
      }
      for (let c = 0; c < 3; c++) {
        const target = n * 0.8;
        let acc = 0;
        let v = 255;
        for (let k = 0; k < 256; k++) {
          acc += hist[c * 256 + k];
          if (acc >= target) {
            v = k;
            break;
          }
        }
        raw[(by * bw + bx) * 3 + c] = v;
        gHist[c * 256 + v]++;
      }
    }
  }
  // Global paper: 75th percentile of the block values.
  const global = [255, 255, 255];
  for (let c = 0; c < 3; c++) {
    const target = bw * bh * 0.75;
    let acc = 0;
    for (let k = 0; k < 256; k++) {
      acc += gHist[c * 256 + k];
      if (acc >= target) {
        global[c] = k;
        break;
      }
    }
  }
  const paper = new Float32Array(bw * bh * 3);
  const win: number[] = [];
  for (let by = 0; by < bh; by++) {
    for (let bx = 0; bx < bw; bx++) {
      for (let c = 0; c < 3; c++) {
        win.length = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const X = bx + dx;
            const Y = by + dy;
            if (X < 0 || Y < 0 || X >= bw || Y >= bh) continue;
            win.push(raw[(Y * bw + X) * 3 + c]);
          }
        }
        win.sort((a, b) => a - b);
        let v = win[win.length >> 1];
        // A block darker than the global paper by > 40 is ink-dominated: use the global value.
        if (v < global[c] - 40) v = global[c];
        paper[(by * bw + bx) * 3 + c] = v;
      }
    }
  }
  const s = new Uint8Array(w * h);
  const field: InkField = { w, h, s, paper, bw, bh, block };
  const W = [0, 0, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      paperAt(field, x, y, W);
      const i = y * w + x;
      rgbAt(img, i, px);
      let m = 0;
      for (let c = 0; c < 3; c++) {
        const a = W[c] - px[c];
        if (a > m) m = a;
      }
      s[i] = m > 255 ? 255 : m | 0;
    }
  }
  return field;
}

/** Bilinear paper colour at pixel (x, y). */
export function paperAt(f: InkField, x: number, y: number, out: number[]): void {
  const fx = Math.min(Math.max((x + 0.5) / f.block - 0.5, 0), f.bw - 1);
  const fy = Math.min(Math.max((y + 0.5) / f.block - 0.5, 0), f.bh - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, f.bw - 1);
  const y1 = Math.min(y0 + 1, f.bh - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const p = f.paper;
  for (let c = 0; c < 3; c++) {
    const v00 = p[(y0 * f.bw + x0) * 3 + c];
    const v10 = p[(y0 * f.bw + x1) * 3 + c];
    const v01 = p[(y1 * f.bw + x0) * 3 + c];
    const v11 = p[(y1 * f.bw + x1) * 3 + c];
    out[c] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
  }
}

/** Feature of pixel i: unit absorption direction. */
function featureAt(
  img: RasterImage,
  f: InkField,
  i: number,
  px: number[],
  W: number[],
  out: Float64Array,
): boolean {
  const x = i % f.w;
  const y = (i - x) / f.w;
  rgbAt(img, i, px);
  paperAt(f, x, y, W);
  const a0 = Math.max(0, W[0] - px[0]);
  const a1 = Math.max(0, W[1] - px[1]);
  const a2 = Math.max(0, W[2] - px[2]);
  const n = Math.hypot(a0, a1, a2);
  if (n < 1e-6) return false;
  out[0] = a0 / n;
  out[1] = a1 / n;
  out[2] = a2 / n;
  return true;
}

/** Peak strength in the 3×3 neighbourhood and the index holding it. */
function peak3(f: InkField, i: number): { v: number; at: number } {
  const { w, h, s } = f;
  const x = i % w;
  const y = (i - x) / w;
  let v = -1;
  let at = i;
  for (let dy = -1; dy <= 1; dy++) {
    const Y = y + dy;
    if (Y < 0 || Y >= h) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const X = x + dx;
      if (X < 0 || X >= w) continue;
      const j = Y * w + X;
      if (s[j] > v) {
        v = s[j];
        at = j;
      }
    }
  }
  return { v, at };
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const D = 3;
function dist2(a: Float64Array, ai: number, b: Float64Array, bi: number): number {
  let s = 0;
  for (let k = 0; k < D; k++) {
    const d = a[ai * D + k] - b[bi * D + k];
    s += d * d;
  }
  return s;
}

/**
 * Cluster the ink and label every ink pixel (0 = paper, 1..K = class). Returns the classes in
 * label order. The label image is the only full-size allocation besides the strength image.
 */
export function clusterInks(
  img: RasterImage,
  f: InkField,
  opts: TraceOpts,
): { labels: Uint8Array; inks: InkClass[] } {
  const { w, h, s } = f;
  const N = w * h;
  const px = [0, 0, 0];
  const W = [0, 0, 0];
  const feat = new Float64Array(D);

  // 1. Core samples: ink pixels near the ridge of their line.
  let coreCount = 0;
  for (let i = 0; i < N; i++) {
    if (s[i] < opts.inkHigh) continue;
    coreCount++;
  }
  const MAX_SAMPLES = 120_000;
  const stride = Math.max(1, Math.ceil(coreCount / MAX_SAMPLES));
  const samples = new Float64Array(MAX_SAMPLES * D + D * 64);
  let ns = 0;
  let seen = 0;
  for (let i = 0; i < N; i++) {
    if (s[i] < opts.inkHigh) continue;
    if (seen++ % stride !== 0) continue;
    const pk = peak3(f, i);
    if (s[i] < 0.6 * pk.v) continue;
    if (ns * D + D > samples.length) break;
    if (!featureAt(img, f, i, px, W, feat)) continue;
    for (let k = 0; k < D; k++) samples[ns * D + k] = feat[k];
    ns++;
  }
  const labels = new Uint8Array(N);
  if (ns === 0) return { labels, inks: [] };
  const X = samples.subarray(0, ns * D);

  // 2. k-means++ with K seeds, Lloyd iterations.
  const K = Math.min(opts.maxInks, ns);
  const rand = rng(0x5eed);
  const C = new Float64Array(K * D);
  const first = Math.floor(rand() * ns);
  for (let k = 0; k < D; k++) C[k] = X[first * D + k];
  const dmin = new Float64Array(ns).fill(Infinity);
  for (let c = 1; c < K; c++) {
    let sum = 0;
    for (let i = 0; i < ns; i++) {
      const d = dist2(X, i, C, c - 1);
      if (d < dmin[i]) dmin[i] = d;
      sum += dmin[i];
    }
    let r = rand() * sum;
    let pick = ns - 1;
    for (let i = 0; i < ns; i++) {
      r -= dmin[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
    for (let k = 0; k < D; k++) C[c * D + k] = X[pick * D + k];
  }
  const assign = new Int32Array(ns);
  const nearest = (cent: Float64Array, nc: number, alive: boolean[] | null, i: number) => {
    let best = -1;
    let bd = Infinity;
    for (let c = 0; c < nc; c++) {
      if (alive && !alive[c]) continue;
      const d = dist2(X, i, cent, c);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  };
  const recompute = (nc: number) => {
    const sum = new Float64Array(nc * D);
    const cnt = new Int32Array(nc);
    for (let i = 0; i < ns; i++) {
      const c = assign[i];
      cnt[c]++;
      for (let k = 0; k < D; k++) sum[c * D + k] += X[i * D + k];
    }
    for (let c = 0; c < nc; c++) {
      if (!cnt[c]) continue;
      for (let k = 0; k < D; k++) C[c * D + k] = sum[c * D + k] / cnt[c];
    }
    return cnt;
  };
  for (let it = 0; it < 20; it++) {
    let moved = 0;
    for (let i = 0; i < ns; i++) {
      const c = nearest(C, K, null, i);
      if (c !== assign[i]) moved++;
      assign[i] = c;
    }
    recompute(K);
    if (it > 0 && moved < ns * 0.001) break;
  }

  // 3. Merge close clusters (COMPLETE linkage over the Lloyd centroids, so a band of mixed
  //    fringe pixels between pink and purple cannot chain the two into one), then fold tiny
  //    clusters into their nearest neighbour.
  const alive = new Array<boolean>(K).fill(true);
  let cnt = recompute(K);
  for (let c = 0; c < K; c++) if (!cnt[c]) alive[c] = false;
  const C0 = C.slice();
  const members: number[][] = Array.from({ length: K }, (_, c) => [c]);
  const merge2 = opts.mergeDist * opts.mergeDist;
  const linkage = (a: number, b: number) => {
    let m = 0;
    for (const p of members[a]) for (const q of members[b]) m = Math.max(m, dist2(C0, p, C0, q));
    return m;
  };
  for (;;) {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let a = 0; a < K; a++) {
      if (!alive[a]) continue;
      for (let b = a + 1; b < K; b++) {
        if (!alive[b]) continue;
        const d = linkage(a, b);
        if (d < bd) {
          bd = d;
          best = [a, b];
        }
      }
    }
    if (!best || bd > merge2) break;
    const [a, b] = best;
    for (let i = 0; i < ns; i++) if (assign[i] === b) assign[i] = a;
    members[a].push(...members[b]);
    alive[b] = false;
    cnt = recompute(K);
  }
  for (;;) {
    let small = -1;
    let sm = Infinity;
    for (let c = 0; c < K; c++) {
      if (alive[c] && cnt[c] < ns * opts.minInkShare && cnt[c] < sm) {
        sm = cnt[c];
        small = c;
      }
    }
    const nAlive = alive.filter(Boolean).length;
    if (small < 0 || nAlive <= 1) break;
    alive[small] = false;
    for (let i = 0; i < ns; i++) if (assign[i] === small) assign[i] = nearest(C, K, alive, i);
    cnt = recompute(K);
  }

  // 4. Classes in label order 1..n.
  const order: number[] = [];
  for (let c = 0; c < K; c++) if (alive[c]) order.push(c);
  const labelOf = new Int32Array(K).fill(0);
  order.forEach((c, j) => (labelOf[c] = j + 1));
  const cent = new Float64Array(order.length * D);
  order.forEach((c, j) => {
    for (let k = 0; k < D; k++) cent[j * D + k] = C[c * D + k];
  });

  // 5. Label: ridge pixels by feature, flanks inherit from the 3×3 peak they hang on.
  const nearestCent = (fv: Float64Array) => {
    let best = 0;
    let bd = Infinity;
    for (let c = 0; c < order.length; c++) {
      let d = 0;
      for (let k = 0; k < D; k++) {
        const t = fv[k] - cent[c * D + k];
        d += t * t;
      }
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best + 1;
  };
  // Two passes, no side arrays: ridge pixels first, then flanks from their (labelled) peak.
  for (let i = 0; i < N; i++) {
    if (s[i] < opts.inkLow) continue;
    const pk = peak3(f, i);
    if (s[i] >= 0.6 * pk.v) labels[i] = featureAt(img, f, i, px, W, feat) ? nearestCent(feat) : 1;
  }
  for (let i = 0; i < N; i++) {
    if (s[i] < opts.inkLow || labels[i]) continue;
    const pk = peak3(f, i);
    if (labels[pk.at]) labels[i] = labels[pk.at];
    else labels[i] = featureAt(img, f, i, px, W, feat) ? nearestCent(feat) : 1;
  }

  // 6. Class colour: median of ridge pixels with strength ≥ 0.85 × the class's own 90th pct.
  const inks: InkClass[] = order.map((c, j) => ({
    label: j + 1,
    rgb: [0, 0, 0],
    dir: [cent[j * D], cent[j * D + 1], cent[j * D + 2]],
    peak: 0,
    share: cnt[c] / ns,
  }));
  const chans: number[][][] = order.map(() => [[], [], []]);
  const sStride = Math.max(1, Math.floor(N / 2_000_000));
  for (let i = 0; i < N; i += sStride) {
    const L = labels[i];
    if (!L || s[i] < opts.inkHigh) continue;
    const pk = peak3(f, i);
    if (pk.at !== i) continue;
    rgbAt(img, i, px);
    const ch = chans[L - 1];
    if (ch[0].length > 40_000) continue;
    ch[0].push(px[0]);
    ch[1].push(px[1]);
    ch[2].push(px[2]);
  }
  chans.forEach((ch, j) => {
    for (let c = 0; c < 3; c++) {
      const v = ch[c].sort((a, b) => a - b);
      inks[j].rgb[c] = v.length ? v[v.length >> 1] : 0;
    }
  });
  return { labels, inks };
}
