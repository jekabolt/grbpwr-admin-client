// The step picture's inks — ui-kit tokens only (owner 26.10: «наши цвета из ui кита»; 27.10: no green
// anywhere). A stored pair is plain ink; its number tells pairs apart.

/** A stored pair's colour (one token for every pair). */
export const PAIR_INK = 'var(--color-textColor)';

/** 1 for 0, 2 for 1 … — the digit drawn inside the pair box. */
export const pairNo = (i: number) => String(i + 1);
