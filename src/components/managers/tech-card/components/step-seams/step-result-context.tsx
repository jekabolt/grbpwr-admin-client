// CARD-LEVEL STEP RESULTS, WIRING ONLY. This provider is intentionally not mounted yet; future
// views share the one sequential pure pass instead of each rebuilding every preceding operation.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';

import { foldRowsOf, useFoldRowsSig, useFoldsStore } from '../assembly-folds/folds-store';
import type { TechCardFormData } from '../schema';
import { useCardGeoms, useCardPieceKeys, usePoseRows, useSeamRows } from './step-picture-view';
import { OWNER_FIT, stepResults, type StepResult, type StepResultsInput } from './step-result';
import type { FormOpLike } from './step-seams-model';

const StepResultsContext = createContext<readonly StepResult[] | null>(null);

const operationsSignature = (ops: readonly FormOpLike[]) =>
  JSON.stringify(
    ops.map((op) => ({
      inputKeys: op.inputKeys,
      outputUnitKey: op.outputUnitKey,
      seamKeys: op.seamKeys,
      poseKeys: op.poseKeys,
      operationNumber: op.operationNumber,
      assemblyBlockDetached: op.assemblyBlockDetached,
      ...(op.foldKeys?.length ? { foldKeys: op.foldKeys } : {}),
      ...(op.layerOrder?.length ? { layerOrder: op.layerOrder } : {}),
    })),
  );

function ResultsValueProvider({
  input,
  children,
}: {
  input: StepResultsInput;
  children: ReactNode;
}) {
  const value = stepResults(input, OWNER_FIT);
  return <StepResultsContext.Provider value={value}>{children}</StepResultsContext.Provider>;
}

function CardStepResultProvider({ children }: { children: ReactNode }) {
  const { control, getValues } = useFormContext<TechCardFormData>();
  const opsSignature = useWatch({
    control,
    name: 'operations',
    compute: (value) => operationsSignature((value ?? []) as FormOpLike[]),
  });
  const ops = useMemo(
    () => [...((getValues('operations') ?? []) as FormOpLike[])],
    // `setValue` mutates the operations array in place; its content signature is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opsSignature, getValues],
  );
  const { geoms, innerLines, geo } = useCardGeoms();
  const pieceKeys = useCardPieceKeys();
  const byKey = useSeamRows();
  const poses = usePoseRows();
  const foldSig = useFoldRowsSig();
  const grainDeg = geo?.grainDeg;
  const folds = useMemo(() => {
    const rows = foldRowsOf(useFoldsStore.getState());
    return rows.length && grainDeg ? { rows, grainDeg } : undefined;
    // the rows' signature is the dependency: their array is new on every store read
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldSig, grainDeg]);
  const input = useMemo<StepResultsInput>(
    () => ({ ops, byKey, poses, geoms, innerLines, pieceKeys, ...(folds ? { folds } : {}) }),
    [ops, byKey, poses, geoms, innerLines, pieceKeys, folds],
  );
  return <ResultsValueProvider input={input}>{children}</ResultsValueProvider>;
}

/**
 * The future card-level provider. `input` is an optional pure-data seam for tests and non-form
 * renderers; normal editor use reads the existing card geometry, row and operation hooks.
 */
export function StepResultProvider({
  children,
  input,
}: {
  children?: ReactNode;
  input?: StepResultsInput;
}) {
  return input ? (
    <ResultsValueProvider input={input}>{children}</ResultsValueProvider>
  ) : (
    <CardStepResultProvider>{children}</CardStepResultProvider>
  );
}

/** One cached result by operation index; undefined outside the provider or outside the card. */
export function useStepResult(index: number): StepResult | undefined {
  return useContext(StepResultsContext)?.[index];
}

/** The shared card array for consumers that need to traverse the operation chain. */
export const useStepResults = (): readonly StepResult[] | null => useContext(StepResultsContext);
