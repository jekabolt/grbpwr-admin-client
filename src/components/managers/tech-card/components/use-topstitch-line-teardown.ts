import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';

import type { TechCardFormData } from './schema';
import type { TopstitchOperation } from './topstitch-lines';

/** Remove nested line rows before their step kind or thread reference leaves the form. */
export function useTopstitchLineTeardown() {
  const { getValues, setValue } = useFormContext<TechCardFormData>();
  return useCallback(
    (scope: { stepIndexes?: readonly number[]; bomLineKeys?: readonly string[] }) => {
      const operations = (getValues('operations') ?? []) as TopstitchOperation[];
      const steps = scope.stepIndexes ? new Set(scope.stepIndexes) : null;
      const keys = scope.bomLineKeys ? new Set(scope.bomLineKeys) : null;
      operations.forEach((operation, index) => {
        if (steps && !steps.has(index)) return;
        const lines = operation.topstitchLines ?? [];
        const kept = keys ? lines.filter((line) => !keys.has(line.bomLineKey)) : [];
        if (kept.length === lines.length) return;
        setValue(`operations.${index}.topstitchLines`, kept, { shouldDirty: true });
      });
    },
    [getValues, setValue],
  );
}
