// The step picker's inks — ui-kit tokens only (owner 26.10: «наши цвета из ui кита»): side A is the
// highlight accent, side B plain ink, a stored pair the success token, so it never reads as A or B.

/** A stored pair's colour (one token for every pair; the number tells pairs apart). */
export const PAIR_INK = 'var(--color-success)';

export const SIDE_INK = {
  a: 'var(--color-highlightColor)',
  b: 'var(--color-textColor)',
} as const;

/** Piece outline and fill in the picker. */
export const PIECE_INK = {
  line: 'var(--color-labelColor)',
  fill: 'var(--color-pageBg)',
  inner: 'var(--color-borderColor)',
  code: 'var(--color-textColor)',
} as const;

/** 1 for 0, 2 for 1 … — the digit drawn inside the pair circle. */
export const pairNo = (i: number) => String(i + 1);
