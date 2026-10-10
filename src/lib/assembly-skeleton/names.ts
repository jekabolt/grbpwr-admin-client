// Piece names as words — shared by the geometry (lane A) and the skeleton (lane B), so a name says
// the same thing to both: tokens are any letters or digits (Latin, Cyrillic, Polish), lower-cased.

import roles from './skeleton/templates/roles.json';

/** Whole tokens of a piece name, case-insensitive: `FP_1_L` → fp, 1, l; `Рукав лев` → рукав, лев. */
export function nameTokens(name: string): string[] {
  return (name ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

const LINING_TOKENS: ReadonlySet<string> = new Set(
  (roles as { liningTokens?: string[] }).liningTokens ?? [],
);

/** The name calls the piece lining (`LIN_FRONT_L`, `подклад спинки`, `podszewka przód`). */
export function liningByName(name: string): boolean {
  return nameTokens(name).some((t) => LINING_TOKENS.has(t.replace(/^\d+|\d+$/g, '')));
}

export function isLiningToken(token: string): boolean {
  return LINING_TOKENS.has(token);
}
