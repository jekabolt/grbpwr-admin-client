// Runs a picker's fold plan against the server: a plan that also drops rows goes out as ONE
// replace call (delete + upsert in one transaction), so a double → single never lands half done.

import type { StoredFold } from 'lib/folds';
import type { FoldPlan } from './fold-plan';

export type FoldPlanWrites = {
  upsert: (rows: StoredFold[]) => Promise<boolean>;
  replace: (upsert: StoredFold[], remove: StoredFold[]) => Promise<boolean>;
};

/** The step link goes on only after the rows are stored; a refusal writes nothing. */
export async function executeFoldPlan(
  plan: FoldPlan,
  writes: FoldPlanWrites,
  assign: (keys: string[], step: number) => void,
  refuse: (title: string, detail: string) => void,
): Promise<boolean> {
  if ('refused' in plan) {
    refuse(plan.refused[0], plan.refused[1]);
    return false;
  }
  const stored = plan.remove.length
    ? await writes.replace(plan.upsert, plan.remove)
    : await writes.upsert(plan.upsert);
  if (!stored) return false;
  if (plan.link) assign(plan.link.keys, plan.link.step);
  return true;
}
