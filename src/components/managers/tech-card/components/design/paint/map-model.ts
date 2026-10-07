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

/**
 * R9 · THE HARDWARE NAMESPACE. A hardware slot's label is a function of its id ALONE — never of
 * which other slots the card holds — so deleting or adding a slot never moves another slot's label
 * and no saved map is orphaned or inherits pixels. The namespace is near-grey (chroma ≤ 31 of 255):
 * every cloth label (`slotHex`, S 0.62 · L 0.2–0.8 → chroma ≥ 63) and every free-colour label
 * (`freeColourLabel`, chroma ≥ 92) lies outside it, black and white too. Injective for ids below
 * `HARDWARE_ID_SPAN` (128 greys × 32 × 32 offsets); beyond it the ids wrap.
 */
export const HARDWARE_ID_SPAN = 128 * 32 * 32;
export function hardwareHex(bomItemId: number): string {
  const n =
    (((Math.trunc(bomItemId) - 1) % HARDWARE_ID_SPAN) + HARDWARE_ID_SPAN) % HARDWARE_ID_SPAN;
  const base = 64 + (n % 128);
  const dg = (Math.floor(n / 128) % 32) - 16;
  const db = Math.floor(n / 4096) - 16;
  const ch = (v: number) => v.toString(16).padStart(2, '0');
  return `#${ch(base)}${ch(base + dg)}${ch(base + db)}`;
}

/**
 * Labels of every slot of the card: the cloths' collisions stepped apart in id order; R9 · `after`
 * (the hardware slots) take `hardwareHex` — their own namespace, stable under any change of the set.
 */
export function slotLabels(
  bomItemIds: readonly number[],
  after: readonly number[] = [],
): Map<number, string> {
  const out = new Map<number, string>();
  const taken = new Set<string>();
  const sorted = (ids: readonly number[]) =>
    [...new Set(ids)].filter((x) => x > 0 && !out.has(x)).sort((a, b) => a - b);
  for (const id of sorted(bomItemIds)) {
    let step = 0;
    let hex = slotHex(id, step);
    while ((taken.has(hex) || !isMapInk(hex)) && step < 12) hex = slotHex(id, ++step);
    taken.add(hex);
    out.set(id, hex);
  }
  for (const id of sorted(after)) out.set(id, hardwareHex(id));
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

/* ─────────────────────────── R9 · hardware as parts ─────────────────────────── */

/** A hardware click: the pixels to paint, or `open` (the fill ran past the share — paint nothing). */
export type HardwarePick = { idx: Int32Array; open: false } | { idx: null; open: true };

/** Past this share of the sheet a hardware fill is an open outline, not a button. */
export const HARDWARE_OPEN_SHARE = 0.01;
/** A click on ink looks this far (px) for the button's inside. */
const HARDWARE_SNAP_PX = 3;

/**
 * R9 · what a click with a hardware tile armed paints (a NEW gesture: the cutter folds a button's
 * disc into the body region, so regions cannot say where it is). The non-ink pixels flooded from
 * the click (4-connected, bounded by the ink as drawn — no closing), plus every non-ink island whose
 * box lies inside the fill's box: the pockets enclosed between a button's holes. A click on ink
 * takes the nearest non-ink pixel within `HARDWARE_SNAP_PX`; with none (a solid snap or rivet drawn
 * as one dot) the 8-connected ink blob under the pointer is painted instead. A fill or a blob past
 * `HARDWARE_OPEN_SHARE` of the sheet is an open outline: `open`, nothing painted.
 */
export function hardwareAt(
  ink: Uint8Array,
  w: number,
  h: number,
  x: number,
  y: number,
  share = HARDWARE_OPEN_SHARE,
): HardwarePick | null {
  if (x < 0 || y < 0 || x >= w || y >= h) return null;
  const max = Math.max(1, Math.floor(w * h * share));
  const at = y * w + x;
  if (!ink[at]) return floodButton(ink, w, h, at, max);
  // On ink: the nearest non-ink pixels first; a ring is clicked from inside or out, so the first
  // seed whose fill closes wins (the outside of a button is the body: open).
  const seeds: { i: number; d: number }[] = [];
  const r = HARDWARE_SNAP_PX;
  for (let dy = -r; dy <= r; dy += 1)
    for (let dx = -r; dx <= r; dx += 1) {
      const xx = x + dx;
      const yy = y + dy;
      const d = dx * dx + dy * dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h || d > r * r) continue;
      if (!ink[yy * w + xx]) seeds.push({ i: yy * w + xx, d });
    }
  if (seeds.length === 0) return inkBlobAt(ink, w, h, at, max);
  seeds.sort((a, b) => a.d - b.d);
  const tried = new Set<number>();
  for (const { i } of seeds) {
    if (tried.has(i)) continue;
    const pick = floodButton(ink, w, h, i, max, tried);
    if (!pick.open) return pick;
  }
  return { idx: null, open: true };
}

/** One hardware fill from a non-ink seed (`hardwareAt`); every pixel it reached goes in `tried`. */
function floodButton(
  ink: Uint8Array,
  w: number,
  h: number,
  seed: number,
  max: number,
  tried?: Set<number>,
): HardwarePick {
  const n = w * h;
  const mark = new Uint8Array(n);
  const fill: number[] = [];
  const stack: number[] = [seed];
  mark[seed] = 1;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    fill.push(i);
    tried?.add(i);
    if (fill.length > max) return { idx: null, open: true };
    const cx = i % w;
    const cy = (i / w) | 0;
    if (cx < x0) x0 = cx;
    if (cx > x1) x1 = cx;
    if (cy < y0) y0 = cy;
    if (cy > y1) y1 = cy;
    const visit = (j: number) => {
      if (!mark[j] && !ink[j]) {
        mark[j] = 1;
        stack.push(j);
      }
    };
    if (cx > 0) visit(i - 1);
    if (cx < w - 1) visit(i + 1);
    if (i >= w) visit(i - w);
    if (i + w < n) visit(i + w);
  }
  // The pockets: non-ink islands met inside the fill's box that never leave it (a flood that
  // steps out of the box stops there — it is the cloth around the button).
  const inBox = (i: number) => {
    const cx = i % w;
    const cy = (i / w) | 0;
    return cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1;
  };
  for (let cy = y0; cy <= y1; cy += 1)
    for (let cx = x0; cx <= x1; cx += 1) {
      const s = cy * w + cx;
      if (mark[s] || ink[s]) continue;
      const island: number[] = [];
      let inside = true;
      const st: number[] = [s];
      mark[s] = 2;
      while (st.length > 0) {
        const i = st.pop() as number;
        if (!inBox(i)) {
          inside = false;
          continue;
        }
        island.push(i);
        const ix = i % w;
        const visit = (j: number) => {
          if (!mark[j] && !ink[j]) {
            mark[j] = 2;
            st.push(j);
          }
        };
        if (ix > 0) visit(i - 1);
        if (ix < w - 1) visit(i + 1);
        if (i >= w) visit(i - w);
        if (i + w < n) visit(i + w);
      }
      if (inside) for (const i of island) fill.push(i);
    }
  if (fill.length > max) return { idx: null, open: true };
  return { idx: Int32Array.from(fill), open: false };
}

/** The 8-connected ink blob at `seed`, or `open` past `max` (a line of the drawing, not a dot). */
function inkBlobAt(ink: Uint8Array, w: number, h: number, seed: number, max: number): HardwarePick {
  const n = w * h;
  const seen = new Uint8Array(n);
  const out: number[] = [];
  const stack = [seed];
  seen[seed] = 1;
  while (stack.length > 0) {
    const i = stack.pop() as number;
    out.push(i);
    if (out.length > max) return { idx: null, open: true };
    const cx = i % w;
    for (let dy = -1; dy <= 1; dy += 1)
      for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const xx = cx + dx;
        const j = i + dy * w + dx;
        if (xx < 0 || xx >= w || j < 0 || j >= n || seen[j] || !ink[j]) continue;
        seen[j] = 1;
        stack.push(j);
      }
  }
  return { idx: Int32Array.from(out), open: false };
}

/** One hardware instance: its pixels and box (inclusive). */
export type HardwareInstance = {
  idx: Int32Array;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

/** A component under this many px (at the working resolution) is not an instance. */
export const HARDWARE_MIN_PX = 12;

/**
 * R9 · the instances of one hardware label on a side: its 8-connected components, a component whose
 * box lies inside another's joined to it (a button's hole pockets are the button), then the ones
 * under `HARDWARE_MIN_PX` dropped. Derived at use time, never stored.
 */
export function hardwareInstances(
  labels: Uint32Array,
  value: number,
  w: number,
  h: number,
  minPx = HARDWARE_MIN_PX,
): HardwareInstance[] {
  return hardwareInstancesAll(labels, (v) => v === value, w, h, minPx).get(value) ?? [];
}

/**
 * R9 fix 4 · the instances of EVERY hardware label of a side in ONE pass over the raster (one
 * `seen`, each pixel visited once): label (packed) → its instances. A label absent from the side
 * is simply not a key. `isHardware` is asked once per distinct label value.
 */
export function hardwareInstancesAll(
  labels: Uint32Array,
  isHardware: (value: number) => boolean,
  w: number,
  h: number,
  minPx = HARDWARE_MIN_PX,
): Map<number, HardwareInstance[]> {
  const n = w * h;
  const asked = new Map<number, boolean>();
  const hw = (v: number) => {
    let yes = asked.get(v);
    if (yes === undefined) {
      yes = v !== 0 && isHardware(v);
      asked.set(v, yes);
    }
    return yes;
  };
  type Comp = { idx: number[]; x0: number; y0: number; x1: number; y1: number };
  const byValue = new Map<number, Comp[]>();
  let seen: Uint8Array | null = null;
  const stack: number[] = [];
  for (let s = 0; s < n; s += 1) {
    const value = labels[s];
    if (value === 0 || (seen && seen[s]) || !hw(value)) continue;
    if (!seen) seen = new Uint8Array(n);
    const c: Comp = { idx: [], x0: w, y0: h, x1: -1, y1: -1 };
    stack.push(s);
    seen[s] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      c.idx.push(i);
      const cx = i % w;
      const cy = (i / w) | 0;
      if (cx < c.x0) c.x0 = cx;
      if (cx > c.x1) c.x1 = cx;
      if (cy < c.y0) c.y0 = cy;
      if (cy > c.y1) c.y1 = cy;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const xx = cx + dx;
          const j = i + dy * w + dx;
          if (xx < 0 || xx >= w || j < 0 || j >= n || seen[j] || labels[j] !== value) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
    const list = byValue.get(value);
    if (list) list.push(c);
    else byValue.set(value, [c]);
  }
  const out = new Map<number, HardwareInstance[]>();
  for (const [value, comps] of byValue) {
    // Biggest first: a pocket finds the button it sits in.
    comps.sort((a, b) => b.idx.length - a.idx.length);
    const kept: Comp[] = [];
    for (const c of comps) {
      const host = kept.find((k) => c.x0 >= k.x0 && c.x1 <= k.x1 && c.y0 >= k.y0 && c.y1 <= k.y1);
      if (host) for (const i of c.idx) host.idx.push(i);
      else kept.push(c);
    }
    const list = kept
      .filter((c) => c.idx.length >= minPx)
      .map((c) => ({ idx: Int32Array.from(c.idx), x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1 }));
    if (list.length > 0) out.set(value, list);
  }
  return out;
}

/** How far (px) the export looks past a component's own ink for the cloth around it. */
const AROUND_PX = 8;

/**
 * R9 · the labels as the outgoing colour map carries them: every pixel of a hardware label takes
 * the label of the cloth around its component — the majority of the first ring of pixels outside
 * it that are neither ink nor hardware (paper counts: 0). A hardware hex never reaches the model's
 * map (a flooded hex leaked its colour into the button, Ф0 run 197); the saved plan keeps it.
 */
export function exportLabels(
  labels: Uint32Array,
  ink: Uint8Array,
  w: number,
  h: number,
  isHardware: (v: number) => boolean,
): Uint32Array {
  const out = labels.slice();
  const n = w * h;
  const seen = new Uint8Array(n);
  for (let s = 0; s < n; s += 1) {
    const value = labels[s];
    if (seen[s] || !value || !isHardware(value)) continue;
    // The component (8-connected, one label).
    const comp: number[] = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length > 0) {
      const i = stack.pop() as number;
      comp.push(i);
      const cx = i % w;
      for (let dy = -1; dy <= 1; dy += 1)
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const xx = cx + dx;
          const j = i + dy * w + dx;
          if (xx < 0 || xx >= w || j < 0 || j >= n || seen[j] || labels[j] !== value) continue;
          seen[j] = 1;
          stack.push(j);
        }
    }
    // Rings outward through ink and hardware until a ring meets cloth or paper.
    const reached = new Set<number>(comp);
    let front = comp;
    const votes = new Map<number, number>();
    for (let step = 0; step < AROUND_PX && votes.size === 0 && front.length > 0; step += 1) {
      const next: number[] = [];
      for (const i of front) {
        const cx = i % w;
        const nb = [cx > 0 ? i - 1 : -1, cx < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) {
          if (j < 0 || j >= n || reached.has(j)) continue;
          reached.add(j);
          const v = labels[j];
          if (ink[j] || (v && isHardware(v))) next.push(j);
          else votes.set(v, (votes.get(v) ?? 0) + 1);
        }
      }
      front = next;
    }
    let to = 0;
    let most = -1;
    for (const [v, c] of votes) {
      // A tie goes to a cloth over paper.
      if (c > most || (c === most && v !== 0 && to === 0)) {
        to = v;
        most = c;
      }
    }
    for (const i of comp) out[i] = to;
  }
  return out;
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
 * R9 · `onInk`: labels kept OVER the ink (the saved plan's hardware: a rivet drawn as a solid dot
 * is all ink, and black there would lose it on the next read).
 */
export function mapPixels(
  labels: Uint32Array,
  ink: Uint8Array,
  w: number,
  h: number,
  onInk?: (v: number) => boolean,
): { rgba: Uint8ClampedArray; palette: PlanSwatch[] } {
  const rgba = new Uint8ClampedArray(w * h * 4);
  const counts = new Map<number, number>();
  for (let i = 0, p = 0; i < w * h; i += 1, p += 4) {
    rgba[p + 3] = 255;
    const v = labels[i];
    if (ink[i] && !(v && onInk?.(v))) continue; // black
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

/**
 * QW1 · the garment's cloth, as the canvas and the mockup fill it with the REMAINDER: every pixel
 * of a region, and every pixel under a line whose nearest neighbour is in a region — minus the
 * outline's outer fringe (the light pixels between the outer line and the paper, reached from
 * outside within a few px without crossing ink), so the outline stands on paper (cached per flat).
 * v5 · minus the side's OPENINGS: a hole is never cloth, not even the remainder's.
 */
const CLOTH = new WeakMap<Int32Array, Uint8Array>();
export function clothMask(
  flat: Pick<FlatRegions, 'labels' | 'silhouette' | 'w' | 'h' | 'openings'> & {
    ink?: Uint8Array;
  },
): Uint8Array {
  const hit = CLOTH.get(flat.labels);
  if (hit) return hit;
  const { w, h, silhouette, ink, openings } = flat;
  const n = w * h;
  const out = new Uint8Array(n);
  const cloth = (r: number) => r > 0 && !openings?.[r];
  for (let i = 0; i < n; i += 1) if (cloth(flat.labels[i])) out[i] = 1;
  const { idx, near } = underLines(flat);
  for (let k = 0; k < idx.length; k += 1) if (cloth(flat.labels[near[k]])) out[idx[k]] = 1;
  if (ink) {
    const reach = Math.max(2, Math.round((3 * Math.max(w, h)) / 1024));
    const step = new Int16Array(n).fill(-1);
    let front: number[] = [];
    for (let i = 0; i < n; i += 1) if (!silhouette[i]) step[i] = 0;
    for (let i = 0; i < n; i += 1) {
      if (step[i] !== 0) continue;
      const x = i % w;
      if ((x > 0 && step[i - 1] < 0) || (x < w - 1 && step[i + 1] < 0)) front.push(i);
      else if ((i >= w && step[i - w] < 0) || (i + w < n && step[i + w] < 0)) front.push(i);
    }
    for (let d = 1; d <= reach && front.length > 0; d += 1) {
      const next: number[] = [];
      for (const i of front) {
        const x = i % w;
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w];
        for (const j of nb) {
          if (j < 0 || j >= n || step[j] >= 0 || ink[j]) continue;
          step[j] = d;
          out[j] = 0;
          next.push(j);
        }
      }
      front = next;
    }
  }
  CLOTH.set(flat.labels, out);
  return out;
}
