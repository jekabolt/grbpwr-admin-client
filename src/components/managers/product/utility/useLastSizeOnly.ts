import { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ProductFormData } from './schema';

export function useLastSizeOnly(filteredSizes: Array<{ id?: number; name?: string }>) {
  const { watch, setValue } = useFormContext<ProductFormData>();
  const values = watch();
  const [osSizeNonZero, setOsSizeNonZero] = useState(false);

  const osSize = useMemo(() => {
    return filteredSizes.find(
      (size) => size.name?.toLowerCase() === 'os' || size.name?.toLowerCase() === 'one size',
    );
  }, [filteredSizes]);

  const osSizeId = osSize?.id;

  useEffect(() => {
    if (!osSizeId) return;

    const osSizeMeasurement = values.sizeMeasurements?.find(
      (sm) => sm?.productSize?.sizeId === osSizeId,
    );

    const osSizeValue = osSizeMeasurement?.productSize?.quantity?.value || '0';
    const hasValue = osSizeValue !== '0' && osSizeValue !== '';

    setOsSizeNonZero(hasValue);

    if (hasValue && values.sizeMeasurements && values.sizeMeasurements.length > 1) {
      const onlyOsSize = values.sizeMeasurements.filter(
        (sm) => sm?.productSize?.sizeId === osSizeId,
      );
      if (onlyOsSize.length !== values.sizeMeasurements.length) {
        setValue('sizeMeasurements', onlyOsSize, { shouldDirty: true });
      }
    }
  }, [values.sizeMeasurements, osSizeId, setValue]);

  const handleLastSizeCheck = (sizeId: number | undefined, value: string) => {
    if (sizeId === osSizeId) {
      setOsSizeNonZero(value !== '0' && value !== '');
    }
  };

  const shouldShowSize = (sizeId: number | undefined) => {
    const isOsSize = sizeId === osSizeId;
    return isOsSize || !osSizeNonZero;
  };

  return { osSizeNonZero, osSizeId, handleLastSizeCheck, shouldShowSize };
}
