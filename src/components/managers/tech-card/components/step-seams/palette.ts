// The step picker's inks (mockup M1, owner OK 26.10): side A blue, side B orange, and one colour per
// stored pair by its number. Data, not design tokens — the picker draws pieces, not chrome.

/** A pair's colour by its 0-based number in the step (wraps after five). */
export const PAIR_INK = ['#2f6fed', '#e0662b', '#1f9d6b', '#b54ac4', '#c99a00'] as const;
export const pairInk = (i: number) =>
  PAIR_INK[((i % PAIR_INK.length) + PAIR_INK.length) % PAIR_INK.length];

export const SIDE_INK = { a: '#2f6fed', b: '#e0662b' } as const;

/** Piece outline and fill in the picker (the drawing's own grey, not the page's). */
export const PIECE_INK = {
  line: '#555555',
  fill: '#f4f4f4',
  inner: '#9a9a9a',
  code: '#222222',
} as const;

const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
/** ① for 0, ② for 1 … plain «21» past twenty. */
export const pairNo = (i: number) => (i >= 0 && i < CIRCLED.length ? CIRCLED[i] : String(i + 1));
