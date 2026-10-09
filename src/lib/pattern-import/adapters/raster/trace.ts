// One raster page → canonical IR (F11).
//
// Per image: paper → ink strength → colour classes → per-class connected components → thinning →
// skeleton graph → sub-pixel refinement along the normal → Douglas–Peucker → page mm (y-up) →
// page calibration. Only one image's buffers are alive at a time; the caller releases the pixels
// after the page returns. Peak working set ≈ pixels + 3 B/px (strength, label, visited) + the
// largest component crop.

import type { BoxMm, IRPage, IRPath, IRRaster, PtMm, Style } from '../../types';
import { apply, IDENTITY, meanScale } from './affine';
import { clusterInks, estimatePaper } from './ink';
import {
  releaseScratch,
  scratchU8,
  simplifyDPIndices,
  skeletonToPolylines,
  zhangSuen,
} from './skeleton';
import type {
  InkClass,
  RasterCalibration,
  RasterImage,
  RasterPageInput,
  TraceOpts,
  TraceStats,
} from './types';
import { TRACE_DEFAULTS } from './types';

const N8X = [0, 1, 1, 1, 0, -1, -1, -1];
const N8Y = [-1, -1, 0, 1, 1, 1, 0, -1];

export type TracedLine = {
  label: number;
  fill: boolean;
  widthMm: number;
  /** Page frame, mm, y-up (before calibration). */
  pts: PtMm[];
  closed: boolean;
  /** Pixel bbox of the component the line came from (image pixel frame). */
  pxBox: [number, number, number, number];
};

export type TracedImage = { lines: TracedLine[]; inks: InkClass[]; stats: TraceStats };

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Bilinear strength at continuous pixel-centre-frame (X, Y), counting only class-L pixels. */
function sampleS(
  s: Uint8Array,
  labels: Uint8Array,
  w: number,
  h: number,
  L: number,
  X: number,
  Y: number,
): number {
  const u = X - 0.5;
  const v = Y - 0.5;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const tx = u - x0;
  const ty = v - y0;
  let acc = 0;
  for (let dy = 0; dy <= 1; dy++) {
    const yy = y0 + dy;
    if (yy < 0 || yy >= h) continue;
    const wy = dy ? ty : 1 - ty;
    for (let dx = 0; dx <= 1; dx++) {
      const xx = x0 + dx;
      if (xx < 0 || xx >= w) continue;
      const i = yy * w + xx;
      if (labels[i] !== L) continue;
      acc += s[i] * wy * (dx ? tx : 1 - tx);
    }
  }
  return acc;
}

/** Move each interior vertex to the strength centroid across the line (≤ 1 px). */
function refineLine(
  pts: number[],
  closed: boolean,
  s: Uint8Array,
  labels: Uint8Array,
  w: number,
  h: number,
  L: number,
  R: number,
): number[] {
  const n = pts.length / 2;
  const out = pts.slice();
  if (n < 5) return out;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) continue;
    const a = closed ? (i - 3 + n) % n : Math.max(0, i - 3);
    const b = closed ? (i + 3) % n : Math.min(n - 1, i + 3);
    let tx = pts[b * 2] - pts[a * 2];
    let ty = pts[b * 2 + 1] - pts[a * 2 + 1];
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) continue;
    tx /= tl;
    ty /= tl;
    const nx = -ty;
    const ny = tx;
    const X = pts[i * 2];
    const Y = pts[i * 2 + 1];
    let sw = 0;
    let so = 0;
    for (let o = -R; o <= R + 1e-9; o += 0.25) {
      const v = sampleS(s, labels, w, h, L, X + o * nx, Y + o * ny);
      sw += v;
      so += v * o;
    }
    if (sw <= 0) continue;
    let shift = so / sw;
    if (shift > 1) shift = 1;
    if (shift < -1) shift = -1;
    out[i * 2] = X + shift * nx;
    out[i * 2 + 1] = Y + shift * ny;
  }
  return out;
}

/**
 * Thinning eats about half a line width at a free end. Walk outwards along the end tangent while
 * the class's strength stays above half of the strength at the end vertex: a butt cap's edge is
 * where coverage crosses 50 %.
 */
function extendEnds(
  pts: number[],
  freeA: boolean,
  freeB: boolean,
  s: Uint8Array,
  labels: Uint8Array,
  w: number,
  h: number,
  L: number,
  widthPx: number,
): number[] {
  const n = pts.length / 2;
  if (n < 2) return pts;
  const out = pts.slice();
  const maxO = 2 * widthPx + 2;
  const extend = (end: number, inner: number) => {
    const x0 = pts[end * 2];
    const y0 = pts[end * 2 + 1];
    let tx = x0 - pts[inner * 2];
    let ty = y0 - pts[inner * 2 + 1];
    const tl = Math.hypot(tx, ty);
    if (tl < 1e-6) return;
    tx /= tl;
    ty /= tl;
    const v0 = sampleS(s, labels, w, h, L, x0, y0);
    if (v0 <= 0) return;
    let prevO = 0;
    let prevV = v0;
    let reach = 0;
    for (let o = 0.25; o <= maxO; o += 0.25) {
      const v = sampleS(s, labels, w, h, L, x0 + o * tx, y0 + o * ty);
      if (v < 0.5 * v0) {
        reach = prevO + ((o - prevO) * (prevV - 0.5 * v0)) / Math.max(1e-6, prevV - v);
        break;
      }
      prevO = o;
      prevV = v;
      reach = o;
    }
    out[end * 2] = x0 + reach * tx;
    out[end * 2 + 1] = y0 + reach * ty;
  };
  const k = Math.min(4, n - 1);
  if (freeA) extend(0, k);
  if (freeB) extend(n - 1, n - 1 - k);
  return out;
}

function fitLine(xs: number[], ys: number[]): [number, number, number, number] | null {
  const n = xs.length;
  if (n < 4) return null;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += xs[i];
    my += ys[i];
  }
  mx /= n;
  my /= n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - mx;
    const y = ys[i] - my;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return [mx, my, Math.cos(th), Math.sin(th)];
}

/**
 * Thinning also cuts sharp corners (the skeleton takes the diagonal), and Douglas–Peucker then
 * pins the straight runs either side to that cut corner — a test square comes out half a pixel
 * small per side. Put every kept vertex with a turn > 20° back on the intersection of the lines
 * fitted to the dense runs either side, outside a guard of 1.5 line widths.
 */
function sharpenCorners(
  dense: number[],
  keep: number[],
  closed: boolean,
  widthPx: number,
): number[] {
  const n = dense.length / 2;
  const K = keep.length;
  const out: number[] = [];
  for (const i of keep) out.push(dense[i * 2], dense[i * 2 + 1]);
  if (K < 3) return out;
  const guard = Math.ceil(1.5 * widthPx + 1);
  const span = 40;
  const at = (i: number) => (closed ? ((i % n) + n) % n : i);
  for (let j = 0; j < K; j++) {
    if (!closed && (j === 0 || j === K - 1)) continue;
    const i = keep[j];
    const a = keep[(j - 1 + K) % K];
    const b = keep[(j + 1) % K];
    const da = closed ? (i - a + n) % n : i - a;
    const db = closed ? (b - i + n) % n : b - i;
    const vx = dense[i * 2];
    const vy = dense[i * 2 + 1];
    const ux = vx - dense[a * 2];
    const uy = vy - dense[a * 2 + 1];
    const wx = dense[b * 2] - vx;
    const wy = dense[b * 2 + 1] - vy;
    const cos = (ux * wx + uy * wy) / (Math.hypot(ux, uy) * Math.hypot(wx, wy) || 1);
    if (cos > Math.cos((20 * Math.PI) / 180)) continue;
    const x1: number[] = [];
    const y1: number[] = [];
    for (let t = guard; t < Math.min(da - 1, guard + span); t++) {
      const q = at(i - t);
      x1.push(dense[q * 2]);
      y1.push(dense[q * 2 + 1]);
    }
    const x2: number[] = [];
    const y2: number[] = [];
    for (let t = guard; t < Math.min(db - 1, guard + span); t++) {
      const q = at(i + t);
      x2.push(dense[q * 2]);
      y2.push(dense[q * 2 + 1]);
    }
    const l1 = fitLine(x1, y1);
    const l2 = fitLine(x2, y2);
    if (!l1 || !l2) continue;
    const den = l1[2] * l2[3] - l1[3] * l2[2];
    if (Math.abs(den) < 0.2) continue;
    const t = ((l2[0] - l1[0]) * l2[3] - (l2[1] - l1[1]) * l2[2]) / den;
    const X = l1[0] + t * l1[2];
    const Y = l1[1] + t * l1[3];
    if (Math.hypot(X - vx, Y - vy) > 2 * widthPx + 2) continue;
    out[j * 2] = X;
    out[j * 2 + 1] = Y;
  }
  return out;
}

/** Trace one image into page-frame polylines (uncalibrated). */
export function traceImage(img: RasterImage, opts: TraceOpts): TracedImage {
  const t0 = now();
  const mmPerPx = meanScale(img.pxToPage);
  const pxPerMm = 1 / mmPerPx;
  const { width: w, height: h } = img;
  const field = estimatePaper(img, pxPerMm);
  const t1 = now();
  const { labels, inks } = clusterInks(img, field, opts);
  const t2 = now();
  const s = field.s;

  const paperMean = [0, 0, 0];
  const nb = field.bw * field.bh;
  for (let k = 0; k < nb; k++)
    for (let c = 0; c < 3; c++) paperMean[c] += field.paper[k * 3 + c] / nb;
  const vis = new Uint8Array(w * h);
  type Comp = { hue: number; strength: number; weight: number };
  const comps: Comp[] = [];
  const raw: (TracedLine & { comp: number })[] = [];
  const stack: number[] = [];
  const comp: number[] = [];
  const hist = new Uint32Array(256);
  let components = 0;
  const minPx = Math.max(4, Math.round(0.25 * pxPerMm * 0.25 * pxPerMm));
  const eps = opts.simplifyMm * pxPerMm;
  const minLenPx = opts.minLengthMm * pxPerMm;
  for (let i0 = 0; i0 < w * h; i0++) {
    const L = labels[i0];
    if (!L || vis[i0]) continue;
    // Flood the 8-connected component of hue class L.
    comp.length = 0;
    stack.length = 0;
    stack.push(i0);
    vis[i0] = 1;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let maxS = 0;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (s[i] > maxS) maxS = s[i];
      for (let k = 0; k < 8; k++) {
        const X = x + N8X[k];
        const Y = y + N8Y[k];
        if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
        const j = Y * w + X;
        if (vis[j] || labels[j] !== L) continue;
        vis[j] = 1;
        stack.push(j);
      }
    }
    if (maxS < opts.inkHigh || comp.length < minPx) continue;
    components++;
    // Crop with a 1-px zero border.
    const CW = x1 - x0 + 3;
    const CH = y1 - y0 + 3;
    const crop = scratchU8(0, CW * CH);
    for (const i of comp) {
      const x = i % w;
      const y = (i - x) / w;
      crop[(y - y0 + 1) * CW + (x - x0 + 1)] = 1;
    }
    zhangSuen(crop, CW, CH);
    // Component strength = median over the skeleton of the 3×3 peak: the line's full-strength
    // absorption, stable against the sub-pixel phase of a 1–2 px line.
    hist.fill(0);
    let skelPx = 0;
    for (let cy = 1; cy < CH - 1; cy++) {
      for (let cx = 1; cx < CW - 1; cx++) {
        if (!crop[cy * CW + cx]) continue;
        skelPx++;
        const X = cx + x0 - 1;
        const Y = cy + y0 - 1;
        let pk = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = Y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = X + dx;
            if (xx < 0 || xx >= w) continue;
            const j = yy * w + xx;
            if (labels[j] === L && s[j] > pk) pk = s[j];
          }
        }
        hist[pk]++;
      }
    }
    if (!skelPx) continue;
    let acc = 0;
    let strength = maxS;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= skelPx * 0.5) {
        strength = Math.max(v, 1);
        break;
      }
    }
    let inkVol = 0;
    for (const i of comp) inkVol += Math.min(1, s[i] / strength);
    const ci = comps.length;
    comps.push({ hue: L, strength, weight: comp.length });
    const widthPx = inkVol / skelPx;
    const fill = widthPx * mmPerPx > opts.fillWidthMm;
    const spurPx = Math.max(opts.spurMm * pxPerMm, 1.2 * widthPx);
    const { lines: skel } = skeletonToPolylines(crop, CW, CH, spurPx);
    const R = Math.min(4, Math.max(1.5, 0.6 * widthPx + 1));
    for (const sl of skel) {
      // Crop frame → image pixel-centre frame.
      const p = sl.pts;
      for (let k = 0; k < p.length; k += 2) {
        p[k] += x0 - 1;
        p[k + 1] += y0 - 1;
      }
      let len = 0;
      for (let k = 2; k < p.length; k += 2) len += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
      if (len < minLenPx && !sl.closed) continue;
      const fine = opts.refine && !fill;
      let refined = fine ? refineLine(p, sl.closed, s, labels, w, h, L, R) : p;
      if (fine) refined = extendEnds(refined, sl.freeA, sl.freeB, s, labels, w, h, L, widthPx);
      const keep = simplifyDPIndices(refined, eps);
      let simple: number[];
      if (fine) simple = sharpenCorners(refined, keep, sl.closed, widthPx);
      else {
        simple = [];
        for (const k of keep) simple.push(refined[k * 2], refined[k * 2 + 1]);
      }
      const pts: PtMm[] = [];
      for (let k = 0; k < simple.length; k += 2)
        pts.push(apply(img.pxToPage, simple[k], simple[k + 1]));
      if (pts.length < 2) continue;
      raw.push({
        comp: ci,
        label: 0,
        fill,
        widthMm: widthPx * mmPerPx,
        pts,
        closed: sl.closed,
        pxBox: [x0, y0, x1 + 1, y1 + 1],
      });
    }
  }

  // Split each hue class by component strength (black vs pale grey of the same hue): sort by
  // strength, open a new class when a component is `strengthSplit` × the running class mean.
  const final: InkClass[] = [];
  const classOfComp = new Int32Array(comps.length);
  const totalW = comps.reduce((a, c) => a + c.weight, 0) || 1;
  inks.forEach((ink) => {
    const mine = comps
      .map((c, k) => ({ c, k }))
      .filter((e) => e.c.hue === ink.label)
      .sort((a, b) => a.c.strength - b.c.strength);
    let cur: { sw: number; w: number; members: number[] } | null = null;
    const dmax = Math.max(...ink.dir, 1e-6);
    const close = () => {
      if (!cur) return;
      const label = final.length + 1;
      const str = cur.sw / cur.w;
      final.push({
        label,
        // Full-strength colour = paper − hue × strength: the same ink reads the same on every page
        // and at every line width (a thin line's own pixels never reach full coverage).
        rgb: [0, 1, 2].map((c) =>
          Math.round(Math.max(0, Math.min(255, paperMean[c] - (ink.dir[c] / dmax) * str))),
        ) as [number, number, number],
        dir: ink.dir,
        peak: str / 255,
        share: cur.w / totalW,
      });
      for (const k of cur.members) classOfComp[k] = label;
    };
    for (const { c, k } of mine) {
      if (cur && c.strength > opts.strengthSplit * (cur.sw / cur.w)) {
        close();
        cur = null;
      }
      if (!cur) cur = { sw: 0, w: 0, members: [] };
      cur.sw += c.strength * c.weight;
      cur.w += c.weight;
      cur.members.push(k);
    }
    close();
  });
  releaseScratch();
  const lines: TracedLine[] = raw.map(({ comp: ci, ...l }) => ({ ...l, label: classOfComp[ci] }));
  const t3 = now();
  return {
    lines,
    inks: final,
    stats: {
      op: img.op,
      widthPx: w,
      heightPx: h,
      dpi: 25.4 * pxPerMm,
      inks: final,
      components,
      polylines: lines.length,
      ms: { paper: t1 - t0, cluster: t2 - t1, trace: t3 - t2, total: t3 - t0 },
    },
  };
}

const hex = (rgb: [number, number, number]) =>
  rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

/** Bounding box of the image on the page. */
function imageBox(img: RasterImage): BoxMm {
  const c = [
    apply(img.pxToPage, 0, 0),
    apply(img.pxToPage, img.width, 0),
    apply(img.pxToPage, 0, img.height),
    apply(img.pxToPage, img.width, img.height),
  ];
  return {
    minX: Math.min(...c.map((p) => p.x)),
    minY: Math.min(...c.map((p) => p.y)),
    maxX: Math.max(...c.map((p) => p.x)),
    maxY: Math.max(...c.map((p) => p.y)),
  };
}

export type TracePageResult = { page: IRPage; stats: TraceStats[] };

/**
 * Trace every image of the page, intern styles per (ink colour, fill), apply the calibration.
 * `rasterIdBase` numbers the IRRaster metadata (the session's blob-store ids).
 */
export function tracePageSync(
  input: RasterPageInput,
  calib: RasterCalibration | null,
  opts: Partial<TraceOpts> = {},
  rasterIdBase = 0,
): TracePageResult {
  const o: TraceOpts = { ...TRACE_DEFAULTS, ...opts };
  const A = calib?.affine ?? IDENTITY;
  const styles: Style[] = [];
  const styleKey = new Map<string, number>();
  const paths: IRPath[] = [];
  const rasters: IRRaster[] = [];
  const stats: TraceStats[] = [];
  const pageArea = input.widthMm * input.heightMm;
  input.images.forEach((img, k) => {
    const t = traceImage(img, o);
    stats.push(t.stats);
    const box = imageBox(img);
    const bw = box.maxX - box.minX;
    rasters.push({
      id: rasterIdBase + k,
      page: input.page,
      file: input.file,
      bbox: box,
      widthPx: img.width,
      heightPx: img.height,
      dpi: bw > 0 ? img.width / (bw / 25.4) : 0,
      pageCover: pageArea > 0 ? (bw * (box.maxY - box.minY)) / pageArea : 0,
    });
    // Median width per (label, fill) for the style.
    const widths = new Map<string, number[]>();
    for (const l of t.lines) {
      const key = `${l.label}|${l.fill ? 1 : 0}`;
      if (!widths.has(key)) widths.set(key, []);
      widths.get(key)!.push(l.widthMm);
    }
    const localStyle = new Map<string, number>();
    for (const [key, ws] of widths) {
      const [label, fill] = key.split('|');
      const ink = t.inks[Number(label) - 1];
      ws.sort((a, b) => a - b);
      const sk = `${hex(ink.rgb)}|${fill}`;
      let id = styleKey.get(sk);
      if (id === undefined) {
        id = styles.length;
        styleKey.set(sk, id);
        styles.push({
          id,
          strokeRgb: [ink.rgb[0], ink.rgb[1], ink.rgb[2]],
          widthMm: +ws[ws.length >> 1].toFixed(3),
          dash: null,
          layer: null,
          fill: fill === '1',
          clip: null,
        });
      }
      localStyle.set(key, id);
    }
    t.lines.forEach((l, sub) => {
      const pts = A === IDENTITY ? l.pts : l.pts.map((p) => apply(A, p.x, p.y));
      paths.push({
        id: paths.length,
        pts,
        closed: l.closed,
        style: localStyle.get(`${l.label}|${l.fill ? 1 : 0}`)!,
        src: {
          file: input.file,
          page: input.page,
          op: img.op,
          sub,
          handle: `px:${l.pxBox.join(',')}`,
        },
      });
    });
  });
  return {
    page: {
      file: input.file,
      page: input.page,
      widthMm: input.widthMm,
      heightMm: input.heightMm,
      styles,
      paths,
      texts: [],
      rasters,
      layers: [],
    },
    stats,
  };
}
