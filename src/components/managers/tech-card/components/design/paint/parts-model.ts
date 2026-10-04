/**
 * PAINT THE PARTS · auto parts (Ф2) — everything pure around the model's grouping.
 *
 *   marks      the picture the model reads (Set-of-Mark, as `f0/som.py marks()`): every region
 *              tinted by the probe's palette, the drawing black over a white halo, the region's
 *              number in red with a white stroke at the point farthest from its edge.
 *   parts      the answer laid over this flat's regions: region → part, the part's name, the
 *              regions the model says span two parts (no seam drawn).
 *   gesture    one click = a list of (view, pixels) painted together, undone together.
 */
import type { DesignPartsSuggestion } from 'api/proto-http/admin';

import { componentAt, paintIndices, type PaintDiff } from './map-model';
import { distanceTransform, type FlatRegions } from './regions';

/** The probe's palette (`probe.py PAL`), tinted 75 % over white. */
const PAL: [number, number, number][] = [
  [230, 25, 75],
  [60, 180, 75],
  [255, 200, 25],
  [0, 130, 200],
  [245, 130, 48],
  [145, 30, 180],
  [70, 240, 240],
  [240, 50, 230],
  [210, 245, 60],
  [250, 190, 212],
  [0, 128, 128],
  [220, 190, 255],
  [170, 110, 40],
  [255, 250, 200],
  [128, 0, 0],
  [170, 255, 195],
  [128, 128, 0],
  [255, 215, 180],
  [0, 0, 128],
  [128, 128, 128],
];

/** Regions the model is asked to name: fewer is nothing to group, more is unreadable. */
export const PARTS_REGIONS_MIN = 2;
export const PARTS_REGIONS_MAX = 60;

/**
 * Per region (1..count) the pixel farthest from its edge (the sheet's edge counts) — where its
 * number is written, and the seed a part click fills the region from. -1 = no pixel.
 */
export function markPoints(flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>): Int32Array {
  const { labels, count, w, h } = flat;
  const n = w * h;
  // Seeds: every pixel that is not inside a region's interior (another label next to it, ink,
  // outside, or the sheet's border). The distance to them is the distance to the region's edge.
  const seed = new Uint8Array(n);
  for (let i = 0; i < n; i += 1) {
    const v = labels[i];
    if (!v) {
      seed[i] = 1;
      continue;
    }
    const x = i % w;
    if (
      x === 0 ||
      x === w - 1 ||
      i < w ||
      i + w >= n ||
      labels[i - 1] !== v ||
      labels[i + 1] !== v ||
      labels[i - w] !== v ||
      labels[i + w] !== v
    )
      seed[i] = 1;
  }
  const { d2 } = distanceTransform(seed, w, h);
  const best = new Float64Array(count + 1).fill(-1);
  const at = new Int32Array(count + 1).fill(-1);
  for (let i = 0; i < n; i += 1) {
    const v = labels[i];
    if (v > 0 && v <= count && d2[i] > best[v]) {
      best[v] = d2[i];
      at[v] = i;
    }
  }
  return at;
}

/** The tinted regions + the drawing (RGBA) — the marks picture before its numbers. */
export function marksTint(flat: FlatRegions): Uint8ClampedArray {
  const { w, h, labels, ink } = flat;
  const n = w * h;
  const out = new Uint8ClampedArray(n * 4);
  // 3×3 halo around the ink, as the probe's `cv2.dilate(ink, ones(3,3))`.
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    out[p + 3] = 255;
    const v = labels[i];
    let r = 255;
    let g = 255;
    let b = 255;
    if (v > 0) {
      const c = PAL[(v - 1) % PAL.length];
      r = c[0] * 0.75 + 255 * 0.25;
      g = c[1] * 0.75 + 255 * 0.25;
      b = c[2] * 0.75 + 255 * 0.25;
    }
    const x = i % w;
    let halo = false;
    if (ink[i]) {
      r = 0;
      g = 0;
      b = 0;
    } else {
      for (let dy = -1; dy <= 1 && !halo; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          const xx = x + dx;
          const j = i + dy * w + dx;
          if (xx >= 0 && xx < w && j >= 0 && j < n && ink[j]) {
            halo = true;
            break;
          }
        }
      if (halo) {
        r = 255;
        g = 255;
        b = 255;
      }
    }
    out[p] = r;
    out[p + 1] = g;
    out[p + 2] = b;
  }
  return out;
}

/** The probe writes Menlo 14 on a ≈ 850 px sheet; the number keeps that share of the sheet. */
export const markFontPx = (w: number, h: number): number =>
  Math.max(12, Math.round((14 * Math.max(w, h)) / 850));

/* ─────────────────────────── the answer over this flat ─────────────────────────── */

export type PartGroup = { label: string; regions: number[] };

export type ViewParts = {
  groups: PartGroup[];
  /** Region → its group's index; -1 = none. Length count + 1. */
  regionGroup: Int32Array;
  /** Region → why it spans two parts. */
  split: Map<number, string>;
  /** Region → its seed pixel (`markPoints`). */
  seeds: Int32Array;
};

/** Names compare by their words: case, spaces. */
export const partKey = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ');

/** A part a name can travel by (R9): a real name, not the model's leftovers. */
export const transferable = (label: string): boolean => {
  const k = partKey(label);
  return k !== '' && k !== 'unnamed';
};

/** The suggestion laid over this flat's regions; null when it names nothing usable. */
export function partsOf(
  s: Pick<DesignPartsSuggestion, 'parts' | 'splitNeeded'>,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>,
  seeds: Int32Array = markPoints(flat),
): ViewParts | null {
  const regionGroup = new Int32Array(flat.count + 1).fill(-1);
  const groups: PartGroup[] = [];
  for (const g of s.parts ?? []) {
    const regions: number[] = [];
    for (const r of g.regions ?? []) {
      const id = Number(r);
      if (!Number.isInteger(id) || id < 1 || id > flat.count || regionGroup[id] >= 0) continue;
      regionGroup[id] = groups.length;
      regions.push(id);
    }
    if (regions.length > 0) groups.push({ label: partKey(g.label ?? ''), regions });
  }
  if (groups.length === 0) return null;
  const split = new Map<number, string>();
  for (const x of s.splitNeeded ?? []) {
    const id = Number(x.region);
    if (Number.isInteger(id) && id >= 1 && id <= flat.count) split.set(id, (x.why ?? '').trim());
  }
  return { groups, regionGroup, split, seeds };
}

/**
 * The pixels a part click fills: under the pointer the Ф1 rule (the same-label piece + its
 * slivers); every other region of the part from its own seed by the same rule.
 */
export function partIndices(
  labels: Uint32Array,
  flat: Pick<FlatRegions, 'labels' | 'w' | 'h'>,
  parts: ViewParts,
  group: number,
  at?: { x: number; y: number },
): Int32Array {
  const { w, h } = flat;
  const g = parts.groups[group];
  if (!g) return new Int32Array(0);
  const here = at ? flat.labels[at.y * w + at.x] : 0;
  const chunks: Int32Array[] = [];
  for (const r of g.regions) {
    let idx: Int32Array | null = null;
    if (at && r === here) idx = componentAt(labels, flat.labels, w, h, at.x, at.y);
    else {
      const s = parts.seeds[r];
      if (s >= 0) idx = componentAt(labels, flat.labels, w, h, s % w, (s / w) | 0);
    }
    if (idx && idx.length) chunks.push(idx);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Int32Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** The groups of `parts` named like `label` (R9: the same part seen from another side). */
export const groupsNamed = (parts: ViewParts, label: string): number[] => {
  if (!transferable(label)) return [];
  const k = partKey(label);
  const out: number[] = [];
  parts.groups.forEach((g, i) => {
    if (g.label === k) out.push(i);
  });
  return out;
};

/* ─────────────────────────── one gesture over several sides ─────────────────────────── */

export type GestureStep = { view: string; diff: PaintDiff };
export type Gesture = GestureStep[];

/** Paint every target with `value`; the steps that changed something (empty = no gesture). */
export function paintGesture(
  targets: readonly { view: string; labels: Uint32Array; idx: Int32Array }[],
  value: number,
): Gesture {
  const out: Gesture = [];
  for (const t of targets) {
    const diff = paintIndices(t.labels, t.idx, value);
    if (diff) out.push({ view: t.view, diff });
  }
  return out;
}
