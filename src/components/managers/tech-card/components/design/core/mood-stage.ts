/**
 * ═══ THE STAGE OF THE MOODBOARD STEP ON A GUIDED CARD — DERIVED, NEVER STORED (onboarding S5) ═══
 *
 * The owner: «когда мы в первый раз заходим на экран мудборд у нас не должно быть блоков
 * DESCRIPTION GENERAL INFORMATION MATERIAL SLOTS COLOURWAYS … нас встречает просто мудборд». The
 * face of the step follows the card's own data, the way the rest of the chain does (`stepDone`,
 * `nextUp`): a second user, a reload or a second tab land on the same face, because the inputs are
 * the server's answers and the form, not a flag somebody forgot to flip.
 *
 *   built            → 'full'       everything, and `go to flats ›`
 *   a description    → 'described'  + DESCRIPTION with `next ✦`
 *   an answer        → 'asked'      + `ask more ✦ / next ✦` in the quiz row
 *   a board picture  → 'unasked'    ASK ME live, the callouts panel beside the board
 *   nothing          → 'empty'      the board alone, its first tile saying what goes there
 *
 * A block with content is never hidden: whatever the draft (or a person) wrote into the lower
 * blocks makes the card `built`. The face only ever moves forward on a mount — `guideShow` folds in
 * the reveal latch, so a description emptied for a retype does not take its own block away.
 */
export type MoodStage = 'empty' | 'unasked' | 'asked' | 'described' | 'full';

const RANK: Record<MoodStage, number> = { empty: 0, unasked: 1, asked: 2, described: 3, full: 4 };

export function moodStage(x: {
  /** Pictures ON THE BOARD (`isBoardRow`), not the legacy input rows. */
  pictures: number;
  concept: string | null | undefined;
  /** Quiz answers that are not skips. */
  answered: number;
  built: boolean;
}): MoodStage {
  if (x.built) return 'full';
  if ((x.concept ?? '').trim()) return 'described';
  if (x.answered > 0) return 'asked';
  if (x.pictures > 0) return 'unasked';
  return 'empty';
}

/**
 * «The lower blocks hold something» — what the construction draft writes (aspects, material slots,
 * colourways, its journal) or a person typed there. `fit` is NOT in it: it is a style fact edited on
 * CARD DETAILS, picked before the board exists, and counting it would skip the whole guide for
 * anyone who set the fit on the first step. A journal entry of the DESCRIPTION alone is not either:
 * that is the quiz's `next ✦`, the step before the blocks.
 */
export function moodBuilt(x: {
  details: number;
  bomItems: number;
  /** Colourways the draft proposed (the card's memory) and the ones saved on the card. */
  colourways: number;
  /** Journal entries of the draft that are not the description. */
  fills: number;
}): boolean {
  return x.details > 0 || x.bomItems > 0 || x.colourways > 0 || x.fills > 0;
}

/** What this mount has already shown: nothing, the DESCRIPTION, or every block. */
export type GuideLatch = 'none' | 'description' | 'blocks';

const LATCH_RANK: Record<GuideLatch, number> = { none: 0, description: 3, blocks: 4 };

export type GuideShow = {
  /** The callouts panel beside the board — nothing to pin on an empty board. */
  callouts: boolean;
  /** DESCRIPTION (with the draft's row). */
  description: boolean;
  /** GENERAL INFORMATION, CONSTRUCTION, MATERIAL SLOTS, COLOURWAYS — and the `go to flats ›` footer. */
  blocks: boolean;
};

export const SHOW_ALL: GuideShow = { callouts: true, description: true, blocks: true };

export function guideShow(stage: MoodStage, latch: GuideLatch = 'none'): GuideShow {
  const at = Math.max(RANK[stage], LATCH_RANK[latch]);
  return {
    callouts: at >= RANK.unasked,
    description: at >= RANK.described,
    blocks: at >= RANK.full,
  };
}

/** The latch a stage earns by being on screen (a face never steps back on this mount). */
export function latchOf(stage: MoodStage): GuideLatch {
  return stage === 'full' ? 'blocks' : stage === 'described' ? 'description' : 'none';
}

export function latchAtLeast(have: GuideLatch, want: GuideLatch): boolean {
  return LATCH_RANK[have] >= LATCH_RANK[want];
}
