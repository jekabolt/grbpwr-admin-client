// RASTER · crop to what the page shows + area resampling, row by row (memory = two output rows).
//
// A window [x0, x1) × [y0, y1) of a source image (integer pixels) becomes an outW × outH image whose
// pixel (i, j) is the AREA MEAN of the source rectangle [x0 + i·kx, x0 + (i+1)·kx) ×
// [y0 + j·ky, y0 + (j+1)·ky), kx = (x1 − x0)/outW ≥ 1, ky = (y1 − y0)/outH ≥ 1. The map from output
// pixels to source pixels is therefore EXACTLY `windowAffine` — composed into `pxToPage`, mm per
// pixel stays true and the tracer's lengths are unchanged by the resampling. outW = ⌊(x1−x0)/k⌋
// leaves at most one output pixel's sliver of the window's right/bottom edge unread.
//
// RGBA input is composited over white (as the tracer does) and comes out RGB.

import type { Affine } from '../../types';

export type Window = { x0: number; y0: number; x1: number; y1: number };

/** Output pixel → source pixel of a window read at outW × outH. */
export function windowAffine(win: Window, outW: number, outH: number): Affine {
  return {
    a: (win.x1 - win.x0) / outW,
    b: 0,
    c: 0,
    d: (win.y1 - win.y0) / outH,
    e: win.x0,
    f: win.y0,
  };
}

/** Streaming area resampler: push the window's source rows in order (each already cut to x0..x1). */
export class AreaResampler {
  readonly out: Uint8Array;
  readonly outCh: 1 | 3;
  private readonly kx: number;
  private readonly ky: number;
  private readonly norm: number;
  private readonly col0: Int32Array;
  private readonly w0: Float32Array;
  private cur: Float32Array;
  private nxt: Float32Array;
  private readonly hrow: Float32Array;
  private j = 0;
  private y = 0;
  private readonly identity: boolean;

  constructor(
    private readonly winW: number,
    private readonly winH: number,
    readonly outW: number,
    readonly outH: number,
    private readonly ch: 1 | 3 | 4,
  ) {
    this.outCh = ch === 1 ? 1 : 3;
    this.out = new Uint8Array(outW * outH * this.outCh);
    this.kx = winW / outW;
    this.ky = winH / outH;
    this.norm = 1 / (this.kx * this.ky);
    this.identity = outW === winW && outH === winH && ch !== 4;
    // each source column feeds at most two output columns (kx ≥ 1)
    this.col0 = new Int32Array(winW);
    this.w0 = new Float32Array(winW);
    for (let x = 0; x < winW; x++) {
      const o = Math.floor(x / this.kx);
      this.col0[x] = o;
      const edge = (o + 1) * this.kx;
      this.w0[x] = x + 1 <= edge ? 1 : edge - x;
    }
    const n = outW * this.outCh;
    this.cur = new Float32Array(n);
    this.nxt = new Float32Array(n);
    this.hrow = new Float32Array(n);
  }

  /** Rows received so far. */
  get rows(): number {
    return this.y;
  }

  push(row: Uint8Array | Uint8ClampedArray): void {
    const y = this.y++;
    if (y >= this.winH) return;
    const { ch, outCh, outW } = this;
    if (this.identity) {
      this.out.set(row.subarray(0, outW * ch), y * outW * ch);
      return;
    }
    const j = Math.floor(y / this.ky);
    if (j >= this.outH) return;
    // horizontal: area weights into hrow
    const h = this.hrow;
    h.fill(0);
    for (let x = 0; x < this.winW; x++) {
      const o = this.col0[x];
      const w = this.w0[x];
      let r: number;
      let g: number;
      let b: number;
      const p = x * ch;
      if (ch === 1) r = g = b = row[p];
      else if (ch === 3) {
        r = row[p];
        g = row[p + 1];
        b = row[p + 2];
      } else {
        const a = row[p + 3] / 255;
        r = row[p] * a + 255 * (1 - a);
        g = row[p + 1] * a + 255 * (1 - a);
        b = row[p + 2] * a + 255 * (1 - a);
      }
      if (o < outW) {
        if (outCh === 1) h[o] += w * r;
        else {
          h[o * 3] += w * r;
          h[o * 3 + 1] += w * g;
          h[o * 3 + 2] += w * b;
        }
      }
      if (w < 1 && o + 1 < outW) {
        const w1 = 1 - w;
        if (outCh === 1) h[o + 1] += w1 * r;
        else {
          h[(o + 1) * 3] += w1 * r;
          h[(o + 1) * 3 + 1] += w1 * g;
          h[(o + 1) * 3 + 2] += w1 * b;
        }
      }
    }
    // vertical: this row's share of output rows j and j + 1
    if (j !== this.j) this.flushTo(j);
    const edge = (j + 1) * this.ky;
    const wy = y + 1 <= edge ? 1 : edge - y;
    const cur = this.cur;
    for (let k = 0; k < h.length; k++) cur[k] += wy * h[k];
    if (wy < 1) {
      const nx = this.nxt;
      const w1 = 1 - wy;
      for (let k = 0; k < h.length; k++) nx[k] += w1 * h[k];
    }
  }

  /** Emit every complete output row before `j` (call `finish` after the last source row). */
  private flushTo(j: number): void {
    while (this.j < j && this.j < this.outH) {
      this.emit(this.j, this.cur);
      const t = this.cur;
      this.cur = this.nxt;
      this.nxt = t;
      this.nxt.fill(0);
      this.j++;
    }
  }

  private emit(j: number, acc: Float32Array): void {
    const base = j * acc.length;
    for (let k = 0; k < acc.length; k++) {
      const v = acc[k] * this.norm;
      this.out[base + k] = v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
    }
  }

  /** The image; throws when the source ran out before the window's last row. */
  finish(): { data: Uint8Array; width: number; height: number; channels: 1 | 3 } {
    const need = this.identity ? this.winH : Math.ceil(this.outH * this.ky - 1e-9);
    if (this.y < need)
      throw new Error(`raster: the image data ended at row ${this.y} of ${need}`);
    if (!this.identity) this.flushTo(this.outH);
    return { data: this.out, width: this.outW, height: this.outH, channels: this.identity ? (this.ch as 1 | 3) : this.outCh };
  }
}

/** Crop + resample an image already in memory (pdf.js decoded it). */
export function resampleInMemory(
  src: { data: Uint8Array | Uint8ClampedArray; width: number; channels: 1 | 3 | 4 },
  win: Window,
  outW: number,
  outH: number,
): { data: Uint8Array; width: number; height: number; channels: 1 | 3 } {
  const r = new AreaResampler(win.x1 - win.x0, win.y1 - win.y0, outW, outH, src.channels);
  const ch = src.channels;
  for (let y = win.y0; y < win.y1; y++) {
    const at = (y * src.width + win.x0) * ch;
    r.push(src.data.subarray(at, at + (win.x1 - win.x0) * ch));
  }
  return r.finish();
}
