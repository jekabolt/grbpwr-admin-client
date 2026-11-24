import { describe, expect, it } from 'vitest';

import { dilateColumns, dilateSquare, Grid, maskBox, openMask } from './raster';

// The fast raster primitives against naive references, on random masks: a speed change must not
// move a pixel (the fill reacts far from a moved wall).
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

function randomMask() {
  const W = 3 + Math.floor(rnd() * 50);
  const H = 3 + Math.floor(rnd() * 50);
  const g = new Grid({ minX: 0, minY: 0, maxX: W - 2, maxY: H - 2 }, 1);
  const dens = rnd() * 0.6;
  const m = new Uint8Array(g.W * g.H).map(() => (rnd() < dens ? 1 : 0));
  return { g, m, r: 1 + Math.floor(rnd() * 3) };
}

function naiveDilate(g: Grid, m: Uint8Array, r: number, square: boolean) {
  const out = new Uint8Array(m.length);
  for (let y = 0; y < g.H; y++)
    for (let x = 0; x < g.W; x++) {
      if (!m[y * g.W + x]) continue;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = square ? -r : 0; dx <= (square ? r : 0); dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < g.W && yy < g.H) out[yy * g.W + xx] = 1;
        }
    }
  return out;
}

function naiveBox(g: Grid, m: Uint8Array) {
  let x0 = g.W;
  let y0 = g.H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < g.H; y++)
    for (let x = 0; x < g.W; x++)
      if (m[y * g.W + x]) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  return { x0, y0, x1, y1 };
}

describe('raster primitives', () => {
  it('dilations and the mask box match the naive versions', () => {
    for (let t = 0; t < 500; t++) {
      const { g, m, r } = randomMask();
      if (t % 5 === 0) m.fill(0);
      const box = naiveBox(g, m);
      expect(maskBox(g, m)).toEqual(box);
      expect(dilateSquare(g, m, r)).toEqual(naiveDilate(g, m, r, true));
      const col = naiveDilate(g, m, r, false);
      expect(dilateColumns(g, m, r)).toEqual(col);
      if (box.x1 >= 0) expect(dilateColumns(g, m, r, box)).toEqual(col);
    }
  });

  it('opening removes a 1-px spur and keeps the seed component', () => {
    const g = new Grid({ minX: 0, minY: 0, maxX: 30, maxY: 30 }, 1);
    const m = new Uint8Array(g.W * g.H);
    for (let y = 5; y < 20; y++) for (let x = 5; x < 20; x++) m[y * g.W + x] = 1;
    for (let x = 20; x < 28; x++) m[12 * g.W + x] = 1; // spur
    const o = openMask(g, m, 1, 10 * g.W + 10);
    expect(o[12 * g.W + 25]).toBe(0);
    expect(o[10 * g.W + 10]).toBe(1);
    expect(o.reduce((a, v) => a + v, 0)).toBe(15 * 15);
  });
});
