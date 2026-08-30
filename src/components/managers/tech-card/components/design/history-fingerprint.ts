import type {
  common_DesignInputRef,
  common_DesignReference,
  common_DesignRun,
} from 'api/proto-http/admin';

import { normaliseViewKey } from './views';

/**
 * THE `earlier — inputs have changed` DIVIDER, AND THE EXACT WIDTH OF WHAT IT CLAIMS.
 *
 * The history is a list of answers, and the divider says which of them answer the question that is
 * on the table RIGHT NOW. Everything above the line was asked with the inputs the card carries at
 * this moment; everything below it was asked with different ones and must be read as an older
 * conversation.
 *
 * WHAT IS COMPARED, LITERALLY: the GARMENT DESCRIPTION, the requested VIEWS, the LAYOUT, and the
 * REFERENCE IMAGES with their roles and notes, in prompt order. That list is not a summary of «the
 * inputs» — it is the whole comparison, and the divider states it on screen (`DIVIDER_SCOPE`)
 * precisely because a provenance organ that compares four things and implies six is the one kind of
 * lie this band may not tell.
 *
 * EVERY TERM HAS BOTH ITS HALVES, AND THAT IS THE PRECONDITION FOR COMPARING IT AT ALL. Until the
 * generation wave landed, two of them had only one half: the card had no `garment_description` and
 * `DesignReference` had no `note`, while the run's frozen snapshot carried both. Hashing a frozen
 * value against a current one that cannot be read would have marked EVERY run as changed the moment
 * anybody typed — a false red — and dropping the frozen half silently would have let a run made
 * from a completely different description sit above the line — a false green. Both halves now
 * exist, and the contract states the pairing outright: `DesignInputSnapshot.garment_note` is «a
 * frozen copy of the card's garment_description as it read at launch».
 *
 * WHAT IS STILL OUT: the moodboard. Its note and its callouts ride into the prompt, and the
 * snapshot freezes them — but the moodboard is explicitly NOT part of the question the flat form
 * asks (the board's own header says «nothing here is sent to generation»), and the band reads the
 * card's live board through a different organ. When that half is readable here it joins, and
 * `DIVIDER_SCOPE` changes in the same commit.
 *
 * WHERE THIS DEPARTS FROM THE PROTOTYPE, ON PURPOSE. The prototype hashes the reference roles and
 * notes and explicitly drops `mediaId`, because in a prototype re-uploading the same file mints a
 * new id and would move the divider for nothing. Here a reference IS a media row on the card:
 * swapping the picture behind a role is a different question, not a re-upload. So the media id is
 * IN.
 *
 * Pure functions only — no React, no queries. The current half of the comparison is assembled by
 * `history-question.ts` (what the form is asking) plus the band's own reference list and the card's
 * own description.
 */

/** One reference, reduced to the parts the fingerprint reads. */
export type QuestionRef = {
  mediaId: number;
  role: string;
  note: string;
};

/** The half of the question the generation form owns: which views, in which layout. */
export type QuestionShape = {
  views: string[];
  layout: string;
};

/** The whole question: what is being made, asked for how, over which references. */
export type DesignQuestion = QuestionShape & {
  refs: QuestionRef[];
  /** The card's `garment_description`, which the run freezes as `inputs.garment_note`. */
  garmentNote: string;
};

/**
 * Spoken on screen beside the divider. It is a constant rather than prose at the call site so the
 * sentence and the arithmetic below can never drift apart.
 */
export const DIVIDER_SCOPE =
  'the garment description, views, layout and the reference pictures with their roles and notes';

/**
 * Views are a SET, not a sequence: ticking back then front is the same request as ticking front
 * then back, and a divider that disagreed would move on a gesture that changed nothing.
 */
function normaliseViews(views?: readonly (string | undefined)[] | null): string[] {
  const out = new Set<string>();
  for (const view of views ?? []) {
    const key = normaliseViewKey(view);
    if (key) out.add(key);
  }
  return [...out].sort();
}

/**
 * WITH ONE VIEW ASKED FOR, THE LAYOUT IS NOT PART OF THE QUESTION. The generation form says so in
 * its own words — «only one view is asked — both layouts return one picture» — so folding the
 * layout in there would push every earlier run under the line on a switch that changes neither the
 * request nor the answer.
 */
function normaliseLayout(layout: string | undefined | null, viewCount: number): string {
  if (viewCount <= 1) return '';
  return (layout ?? '').trim().toLowerCase();
}

/**
 * ORDER IS KEPT AS THE WIRE GIVES IT, and it is not re-sorted. `GetDesignBand.references` is
 * documented as being in PROMPT ORDER, and the snapshot's `refs` are the copy of that same order;
 * re-sorting either side by `ordinal` — a field the snapshot half does not even have — would
 * compare two lists that were ordered by different rules.
 */
function normaliseRefs(refs: readonly QuestionRef[]): QuestionRef[] {
  return refs
    .filter((ref) => ref.mediaId > 0 || ref.role)
    .map((ref) => ({
      mediaId: ref.mediaId,
      role: normaliseViewKey(ref.role),
      note: (ref.note ?? '').trim(),
    }));
}

/** The card's CURRENT references, as the fingerprint reads them. */
export function refsOfCard(references?: common_DesignReference[] | null): QuestionRef[] {
  return (references ?? []).map((ref) => ({
    mediaId: ref.mediaId ?? 0,
    role: (ref.role ?? '').trim(),
    note: (ref.note ?? '').trim(),
  }));
}

/** A run's FROZEN references, as the fingerprint reads them. */
function refsOfRun(refs?: common_DesignInputRef[] | null): QuestionRef[] {
  // A ref whose media has since been deleted keeps its `media_id` in the snapshot and loses only
  // the resolved picture — so the frozen fact is still readable, and the run correctly stops
  // matching a card that no longer holds that reference.
  return (refs ?? []).map((ref) => ({
    mediaId: ref.mediaId ?? 0,
    role: (ref.role ?? '').trim(),
    note: (ref.note ?? '').trim(),
  }));
}

/** The stable string two questions are compared by. Never shown; only compared. */
export function fingerprint(question: DesignQuestion): string {
  const views = normaliseViews(question.views);
  return JSON.stringify({
    // Trimmed, and nothing more. NOT case-folded and NOT whitespace-collapsed: rewriting a
    // description IS a change to the question, and a comparison that forgave edits would be a
    // divider that quietly claimed an old run answers a prompt it never saw.
    garmentNote: (question.garmentNote ?? '').trim(),
    views,
    layout: normaliseLayout(question.layout, views.length),
    refs: normaliseRefs(question.refs).map((ref) => [ref.mediaId, ref.role, ref.note]),
  });
}

/**
 * WHICH RUNS TAKE PART IN THE COMPARISON AT ALL.
 *
 * `null` means «this row is not on either side of the line» — it is drawn wherever it falls and
 * never triggers the divider:
 *
 *  · a render or a 3D run answers a different question entirely;
 *  · A FIX RUN'S INPUTS ARE THE BENCH SLOTS, NOT THE REFERENCES. Its snapshot carries no views the
 *    human ticked, so hashing it would drop every fix under «inputs have changed» for a reason
 *    that has nothing to do with the inputs having changed;
 *  · a row served without its snapshot has nothing to compare, and guessing from `params` alone
 *    would compare the request against a question that includes the references.
 */
export function questionOfRun(run: common_DesignRun): DesignQuestion | null {
  if ((run.kind ?? '').trim().toLowerCase() !== 'flat') return null;
  if ((run.params?.fixTarget ?? '').trim()) return null;
  const inputs = run.inputs;
  if (!inputs) return null;
  return {
    // The SNAPSHOT is the authority — the contract calls `DesignInputSnapshot.views/layout` «the
    // fingerprint that draws the current/earlier divider». `params` is the fallback for a server
    // that files the row before it echoes them back.
    views: (inputs.views ?? []).length ? (inputs.views ?? []) : (run.params?.views ?? []),
    layout: (inputs.layout ?? '').trim() || (run.params?.layout ?? ''),
    refs: refsOfRun(inputs.refs),
    garmentNote: (inputs.garmentNote ?? '').trim(),
  };
}

/**
 * THE INDEX THE DIVIDER STANDS BEFORE — the newest run that no longer answers the current
 * question, in a list sorted newest first. `-1` when there is nothing to divide.
 *
 * IT IS COMPUTED OVER THE WHOLE LIST AND NOT OVER THE PAGE. A divider that only existed once its
 * row happened to be paged in would be absent exactly when the history is long enough to need it;
 * the pager carries its words instead when the line falls past the edge of the page.
 *
 * Everything below the first mismatch is «earlier», including a row further down that happens to
 * match again: the label reads «inputs have changed SINCE here», which is a statement about the
 * order of events and not about each row on its own.
 */
export function firstEarlierIndex(
  runs: readonly common_DesignRun[],
  currentFingerprint: string | null,
): number {
  if (!currentFingerprint) return -1;
  for (let i = 0; i < runs.length; i++) {
    const question = questionOfRun(runs[i]);
    if (!question) continue;
    if (fingerprint(question) !== currentFingerprint) return i;
  }
  return -1;
}
