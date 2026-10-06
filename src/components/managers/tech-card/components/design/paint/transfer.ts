/**
 * PAINT THE PARTS · T28 — a saved map carried onto a NEW flat of its side.
 *
 * Owner: «не надо показывать stale … надо просто один раз показать что оно stale и разметить новые
 * картинки которые прибыли». The side's flat was replaced (re-crop, re-scale, a square with
 * margins, a cleaner redraw): the old paint is laid over the new regions instead of standing on the
 * side as a STALE badge nobody can act on.
 *
 *   align   the old map's drawing box (every non-white pixel: its ink is the old flat's ink, its
 *           labels sit inside the old silhouette) onto the new flat's ink box — normalised
 *           coordinates inside the two boxes, x and y each on its own.
 *   vote    every pixel of a new region samples the old map at its aligned place; the label most
 *           of its LABELLED samples carry wins, and only when labelled samples are at least half of
 *           the region's (ink, paper and unknown colours vote "nothing"). Otherwise the region
 *           stays unpainted — a guess over a half-covered part would paint what nobody painted.
 *
 * The labels are the old ones, byte for byte: slot labels and free-colour labels keep their rows.
 */
import { labelsFromMap } from './map-model';
import type { FlatRegions } from './regions';

export type OldMap = {
  rgba: Uint8ClampedArray | Uint8Array;
  w: number;
  h: number;
  /** The map's palette hexes: only these exact colours are labels. */
  palette: readonly string[];
};

type Box = { x0: number; y0: number; x1: number; y1: number };

/** The box of every pixel `on` says is drawing; null when there is none. */
function boxOf(w: number, h: number, on: (i: number) => boolean): Box | null {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1) {
      if (!on(y * w + x)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** A map pixel is drawing: opaque and not white (its ink and its labels, never the paper). */
const drawnOf = (rgba: Uint8ClampedArray | Uint8Array) => (i: number) => {
  const p = i * 4;
  if (rgba[p + 3] < 128) return false;
  return rgba[p] < 250 || rgba[p + 1] < 250 || rgba[p + 2] < 250;
};

/* ─────────────────────────── T29 · artwork marks follow the flat ─────────────────────────── */

/** A box in FRACTIONS of its picture (outer edges: a 1-px box still spans a pixel). */
export type FracBox = { x0: number; y0: number; x1: number; y1: number };

const fracOf = (b: Box | null, w: number, h: number): FracBox | null =>
  b ? { x0: b.x0 / w, y0: b.y0 / h, x1: (b.x1 + 1) / w, y1: (b.y1 + 1) / h } : null;

/**
 * The old map's INK box, in fractions: its pure-black pixels are the old flat's ink byte for byte
 * (`mapPixels`), so this is the old flat's own ink box — the frame an artwork mark was placed in.
 * (The paint's drawing box runs a few px wider: labels spill past the outline into the dilated
 * silhouette — harmless for a region vote, a visible shift for a mark.) A map without black falls
 * back to its drawing box.
 */
export function mapDrawBox(old: Pick<OldMap, 'rgba' | 'w' | 'h'>): FracBox | null {
  const { rgba, w, h } = old;
  const black = (i: number) => {
    const p = i * 4;
    return rgba[p + 3] >= 128 && rgba[p] === 0 && rgba[p + 1] === 0 && rgba[p + 2] === 0;
  };
  return fracOf(boxOf(w, h, black) ?? boxOf(w, h, drawnOf(rgba)), w, h);
}

/** A flat's ink box (`regions.ts` ink — the box `transferMap` aligns onto), in fractions. */
export const inkBox = (flat: Pick<FlatRegions, 'w' | 'h' | 'ink'>): FracBox | null =>
  fracOf(
    boxOf(flat.w, flat.h, (i) => flat.ink[i] === 1),
    flat.w,
    flat.h,
  );

/**
 * T29 · an artwork mark's points (fractions of the OLD flat's picture) on the NEW flat: the same
 * box-to-box alignment as the paint (x and y each on its own), clamped into 0..1. Null when either
 * box is empty or degenerate — the mark then stays where it is.
 */
export function transferPoints<P extends { x: number; y: number }>(
  oldBox: FracBox | null,
  newBox: FracBox | null,
  points: readonly P[],
): P[] | null {
  if (!oldBox || !newBox) return null;
  const ow = oldBox.x1 - oldBox.x0;
  const oh = oldBox.y1 - oldBox.y0;
  const nw = newBox.x1 - newBox.x0;
  const nh = newBox.y1 - newBox.y0;
  if (!(ow > 0 && oh > 0 && nw > 0 && nh > 0)) return null;
  const c = (v: number) => Math.min(1, Math.max(0, v));
  return points.map((p) => ({
    ...p,
    x: c(newBox.x0 + ((p.x - oldBox.x0) * nw) / ow),
    y: c(newBox.y0 + ((p.y - oldBox.y0) * nh) / oh),
  }));
}

/** Share of a region's samples that must carry a label for the region to take one. */
export const TRANSFER_COVER = 0.5;

/**
 * The old map's paint on the new flat: a label raster at the new flat's size (0 = unpainted),
 * every new region either wholly one old label or untouched. Null when the old map holds no
 * drawing or no label at all, or the new flat has no ink (nothing to align).
 */
export function transferMap(
  old: OldMap,
  flat: Pick<FlatRegions, 'w' | 'h' | 'ink' | 'labels' | 'count'>,
): { labels: Uint32Array; painted: number } | null {
  const { rgba, w: mw, h: mh } = old;
  const oldLabels = labelsFromMap(rgba, mw, mh, mw, mh, old.palette);
  const ob = boxOf(mw, mh, drawnOf(rgba));
  const { w, h, ink, labels: regions, count } = flat;
  const nb = boxOf(w, h, (i) => ink[i] === 1);
  if (!ob || !nb || count <= 0) return null;
  let any = false;
  for (let i = 0; i < oldLabels.length && !any; i += 1) if (oldLabels[i]) any = true;
  if (!any) return null;

  // Pixel centres map box to box (the boxes' outer edges, so a 1-px box still spans a pixel).
  const sx = (ob.x1 + 1 - ob.x0) / (nb.x1 + 1 - nb.x0);
  const sy = (ob.y1 + 1 - ob.y0) / (nb.y1 + 1 - nb.y0);
  const colOf = new Int32Array(w);
  for (let x = 0; x < w; x += 1) {
    const ox = Math.floor(ob.x0 + (x + 0.5 - nb.x0) * sx);
    colOf[x] = ox < 0 || ox >= mw ? -1 : ox;
  }
  const rowOf = new Int32Array(h);
  for (let y = 0; y < h; y += 1) {
    const oy = Math.floor(ob.y0 + (y + 0.5 - nb.y0) * sy);
    rowOf[y] = oy < 0 || oy >= mh ? -1 : oy;
  }

  const total = new Int32Array(count + 1);
  const votes = new Map<number, number>(); // region * 2^24 + label → samples
  for (let y = 0; y < h; y += 1) {
    const oy = rowOf[y];
    for (let x = 0; x < w; x += 1) {
      const r = regions[y * w + x];
      if (r <= 0 || r > count) continue;
      total[r] += 1;
      const ox = colOf[x];
      if (oy < 0 || ox < 0) continue;
      const l = oldLabels[oy * mw + ox];
      if (!l) continue;
      const key = r * 0x1000000 + l;
      votes.set(key, (votes.get(key) ?? 0) + 1);
    }
  }

  const best = new Uint32Array(count + 1);
  const bestN = new Int32Array(count + 1);
  const labelled = new Int32Array(count + 1);
  for (const [key, n] of votes) {
    const r = Math.floor(key / 0x1000000);
    const l = key - r * 0x1000000;
    labelled[r] += n;
    if (n > bestN[r] || (n === bestN[r] && l < best[r])) {
      bestN[r] = n;
      best[r] = l;
    }
  }
  let painted = 0;
  for (let r = 1; r <= count; r += 1) {
    if (!best[r] || labelled[r] < total[r] * TRANSFER_COVER) best[r] = 0;
    else painted += 1;
  }

  const out = new Uint32Array(w * h);
  for (let i = 0; i < out.length; i += 1) {
    const r = regions[i];
    if (r > 0 && r <= count) out[i] = best[r];
  }
  return { labels: out, painted };
}

/**
 * D2 · what opening a side whose saved map stands on a replaced flat does with the result of the
 * carry: carried paint is a DRAFT (`draft`) shown but NEVER saved by the opening itself — only the
 * person's next gesture on the side saves it; a map confirmed gone is cleared (`dirty`: nothing
 * painted is written). Nothing carried: nothing changes.
 */
export function carryOutcome(moved: boolean, gone: boolean): { draft: boolean; dirty: boolean } {
  if (moved) return { draft: true, dirty: false };
  return { draft: false, dirty: gone };
}
