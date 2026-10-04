/**
 * PAINT THE PARTS · the label raster of one view and everything pure around it.
 *
 * A LABEL IS A PACKED `#rrggbb` (0 = unpainted). It is the hex the colour map carries for that
 * pixel, so the raster IS the map: no lookup table between what is painted and what is sent.
 *
 *   slot label    one per BOM cloth slot: hue by the golden angle from the slot's id, fixed
 *                 saturation and lightness; a collision inside the card steps the lightness
 *                 (deterministic by id order). The colourway decides the cloth: the map is the
 *                 card's, the slot → asset binding is the colourway's.
 *   colour label  a free colour (`+ colour`) gets its own fresh label (`freeColourLabel`); the
 *                 colour itself rides on the plan cloth `{hex: label, colourHex}` only.
 *
 * Gestures return a DIFF (indices + what stood there) so undo is exact and cheap.
 */
import { isMapInk, planHex, type PlanSwatch } from '../colour-plan/model';
import { distanceTransform, type FlatRegions } from './regions';

export const PAINT_SIDE_MAX = 1600;

export const packHex = (hex: string): number => parseInt(hex.slice(1), 16) & 0xffffff;
export const hexOf = (packed: number): string =>
  `#${(packed & 0xffffff).toString(16).padStart(6, '0')}`;

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

const GOLDEN = 137.508;

/** The label of one slot, before collisions. */
export const slotHex = (bomItemId: number, step = 0): string =>
  hslHex(
    (((bomItemId * GOLDEN) % 360) + 360) % 360,
    0.62,
    Math.max(0.2, Math.min(0.8, 0.52 + step * 0.07 * (step % 2 ? 1 : -1))),
  );

/** Labels of every slot of the card, collisions stepped apart in id order. */
export function slotLabels(bomItemIds: readonly number[]): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>();
  for (const id of [...new Set(bomItemIds)].filter((x) => x > 0).sort((a, b) => a - b)) {
    let step = 0;
    let hex = slotHex(id, step);
    while ((taken.has(hex) || !isMapInk(hex)) && step < 12) hex = slotHex(id, ++step);
    taken.add(hex);
    out.set(id, hex);
  }
  return out;
}

/**
 * A fresh label for a free colour (`+ colour`). The label is NOT the colour: the colour may be
 * black or white (refused as labels) or equal a slot label. The person's colour lives only on the
 * plan cloth `{hex: label, colourHex}`; the label is a distinct #rrggbb off every taken one.
 */
export function freeColourLabel(taken: Iterable<string>): string {
  const used = new Set([...taken].map((x) => planHex(x)));
  for (let k = 1; k < 4096; k += 1) {
    const hex = hslHex((k * GOLDEN + 23) % 360, 0.5 + (k % 3) * 0.1, 0.36 + (k % 4) * 0.08);
    if (isMapInk(hex) && !used.has(hex)) return hex;
  }
  return '';
}

/* ─────────────────────────── gestures ─────────────────────────── */

export type PaintDiff = { idx: Int32Array; before: Uint32Array; after: number };

/** Pixels of every region, grouped (cached per regions raster). */
const REGION_INDEX = new WeakMap<Int32Array, { start: Int32Array; px: Int32Array }>();
function regionIndex(regions: Int32Array): { start: Int32Array; px: Int32Array } {
  const hit = REGION_INDEX.get(regions);
  if (hit) return hit;
  let max = 0;
  for (let i = 0; i < regions.length; i += 1) if (regions[i] > max) max = regions[i];
  const start = new Int32Array(max + 2);
  for (let i = 0; i < regions.length; i += 1) start[regions[i] + 1] += 1;
  for (let r = 1; r < start.length; r += 1) start[r] += start[r - 1];
  const fill = start.slice();
  const px = new Int32Array(regions.length);
  for (let i = 0; i < regions.length; i += 1) px[fill[regions[i]]++] = i;
  const out = { start, px };
  REGION_INDEX.set(regions, out);
  return out;
}

/** A fragment of a region smaller than this share rides with the click (slivers between lines). */
const SLIVER_SHARE = 0.03;

/**
 * The pixels a click at (x, y) would fill: the 8-connected piece of (same region ∩ same current
 * label) under the pointer, plus the region's small same-label slivers that the line closing cut
 * off (a channel between double stitching belongs to the part it runs along). A big piece left by
 * the pen stays its own.
 */
export function componentAt(
  labels: Uint32Array,
  regions: Int32Array,
  w: number,
  h: number,
  x: number,
  y: number,
): Int32Array | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const s = y * w + x;
  const region = regions[s];
  if (!region) return null;
  const label = labels[s];
  const { start, px } = regionIndex(regions);
  const from = start[region];
  const to = start[region + 1];
  const regionSize = to - from;
  const seen = new Uint8Array(w * h);
  const stack = new Int32Array(regionSize + 1);
  const n = w * h;
  const out: number[] = [];

  const flood = (seed: number): number[] => {
    const piece: number[] = [];
    let top = 0;
    seen[seed] = 1;
    stack[top++] = seed;
    while (top > 0) {
      const i = stack[--top];
      piece.push(i);
      const cx = i % w;
      const visit = (j: number) => {
        if (!seen[j] && regions[j] === region && labels[j] === label) {
          seen[j] = 1;
          stack[top++] = j;
        }
      };
      // 8-connected: the strip given back to a region along its lines can touch it by a corner.
      const up = i >= w;
      const down = i + w < n;
      if (cx > 0) {
        visit(i - 1);
        if (up) visit(i - w - 1);
        if (down) visit(i + w - 1);
      }
      if (cx < w - 1) {
        visit(i + 1);
        if (up) visit(i - w + 1);
        if (down) visit(i + w + 1);
      }
      if (up) visit(i - w);
      if (down) visit(i + w);
    }
    return piece;
  };

  const first = flood(s);
  for (const i of first) out.push(i);
  const sliver = regionSize * SLIVER_SHARE;
  // A click ON a sliver means the part it runs along: then every piece comes.
  const all = first.length < sliver;
  for (let k = from; k < to; k += 1) {
    const i = px[k];
    if (seen[i] || labels[i] !== label) continue;
    const piece = flood(i);
    if (all || piece.length < sliver) for (const j of piece) out.push(j);
  }
  return Int32Array.from(out);
}

/** Paint `idx` with `value`; null when nothing would change. */
export function paintIndices(
  labels: Uint32Array,
  idx: Int32Array,
  value: number,
): PaintDiff | null {
  const keep: number[] = [];
  for (let k = 0; k < idx.length; k += 1) if (labels[idx[k]] !== value) keep.push(idx[k]);
  if (keep.length === 0) return null;
  const at = Int32Array.from(keep);
  const before = new Uint32Array(at.length);
  for (let k = 0; k < at.length; k += 1) {
    before[k] = labels[at[k]];
    labels[at[k]] = value;
  }
  return { idx: at, before, after: value };
}

/** Pixels whose centre lies inside the polygon (even-odd), clipped to the silhouette. */
export function polygonIndices(
  pts: readonly { x: number; y: number }[],
  silhouette: Uint8Array,
  w: number,
  h: number,
): Int32Array {
  if (pts.length < 3) return new Int32Array(0);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(h - 1, Math.ceil(maxY));
  const out: number[] = [];
  const xs: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    const cy = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a.y <= cy !== b.y <= cy) xs.push(a.x + ((cy - a.y) / (b.y - a.y)) * (b.x - a.x));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const from = Math.max(0, Math.ceil(xs[k] - 0.5));
      const to = Math.min(w - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = from; x <= to; x += 1) {
        const i = y * w + x;
        if (silhouette[i]) out.push(i);
      }
    }
  }
  return Int32Array.from(out);
}

export const undoDiff = (labels: Uint32Array, d: PaintDiff): void => {
  for (let k = 0; k < d.idx.length; k += 1) labels[d.idx[k]] = d.before[k];
};
export const redoDiff = (labels: Uint32Array, d: PaintDiff): void => {
  for (let k = 0; k < d.idx.length; k += 1) labels[d.idx[k]] = d.after;
};

/* ─────────────────────────── the map on the wire ─────────────────────────── */

/**
 * The colour map as pixels: white paper, labels, the flat's ink black on top. The palette is the
 * exact count of label pixels that survive the ink — the closed set the prompt may name.
 */
export function mapPixels(
  labels: Uint32Array,
  ink: Uint8Array,
  w: number,
  h: number,
): { rgba: Uint8ClampedArray; palette: PlanSwatch[] } {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const counts = new Map<number, number>();
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    rgba[p + 3] = 255;
    if (ink[i]) continue; // black
    const v = labels[i];
    if (!v) {
      rgba[p] = 255;
      rgba[p + 1] = 255;
      rgba[p + 2] = 255;
      continue;
    }
    rgba[p] = (v >> 16) & 0xff;
    rgba[p + 1] = (v >> 8) & 0xff;
    rgba[p + 2] = v & 0xff;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const palette: PlanSwatch[] = [];
  for (const [v, px] of counts) {
    const hex = hexOf(v);
    if (isMapInk(hex)) palette.push({ hex, px });
  }
  palette.sort((a, b) => b.px - a.px);
  return { rgba, palette };
}

/** Is anything painted at all. */
export const anyPainted = (labels: Uint32Array): boolean => {
  for (let i = 0; i < labels.length; i += 1) if (labels[i]) return true;
  return false;
};

/**
 * A saved map back into labels: only EXACT palette hexes become labels, everything else (paper,
 * ink, a resampled edge) is unpainted. A size mismatch is resampled nearest-neighbour.
 */
export function labelsFromMap(
  rgba: Uint8ClampedArray | Uint8Array,
  mw: number,
  mh: number,
  w: number,
  h: number,
  palette: readonly string[],
): Uint32Array {
  const known = new Set(
    palette
      .map((x) => planHex(x))
      .filter(isMapInk)
      .map(packHex),
  );
  const out = new Uint32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(mh - 1, Math.floor(((y + 0.5) * mh) / h));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(mw - 1, Math.floor(((x + 0.5) * mw) / w));
      const p = (sy * mw + sx) * 4;
      if (rgba[p + 3] !== 255) continue;
      const v = (rgba[p] << 16) | (rgba[p + 1] << 8) | rgba[p + 2];
      if (known.has(v)) out[y * w + x] = v;
    }
  }
  return out;
}

/** The canvas size of a flat: its own pixels, the long side capped. */
export function paintSize(w: number, h: number): { w: number; h: number } {
  const s = Math.min(1, PAINT_SIDE_MAX / Math.max(1, w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

/* ─────────────────────────── the canvas look (display only) ─────────────────────────── */

/**
 * The pixels UNDER the drawing: inside the silhouette and in no region (the ink, its edges,
 * specks), each with the nearest pixel that is in a region or outside — so a painted part's
 * colour runs under its own lines and stops at the line's middle (cached per flat).
 */
const UNDER = new WeakMap<Int32Array, { idx: Int32Array; near: Int32Array }>();
export function underLines(flat: Pick<FlatRegions, 'labels' | 'silhouette' | 'w' | 'h'>): {
  idx: Int32Array;
  near: Int32Array;
} {
  const hit = UNDER.get(flat.labels);
  if (hit) return hit;
  const n = flat.w * flat.h;
  const seed = new Uint8Array(n);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (flat.silhouette[i] && !flat.labels[i]) count += 1;
    else seed[i] = 1;
  }
  const { nearest } = distanceTransform(seed, flat.w, flat.h);
  const idx = new Int32Array(count);
  const near = new Int32Array(count);
  for (let i = 0, k = 0; i < n; i += 1)
    if (!seed[i]) {
      idx[k] = i;
      near[k] = nearest[i] < 0 ? i : nearest[i];
      k += 1;
    }
  const out = { idx, near };
  UNDER.set(flat.labels, out);
  return out;
}

/** The labels as the canvas shows them: every unpainted pixel under a line takes its neighbour's. */
export function displayLabels(
  labels: Uint32Array,
  under: { idx: Int32Array; near: Int32Array },
): Uint32Array {
  const out = labels.slice();
  for (let k = 0; k < under.idx.length; k += 1) {
    const i = under.idx[k];
    if (!out[i]) out[i] = labels[under.near[k]];
  }
  return out;
}
