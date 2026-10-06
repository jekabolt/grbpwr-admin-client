/**
 * PAINT THE PARTS · the cloth on a flat: ONE scale for the canvas and the mockup (T13, QW1, QW2).
 *
 * At GENERATE every outgoing map gets a picture of its flat with each labelled part filled with
 * its cloth's tile AT THE CLOTH'S TRUE REPEAT, the fill running under the lines (the canvas's
 * nearest-label rule), the flat's own line art multiplied on top, white outside the silhouette —
 * as `t13/ab.py side()` builds `mock-*.png`. The image model copies the motif's scale and colours
 * from a mockup (the A/B), so the scale is the point, and the canvas draws through the very same
 * function: what the person paints is what the model is shown.
 *
 * SCALE: mm per flat px of one side (`viewScale`), from the card's size chart when it says enough —
 * the half chest across the body on FRONT / BACK, else the garment length down the silhouette —
 * otherwise the silhouette stands for `GARMENT_WIDTH_MM` across and the scale is ESTIMATED.
 * A cloth with no stated repeat is a swatch picture: it stands for `SWATCH_MM` across.
 *
 * QW1 · the REMAINDER: unlabelled pixels inside the silhouette are the cloth the run lays there
 * (the first unpainted pack cloth) — full on the mockup, muted on the canvas.
 */
import type { common_MeasurementName, common_StyleSizeChart } from 'api/proto-http/admin';

import { clothMask, displayLabels, underLines } from './map-model';
import type { FlatRegions } from './regions';

/** The garment's width a silhouette stands for when the size chart says nothing, in mm. */
export const GARMENT_WIDTH_MM = 600;

/** A cloth picture with no stated repeat shows this much cloth across, in mm. */
export const SWATCH_MM = 100;

/**
 * Bumped whenever the mockup's drawing changes: a cached mockup of an older drawing is not reused.
 * v3 · the remainder never fills an opening.
 */
export const MOCKUP_REV = 'mockup.v3';

/** What the card's size chart says about the garment (0 = not said), in mm. */
export type Garment = { chestMm: number; lengthMm: number };
export const NO_GARMENT: Garment = { chestMm: 0, lengthMm: 0 };

/** One side's scale: mm per flat px, whether it is a guess, and the silhouette's width in mm. */
export type ViewScale = { mmPerPx: number; estimated: boolean; acrossMm: number };

/** A chart value in mm: under 300 it was typed in cm. */
const toMm = (v: number): number => (!(v > 0) ? 0 : v < 300 ? v * 10 : v);

/**
 * The garment of the size chart: the base size's chest (a girth over 800 mm is halved — a flat
 * shows half of it) and length. Without a base size, the middle size that carries the measurement.
 */
export function garmentOfChart(
  chart: Pick<common_StyleSizeChart, 'cells' | 'gradeBaseSizeId'> | undefined,
  names: readonly common_MeasurementName[] | undefined,
  baseSizeId = 0,
): Garment {
  const idOf = (name: string) =>
    (names ?? []).find((n) => (n.name ?? '').trim().toLowerCase() === name)?.id ?? 0;
  const base = baseSizeId || chart?.gradeBaseSizeId || 0;
  const valueOf = (nameId: number): number => {
    if (!nameId) return 0;
    const cells = (chart?.cells ?? [])
      .filter((c) => c.measurementNameId === nameId && Number(c.value?.value) > 0)
      .sort((a, b) => (a.sizeId ?? 0) - (b.sizeId ?? 0));
    const cell = cells.find((c) => c.sizeId === base) ?? cells[(cells.length - 1) >> 1];
    return toMm(Number(cell?.value?.value ?? 0));
  };
  const chest = valueOf(idOf('chest'));
  return { chestMm: chest > 800 ? chest / 2 : chest, lengthMm: valueOf(idOf('length')) };
}

/** The silhouette's box (px); an empty silhouette is the whole flat. */
export function silhouetteBox(flat: Pick<FlatRegions, 'silhouette' | 'w' | 'h'>) {
  const { w, h, silhouette } = flat;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0, i = 0; y < h; y += 1)
    for (let x = 0; x < w; x += 1, i += 1)
      if (silhouette[i]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  return x1 < 0 ? { x0: 0, y0: 0, w, h } : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * The body's width (px): the median of the longest silhouette run over the rows 35–55 % down —
 * below the armholes, where a sleeve stands apart from the body.
 */
function bodyWidthPx(flat: Pick<FlatRegions, 'silhouette' | 'w' | 'h'>): number {
  const box = silhouetteBox(flat);
  const runs: number[] = [];
  const ya = box.y0 + Math.round(box.h * 0.35);
  const yb = box.y0 + Math.round(box.h * 0.55);
  for (let y = ya; y <= yb; y += 1) {
    let best = 0;
    let run = 0;
    for (let x = 0, i = y * flat.w; x < flat.w; x += 1, i += 1) {
      run = flat.silhouette[i] ? run + 1 : 0;
      if (run > best) best = run;
    }
    if (best > 0) runs.push(best);
  }
  runs.sort((a, b) => a - b);
  return runs[runs.length >> 1] ?? 0;
}

/** The scale of one side: the chart's chest (FRONT / BACK), else its length, else estimated. */
export function viewScale(
  view: string,
  flat: Pick<FlatRegions, 'silhouette' | 'w' | 'h'>,
  garment: Garment = NO_GARMENT,
): ViewScale {
  const box = silhouetteBox(flat);
  const of = (mmPerPx: number, estimated: boolean): ViewScale => ({
    mmPerPx,
    estimated,
    acrossMm: Math.round(mmPerPx * box.w),
  });
  if (garment.chestMm > 0 && (view === 'front' || view === 'back')) {
    const body = bodyWidthPx(flat);
    if (body > 0) return of(garment.chestMm / body, false);
  }
  if (garment.lengthMm > 0 && box.h > 0) return of(garment.lengthMm / box.h, false);
  return of(GARMENT_WIDTH_MM / Math.max(1, box.w), true);
}

/** A cloth tile's width on a flat, in px (never under 2): its repeat, or a swatch's width. */
export function clothTilePx(repeatMm: number, mmPerPx: number): number {
  const mm = repeatMm > 0 ? repeatMm : SWATCH_MM;
  return Math.max(2, Math.round(mm / Math.max(1e-6, mmPerPx)));
}

const mod = (n: number, m: number) => ((n % m) + m) % m;

/** The pixel of a tile laid `tilePx` wide at (x, y) — the canvas and the mockup both read this. */
export function tileSampler(rgba: Uint8ClampedArray, w: number, h: number, tilePx: number) {
  const tw = Math.max(1, tilePx);
  const th = Math.max(1, Math.round((tilePx * h) / w));
  return (x: number, y: number, out: Uint8ClampedArray | number[], p: number) => {
    const sx = Math.min(w - 1, Math.floor((mod(x, tw) / tw) * w));
    const sy = Math.min(h - 1, Math.floor((mod(y, th) / th) * h));
    const q = (sy * w + sx) * 4;
    out[p] = rgba[q];
    out[p + 1] = rgba[q + 1];
    out[p + 2] = rgba[q + 2];
  };
}

/** What one label is filled with: a tile (its own RGBA, laid `tilePx` wide) or a flat colour. */
export type MockupSkin =
  | { kind: 'tile'; rgba: Uint8ClampedArray; w: number; h: number; tilePx: number }
  | { kind: 'colour'; hex: string };

const rgbOf = (hex: string): [number, number, number] => {
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** A skin as a pixel function. */
function skinSampler(skin: MockupSkin) {
  if (skin.kind === 'tile') return tileSampler(skin.rgba, skin.w, skin.h, skin.tilePx);
  const c = rgbOf(skin.hex);
  return (_x: number, _y: number, out: Uint8ClampedArray | number[], p: number) => {
    out[p] = c[0];
    out[p + 1] = c[1];
    out[p + 2] = c[2];
  };
}

/**
 * The mockup RGBA of one side: `labels` (packed #rrggbb per pixel, 0 = unpainted) over `flat`,
 * `flatRgba` the flat's own pixels at the same size, `skins` by packed label. `remainder` fills
 * the unpainted inside of the silhouette (QW1); without it, and for a label without a skin, paper.
 */
export function mockupPixels(
  flat: Pick<FlatRegions, 'labels' | 'silhouette' | 'w' | 'h' | 'openings'> & { ink?: Uint8Array },
  labels: Uint32Array,
  flatRgba: Uint8ClampedArray,
  skins: ReadonlyMap<number, MockupSkin>,
  remainder?: MockupSkin | null,
): Uint8ClampedArray {
  const { w } = flat;
  const shown = displayLabels(labels, underLines(flat));
  const out = new Uint8ClampedArray(shown.length * 4);
  const samplers = new Map<number, ReturnType<typeof skinSampler> | null>();
  const rest = remainder ? skinSampler(remainder) : null;
  const cloth = rest ? clothMask(flat) : null;
  const px = [255, 255, 255];
  for (let i = 0, p = 0; i < shown.length; i += 1, p += 4) {
    // The flat's line over white paper: the multiplier.
    const a = flatRgba[p + 3] / 255;
    const lr = (flatRgba[p] * a + 255 * (1 - a)) / 255;
    const lg = (flatRgba[p + 1] * a + 255 * (1 - a)) / 255;
    const lb = (flatRgba[p + 2] * a + 255 * (1 - a)) / 255;
    const v = shown[i];
    let s = samplers.get(v);
    if (s === undefined) {
      const skin = v ? skins.get(v) : undefined;
      s = skin ? skinSampler(skin) : null;
      samplers.set(v, s);
    }
    if (!s && !v && rest && cloth?.[i]) s = rest;
    if (s) s(i % w, (i / w) | 0, px, 0);
    else px[0] = px[1] = px[2] = 255;
    out[p] = px[0] * lr;
    out[p + 1] = px[1] * lg;
    out[p + 2] = px[2] * lb;
    out[p + 3] = 255;
  }
  return out;
}
