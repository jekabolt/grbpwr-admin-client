import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { extractFieldViolations, violationReason } from 'utils/field-errors';
import { useTechCardAutosave } from '../design/autosave-contract';
import type { TechCardFormData } from '../schema';

type FoldStepForm = {
  operations?: {
    foldKeys?: string[];
    inputKeys?: string[];
    operationType?: string;
    operationNumber?: number;
  }[];
};

type FoldStepOperation = NonNullable<FoldStepForm['operations']>[number];

const ownKeys = (operation: FoldStepOperation): string[] => [...new Set(operation.foldKeys ?? [])];

export function stepOfFold(ops: readonly FoldStepOperation[], foldKey: string): number | null {
  const index = ops.findIndex((operation) => operation.foldKeys?.includes(foldKey));
  return index >= 0 ? index : null;
}

export function suggestStep(ops: readonly FoldStepOperation[], pieceKey: string): number | null {
  const key = pieceKey.trim().toUpperCase();
  const index = ops.findIndex(
    (operation) =>
      operation.operationType !== 'TECH_CARD_OPERATION_TYPE_FUSING' &&
      operation.inputKeys?.some((inputKey) => inputKey.trim().toUpperCase() === key),
  );
  return index >= 0 ? index : null;
}

export function assignFold(
  ops: readonly FoldStepOperation[],
  foldKey: string,
  stepIndex: number | null,
): string[][] {
  if (stepIndex !== null && !ops[stepIndex]) return ops.map(ownKeys);
  return ops.map((operation, index) => {
    const keys = ownKeys(operation);
    if (index === stepIndex) return keys.includes(foldKey) ? keys : [...keys, foldKey];
    return keys.filter((key) => key !== foldKey);
  });
}

export function foldStepBlocked(
  ops: readonly FoldStepOperation[],
  foldRowsOfPiece: readonly { foldKey: string; seq: number }[],
  foldKey: string,
  stepIndex: number,
): boolean {
  const row = foldRowsOfPiece.find((candidate) => candidate.foldKey === foldKey);
  if (!row) return false;
  return foldRowsOfPiece.some((other) => {
    if (other.foldKey === foldKey || other.seq === row.seq) return false;
    const otherStep = stepOfFold(ops, other.foldKey);
    if (otherStep === null) return false;
    return other.seq < row.seq ? otherStep > stepIndex : otherStep < stepIndex;
  });
}

export const FOLD_STEP_REFUSAL = 'MOVE THE FOLD FIRST';

const REFUSAL_WORDS: Record<string, string> = {
  fold_order: 'FOLD ORDER',
  fold_on_two_steps: 'FOLD ON TWO STEPS',
  fold_step_gone: FOLD_STEP_REFUSAL,
};

/** The words for a save the server refused over a step's fold link; null for any other refusal. */
export function foldRefusalOf(error: unknown): string | null {
  for (const violation of extractFieldViolations(error)) {
    const words = REFUSAL_WORDS[violationReason(violation.description)];
    if (words) return words;
  }
  return null;
}

export function foldsClosingOn(ops: readonly FoldStepOperation[], index: number): string[] {
  return ops[index] ? ownKeys(ops[index]) : [];
}

const sameKeys = (a: readonly string[] | undefined, b: readonly string[]) =>
  (a?.length ?? 0) === b.length && b.every((key, index) => a?.[index] === key);

export function useFoldStep() {
  const form = useFormContext<TechCardFormData>();
  const autosave = useTechCardAutosave();
  const operations = useWatch({ control: form.control, name: 'operations' }) ?? [];

  const assign = useCallback(
    (foldKeys: readonly string[], stepIndex: number | null) => {
      const current = form.getValues('operations') ?? [];
      let next = current.map((operation) => ({ ...operation, foldKeys: ownKeys(operation) }));
      for (const foldKey of new Set(foldKeys)) {
        const assigned = assignFold(next, foldKey, stepIndex);
        next = next.map((operation, index) => ({ ...operation, foldKeys: assigned[index] }));
      }
      let changed = false;
      next.forEach((operation, index) => {
        if (sameKeys(current[index]?.foldKeys, operation.foldKeys ?? [])) return;
        changed = true;
        form.setValue(`operations.${index}.foldKeys`, operation.foldKeys ?? [], {
          shouldDirty: true,
        });
      });
      if (changed) autosave.request('fold-step');
    },
    [autosave, form],
  );

  return { operations, assign };
}
