import { useCallback } from 'react';
import { useFormContext } from 'react-hook-form';

import type { TechCardFormData } from './schema';
import { useSeamRows } from './step-seams/step-picture-view';
import { useStepSeamRemover } from './step-seams/step-seams-context';

/**
 * Р3: a step that stops sewing lets go of every seam it holds, unasked. Each seam goes through the
 * shared seam remover (`useStepSeamRemover`), so a row another step still holds is only detached
 * and the last holder deletes it, with its binding strips, exactly as a manual removal.
 * False when the server refused a delete; the seams already detached stay detached.
 */
export function useStepSeamUnlink() {
  const { getValues } = useFormContext<TechCardFormData>();
  const remove = useStepSeamRemover();
  const rows = useSeamRows();
  return useCallback(
    async (index: number): Promise<boolean> => {
      const keys = [...((getValues(`operations.${index}.seamKeys`) ?? []) as string[])];
      for (const key of keys) {
        if (!(await remove(index, key, rows.get(key)))) return false;
      }
      return true;
    },
    [getValues, remove, rows],
  );
}
