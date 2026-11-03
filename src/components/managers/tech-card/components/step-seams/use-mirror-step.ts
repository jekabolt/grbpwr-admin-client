import { useCallback, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import type { StoredPose, StoredRow, StoredSeam } from 'lib/seams';

import { posesOf, rowsOf, useSeamsStore } from '../assembly-seams/seams-store';
import type { TechCardFormData } from '../schema';
import { useTechCardAutosave } from '../design/autosave-contract';
import {
  isRightMirrorStep,
  mirrorRowSig,
  mirrorStepPlan,
  type MirrorStepPlan,
  type MirrorStepPlanInput,
} from './mirror-step';
import { useStepSeams } from './step-seams-context';

export type MirrorStepWriteResult = { ok: true } | { ok: false; error: string };

export type MirrorStepWriteDeps = {
  upsert: (rows: readonly StoredRow[]) => Promise<boolean>;
  canonicalize: (rows: readonly StoredRow[]) => StoredRow[];
  link: (
    rows: readonly StoredRow[],
    foldKeys: readonly string[],
    layerOrder: readonly string[],
  ) => void;
  requestAutosave: () => void;
  rowsByKey: () => ReadonlyMap<string, StoredRow>;
  remove: (rows: readonly StoredRow[]) => Promise<boolean>;
  errorOf: (keys: readonly string[]) => string;
};

/** Execute the transaction/form boundary in its required order; exported for the failure probe. */
export async function executeMirrorStep(
  plan: MirrorStepPlan,
  deps: MirrorStepWriteDeps,
): Promise<MirrorStepWriteResult> {
  if (plan.kind !== 'create' && plan.kind !== 'replace') return { ok: false, error: 'not saved' };
  try {
    if (plan.upsert.length && !(await deps.upsert(plan.upsert))) {
      return {
        ok: false,
        error: deps.errorOf(plan.upsert.map((row) => row.seamKey)) || 'not saved',
      };
    }
    const canonical = deps.canonicalize(plan.upsert);
    deps.link(canonical, plan.foldKeys, plan.layerOrder);
    deps.requestAutosave();
    const byKey = deps.rowsByKey();
    const dropping = plan.deleteKeys.flatMap((key) => byKey.get(key) ?? []);
    if (dropping.length && !(await deps.remove(dropping))) {
      return { ok: false, error: deps.errorOf(plan.deleteKeys) || 'not saved' };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message.replace(/^Error:\s*/, '') : 'not saved',
    };
  }
}

/** Match the server echo after an upsert while preserving one row per expected mapped fact. */
export function canonicalMirrorRows(
  expected: readonly StoredRow[],
  have: readonly StoredRow[],
): StoredRow[] {
  const used = new Set<string>();
  return expected.map((row) => {
    const sameKey = have.find((candidate) => candidate.seamKey === row.seamKey);
    const sameFact = have.find(
      (candidate) => !used.has(candidate.seamKey) && mirrorRowSig(candidate) === mirrorRowSig(row),
    );
    const found = sameKey ?? sameFact ?? row;
    used.add(found.seamKey);
    return found;
  });
}

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
  const { setValue } = useFormContext<TechCardFormData>();
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
    const liveRows = () => {
      const state = useSeamsStore.getState();
      return [...rowsOf(state), ...posesOf(state)];
    };
    return executeMirrorStep(plan, {
      upsert: (put) => ctx.writes.upsert([...put]),
      canonicalize: (put) => canonicalMirrorRows(put, liveRows()),
      link: (linked, foldKeys, layerOrder) => {
        setValue(
          `operations.${index}.seamKeys`,
          linked.filter((row) => row.kind !== 'pose').map((row) => row.seamKey),
          { shouldDirty: true },
        );
        setValue(
          `operations.${index}.poseKeys`,
          linked.filter((row) => row.kind === 'pose').map((row) => row.seamKey),
          { shouldDirty: true },
        );
        setValue(`operations.${index}.foldKeys`, [...foldKeys], { shouldDirty: true });
        setValue(`operations.${index}.layerOrder`, [...layerOrder], { shouldDirty: true });
      },
      requestAutosave: () => autosave.request('seams'),
      rowsByKey: () => new Map(liveRows().map((row) => [row.seamKey, row])),
      remove: (drop) => ctx.writes.remove([...drop]),
      errorOf: (keys) => {
        const errors = useSeamsStore.getState().errors;
        return keys.map((key) => errors[key]).find(Boolean) ?? '';
      },
    });
  }, [autosave, ctx, index, plan, setValue]);

  return { plan, visible, write };
}
