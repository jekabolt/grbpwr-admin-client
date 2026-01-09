import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ProductFormData } from './schema';

export function useLastSizeOnly(filteredSizes: Array<{ id?: number; name?: string }>) {
  const { watch, setValue } = useFormContext<ProductFormData>();
  const values = watch();
  const [lastSizeNonZero, setLastSizeNonZero] = useState(false);

  const lastSizeId = useMemo(() => filteredSizes[filteredSizes.length - 1]?.id, [filteredSizes]);

  useEffect(() => {
    if (!lastSizeId) return;

    const lastSizeMeasurement = values.sizeMeasurements?.find(
      (sm) => sm?.productSize?.sizeId === lastSizeId,
    );

    const lastSizeValue = lastSizeMeasurement?.productSize?.quantity?.value || '0';
    const hasValue = lastSizeValue !== '0' && lastSizeValue !== '';

    setLastSizeNonZero(hasValue);

    if (hasValue && values.sizeMeasurements && values.sizeMeasurements.length > 1) {
      const onlyLastSize = values.sizeMeasurements.filter(
        (sm) => sm?.productSize?.sizeId === lastSizeId,
      );
      if (onlyLastSize.length !== values.sizeMeasurements.length) {
        setValue('sizeMeasurements', onlyLastSize, { shouldDirty: true });
      }
    }
  }, [values.sizeMeasurements, lastSizeId, setValue]);

  const handleLastSizeCheck = (sizeId: number | undefined, value: string) => {
    if (sizeId === lastSizeId) {
      setLastSizeNonZero(value !== '0' && value !== '');
    }
  };

  const shouldShowSize = (sizeId: number | undefined, index: number) => {
    const isLastSize = index === filteredSizes.length - 1;
    return isLastSize || !lastSizeNonZero;
  };

  return { lastSizeNonZero, lastSizeId, handleLastSizeCheck, shouldShowSize };
}
