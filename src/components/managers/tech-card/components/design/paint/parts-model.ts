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

/**
 * One part over this flat. `key` is the part's identity across the sides of one card-level answer
 * (`part_key`, Ф2.1 topology); '' on an answer made side by side, where only the name (`words`)
 * can tell the same part on another side.
 */
export type PartGroup = { label: string; regions: number[]; key: string; words: string };

export type ViewParts = {
  groups: PartGroup[];
  /** Region → its group's index; -1 = none. Length count + 1. */
  regionGroup: Int32Array;
  /** Region → why it spans two parts. */
  split: Map<number, string>;
  /** Region → its seed pixel (`markPoints`). */
  seeds: Int32Array;
  /** Every group carries a `part_key` (the card-level answer), not the side-by-side one. */
  keyed: boolean;
};

/** Names compare by their words: case, spaces. */
export const partKey = (label: string): string => label.trim().toLowerCase().replace(/\s+/g, ' ');

/** A name as a set of words ("front right" = "right front"). */
export const nameWords = (label: string): string =>
  [...new Set(partKey(label).split(' ').filter(Boolean))].sort().join(' ');

/** A part a name can travel by (R9): a real name, not the model's leftovers. */
export const transferable = (label: string): boolean => {
  const k = partKey(label);
  return k !== '' && k !== 'unnamed';
};

/** The wearer's side a side view shows (R16: the left side view shows the left parts). */
const SIDE_OF: Record<string, string> = { side_l: 'left', side_r: 'right' };

/**
 * R16 fallback for answers without `part_key`: on a side view a name that says no side gets the
 * side the view shows ("front body" on SIDE LEFT → "left front body").
 */
export const sideName = (label: string, view: string): string => {
  const k = partKey(label);
  const side = SIDE_OF[view];
  if (!side || !transferable(k)) return k;
  const words = k.split(' ');
  return words.includes('left') || words.includes('right') ? k : `${side} ${k}`;
};

/** The suggestion laid over this flat's regions; null when it names nothing usable. */
export function partsOf(
  s: Pick<DesignPartsSuggestion, 'parts' | 'splitNeeded'>,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>,
  seeds: Int32Array = markPoints(flat),
  view = '',
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
    if (regions.length === 0) continue;
    const key = (g.partKey ?? '').trim();
    // With a key the name is the card's own (one name across the sides); without, the side fills in.
    const label = key ? partKey(g.label ?? '') : sideName(g.label ?? '', view);
    groups.push({ label, regions, key, words: nameWords(label) });
  }
  if (groups.length === 0) return null;
  const split = new Map<number, string>();
  for (const x of s.splitNeeded ?? []) {
    const id = Number(x.region);
    if (Number.isInteger(id) && id >= 1 && id <= flat.count) split.set(id, (x.why ?? '').trim());
  }
  return { groups, regionGroup, split, seeds, keyed: groups.every((g) => g.key !== '') };
}

/** A suggestion row from the card-level call (its groups carry `part_key`). */
export const keyedSuggestion = (s: Pick<DesignPartsSuggestion, 'parts'>): boolean =>
  (s.parts ?? []).length > 0 && (s.parts ?? []).every((g) => !!(g.partKey ?? '').trim());

/**
 * The same physical part (R17): by `part_key` when both carry one; else (old answers) by the
 * name's words, only across sides and never for the model's leftovers.
 */
export const samePart = (a: PartGroup, aView: string, b: PartGroup, bView: string): boolean => {
  if (a.key && b.key) return a.key === b.key;
  if (aView === bView) return false;
  return transferable(a.label) && transferable(b.label) && a.words === b.words;
};

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
  return concatIndices(chunks);
}

export function concatIndices(chunks: readonly Int32Array[]): Int32Array {
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
  const k = nameWords(label);
  const out: number[] = [];
  parts.groups.forEach((g, i) => {
    if (g.words === k) out.push(i);
  });
  return out;
};

/**
 * Every group of every side that is the same part as `group` on `view` (R17), the clicked group
 * itself first. Sides without parts are skipped.
 */
export function partAcross(
  sides: readonly { view: string; parts: ViewParts | null }[],
  view: string,
  group: number,
  /** QW6 · ⇧: this side only. */
  only = false,
): { view: string; groups: number[] }[] {
  const home = sides.find((s) => s.view === view)?.parts;
  const g = home?.groups[group];
  if (!g) return [];
  const out = [{ view, groups: [group] }];
  if (only) return out;
  for (const s of sides) {
    if (!s.parts) continue;
    const groups: number[] = [];
    s.parts.groups.forEach((o, i) => {
      if (s.view === view && i === group) return;
      if (samePart(g, view, o, s.view)) groups.push(i);
    });
    if (groups.length === 0) continue;
    const at = out.find((x) => x.view === s.view);
    if (at) at.groups.push(...groups);
    else out.push({ view: s.view, groups });
  }
  return out;
}

/* ─────────────────────────── one gesture over several sides ─────────────────────────── */

/**
 * One side's share of a gesture, bound to the flat it was painted on (`base`) and to that side's
 * label raster (`labels`, by identity): its pixel indices mean nothing on any other flat.
 */
export type GestureStep = { view: string; base: number; labels: Uint32Array; diff: PaintDiff };
export type Gesture = GestureStep[];

/** Paint every target with `value`; the steps that changed something (empty = no gesture). */
export function paintGesture(
  targets: readonly { view: string; base: number; labels: Uint32Array; idx: Int32Array }[],
  value: number,
): Gesture {
  const out: Gesture = [];
  for (const t of targets) {
    const diff = paintIndices(t.labels, t.idx, value);
    if (diff) out.push({ view: t.view, base: t.base, labels: t.labels, diff });
  }
  return out;
}

/** The side a step stands on, as the session holds it now. */
export type GestureSide = { baseMediaId: number; labels: Uint32Array | null };

/**
 * A gesture replays only whole: every step's side still holds the same flat and the same raster.
 * One side replaced or gone → the whole gesture is dead (never half-undone, never replayed into
 * another flat's pixels).
 */
export const gestureLive = (
  g: Gesture,
  sideOf: (view: string) => GestureSide | undefined,
): boolean =>
  g.every((s) => {
    const side = sideOf(s.view);
    return !!side && side.baseMediaId === s.base && side.labels === s.labels;
  });

/* ─────────────────────────── part names into the run (R8) ─────────────────────────── */

/** A named part counts as painted with a label when this share of its pixels carries it. */
export const PART_PAINTED_SHARE = 0.6;
/** `parts` of one fabric use stays a phrase, not a list of the whole garment. */
export const PART_NAMES_MAX = 200;

/** One side as the run sees it: the SAVED map's labels over its flat and its named parts. */
export type NamedSide = {
  labels: Uint32Array;
  flat: Pick<FlatRegions, 'labels'>;
  parts: ViewParts;
};

/** Label (packed #rrggbb) → names of the parts painted with it on this side, in part order. */
export function paintedPartNames(side: NamedSide): Map<number, string[]> {
  const { labels, flat, parts } = side;
  const n = parts.groups.length;
  const total = new Int32Array(n);
  const byLabel: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (let i = 0; i < labels.length; i += 1) {
    const r = flat.labels[i];
    if (!r) continue; // ink or outside
    const g = parts.regionGroup[r] ?? -1;
    if (g < 0) continue;
    total[g] += 1;
    const v = labels[i];
    if (v) byLabel[g].set(v, (byLabel[g].get(v) ?? 0) + 1);
  }
  const out = new Map<number, string[]>();
  for (let g = 0; g < n; g += 1) {
    const name = parts.groups[g].label.trim().replace(/\s+/g, ' ');
    if (!transferable(name) || total[g] === 0) continue;
    for (const [v, c] of byLabel[g])
      if (c / total[g] >= PART_PAINTED_SHARE) out.set(v, [...(out.get(v) ?? []), name]);
  }
  return out;
}

/**
 * Label hex → the human part names painted with it across sides (`paintedPartNames` of each
 * side, in the given order,
 * names deduped by their words, joined with ", ", capped at whole names). A label with no named
 * part painted is absent: the caller keeps its own fallback.
 */
export function partNamesByLabel(
  sides: readonly ReadonlyMap<number, readonly string[]>[],
): Map<string, string> {
  const names = new Map<number, string[]>();
  for (const side of sides)
    for (const [v, list] of side) {
      const have = names.get(v) ?? [];
      for (const name of list) if (!have.some((x) => partKey(x) === partKey(name))) have.push(name);
      names.set(v, have);
    }
  const out = new Map<string, string>();
  for (const [v, list] of names) {
    let s = '';
    for (const name of list) {
      const next = s ? `${s}, ${name}` : name;
      if (next.length > PART_NAMES_MAX) break;
      s = next;
    }
    if (s) out.set(`#${(v & 0xffffff).toString(16).padStart(6, '0')}`, s);
  }
  return out;
}
