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
import { SKELETON, type SkeletonStep } from 'lib/assembly-skeleton/types';

export type StepPick = {
  accepted: boolean;
  applied: boolean;
  /** Ticked by default only to close the order (a guess on the way to the garment). */
  closing?: boolean;
};

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
      if (picks[s.derivedFrom!].closing && pick.accepted && s.confidence < SKELETON.accept)
        pick.closing = true;
    }
    if (pick.accepted && !pick.applied)
      pick.accepted = s.inputs.every((k) => {
        const j = madeBy.get(k);
        return j === undefined || picks[j].accepted;
      });
    if (!pick.accepted) delete pick.closing;
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
 * one end is ticked (`closing`), and its riders follow it. Picks a person made (`keep`) are never
 * overridden — only steps with no pick of their own are closed.
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
  // Riders follow a join the closure ticked (its press, its hem) unless a person picked them.
  return settlePicks(steps, next, (i) => !keep(i));
}

/** The default ticks of a fresh proposal. */
export const defaultPicks = (steps: readonly SkeletonStep[]): StepPick[] =>
  closeOrder(
    steps,
    settlePicks(steps, steps.map(defaultPick), () => true),
  );
