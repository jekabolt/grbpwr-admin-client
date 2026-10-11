// THE SKELETON'S DEFAULT TICKS — which proposed steps «apply all accepted» takes before a person
// touches anything. Shared by the panel and the prod-run harness, so the metric measures the screen.
//
// A guess (confidence below SKELETON.accept) is unticked, and so is everything built on a unit an
// unticked step makes. On its own that never reaches a finished garment: «Set sleeves», «Join
// shoulders» are template joins with no seam read, every one a guess, and the whole tail of the
// order hangs on them (prod run 10.10: default ticks reached one garment on 0 of 12 cards).
//
// THE ORDER MUST CLOSE (05-PROD-DIAGNOSIS F8). When the proposal itself ends in ONE unit, the
// default ticks are completed with the smallest set that gets there: the unticked joins on the way
// to that unit, and the steps riding on them. Each is marked `closing` and the panel says so at the
// top and on the line («ticked to close the order, check it»). A closing join that is an open
// decision (two readings within a hair of each other) is named at the top with its readings, so the
// one choice that decides the order is the first thing in sight. A proposal that does NOT end in
// one unit is not forced: the ticks stay as they are and the panel names the loose ends.
//
// AUTO MODE (07-ENGINE-QUALITY §5, the panel's default — owner 10.10 «maximum auto mode»). One press
// gives a whole draft skeleton: EVERY step is ticked, every decision keeps the engine's own reading,
// and each step that is a guess or an open reading is marked `auto` — on its line, in the notice
// (grouped by `autoKindOf`), and in the header count. Nothing is written until the person applies,
// same as manual; manual mode is `defaultPicks` above, unchanged.
//
// A TIE IS NOT AUTO-PICKED (07 review). A decision whose hosts tie on every rule — only the name or
// the piece key put the engine's reading first (`decision.tie`) — is no reading at all: auto mode
// leaves it unticked and marked `tie`, «to decide», and with it everything built on its unit. A
// person's tick, or a reading they choose, settles it; the rest of the order is ticked again then.
import { SKELETON, type SkeletonStep } from 'lib/assembly-skeleton/types';

export type StepPick = {
  accepted: boolean;
  applied: boolean;
  /** Ticked by default only to close the order (a guess on the way to the garment). */
  closing?: boolean;
  /**
   * A guess ticked by default only because it rides on a ticked join (its press, its hem). Every
   * guess the defaults tick carries one of the two marks; the panel shows it on the row and in the
   * notice. A person's own tick clears both.
   */
  withJoin?: boolean;
  /**
   * Ticked by auto mode: a guess or an open reading taken at the engine's own reading. Only on a
   * step of its own (a rider rides on its join: `withJoin`). A person's own tick clears it.
   */
  auto?: true;
  /** Ticked or unticked by a person: kept through a rebuild and through an auto ↔ manual switch. */
  own?: true;
  /**
   * Left unticked by auto mode: a tie the engine broke by name only (`decision.tie`). Waits for a
   * person — the panel lists it «to decide». A person's own tick clears it.
   */
  tie?: true;
};

/** The engine's reading of this step is a tie it broke by name only — not a pick to take for granted. */
export const isTie = (s: SkeletonStep): boolean => !!s.decision?.tie;

/** A guess the default ticks took for the person — shown on its row and listed in the notice. */
export const autoGuess = (p: StepPick | undefined): boolean =>
  !!p && p.accepted && !p.applied && (!!p.closing || !!p.withJoin || !!p.auto);

/**
 * A step the engine could not settle on its own: a guess (below SKELETON.accept) or a join it read
 * more than one way. Manual mode counts these «to decide»; auto mode ticks and marks them.
 */
export const isOpenChoice = (s: SkeletonStep): boolean =>
  s.confidence < SKELETON.accept ||
  (s.alternatives?.length ?? 0) > 0 ||
  s.seams.some((c) => (c.ambiguousWith?.length ?? 0) > 0);

/**
 * The panel's notice, as lists of step indices: joins ticked to close the order, and the other
 * guesses ticked by default (riding on a join read on its own evidence). Together they are EVERY
 * auto-ticked guess — the probe holds the panel to that.
 */
export function autoTickedGuesses(
  steps: readonly SkeletonStep[],
  picks: readonly StepPick[],
  shown: (s: SkeletonStep) => boolean = () => true,
): { closing: number[]; withJoin: number[]; auto: number[] } {
  const idx = steps.map((_, i) => i).filter((i) => autoGuess(picks[i]) && shown(steps[i]));
  return {
    closing: idx.filter((i) => picks[i].closing),
    withJoin: idx.filter((i) => !picks[i].closing && !picks[i].auto),
    auto: idx.filter((i) => !picks[i].closing && picks[i].auto),
  };
}

/** A press or processing step that rides on the join it follows (its tick, its confidence). */
export const isDerived = (s: SkeletonStep): boolean => s.derivedFrom != null && s.derivedFrom >= 0;

/** Steps that ride on step `i`, directly or through another derived step. */
export const ridersOf = (steps: readonly SkeletonStep[], i: number): number[] => {
  const out: number[] = [];
  const parents = new Set([i]);
  steps.forEach((s, j) => {
    if (isDerived(s) && parents.has(s.derivedFrom!)) {
      out.push(j);
      parents.add(j);
    }
  });
  return out;
};

export const defaultPick = (s: SkeletonStep): StepPick => ({
  // A guess is shown, not applied: it stays unticked until a person ticks it (or the order needs it
  // to close — see closeOrder).
  accepted: s.confidence >= SKELETON.accept,
  applied: false,
});

/**
 * Picks made consistent with the order: a derived step follows its join's tick, and a step whose
 * input is a unit made by an UNTICKED step (the final press on «Shirt» when «Set sleeves» is a
 * guess) is unticked too — ticked, it would refer to a unit the batch never makes, and «apply all
 * accepted» would refuse the whole batch.
 */
export const settlePicks = (
  steps: readonly SkeletonStep[],
  base: readonly StepPick[],
  followJoin: (i: number) => boolean,
): StepPick[] => {
  const madeBy = new Map<string, number>();
  const picks: StepPick[] = [];
  steps.forEach((s, i) => {
    const pick = { ...base[i] };
    if (isDerived(s) && followJoin(i) && picks[s.derivedFrom!]) {
      pick.accepted = picks[s.derivedFrom!].accepted;
      // Following a ticked join is a default, not a person's pick: a guess so ticked is marked.
      if (pick.accepted && !pick.applied && s.confidence < SKELETON.accept) pick.withJoin = true;
      else delete pick.withJoin;
    }
    if (pick.accepted && !pick.applied)
      pick.accepted = s.inputs.every((k) => {
        const j = madeBy.get(k);
        return j === undefined || picks[j].accepted;
      });
    if (!pick.accepted) {
      delete pick.closing;
      delete pick.withJoin;
      delete pick.auto;
    }
    picks.push(pick);
    if (s.outputUnitKey) madeBy.set(s.outputUnitKey, i);
  });
  return picks;
};

/** A reading's strength: its best seam's score (0 = no seam read, a template join). */
const strength = (r: { seams: SkeletonStep['seams'] }) =>
  r.seams.reduce((m, c) => Math.max(m, c.score), 0);

export type OrderClosure = {
  /** The proposal's own ends: units no later join takes. One = it reaches one garment. */
  ends: string[];
  /** Join steps (indices) the default ticks need to reach that garment. */
  path: number[];
  /**
   * Joins on the path that are open decisions where another reading is as strong as the chosen one
   * (within SKELETON.ambiguity): the reading the order closes on is the engine's pick, not a fact.
   */
  openDecisions: number[];
};

/** Where the proposal ends and which joins lead there. Joins = non-derived steps making a unit. */
export function orderClosure(steps: readonly SkeletonStep[]): OrderClosure {
  const madeBy = new Map<string, number>();
  const takenByJoin = new Set<string>();
  steps.forEach((s, i) => {
    if (isDerived(s) || !s.outputUnitKey) return;
    for (const k of s.inputs) if (madeBy.has(k)) takenByJoin.add(k);
    madeBy.set(s.outputUnitKey, i);
  });
  const ends = [...madeBy.keys()].filter((k) => !takenByJoin.has(k));
  if (ends.length !== 1) return { ends, path: [], openDecisions: [] };
  const path = new Set<number>();
  const walk = [madeBy.get(ends[0])!];
  while (walk.length) {
    const i = walk.pop()!;
    if (path.has(i)) continue;
    path.add(i);
    for (const k of steps[i].inputs) {
      const j = madeBy.get(k);
      if (j !== undefined && j < i) walk.push(j);
    }
  }
  const sorted = [...path].sort((a, b) => a - b);
  const openDecisions = sorted.filter((i) => {
    const s = steps[i];
    if (!s.alternatives?.length) return false;
    const own = strength(s);
    return s.alternatives.some((a) => strength(a) >= own - SKELETON.ambiguity);
  });
  return { ends, path: sorted, openDecisions };
}

/**
 * Default picks completed so the order closes: every unticked join on the path to the proposal's
 * one end is ticked (`closing`) — and NOTHING else. Its riders (press, side seams, hem, final
 * press) are not needed for the order to converge, so they stay unticked guesses for the person to
 * take; a rider is ticked only by a join that was ticked on its own evidence. Picks a person made
 * (`keep`) are never overridden — only steps with no pick of their own are closed.
 */
export function closeOrder(
  steps: readonly SkeletonStep[],
  base: readonly StepPick[],
  keep: (i: number) => boolean = () => false,
): StepPick[] {
  const { path } = orderClosure(steps);
  if (!path.length) return [...base];
  const next = base.map((p) => ({ ...p }));
  for (const i of path)
    if (!keep(i) && !next[i].accepted && !next[i].applied)
      next[i] = { ...next[i], accepted: true, closing: true };
  // Riders follow their join unless a person picked them — but not a join the closure ticked: what
  // rides on a guess is not structure, and is left for the person.
  const closedHere = new Set(path.filter((i) => next[i].closing && !base[i].closing));
  const underClosed = (i: number): boolean => {
    for (let j = steps[i].derivedFrom; j != null && j >= 0; j = steps[j].derivedFrom)
      if (closedHere.has(j) || next[j].closing) return true;
    return false;
  };
  for (let i = 0; i < steps.length; i++)
    if (isDerived(steps[i]) && !keep(i) && underClosed(i) && !next[i].applied)
      next[i] = { accepted: false, applied: false };
  return settlePicks(steps, next, (i) => !keep(i) && !underClosed(i));
}

/** The default ticks of a fresh proposal. */
export const defaultPicks = (steps: readonly SkeletonStep[]): StepPick[] =>
  closeOrder(
    steps,
    settlePicks(steps, steps.map(defaultPick), () => true),
  );

// ── auto mode ───────────────────────────────────────────────────────────────────────────────────

/**
 * Auto mode's pick of a fresh step: ticked; marked when the engine could not settle it alone — but a
 * tie (`isTie`) is left unticked, marked, for a person.
 */
export const autoPick = (s: SkeletonStep): StepPick =>
  !isDerived(s) && isTie(s)
    ? { accepted: false, applied: false, tie: true }
    : {
        accepted: true,
        applied: false,
        ...(!isDerived(s) && isOpenChoice(s) ? { auto: true as const } : {}),
      };

/** Auto mode's ties left to a person: the tie steps (indices) still unticked. */
export const openTies = (
  steps: readonly SkeletonStep[],
  picks: readonly StepPick[],
  shown: (s: SkeletonStep) => boolean = () => true,
): number[] =>
  steps
    .map((_, i) => i)
    .filter((i) => !!picks[i]?.tie && !picks[i].accepted && !picks[i].applied && shown(steps[i]));

/**
 * The ticks of a fresh proposal in auto mode: every step, riders with their join, each open choice
 * marked. settlePicks still unticks a step whose input no ticked step makes — the batch stays one
 * the frontier rules accept.
 */
export const autoPicks = (steps: readonly SkeletonStep[]): StepPick[] =>
  picksFor(steps, true, () => undefined);

/**
 * The picks of `steps` in a mode, keeping the picks `kept` returns (a person's, an applied step's,
 * the ones a rebuild carried over) and giving every other step the mode's default. With nothing
 * kept it is exactly `autoPicks` / `defaultPicks`.
 */
export function picksFor(
  steps: readonly SkeletonStep[],
  auto: boolean,
  kept: (i: number) => StepPick | undefined,
): StepPick[] {
  const keep = (i: number) => kept(i) !== undefined;
  const settled = settlePicks(
    steps,
    steps.map((s, i) => kept(i) ?? (auto ? autoPick(s) : defaultPick(s))),
    (i) => !keep(i),
  );
  return auto ? settled : closeOrder(steps, settled, keep);
}

/** The picks a mode switch keeps: what a person ticked or unticked, and what is applied already. */
export const personalPick = (p: StepPick | undefined): StepPick | undefined =>
  p && (p.own || p.applied) ? p : undefined;

/**
 * WHAT KIND OF GUESS an auto-picked step is — the notice groups them by it, and the bench counts
 * them by it (07-ENGINE-QUALITY §5.2). A decision is named by its id's prefix (stable across
 * rebuilds); a guess by what the step does.
 */
export type AutoKind =
  | 'decision:place'
  | 'decision:orphan'
  | 'decision:onto'
  | 'decision:layers'
  | 'decision:order'
  | 'decision:reading'
  | 'guess:template-body'
  | 'guess:converge'
  | 'guess:wrap'
  | 'guess:family-noseam'
  | 'guess:attach-noseam'
  | 'guess:closure'
  | 'guess:feature'
  | 'guess:process'
  | 'guess:other';

const DECISION_KINDS = new Set(['place', 'orphan', 'onto', 'layers', 'order']);

export function autoKindOf(s: SkeletonStep): AutoKind {
  if (s.decision) {
    const prefix = s.decision.id.split(':')[0];
    return DECISION_KINDS.has(prefix) ? (`decision:${prefix}` as AutoKind) : 'decision:reading';
  }
  if ((s.alternatives?.length ?? 0) > 0 || s.seams.some((c) => (c.ambiguousWith?.length ?? 0) > 0))
    return 'decision:reading';
  const label = s.label ?? '';
  if (!s.outputUnitKey) {
    const f = s.feature?.kind;
    if (f === 'buttonholes' || f === 'buttons' || f === 'zip' || /button|snap|zip/i.test(label))
      return 'guess:closure';
    if (f || /dart|vent/i.test(label)) return 'guess:feature';
    return 'guess:process';
  }
  if (/what is left/i.test(label)) return 'guess:converge';
  if (
    /^(Join shoulders|Set |Attach the|Join the|Join back|Join side|Bag |Attach cuffs|Close)/.test(
      label,
    )
  )
    return 'guess:template-body';
  if (/^Sew layers around/.test(label)) return 'guess:wrap';
  if (/^(Join layers|Join panel|Join parts|Join by seams)/.test(label))
    return 'guess:family-noseam';
  if (/^Attach/.test(label)) return 'guess:attach-noseam';
  return 'guess:other';
}

/** Every kind, readings that flip first, then plain guesses (the bench's column order). */
export const AUTO_KINDS: readonly AutoKind[] = [
  'decision:place',
  'decision:orphan',
  'decision:onto',
  'decision:layers',
  'decision:order',
  'decision:reading',
  'guess:template-body',
  'guess:converge',
  'guess:family-noseam',
  'guess:attach-noseam',
  'guess:wrap',
  'guess:closure',
  'guess:feature',
  'guess:process',
  'guess:other',
];

/** Each kind in words, as the notice and the step's line say it. */
export const AUTO_KIND_WORDS: Record<AutoKind, string> = {
  'decision:place': 'where a piece with no seam goes, read from its name and place',
  'decision:orphan': 'a piece with no seam, put on the nearest panel',
  'decision:onto': 'which panel a placket goes onto, read from its name',
  'decision:layers': 'which layers pair up, two pairings as likely',
  'decision:order': 'which goes first, the order most technologists use',
  'decision:reading': 'a join read two ways, the stronger reading taken',
  'guess:template-body': 'the standard order, no seam read',
  'guess:converge': 'what is left joined into one, no seam read',
  'guess:family-noseam': 'pieces of one family joined, no seam read',
  'guess:attach-noseam': 'attached, no seam read',
  'guess:wrap': 'a layer sewn around another, no seam read',
  'guess:closure': 'buttons, holes or a zip, which side is a guess',
  'guess:feature': 'read off the marks on the piece',
  'guess:process': 'what every garment of this kind has, not on the pattern',
  'guess:other': 'a guess',
};

/**
 * Auto-picked steps grouped by kind, the groups in the order their first step comes in the list —
 * the notice reads top to bottom like the steps under it (empty kinds left out).
 */
export function autoGroups(
  steps: readonly SkeletonStep[],
  idx: readonly number[],
): { kind: AutoKind; idx: number[] }[] {
  const by = new Map<AutoKind, number[]>();
  for (const i of idx) {
    const k = autoKindOf(steps[i]);
    by.set(k, [...(by.get(k) ?? []), i]);
  }
  return AUTO_KINDS.filter((k) => by.has(k))
    .map((kind) => ({ kind, idx: by.get(kind)! }))
    .sort((a, b) => a.idx[0] - b.idx[0]);
}
