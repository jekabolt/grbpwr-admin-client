// The step picker's inks (mockup M1, owner OK 26.10): side A blue, side B orange while picking;
// a stored pair is drawn in the success token so it never reads as side A or B.

/** A stored pair's colour (one token for every pair; the number tells pairs apart). */
export const PAIR_INK = 'var(--color-success)';

export const SIDE_INK = { a: '#2f6fed', b: '#e0662b' } as const;

/** Piece outline and fill in the picker (the drawing's own grey, not the page's). */
export const PIECE_INK = {
  line: '#555555',
  fill: '#f4f4f4',
  inner: '#9a9a9a',
  code: '#222222',
} as const;

/** 1 for 0, 2 for 1 … — the digit drawn inside the pair circle. */
export const pairNo = (i: number) => String(i + 1);
