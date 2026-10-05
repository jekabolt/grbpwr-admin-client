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
import { distanceTransform, REGIONS_ALGO_REV, type FlatRegions } from './regions';

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

/**
 * The revision a card-level parts answer is cached under: the cutter's (region numbers) + the
 * labeller's prompt. Bump the second half on ANY change to the labeller's rules (backend
 * `designPartsCardSystemPrompt`): rows of the old rules are then neither applied nor reused.
 * Ф1 (`parts.f1`): openings / seen-through inside / no invented pieces / flank from the drawing.
 * `parts.f2`: the labeller reads the card's join list and a closed part vocabulary built from it.
 */
export const PARTS_ALGO_REV = `${REGIONS_ALGO_REV}+parts.f2`;

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

/** Ф1 · the regions with no cloth of their own (backend `opening`): never painted, never hovered. */
export const OPENING = 'opening';
export const isOpening = (g: Pick<PartGroup, 'key' | 'label'>): boolean =>
  g.key === OPENING || partKey(g.label) === OPENING;

/** Ф1 · the inside of a part seen through an opening: "front body · inside" (same `part_key`). */
export const INSIDE_SUFFIX = ' · inside';

/** A part a name can travel by (R9): a real name, not the model's leftovers. */
export const transferable = (label: string): boolean => {
  const k = partKey(label);
  return k !== '' && k !== 'unnamed' && k !== OPENING;
};

/** Is `region` (1..count) an opening on this side. */
export const openingRegion = (parts: ViewParts | null | undefined, region: number): boolean => {
  if (!parts || region <= 0) return false;
  const g = parts.groups[parts.regionGroup[region] ?? -1];
  return !!g && isOpening(g);
};

/** `idx` without the pixels of the side's openings (the pen and a click never paint them). */
export function dropOpenings(
  idx: Int32Array,
  flat: Pick<FlatRegions, 'labels'>,
  parts: ViewParts | null | undefined,
): Int32Array {
  if (!parts || !parts.groups.some(isOpening)) return idx;
  let keep = 0;
  for (let i = 0; i < idx.length; i += 1) if (!openingRegion(parts, flat.labels[idx[i]])) keep += 1;
  if (keep === idx.length) return idx;
  const out = new Int32Array(keep);
  let o = 0;
  for (let i = 0; i < idx.length; i += 1)
    if (!openingRegion(parts, flat.labels[idx[i]])) out[o++] = idx[i];
  return out;
}

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

/* ─────────────────────────── Ф1 · the wearer's left and right, checked on the drawing ─────────────────────────── */

const LEFT = /\bleft\b/;
const RIGHT = /\bright\b/;

/** 'L' / 'R' / '' — the wearer's side a name says. */
export const sideOf = (label: string): 'L' | 'R' | '' => {
  const k = partKey(label);
  const l = LEFT.test(k);
  const r = RIGHT.test(k);
  return l === r ? '' : l ? 'L' : 'R';
};

/** The same name on the wearer's other side ("left front body" → "right front body"). */
export const twinName = (label: string): string =>
  partKey(label).replace(/\b(left|right)\b/g, (w) => (w === 'left' ? 'right' : 'left'));

/** label → part_key over every group of the card-level answer (the first key a name carries). */
export function labelKeys(
  rows: readonly Pick<DesignPartsSuggestion, 'parts'>[],
): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows)
    for (const g of r.parts ?? []) {
      const key = (g.partKey ?? '').trim();
      const label = partKey(g.label ?? '');
      if (key && label && !out.has(label)) out.set(label, key);
    }
  return out;
}

/** Below this share of the garment's width a centroid says nothing about its side. */
const LR_DEAD = 0.04;
/** A side view's front and back must stand this share of the width apart to read its facing. */
const FLANK_GAP = 0.12;

/**
 * Per group the x of its pixels' centroid (NaN = no pixel) and its pixel count, and the garment's horizontal centre
 * and width (the regions' bounding box).
 */
function groupXs(flat: Pick<FlatRegions, 'labels' | 'count' | 'w'>, parts: ViewParts) {
  const { labels, count, w } = flat;
  const sum = new Float64Array(count + 1);
  const n = new Float64Array(count + 1);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let i = 0; i < labels.length; i += 1) {
    const r = labels[i];
    if (r <= 0 || r > count) continue;
    const x = i % w;
    sum[r] += x;
    n[r] += 1;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  const px = parts.groups.map((g) => g.regions.reduce((c, r) => c + n[r], 0));
  const xs = parts.groups.map((g, i) =>
    px[i] > 0 ? g.regions.reduce((a, r) => a + sum[r], 0) / px[i] : NaN,
  );
  return { xs, px, mid: (x0 + x1) / 2, width: Math.max(1, x1 - x0) };
}

const relabel = (g: PartGroup, label: string, key: string): PartGroup => ({
  ...g,
  label,
  key,
  words: nameWords(label),
});

/**
 * Ф1 · the L/R check of one side after the answer came (B1 `guard`), on the regions' centroids:
 *   front  a wearer-LEFT part sits RIGHT of the garment's centre; back — LEFT of it. A left/right
 *          pair (same name but the side word) that BOTH sit on the wrong side swaps names and keys.
 *   side_* the flank is read from the drawing — the front faces where the "front" parts stand
 *          against the "back" ones (front toward picture-left = the wearer's LEFT flank). Only when
 *          that reads clearly and most sided parts say the other flank, each of those takes its
 *          twin's name and key (`keys`: the card's label → part_key); a twin with no key stays.
 * Openings and the inside of a part (seen through an opening, it may be the far side) are never
 * moved. Returns the same object when nothing changes.
 */
export function fixSides(
  view: string,
  parts: ViewParts,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w'>,
  keys: ReadonlyMap<string, string>,
): ViewParts {
  const movable = (g: PartGroup) => !isOpening(g) && !g.label.endsWith(INSIDE_SUFFIX);
  const { xs, px, mid, width } = groupXs(flat, parts);
  const groups = parts.groups.slice();
  let changed = false;

  if (view === 'front' || view === 'back') {
    // Picture side (+1 right, -1 left, 0 too near the centre) a wearer-LEFT part must have.
    const leftAt = view === 'front' ? 1 : -1;
    const at = (i: number) => {
      const d = xs[i] - mid;
      return Number.isNaN(d) || Math.abs(d) < width * LR_DEAD ? 0 : Math.sign(d);
    };
    const done = new Set<number>();
    parts.groups.forEach((g, i) => {
      // «· inside» groups sit where the far side shows through an opening: their picture side is
      // the far side's, so they never vote here (nor do openings).
      if (done.has(i) || !movable(g) || sideOf(g.label) !== 'L') return;
      const twin = twinName(g.label);
      const j = parts.groups.findIndex(
        (o, k) => !done.has(k) && k !== i && movable(o) && o.label === twin,
      );
      if (j < 0) return;
      done.add(i);
      done.add(j);
      if (at(i) === -leftAt && at(j) === leftAt) {
        groups[i] = relabel(parts.groups[i], parts.groups[j].label, parts.groups[j].key);
        groups[j] = relabel(parts.groups[j], parts.groups[i].label, parts.groups[i].key);
        changed = true;
      }
    });
  } else if (view === 'side_l' || view === 'side_r') {
    const face = (word: RegExp) => {
      let s = 0;
      let c = 0;
      parts.groups.forEach((g, i) => {
        const k = partKey(g.label);
        if (!movable(g) || Number.isNaN(xs[i]) || !word.test(k)) return;
        if (/\bfront\b/.test(k) && /\bback\b/.test(k)) return;
        s += xs[i] * px[i];
        c += px[i];
      });
      return c > 0 ? s / c : NaN;
    };
    const fx = face(/\bfront\b/);
    const bx = face(/\bback\b/);
    if (!Number.isNaN(fx) && !Number.isNaN(bx) && Math.abs(fx - bx) >= width * FLANK_GAP) {
      const flank = fx < bx ? 'L' : 'R';
      const sided = parts.groups.flatMap((g, i) =>
        movable(g) && sideOf(g.label) ? [{ g, i, ok: sideOf(g.label) === flank }] : [],
      );
      const bad = sided.filter((x) => !x.ok);
      if (bad.length > sided.length - bad.length)
        for (const { g, i } of bad) {
          const twin = twinName(g.label);
          const key = g.key ? keys.get(twin) : '';
          if (g.key && !key) continue;
          groups[i] = relabel(g, twin, key ?? '');
          changed = true;
        }
    }
  }
  return changed ? { ...parts, groups } : parts;
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
  if (!g || isOpening(g)) return [];
  const out = [{ view, groups: [group] }];
  if (only) return out;
  for (const s of sides) {
    if (!s.parts) continue;
    const groups: number[] = [];
    s.parts.groups.forEach((o, i) => {
      if (s.view === view && i === group) return;
      if (!isOpening(o) && samePart(g, view, o, s.view)) groups.push(i);
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
    // The inside of a part is that part: its name travels once, by the part's own group.
    if (!transferable(name) || total[g] === 0 || name.endsWith(INSIDE_SUFFIX)) continue;
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
