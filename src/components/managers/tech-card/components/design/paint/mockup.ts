/**
 * PAINT THE PARTS · the cloth mockup of one painted side (T13, R8).
 *
 * At GENERATE every outgoing map gets a picture of its flat with each labelled part filled with
 * its cloth's tile AT THE CLOTH'S TRUE REPEAT, the fill running under the lines (the canvas's
 * nearest-label rule), the flat's own line art multiplied on top, white outside the silhouette —
 * as `t13/ab.py side()` builds `mock-*.png`. The image model copies the motif's scale and colours
 * from a mockup (the A/B), so the scale is the point: tile px = repeatMm / garment width mm × flat
 * width px.
 */
import { displayLabels, underLines } from './map-model';
import type { FlatRegions } from './regions';

/**
 * The garment's width the flat's width stands for, in mm.
 * TODO(T13): read it from the card's size chart (chest / body width of the base size).
 */
export const GARMENT_WIDTH_MM = 600;

/** A cloth with no stated repeat shows 8 repeats across the flat. */
export const UNSTATED_REPEATS = 8;

/** The tile's width on this flat, in px (never under 2). */
export function mockupTilePx(
  repeatMm: number,
  flatWidthPx: number,
  garmentWidthMm = GARMENT_WIDTH_MM,
): number {
  const px =
    repeatMm > 0 && garmentWidthMm > 0
      ? (repeatMm / garmentWidthMm) * flatWidthPx
      : flatWidthPx / UNSTATED_REPEATS;
  return Math.max(2, Math.round(px));
}

/** What one label is filled with: a tile (its own RGBA, laid `tilePx` wide) or a flat colour. */
export type MockupSkin =
  | { kind: 'tile'; rgba: Uint8ClampedArray; w: number; h: number; tilePx: number }
  | { kind: 'colour'; hex: string };

const rgbOf = (hex: string): [number, number, number] => {
  const v = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0;
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/**
 * The mockup RGBA of one side: `labels` (packed #rrggbb per pixel, 0 = paper) over `flat`,
 * `flatRgba` the flat's own pixels at the same size, `skins` by packed label. A label without a
 * skin stays paper.
 */
export function mockupPixels(
  flat: Pick<FlatRegions, 'labels' | 'silhouette' | 'w' | 'h'>,
  labels: Uint32Array,
  flatRgba: Uint8ClampedArray,
  skins: ReadonlyMap<number, MockupSkin>,
): Uint8ClampedArray {
  const { w, h } = flat;
  const shown = displayLabels(labels, underLines(flat));
  const out = new Uint8ClampedArray(w * h * 4);
  const colours = new Map<number, [number, number, number]>();
  for (let i = 0, p = 0; i < shown.length; i += 1, p += 4) {
    // The flat's line over white paper: the multiplier.
    const a = flatRgba[p + 3] / 255;
    const lr = (flatRgba[p] * a + 255 * (1 - a)) / 255;
    const lg = (flatRgba[p + 1] * a + 255 * (1 - a)) / 255;
    const lb = (flatRgba[p + 2] * a + 255 * (1 - a)) / 255;
    let r = 255;
    let g = 255;
    let b = 255;
    const v = shown[i];
    const skin = v ? skins.get(v) : undefined;
    if (skin?.kind === 'tile') {
      const x = i % w;
      const y = (i / w) | 0;
      const tw = skin.tilePx;
      const th = Math.max(1, Math.round((skin.tilePx * skin.h) / skin.w));
      const sx = Math.min(skin.w - 1, Math.floor(((x % tw) / tw) * skin.w));
      const sy = Math.min(skin.h - 1, Math.floor(((y % th) / th) * skin.h));
      const q = (sy * skin.w + sx) * 4;
      r = skin.rgba[q];
      g = skin.rgba[q + 1];
      b = skin.rgba[q + 2];
    } else if (skin?.kind === 'colour') {
      let c = colours.get(v);
      if (!c) {
        c = rgbOf(skin.hex);
        colours.set(v, c);
      }
      [r, g, b] = c;
    }
    out[p] = r * lr;
    out[p + 1] = g * lg;
    out[p + 2] = b * lb;
    out[p + 3] = 255;
  }
  return out;
}
