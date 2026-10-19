// CODE lane · "name N pieces" — ONE click gives every piece blocked 'grammar' (nothing names it, or
// its name breaks the code rule) or 'duplicate-identity' (two different pieces read the same code) a
// code of its own. The codes are the autopilot's (`deterministicCodes`: P01, P02 … in the sheet's
// reading order, never an identity already written, never a size token of the run), so the wizard
// and the autopilot name a file alike. What the source said is kept: its own words (a printed
// title, the DXF block name) become the display name; a bare number ("3", "67") reads «piece 3».
//
// Never a merge: every seed gets its own code — except the two hands of a DRAWN pair (FP_L beside
// FP_R), which get ONE code with their hands, so they stay one pair (renamed apart, each hand
// would be re-read alone, a pair of its own — a doubled cut); a hand asked for a code takes its
// twin along even when the twin is blocked for another reason only.
//
// Each name stays editable in the table; the operator's click makes them the operator's.
// Main-thread safe: plain data.
import type { BoxMm, PairHand, SemanticsOutput, SeedId } from 'lib/pattern-import/types';
import { deterministicCodes } from './autopilot/names';

type Blocked = SemanticsOutput['blocked'][number];

/** Blocked reasons a code answers. */
export const CODE_REASONS: ReadonlySet<string> = new Set(['grammar', 'duplicate-identity']);

export type BulkName = { code: string; mods: string[]; displayName: string };

/** The pieces "name N pieces" answers: one entry per seed (a pair's two specs block it twice). */
export function codeBlocked(blocked: readonly Blocked[]): Blocked[] {
  const out = new Map<SeedId, Blocked>();
  for (const b of blocked) {
    if (!CODE_REASONS.has(b.reason)) continue;
    const prev = out.get(b.seed);
    if (!prev || (!prev.name && b.name)) out.set(b.seed, b);
  }
  return [...out.values()];
}

const opposite = (h: PairHand | null | undefined): PairHand | null =>
  h === 'L' ? 'R' : h === 'R' ? 'L' : null;

/** A display name from the source's words; a bare number is «piece n», nothing at all → null. */
function displayOf(source: string | null | undefined): string | null {
  const s = (source ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!s) return null;
  return /^\d+[.]?$/.test(s) ? `piece ${s.replace(/\.$/, '')}` : s;
}

/**
 * Codes for every piece `blocked` names for a code. `boxOf` = the piece's box on the sheet (its
 * reading order); a seed without one is left out (typed by hand). `taken` = the identities already
 * written (any case); `cardTokens` = the card's size run. `sourceOf` = the seed's own text when
 * semantics read none (the wizard's seed label).
 */
export function bulkNames(
  blocked: readonly Blocked[],
  boxOf: (seed: SeedId) => BoxMm | null | undefined,
  taken: Iterable<string>,
  cardTokens: readonly string[],
  sourceOf?: (seed: SeedId) => string | null | undefined,
): Map<SeedId, BulkName> {
  const want = codeBlocked(blocked);
  // a drawn hand asked while its twin waits on another answer (a grainline): the twin is renamed
  // WITH it — one code, both hands — or the asked hand would be re-read alone (Codex CODE-1)
  const asked = new Set(want.map((b) => b.seed));
  for (const b of [...want]) {
    const n = b.name;
    if (!n?.hand || n.twin == null || asked.has(n.twin)) continue;
    asked.add(n.twin);
    want.push({
      seed: n.twin,
      reason: b.reason,
      detail: `the other hand of piece ${b.seed}`,
      name: { source: n.source, hand: opposite(n.hand), twin: b.seed },
    });
  }
  const bySeed = new Map(want.map((b) => [b.seed, b] as const));
  // a drawn pair: both hands asked, each naming the other as its twin, opposite hands
  const twinOf = new Map<SeedId, SeedId>();
  for (const b of want) {
    const n = b.name;
    if (!n?.hand || n.twin == null) continue;
    const t = bySeed.get(n.twin)?.name;
    if (t && t.twin === b.seed && t.hand === opposite(n.hand)) twinOf.set(b.seed, n.twin);
  }
  // one code per pair: the pair is placed by its lower seed, at the box of both hands
  const lead = (sd: SeedId) => Math.min(sd, twinOf.get(sd) ?? sd);
  const boxes = new Map<SeedId, BoxMm>();
  for (const b of want) {
    const bx = boxOf(b.seed);
    if (!bx) continue;
    const k = lead(b.seed);
    const prev = boxes.get(k);
    boxes.set(
      k,
      prev
        ? {
            minX: Math.min(prev.minX, bx.minX),
            minY: Math.min(prev.minY, bx.minY),
            maxX: Math.max(prev.maxX, bx.maxX),
            maxY: Math.max(prev.maxY, bx.maxY),
          }
        : bx,
    );
  }
  // a pair whose other hand has no box is not a pair here: both are left to the operator
  for (const [a, b] of twinOf)
    if (!boxOf(a) || !boxOf(b)) {
      boxes.delete(lead(a));
      twinOf.delete(a);
      twinOf.delete(b);
    }
  const codes = deterministicCodes(
    [...boxes].map(([seed, box]) => ({ seed, box })),
    taken,
    cardTokens,
  );
  const out = new Map<SeedId, BulkName>();
  for (const b of want) {
    const code = codes.get(lead(b.seed));
    if (!code) continue;
    const paired = twinOf.has(b.seed);
    out.set(b.seed, {
      code,
      mods: paired && b.name?.hand ? [b.name.hand] : [],
      displayName:
        displayOf(b.name?.source) ?? displayOf(sourceOf?.(b.seed)) ?? `piece ${code.slice(1)}`,
    });
  }
  return out;
}
