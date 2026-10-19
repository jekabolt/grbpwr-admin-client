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

// ── unreadable names ────────────────────────────────────────────────────────────────────────────
// A name stored as UTF-8 read back as Latin-1 / cp1252 (and sometimes saved again) arrives as
// «Ð?Ð _8» — the bytes of «Рукав» with the lost ones turned into «?». Nothing can be read back
// from it reliably, so it is not guessed at: the piece is shown as unnamed, in words, with the part
// of its name that IS readable (the trailing «8»). The card's data is never changed.

/** UTF-8 lead bytes seen as Latin-1 (Ð Ñ = Cyrillic, Ã Â = Latin) followed by what a continuation byte became. */
const CP1252_CONT = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
const MOJIBAKE = new RegExp(
  `[\\u00D0\\u00D1][\\u0080-\\u00BF?\\s${CP1252_CONT}]|[\\u00C2\\u00C3][\\u0080-\\u00BF${CP1252_CONT}]|\\uFFFD`,
  'u',
);

/** The name is double-encoded UTF-8 (mojibake): its letters cannot be read. */
export function isUnreadableName(name: string): boolean {
  return MOJIBAKE.test(name ?? '');
}

/**
 * The name as the screens show it: as written, or «unnamed piece 8 (name unreadable)» when it is
 * mojibake — the readable tail (digits / Latin after the last garbled character) keeps two such
 * pieces apart.
 */
export function readablePieceName(name: string): string {
  if (!isUnreadableName(name)) return name;
  const tail = (name.match(/[A-Za-z0-9][A-Za-z0-9_\- ]*$/)?.[0] ?? '')
    .replace(/^[_\-\s]+|[_\-\s]+$/g, '')
    .replace(/_/g, ' ');
  return `unnamed piece${tail ? ` ${tail}` : ''} (name unreadable)`;
}

// ── unit names ──────────────────────────────────────────────────────────────────────────────────

const plural = (w: string) => (/s$/i.test(w) ? w : `${w}s`);

/**
 * A unit name tidied for the screen and the card: a clause repeated by attaching twice
 * («Left front with pocket with pocket») is said once in the plural («Left front with pockets»),
 * and a piece CODE lower-cased into a phrase («Lining mP_LIN_L_1») keeps its capital.
 */
export function tidyUnitName(name: string): string {
  let out = name ?? '';
  // «X with pocket with pocket» → «X with pockets» (any run of the same clause).
  for (;;) {
    const next = out.replace(
      / with ([^,]+?)((?: with \1)+)(?= with |, |$| ×\d)/i,
      (_m, w) => ` with ${plural(w)}`,
    );
    if (next === out) break;
    out = next;
  }
  // «Lining mP_LIN_L_1»: a lower-cased first letter of a CODE (capitals and digits up to a «_» or
  // a digit) was a capital.
  out = out.replace(
    /(^|\s)([a-z])(?=[A-Z0-9]*[_0-9])/g,
    (_m, sp: string, c: string) => sp + c.toUpperCase(),
  );
  return out;
}
