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
import { distanceTransform, REGIONS_ALGO_REV, scaledRadius, type FlatRegions } from './regions';

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
 * `parts.f3`: the labeller's prompt of backend dba6c9a; the client checks a band is thin (`fixBands`).
 * `parts.f4`: the card's join list rev is part of the cache key (corrected joins re-suggest); only a
 * non-elongated `binding` leaves its group.
 * `parts.f5`: the client decides a strap's side by its top end (`fixSides`) and gives a binding's
 * blob / stacked strip to the card's inner layer (`fixBands`); the server retries an unusable answer.
 * `parts.f6` (M5, owner 06.10): an opening is never cloth — the labeller no longer gives a hole to
 * the part «seen through» it, `fixBands` never makes a «· inside»; a side cut into ONE region is
 * named too; a region the labeller left out is shown as an error (`unassignedRegion`).
 * (regions.v6 renumbers the regions: the f6 rows of v5 are neither applied nor reused.)
 * M6 (no client bump): the labeller names only from the card's PIECES list, read from the accepted
 * front/back flats — the server tags its rows with its own prompt rev and the list's rev.
 */
export const PARTS_ALGO_REV = `${REGIONS_ALGO_REV}+parts.f6`;

/**
 * c9 · the key one card-level ask is made under (once per key per session): the sides with their
 * flats, the cut + labeller rev, and the PIECES list's rev (M6; it was the join list's) — an edited
 * list is asked again.
 */
export const partsAskKey = (
  sides: readonly { view: string; baseMediaId: number }[],
  piecesRev: number,
): string =>
  `${sides
    .map((v) => `${v.view}:${v.baseMediaId}`)
    .sort()
    .join('|')}|${PARTS_ALGO_REV}|p${piecesRev}`;

/** c9 · parts held in memory answer only for the pieces list they were named under (M6). */
export const heldPartsFresh = (
  parts: Pick<ViewParts, 'keyed'> | null | undefined,
  namedUnder: number | undefined,
  piecesRev: number,
): boolean => !!parts?.keyed && namedUnder === piecesRev;

/**
 * Regions the model is asked to name: none is a failed cut, more is unreadable. f6: ONE region is
 * named too (the owner's front of fine bindings was «pen only» for being one region).
 */
export const PARTS_REGIONS_MIN = 1;
export const PARTS_REGIONS_MAX = 60;

/**
 * Per region (1..count) the pixel farthest from its edge (the sheet's edge counts) — where its
 * number is written, and the seed a part click fills the region from. -1 = no pixel.
 */
export function markPoints(flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>): Int32Array {
  return inscribed(flat).at;
}

/**
 * Per region its deepest pixel (`at`, -1 = none) and the squared radius of the largest disc
 * inscribed in it (`r2`: the distance from that pixel to the region's edge).
 */
function inscribed(flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>): {
  at: Int32Array;
  r2: Float64Array;
} {
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
  return { at, r2: best };
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

/** The group of the regions the labeller left out (backend `unnamed`, key `unnamed-<view>`). */
export const UNNAMED = 'unnamed';
export const isUnnamed = (g: Pick<PartGroup, 'key' | 'label'>): boolean =>
  partKey(g.label) === UNNAMED || g.key === UNNAMED || g.key.startsWith(`${UNNAMED}-`);

/** A part a name can travel by (R9): a real name, not the model's leftovers. */
export const transferable = (label: string): boolean => {
  const k = partKey(label);
  return k !== '' && k !== UNNAMED && k !== OPENING;
};

/** Is `region` (1..count) an opening on this side. */
export const openingRegion = (parts: ViewParts | null | undefined, region: number): boolean => {
  if (!parts || region <= 0) return false;
  const g = parts.groups[parts.regionGroup[region] ?? -1];
  return !!g && isOpening(g);
};

/**
 * f6 · a region that is neither a named part nor an opening: in no group, or in the labeller's
 * leftovers. An ERROR, never silent paper — the canvas marks it until it is painted.
 */
export const unassignedRegion = (parts: ViewParts | null | undefined, region: number): boolean => {
  if (!parts || region <= 0) return false;
  const g = parts.groups[parts.regionGroup[region] ?? -1];
  return !g || isUnnamed(g);
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

/**
 * D2 · paint carried from a replaced flat never stands on an opening: every pixel of an opening
 * region is cleared. Returns how many pixels were cleared (0 = untouched).
 */
export function clearOpenings(
  labels: Uint32Array,
  flat: Pick<FlatRegions, 'labels'>,
  parts: ViewParts | null | undefined,
): number {
  if (!parts || !parts.groups.some(isOpening)) return 0;
  let n = 0;
  for (let i = 0; i < labels.length; i += 1)
    if (labels[i] && openingRegion(parts, flat.labels[i])) {
      labels[i] = 0;
      n += 1;
    }
  return n;
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
  const lo = new Float64Array(count + 1).fill(Infinity);
  const hi = new Float64Array(count + 1).fill(-Infinity);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (let i = 0; i < labels.length; i += 1) {
    const r = labels[i];
    if (r <= 0 || r > count) continue;
    const x = i % w;
    sum[r] += x;
    n[r] += 1;
    if (x < lo[r]) lo[r] = x;
    if (x > hi[r]) hi[r] = x;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  const px = parts.groups.map((g) => g.regions.reduce((c, r) => c + n[r], 0));
  const xs = parts.groups.map((g, i) =>
    px[i] > 0 ? g.regions.reduce((a, r) => a + sum[r], 0) / px[i] : NaN,
  );
  /** Per group its pixels' x extent: [min, max] (Infinity / -Infinity = no pixel). */
  const span = parts.groups.map((g) => [
    g.regions.reduce((a, r) => Math.min(a, lo[r]), Infinity),
    g.regions.reduce((a, r) => Math.max(a, hi[r]), -Infinity),
  ]);
  return { xs, px, span, mid: (x0 + x1) / 2, width: Math.max(1, x1 - x0) };
}

/** A strap by its name or key (D1: named by the neck point it starts at). */
export const strapLike = (g: Pick<PartGroup, 'key' | 'label'>): boolean =>
  /strap/i.test(g.label) || /strap/i.test(g.key);

/** Rows from a group's topmost pixel that still count as its top end. */
const TOP_END_ROWS = 3;

/**
 * f5 · per group the x of its TOP END: the mean x of its pixels in the topmost `TOP_END_ROWS` rows
 * of its regions (NaN = no pixel). A strap's top end sits at the neck point it starts at.
 */
export function topEndXs(
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w'>,
  groups: readonly Pick<PartGroup, 'regions'>[],
): number[] {
  const { labels, count, w } = flat;
  const top = new Float64Array(count + 1).fill(Infinity);
  for (let i = 0; i < labels.length; i += 1) {
    const r = labels[i];
    if (r > 0 && r <= count) {
      const y = (i / w) | 0;
      if (y < top[r]) top[r] = y;
    }
  }
  return groups.map((g) => {
    const y0 = g.regions.reduce((a, r) => Math.min(a, top[r] ?? Infinity), Infinity);
    if (!Number.isFinite(y0)) return NaN;
    const mine = new Set(g.regions);
    let sum = 0;
    let n = 0;
    const end = Math.min(labels.length, (y0 + TOP_END_ROWS) * w);
    for (let i = y0 * w; i < end; i += 1)
      if (mine.has(labels[i])) {
        sum += i % w;
        n += 1;
      }
    return n > 0 ? sum / n : NaN;
  });
}

/** The same key on the wearer's other side ("left-strap" → "right-strap"). */
const twinKey = (key: string): string =>
  key.replace(/\b(left|right)\b/gi, (w) => (w.toLowerCase() === 'left' ? 'right' : 'left'));

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
 * moved; on front/back neither is a strap nor a part whose pixels reach over the centre line (D1:
 * a crossed strap's centroid sits opposite its neck point). Returns the same object when nothing
 * changes.
 */
export function fixSides(
  view: string,
  parts: ViewParts,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w'>,
  keys: ReadonlyMap<string, string>,
): ViewParts {
  const movable = (g: PartGroup) => !isOpening(g) && !g.label.endsWith(INSIDE_SUFFIX);
  const { xs, px, span, mid, width } = groupXs(flat, parts);
  const groups = parts.groups.slice();
  let changed = false;

  if (view === 'front' || view === 'back') {
    // Picture side (+1 right, -1 left, 0 too near the centre) a wearer-LEFT part must have.
    const leftAt = view === 'front' ? 1 : -1;
    const at = (i: number) => {
      const d = xs[i] - mid;
      return Number.isNaN(d) || Math.abs(d) < width * LR_DEAD ? 0 : Math.sign(d);
    };
    const crossing = (i: number) => span[i][0] < mid && span[i][1] > mid;
    const done = new Set<number>();

    // f5 · D1 · a strap's side is its TOP END's (the neck point it starts at), never its centroid
    // nor the model's word: back — top end picture-left = the wearer's LEFT; front — picture-right.
    // Two straps never share a side: they are told apart by which top end is picture-left.
    const straps = parts.groups.flatMap((g, i) =>
      movable(g) && strapLike(g) && sideOf(g.label) ? [i] : [],
    );
    if (straps.length > 0) {
      const tops = topEndXs(
        flat,
        straps.map((i) => parts.groups[i]),
      );
      const want: ('L' | 'R' | '')[] = tops.map((x) => {
        const d = x - mid;
        if (Number.isNaN(d) || Math.abs(d) < width * LR_DEAD) return '';
        return Math.sign(d) === leftAt ? 'L' : 'R';
      });
      if (straps.length === 2 && tops.every((x) => !Number.isNaN(x)) && tops[0] !== tops[1]) {
        // The pair: the picture-left top end takes the picture-left side, the other the other one.
        const pl: 'L' | 'R' = leftAt === -1 ? 'L' : 'R';
        const pr: 'L' | 'R' = pl === 'L' ? 'R' : 'L';
        const first = tops[0] < tops[1] ? 0 : 1;
        want[first] = pl;
        want[1 - first] = pr;
      }
      straps.forEach((i, k) => {
        done.add(i);
        const g = parts.groups[i];
        if (!want[k] || sideOf(g.label) === want[k]) return;
        const label = twinName(g.label);
        const key = g.key ? keys.get(label) || twinKey(g.key) : '';
        groups[i] = relabel(g, label, key);
        changed = true;
      });
    }

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
      // D1 · a crossed strap (or any part reaching over the centre line) has its centroid on the
      // side OPPOSITE its neck point: the centroid says nothing of its side — the answer stands.
      if (crossing(i) || crossing(j) || strapLike(g) || strapLike(parts.groups[j])) return;
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

/* ─────────────────────────── f3 · a band is a thin strip, checked on the drawing ─────────────────────────── */

/**
 * A name that says a binding — a strip finishing an edge. Only `binding`: a band (rib, hem, neck,
 * turtleneck, waist) may legitimately be wide and sit on the outline, so it is never checked.
 */
const BINDING = /\bbinding\b/;
export const isBand = (g: Pick<PartGroup, 'key' | 'label'>): boolean =>
  !isOpening(g) &&
  !g.label.endsWith(INSIDE_SUFFIX) &&
  (BINDING.test(partKey(g.label)) || BINDING.test(g.key.toLowerCase()));

/**
 * A binding is long and thin: its area over the square of its width (the diameter of the largest
 * inscribed disc) is its length in widths. A strip reads ≳ 4; a triangle ≈ 1.3, a square 1, a disc
 * 0.8. Measured (06.10, regions.v4, + 1 px edge row): card 38's two back "armhole binding"
 * triangles 2.4 / 2.5 (their ragged edges add area), its straps 8.7–26. A region below 3 is no strip.
 */
export const BAND_MIN_ELONGATION = 3;
/**
 * A floor on the width, so a short piece of a narrow binding (cut by a crossing line, near-square)
 * is never taken for a blob: card 38's widest real strip is 5.6 % of the silhouette's width, its
 * triangles 17.9 / 18.1 %. Only a region wider than this AND not elongated leaves the binding.
 */
export const BAND_MAX_WIDTH = 0.07;
/** A region borders the outside (or an opening) along at least this share of its edge. */
const BAND_CONTACT = 0.05;

/** The width of a region from its inscribed radius² (edge pixels are 0, so + 1 for the edge row). */
const bandWidth = (r2: number) => (r2 >= 0 ? 2 * Math.sqrt(r2) + 1 : 0);

/** Per region of a flat: its width (px) and length in widths — what `fixBands` judges. */
export function bandShape(flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h'>): {
  width: Float64Array;
  elongation: Float64Array;
} {
  const { r2 } = inscribed(flat);
  const area = new Float64Array(flat.count + 1);
  for (let i = 0; i < flat.labels.length; i += 1) {
    const v = flat.labels[i];
    if (v > 0 && v <= flat.count) area[v] += 1;
  }
  const width = new Float64Array(flat.count + 1);
  const elongation = new Float64Array(flat.count + 1);
  for (let r = 1; r <= flat.count; r += 1) {
    width[r] = bandWidth(r2[r]);
    elongation[r] = width[r] > 0 ? area[r] / (width[r] * width[r]) : 0;
  }
  return { width, elongation };
}

/**
 * f5 · the card's inner layer as a part (layer 2 of `fixBands`): its label and key. Found, in order:
 * a part of the answer with the key of a `joins.layers` layer of index > 0 (the backend names it by
 * `designPartsLayerName`, keyed by `designPartsSlug`); a part whose name says a layer ("layer",
 * "lining", "v-panel", an "inner … panel"); else the list's layer itself. null = the card has none.
 */
export type LayerPart = { label: string; key: string };

const LAYER_WORDS = /\b(layer|lining|v-panel)\b|\binner\b.*\bpanel\b/;

/** Backend `designPartsLayerName`: the name up to "/(,;", lowercase, at most 3 words. */
export const layerName = (l: { index?: number; name?: string }): string => {
  let n = l.name ?? '';
  const cut = n.search(/[/(,;]/);
  if (cut >= 0) n = n.slice(0, cut);
  const words = n.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 3);
  return words.length ? words.join(' ') : `inner layer ${l.index ?? 0}`;
};

/** Backend `designPartsSlug`: letters and digits, every other run as one "-". */
export const partSlug = (label: string): string => {
  const out = label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return out || 'part';
};

const ownLabel = (label: string): string =>
  partKey(label.endsWith(INSIDE_SUFFIX) ? label.slice(0, -INSIDE_SUFFIX.length) : label);

export function innerLayerPart(
  rows: readonly Pick<DesignPartsSuggestion, 'parts'>[],
  layers: readonly { index?: number; name?: string }[] | undefined,
): LayerPart | null {
  const all = rows.flatMap((r) => r.parts ?? []);
  const inner = (layers ?? []).filter((l) => (l.index ?? 0) > 0);
  for (const l of inner) {
    const key = partSlug(layerName(l));
    const g = all.find((x) => (x.partKey ?? '').trim() === key);
    if (g) return { label: ownLabel(g.label ?? ''), key };
  }
  for (const g of all) {
    const label = ownLabel(g.label ?? '');
    if (!LAYER_WORDS.test(label) || /\bbody\b/.test(label)) continue;
    return { label, key: (g.partKey ?? '').trim() || partSlug(label) };
  }
  if (inner.length > 0) {
    const label = layerName(inner[0]);
    return { label, key: partSlug(label) };
  }
  return null;
}

/**
 * f5 · a strip of a binding group that runs ALONG another strip of the same group (it borders the
 * group's other regions along at least this share of its edge) …
 */
const STACK_CONTACT = 0.15;
/** … and borders no other cloth (a part outside the group, not an opening) along this share. */
const STACK_FREE = 0.05;

/**
 * f3 · the labeller may call a blob a "binding" (card 38 back: the triangle between a strap and the
 * armhole edge). After the answer is laid, every region of a binding-named group that is not a strip
 * (`BAND_MIN_ELONGATION`, above the `BAND_MAX_WIDTH` floor) leaves it:
 *   - it borders the outside of the garment, or an opening, along `BAND_CONTACT` of its edge
 *     (looking across the line, as far as two closing radii) → `opening`;
 *   - f5 · else, the card has an inner layer (`layer`) → that layer part;
 *   - f6 · else it is UNASSIGNED (no group: the canvas shows it as an error) — no longer the
 *     «<part> · inside» of a part beside it: a hole is never cloth, and a guess is never shown as
 *     an answer.
 * f5 · with an inner layer, a binding group of several regions also gives up a strip that runs
 * along the group's other strips (`STACK_CONTACT`) and finishes no cloth (`STACK_FREE`): a binding
 * borders the panel it finishes; that strip is the layer showing past it (card 38 front: the V
 * layer's crescent above the neck binding). The group always keeps a region.
 * A group left with no region is dropped. Returns the same object when nothing changes.
 */
export function fixBands(
  parts: ViewParts,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h' | 'silhouette'>,
  layer: LayerPart | null = null,
): ViewParts {
  if (!parts.groups.some(isBand)) return parts;
  const { labels, count, w, h, silhouette } = flat;
  const n = w * h;
  let x0 = w;
  let x1 = -1;
  for (let i = 0; i < n; i += 1)
    if (silhouette[i]) {
      const x = i % w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  const silW = x1 - x0 + 1;
  if (silW <= 0) return parts;
  const { r2 } = inscribed(flat);
  const area = new Float64Array(count + 1);
  for (let i = 0; i < n; i += 1) {
    const v = labels[i];
    if (v > 0 && v <= count) area[v] += 1;
  }
  const wide: number[] = [];
  /** Strips of a binding group, and of this side's own layer group: the stacked candidates. */
  const stacked: number[] = [];
  const layerAt = layer
    ? parts.groups.findIndex(
        (g) => g.key === layer.key && !g.label.endsWith(INSIDE_SUFFIX) && !isOpening(g),
      )
    : -1;
  parts.groups.forEach((g, gi) => {
    if (!isBand(g) && gi !== layerAt) return;
    for (const r of g.regions) {
      const d = bandWidth(r2[r]);
      const blob = d > BAND_MAX_WIDTH * silW && area[r] / (d * d) < BAND_MIN_ELONGATION;
      if (blob && isBand(g)) wide.push(r);
      else if (!blob && layer) stacked.push(r);
    }
  });
  if (wide.length === 0 && stacked.length === 0) return parts;

  // Across the line: from each edge pixel of a wide region walk the 4 directions over the ink
  // (label 0 inside the silhouette) up to `reach` px; tally what is landed on.
  const reach = 2 * scaledRadius(w, h, 3);
  const opening = new Set<number>();
  parts.groups.forEach((g) => {
    if (isOpening(g)) for (const r of g.regions) opening.add(r);
  });
  const out: Map<number, string | PartGroup | LayerPart> = new Map();
  /** f6 · the regions that leave their binding for no group (an error on the canvas). */
  const UNASSIGNED = '';
  const wideSet = new Set(wide);
  const scan = new Set([...wide, ...stacked]);
  const edge = new Map<number, number>();
  const outside = new Map<number, number>();
  const touch = new Map<number, Map<number, number>>();
  for (const r of scan) touch.set(r, new Map());
  const steps = [-1, 1, -w, w];
  for (let i = 0; i < n; i += 1) {
    const v = labels[i];
    if (!scan.has(v)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let isEdge = false;
    let out_ = false;
    const seen = new Set<number>();
    for (let d = 0; d < 4; d += 1) {
      let j = i;
      let xx = x;
      let yy = y;
      for (let k = 1; k <= reach; k += 1) {
        j += steps[d];
        if (d === 0) xx -= 1;
        else if (d === 1) xx += 1;
        else if (d === 2) yy -= 1;
        else yy += 1;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) {
          if (k === 1) isEdge = true;
          out_ = true;
          break;
        }
        const u = labels[j];
        if (u === v) break;
        if (k === 1) isEdge = true;
        if (!silhouette[j]) {
          out_ = true;
          break;
        }
        if (u) {
          seen.add(u);
          break;
        }
      }
    }
    if (!isEdge) continue;
    edge.set(v, (edge.get(v) ?? 0) + 1);
    if (out_) outside.set(v, (outside.get(v) ?? 0) + 1);
    const t = touch.get(v)!;
    for (const u of seen) t.set(u, (t.get(u) ?? 0) + 1);
  }

  for (const r of wide) {
    const e = Math.max(1, edge.get(r) ?? 0);
    const t = touch.get(r)!;
    let toOpening = 0;
    for (const [u, c] of t) if (opening.has(u)) toOpening += c;
    if (((outside.get(r) ?? 0) + toOpening) / e >= BAND_CONTACT) {
      out.set(r, OPENING);
      continue;
    }
    out.set(r, layer ?? UNASSIGNED);
  }

  // f5 · stacked strips: a binding and the layer showing past it run along each other. Over one
  // binding group and the layer's strips that lie along it, the strip that finishes cloth (borders a
  // part outside them, not an opening, along `STACK_FREE`) is the binding, one that finishes none is
  // the layer — whichever of the two the answer put it in. The binding always keeps a region.
  const moved = new Set<number>(wideSet);
  if (layer) {
    const groupOf = (r: number) => parts.regionGroup[r] ?? -1;
    const stackSet = new Set(stacked);
    parts.groups.forEach((g, gi) => {
      if (!isBand(g)) return;
      const own = g.regions.filter((r) => stackSet.has(r));
      if (own.length === 0) return;
      const ownSet = new Set(own);
      const contact = (r: number, to: (u: number) => boolean) => {
        let c = 0;
        for (const [u, n] of touch.get(r) ?? []) if (to(u)) c += n;
        return c / Math.max(1, edge.get(r) ?? 0);
      };
      // The layer's strips lying along this binding.
      const lay =
        layerAt >= 0
          ? parts.groups[layerAt].regions.filter(
              (r) =>
                stackSet.has(r) &&
                !out.has(r) /* one binding per layer strip */ &&
                contact(r, (u) => ownSet.has(u)) >= STACK_CONTACT,
            )
          : [];
      const pair = new Set([...own, ...lay]);
      const finishes = (r: number) =>
        contact(r, (u) => !pair.has(u) && !opening.has(u) && groupOf(u) !== gi) >= STACK_FREE;
      const along = (r: number) => contact(r, (u) => pair.has(u)) >= STACK_CONTACT;
      const leave = own.filter((r) => !finishes(r) && along(r));
      const join = lay.filter((r) => finishes(r));
      const keeps = own.filter((r) => !wideSet.has(r)).length - leave.length + join.length;
      if (keeps < 1 || (leave.length === 0 && join.length === 0)) return;
      for (const r of leave) {
        out.set(r, layer);
        moved.add(r);
      }
      for (const r of join) {
        out.set(r, g);
        moved.add(r);
      }
    });
  }
  if (out.size === 0) return parts;

  // Rebuild the groups: the wide regions leave their band, join the opening / the layer / none.
  const groups: PartGroup[] = parts.groups.map((g) => ({
    ...g,
    regions: g.regions.filter((r) => !moved.has(r)),
  }));
  const findOrAdd = (label: string, key: string): PartGroup => {
    let g = groups.find((o) =>
      label === OPENING ? isOpening(o) : o.label === label && o.key === key,
    );
    if (!g) {
      g = { label, regions: [], key, words: nameWords(label) };
      groups.push(g);
    }
    return g;
  };
  for (const [r, to] of out) {
    if (to === UNASSIGNED) continue;
    const g =
      to === OPENING
        ? findOrAdd(OPENING, OPENING)
        : to === layer
          ? findOrAdd(layer.label, layer.key)
          : findOrAdd((to as PartGroup).label, (to as PartGroup).key);
    g.regions.push(r);
  }
  const kept = groups.filter((g) => g.regions.length > 0);
  const regionGroup = new Int32Array(parts.regionGroup.length).fill(-1);
  kept.forEach((g, i) => {
    for (const r of g.regions) regionGroup[r] = i;
  });
  return { ...parts, groups: kept, regionGroup, keyed: kept.every((g) => g.key !== '') };
}

/** M5 · an unnamed strip borders the part it finishes along at least this share of its edge … */
const ADOPT_SHARE = 0.1;
/** … and every other cloth part along at most this share of that. */
const ADOPT_RIVAL = 0.5;

/**
 * M5 (live, card 38) · a STRIP the labeller left unnamed — it called it «hem» or «hem band»: an
 * edge, or a name the construction does not have — that runs along ONE named cloth part is that
 * part's edge, the panel it finishes (the labeller's own rule: «a thin strip along an edge is the
 * binding or band the construction lists, or else the panel whose edge it finishes»). Thin
 * (`BAND_MAX_WIDTH` of the silhouette) and long (`BAND_MIN_ELONGATION` widths); across its lines
 * (as far as two closing radii) it borders that part along `ADOPT_SHARE` of its edge and any other
 * cloth part along at most `ADOPT_RIVAL` of that, and it lies on the garment's OUTER edge (borders
 * the outside along `BAND_CONTACT`: a hem, never a slit or a strip round a hole — those may be a
 * hole or a piece of their own). Anything else stays unassigned (an error on the canvas). Returns
 * the same object when nothing changes.
 */
export function adoptEdges(
  parts: ViewParts,
  flat: Pick<FlatRegions, 'labels' | 'count' | 'w' | 'h' | 'silhouette'>,
): ViewParts {
  const { labels, count, w, h, silhouette } = flat;
  const lost: number[] = [];
  for (let r = 1; r <= count; r += 1) if (unassignedRegion(parts, r)) lost.push(r);
  if (lost.length === 0) return parts;
  const n = w * h;
  let x0 = w;
  let x1 = -1;
  for (let i = 0; i < n; i += 1)
    if (silhouette[i]) {
      const x = i % w;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  const silW = x1 - x0 + 1;
  if (silW <= 0) return parts;
  const { width, elongation } = bandShape(flat);
  const strips = new Set(
    lost.filter((r) => width[r] <= BAND_MAX_WIDTH * silW && elongation[r] >= BAND_MIN_ELONGATION),
  );
  if (strips.size === 0) return parts;
  const cloth = (u: number) => {
    const g = parts.groups[parts.regionGroup[u] ?? -1];
    return g && !isOpening(g) && !isUnnamed(g) ? parts.regionGroup[u] ?? -1 : -1;
  };
  const reach = 2 * scaledRadius(w, h, 3);
  const steps = [-1, 1, -w, w];
  const edge = new Map<number, number>();
  const outside = new Map<number, number>();
  const touch = new Map<number, Map<number, number>>();
  for (let i = 0; i < n; i += 1) {
    const v = labels[i];
    if (!strips.has(v)) continue;
    const x = i % w;
    const y = (i / w) | 0;
    let isEdge = false;
    let out = false;
    const seen = new Set<number>();
    for (let d = 0; d < 4; d += 1) {
      let j = i;
      let xx = x;
      let yy = y;
      for (let k = 1; k <= reach; k += 1) {
        j += steps[d];
        if (d === 0) xx -= 1;
        else if (d === 1) xx += 1;
        else if (d === 2) yy -= 1;
        else yy += 1;
        if (xx < 0 || xx >= w || yy < 0 || yy >= h) {
          if (k === 1) isEdge = true;
          out = true;
          break;
        }
        const u = labels[j];
        if (u === v) break;
        if (k === 1) isEdge = true;
        if (!silhouette[j]) {
          out = true;
          break;
        }
        if (u) {
          const gi = cloth(u);
          if (gi >= 0) seen.add(gi);
          break;
        }
      }
    }
    if (!isEdge) continue;
    edge.set(v, (edge.get(v) ?? 0) + 1);
    if (out) outside.set(v, (outside.get(v) ?? 0) + 1);
    let t = touch.get(v);
    if (!t) touch.set(v, (t = new Map()));
    for (const gi of seen) t.set(gi, (t.get(gi) ?? 0) + 1);
  }
  const to = new Map<number, number>();
  for (const r of strips) {
    const e = Math.max(1, edge.get(r) ?? 0);
    if ((outside.get(r) ?? 0) / e < BAND_CONTACT) continue;
    const ranked = [...(touch.get(r) ?? [])].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 0 || ranked[0][1] / e < ADOPT_SHARE) continue;
    if (ranked.length > 1 && ranked[1][1] > ADOPT_RIVAL * ranked[0][1]) continue;
    to.set(r, ranked[0][0]);
  }
  if (to.size === 0) return parts;
  const groups: PartGroup[] = parts.groups.map((g, gi) => ({
    ...g,
    regions: [
      ...g.regions.filter((r) => !to.has(r)),
      ...[...to].filter(([, t]) => t === gi).map(([r]) => r),
    ].sort((a, b) => a - b),
  }));
  const kept = groups.filter((g) => g.regions.length > 0);
  const regionGroup = new Int32Array(parts.regionGroup.length).fill(-1);
  kept.forEach((g, i) => {
    for (const r of g.regions) regionGroup[r] = i;
  });
  return { ...parts, groups: kept, regionGroup, keyed: kept.every((g) => g.key !== '') };
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
