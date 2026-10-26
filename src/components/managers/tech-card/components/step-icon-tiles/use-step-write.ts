import { useCallback } from 'react';
import { useFormContext, type FieldPath } from 'react-hook-form';
import type { TechCardFormData } from '../schema';

/**
 * Writes one field of step `index` as a person's edit: dirty, touched, and re-validated once the
 * form has been submitted (the same moment a select re-validates). An unchanged value is not
 * written, so a click that changes nothing leaves the form clean.
 */
export function useStepWrite(index: number) {
  const { getValues, setValue, formState } = useFormContext<TechCardFormData>();
  const revalidate = formState.isSubmitted;
  return useCallback(
    (field: string, value: unknown) => {
      const name = `operations.${index}.${field}` as FieldPath<TechCardFormData>;
      if (Object.is(getValues(name), value)) return;
      setValue(name, value as never, {
        shouldDirty: true,
        shouldTouch: true,
        shouldValidate: revalidate,
      });
    },
    [index, getValues, setValue, revalidate],
  );
}
