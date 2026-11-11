import { useCallback, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import type { StoredPose, StoredRow, StoredSeam } from 'lib/seams';

import { mirrorChange, type SeamChange, type StepRef } from '../assembly-seams/seam-change-plan';
import type { SeamChangeResult } from '../assembly-seams/seam-change';
import { reuseKeys, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from '../design/autosave-contract';
import {
  isRightMirrorStep,
  mirrorStepPlan,
  type MirrorStepPlan,
  type MirrorStepPlanInput,
} from './mirror-step';
import { useStepSeams } from './step-seams-context';

export type MirrorStepWriteResult = { ok: true } | { ok: false; error: string };

export type MirrorStepWriteDeps = {
  /** The mirrored step, by its form row identity. */
  step: StepRef;
  /** The keys the step links now (seams and poses), read when the write starts. */
  stepKeys: () => readonly string[];
  /** New rows onto the key of a row already stored for their pair (the server lands them there too). */
  canonicalize: (rows: readonly StoredRow[]) => StoredRow[];
  /** ONE ChangeTechCardSeams for the whole mirror; `gone`: rows it is expected to delete. */
  change: (change: SeamChange, gone: readonly string[]) => Promise<SeamChangeResult>;
  /** The committed rows (stored keys) and the mirrored folds and layer order onto the step. */
  link: (
    rows: readonly StoredRow[],
    foldKeys: readonly string[],
    layerOrder: readonly string[],
  ) => void;
  requestAutosave: () => void;
};

/**
 * MIRROR as one transaction (C7, invariant 5): the mapped rows written AND linked to the step, every
 * other key of the step detached (the server deletes the ones no other step links) — all or nothing.
 * Only a committed change touches the form; exported for the failure probe.
 */
export async function executeMirrorStep(
  plan: MirrorStepPlan,
  deps: MirrorStepWriteDeps,
): Promise<MirrorStepWriteResult> {
  if (plan.kind !== 'create' && plan.kind !== 'replace') return { ok: false, error: 'not saved' };
  try {
    const upsert = deps.canonicalize(plan.upsert);
    const moved = new Map(plan.upsert.map((row, i) => [row.seamKey, upsert[i]?.seamKey]));
    const linkKeys = [...new Set(plan.linkKeys.map((key) => moved.get(key) ?? key))];
    const change = mirrorChange(deps.step, { upsert, linkKeys }, deps.stepKeys());
    const gone = plan.deleteKeys.filter((key) => !linkKeys.includes(key));
    const res = await deps.change(change, gone);
    if (!res.ok) return { ok: false, error: res.why || 'not saved' };
    const stored = upsert.map((row) => {
      const key = res.keyMap.get(row.seamKey) ?? row.seamKey;
      return key === row.seamKey ? row : { ...row, seamKey: key };
    });
    deps.link(stored, plan.foldKeys, plan.layerOrder);
    deps.requestAutosave();
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.replace(/^Error:\s*/, '') : 'not saved',
    };
  }
}

/** The client's half of the server's rekey: a new seam row of a stored pair goes onto that key. */
export function canonicalMirrorRows(
  expected: readonly StoredRow[],
  have: readonly StoredSeam[],
): StoredRow[] {
  return expected.map((row) =>
    row.kind === 'pose' ? row : reuseKeys([row as StoredSeam], have)[0] ?? row,
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((key) => b.includes(key));

type UseMirrorStepInput = Omit<MirrorStepPlanInput, 'rows' | 'poses'> & {
  rows: ReadonlyMap<string, StoredSeam>;
  poses: ReadonlyMap<string, StoredPose>;
  index: number;
};

export function useMirrorStep({
  index,
  step,
  cardOps,
  rows,
  poses,
  folds,
  geoms,
  grainDeg,
}: UseMirrorStepInput) {
  const ctx = useStepSeams();
  const autosave = useTechCardAutosave();
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  const rowList = useMemo(() => [...rows.values()], [rows]);
  const poseList = useMemo(() => [...poses.values()], [poses]);
  const plan = useMemo(
    () =>
      mirrorStepPlan({
        step,
        cardOps,
        rows: rowList,
        poses: poseList,
        folds,
        geoms,
        grainDeg,
      }),
    [step, cardOps, rowList, poseList, folds, geoms, grainDeg],
  );
  const visible = useMemo(
    () => plan.kind !== 'no-twin' || isRightMirrorStep(step, cardOps, geoms),
    [plan.kind, step, cardOps, geoms],
  );

  const write = useCallback(async (): Promise<MirrorStepWriteResult> => {
    if (!ctx || ctx.frozen) return { ok: false, error: 'not saved' };
    const historyKey = getValues(`operations.${index}.historyKey`);
    if (!historyKey) return { ok: false, error: 'not saved' };
    // The step's row by identity: the list may have moved while the request flew.
    const rowAt = () =>
      (getValues('operations') ?? []).findIndex((op) => op.historyKey === historyKey);
    return executeMirrorStep(plan, {
      step: { historyKey },
      stepKeys: () => {
        const op = getValues('operations')?.[rowAt()];
        return [...(op?.seamKeys ?? []), ...(op?.poseKeys ?? [])];
      },
      canonicalize: (put) => canonicalMirrorRows(put, rowsOf(useSeamsStore.getState())),
      change: (change, gone) =>
        ctx.writes.change(change, {
          verb: plan.upsert.length > 1 ? `decisions (${plan.upsert.length})` : 'decision',
          gone,
        }),
      link: (linked, foldKeys, layerOrder) => {
        const at = rowAt();
        if (at < 0) return;
        const op = getValues(`operations.${at}`);
        const seamKeys = linked.filter((row) => row.kind !== 'pose').map((row) => row.seamKey);
        const poseKeys = linked.filter((row) => row.kind === 'pose').map((row) => row.seamKey);
        // The form adopted the server's links already; this only covers a step it could not tell.
        if (!sameSet(op?.seamKeys ?? [], seamKeys))
          setValue(`operations.${at}.seamKeys`, seamKeys, { shouldDirty: true });
        if (!sameSet(op?.poseKeys ?? [], poseKeys))
          setValue(`operations.${at}.poseKeys`, poseKeys, { shouldDirty: true });
        setValue(`operations.${at}.foldKeys`, [...foldKeys], { shouldDirty: true });
        setValue(`operations.${at}.layerOrder`, [...layerOrder], { shouldDirty: true });
      },
      requestAutosave: () => autosave.request('seams'),
    });
  }, [autosave, ctx, getValues, index, plan, setValue]);

  return { plan, visible, write };
}
