// A10 · AUTOPILOT — a name for a piece nothing names (no AI answer, no DXF block, no sheet text).
//
// Deterministic codes P01, P02 … in reading order of the sheet (top row first, left to right; the
// sheet frame is y-up). A code is ONE word of the G11 grammar — never `P_1` (a `_1` reads as a part
// number mod) and never a token of the card's size run (a single-token identity is never read as
// ending in a size, and `identityProblem` is asked anyway, with the gate's own rules).
import { identityProblem, sizeTokenTest } from 'lib/pattern-import/manifest';
import type { BoxMm, SeedId } from 'lib/pattern-import/types';

/** Reading order: rows of ~150 mm from the top, then left to right. */
export function readingOrder<T extends { seed: SeedId; box: BoxMm }>(xs: readonly T[]): T[] {
  const ROW = 150;
  const top = Math.max(...xs.map((x) => x.box.maxY));
  const row = (x: T) => Math.floor((top - (x.box.maxY + x.box.minY) / 2) / ROW);
  return [...xs].sort(
    (a, b) =>
      row(a) - row(b) ||
      (a.box.minX + a.box.maxX) / 2 - (b.box.minX + b.box.maxX) / 2 ||
      a.seed - b.seed,
  );
}

/**
 * Codes for `want` (in reading order), skipping every identity already taken (any case) and any
 * that the G11 rule refuses for this card's run.
 */
export function deterministicCodes(
  want: readonly { seed: SeedId; box: BoxMm }[],
  taken: Iterable<string>,
  cardTokens: readonly string[],
): Map<SeedId, string> {
  // a written pair P01_L / P01_R takes the code P01 too (CODE lane: zhaket «6.» was given P01 next
  // to piece 3's P01_L/P01_R and blocked as a duplicate again, pass after pass)
  const used = new Set(
    [...taken].flatMap((t) => {
      const w = t.toUpperCase().split('_');
      return w.map((_, i) => w.slice(0, i + 1).join('_'));
    }),
  );
  const isSizeToken = sizeTokenTest(cardTokens);
  const out = new Map<SeedId, string>();
  let n = 1;
  for (const w of readingOrder(want)) {
    for (;;) {
      const code = `P${String(n++).padStart(2, '0')}`;
      if (used.has(code) || isSizeToken(code)) continue;
      if (identityProblem(code, { isSizeToken })) continue;
      used.add(code);
      out.set(w.seed, code);
      break;
    }
  }
  return out;
}
