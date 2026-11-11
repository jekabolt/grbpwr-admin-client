import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { extractFieldViolations, violationReason } from 'utils/field-errors';
import { clearLinkOwed, markLinkOwed } from '../card-owed';
import { useTechCardAutosave } from '../design/autosave-contract';
import type { TechCardFormData } from '../schema';
import { owedFoldLinks } from './fold-links-keep';
import { useFoldsStore } from './folds-store';

type FoldStepForm = {
  operations?: {
    foldKeys?: string[];
    inputKeys?: string[];
    operationType?: string;
    operationNumber?: number;
    outputUnitKey?: string;
  }[];
};

type FoldStepOperation = NonNullable<FoldStepForm['operations']>[number];

const ownKeys = (operation: FoldStepOperation): string[] => [...new Set(operation.foldKeys ?? [])];

export function stepOfFold(ops: readonly FoldStepOperation[], foldKey: string): number | null {
  const index = ops.findIndex((operation) => operation.foldKeys?.includes(foldKey));
  return index >= 0 ? index : null;
}

const FUSING = 'TECH_CARD_OPERATION_TYPE_FUSING';
const PRESS_TYPES = new Set([
  'TECH_CARD_OPERATION_TYPE_PRESS',
  'TECH_CARD_OPERATION_TYPE_PRESS_OPEN',
]);
const sameKey = (a: string, b: string) => a.trim().toUpperCase() === b.trim().toUpperCase();

/**
 * The step works on this one piece alone: it makes no unit and every input is that piece. The same
 * contract as `processedPieceOf` (assembly-layout.ts), read off a form row.
 */
export function ownsOnlyPiece(operation: FoldStepOperation, pieceKey: string): boolean {
  if (!pieceKey.trim() || (operation.outputUnitKey ?? '').trim()) return false;
  const inputs = (operation.inputKeys ?? []).filter((key) => key.trim());
  return inputs.length > 0 && inputs.every((key) => sameKey(key, pieceKey));
}

/** The piece's first own non-fusing step; never a join, never FUSING. */
export function suggestStep(ops: readonly FoldStepOperation[], pieceKey: string): number | null {
  const index = ops.findIndex(
    (operation) => operation.operationType !== FUSING && ownsOnlyPiece(operation, pieceKey),
  );
  return index >= 0 ? index : null;
}

/**
 * Where a fold picked on the piece tile closes, without making a row: (a) the piece's own
 * non-fusing step that already closes one of its folds, else (b) its own Press step. Null = a new
 * Press step is needed. Never FUSING.
 */
export function pieceFoldStep(
  ops: readonly FoldStepOperation[],
  pieceKey: string,
  pieceFoldKeys: ReadonlySet<string>,
): number | null {
  const own = (operation: FoldStepOperation) =>
    operation.operationType !== FUSING && ownsOnlyPiece(operation, pieceKey);
  const closing = ops.findIndex(
    (operation) =>
      own(operation) && (operation.foldKeys ?? []).some((key) => pieceFoldKeys.has(key)),
  );
  if (closing >= 0) return closing;
  const press = ops.findIndex(
    (operation) => own(operation) && PRESS_TYPES.has(operation.operationType ?? ''),
  );
  return press >= 0 ? press : null;
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
      // The link reaches the server with the next card save; until a read shows it, this browser owes it.
      const cardId = useFoldsStore.getState().cardId;
      if (changed && cardId) {
        const now = Date.now();
        for (const key of foldKeys) clearLinkOwed(cardId, key, 'foldKeys');
        for (const link of owedFoldLinks(next, foldKeys, stepIndex, now))
          markLinkOwed(cardId, link);
      }
      if (changed) autosave.request('fold-step');
    },
    [autosave, form],
  );

  return { operations, assign };
}
