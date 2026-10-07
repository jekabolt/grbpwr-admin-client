import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useCallback, useEffect, useLayoutEffect, useSyncExternalStore } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { FIELD_REVEAL_EVENT, type FieldRevealDetail } from 'utils/field-errors';

import type { TechCardFormData } from '../schema';
import { stepOfField } from './core/chain';
import { isBoardRow } from './core/mood-gate';
import {
  SHOW_ALL,
  guideShow,
  latchAtLeast,
  latchOf,
  moodBuilt,
  moodStage,
  type GuideLatch,
  type GuideShow,
  type MoodStage,
} from './core/mood-stage';
import { useCardMemory } from './head/use-draft-fills';
import { useDesignQuizAnswers } from './use-design-band';

/**
 * ═══ THE GUIDED FACE OF THE MOODBOARD STEP (onboarding S5) ══════════════════════════════════════
 *
 * One hook, called once by the composer (`studio-tab.tsx`), whose answer goes down as a prop: the
 * board hides its callouts panel and DESCRIPTION by it, the quiz draws its batch-end pair by it, the
 * draft relabels its GENERATE by it, and the composer hides the four lower blocks and the footer by
 * it. A second reader computing its own stage could put a face on screen that the next block
 * contradicts.
 *
 * The stage is DERIVED (`core/mood-stage.ts`). The one thing kept beside it is the LATCH — how far
 * this face has already opened on this card in this tab — so a face never steps back under a hand:
 * a description selected and retyped does not take its own block away, and a reveal asked for by a
 * door (`FIELD_REVEAL_EVENT` for `bomItems.0.name`, a run that wrote nothing) stays revealed when the
 * step is left and opened again. It lives in `sessionStorage` per card, beside the quiz's session —
 * a reload in the same tab keeps it, another tab or person derives the face from the data again.
 *
 * Off (`active: false`, everything shown) on every card that is not on its guide: legacy cards, a
 * card whose guide was exited (the server flag), a viewer, a frozen card. Off costs nothing — every
 * read below is keyed by a card id that is 0 then, so no query runs.
 */
export type GuideFace = {
  active: boolean;
  stage: MoodStage;
  show: GuideShow;
  /** Open the face at least to `what` (a door asked for a field it hides, or the draft landed). */
  reveal: (what: Exclude<GuideLatch, 'none'>) => void;
};

const KEY = 'plm.techcard.guide.v1.';
const latches = new Map<number, GuideLatch>();
const listeners = new Set<() => void>();

function readLatch(card: number): GuideLatch {
  if (!(card > 0)) return 'none';
  const known = latches.get(card);
  if (known) return known;
  let stored: string | null = null;
  try {
    stored = window.sessionStorage.getItem(KEY + card);
  } catch {
    /* storage refused (private mode): the latch lives in memory for this page */
  }
  const latch: GuideLatch = stored === 'blocks' || stored === 'description' ? stored : 'none';
  latches.set(card, latch);
  return latch;
}

function writeLatch(card: number, want: GuideLatch) {
  if (!(card > 0) || latchAtLeast(readLatch(card), want)) return;
  latches.set(card, want);
  try {
    window.sessionStorage.setItem(KEY + card, want);
  } catch {
    /* in memory only */
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The lower blocks' fields: a door to one of them opens the whole face. */
const BLOCK_ROOTS = new Set(['details', 'bomItems', 'colorways']);

export function useGuideFace(techCardId: number | undefined, guided: boolean): GuideFace {
  const card = guided && techCardId && techCardId > 0 ? techCardId : 0;
  const active = card > 0;
  const { control } = useFormContext<TechCardFormData>();
  /* Booleans and counts, not the arrays: the composer re-renders when the FACE could change, not on
     every keystroke in a BOM line. */
  const pictures = useWatch({
    control,
    name: 'moodboardMedia',
    compute: (rows) => (rows ?? []).filter(isBoardRow).length,
  });
  const concept = useWatch({
    control,
    name: 'concept',
    compute: (v) => ((v as string | null | undefined) ?? '').trim(),
  });
  // An aspect row with no words and no pictures holds nothing (a seeded key is not content).
  const details = useWatch({
    control,
    name: 'details',
    compute: (d) =>
      (d ?? []).filter((x) => (x.text ?? '').trim() || (x.mediaIds ?? []).length).length,
  });
  const bomItems = useWatch({ control, name: 'bomItems', compute: (b) => (b ?? []).length });
  const { answers, isSuccess: answersRead } = useDesignQuizAnswers(card || undefined);
  const { fills, proposals } = useCardMemory(card);
  const { data: saved } = useTechCard(card || undefined);
  const savedColourways = active ? saved?.colorways?.length ?? 0 : 0;

  const built = moodBuilt({
    details,
    bomItems,
    colourways: proposals.length + savedColourways,
    fills: fills.filter((f) => f.target.kind !== 'concept').length,
  });
  const answered = answers.filter((a) => !a.skipped).length;
  let stage = moodStage({ pictures, concept, answered, built });
  /* Until the saved answers are read, a board with pictures (or nothing) reads `unasked`: never the
     empty face over pictures, never the batch-end pair before the answers are known. */
  if (active && !answersRead && (stage === 'empty' || stage === 'asked')) stage = 'unasked';

  const latch = useSyncExternalStore(
    subscribe,
    () => readLatch(card),
    () => 'none' as GuideLatch,
  );
  /* What has been on screen stays on screen on this card (see the header). Layout effect: the latch
     is written before paint, so the next render after a retype already holds it. */
  const earned = latchOf(stage);
  useLayoutEffect(() => {
    if (active && earned !== 'none') writeLatch(card, earned);
  }, [active, card, earned]);

  const reveal = useCallback((what: Exclude<GuideLatch, 'none'>) => writeLatch(card, what), [card]);

  /* A DOOR TO A FIELD THIS FACE HIDES OPENS THE FACE — the folded board's trick (`mood-board.tsx`,
     `foldBody`). `revealField` and `openStepOf` dispatch on the hidden anchor and the event bubbles
     here; with no anchor drawn they dispatch on `document` itself. Either way the face opens and the
     reveal loop finds its anchor shown a frame later. Not claimed: the composer still decides about
     the step. */
  useEffect(() => {
    if (!active) return undefined;
    const onAsk = (e: Event) => {
      const path = (e as CustomEvent<FieldRevealDetail>).detail?.path ?? '';
      if (stepOfField(path) !== 'mood') return;
      const root = path.split('.')[0] ?? '';
      if (BLOCK_ROOTS.has(root)) writeLatch(card, 'blocks');
      else if (root === 'concept') writeLatch(card, 'description');
    };
    document.addEventListener(FIELD_REVEAL_EVENT, onAsk);
    return () => document.removeEventListener(FIELD_REVEAL_EVENT, onAsk);
  }, [active, card]);

  if (!active) return { active: false, stage: 'full', show: SHOW_ALL, reveal };
  return { active, stage, show: guideShow(stage, latch), reveal };
}
