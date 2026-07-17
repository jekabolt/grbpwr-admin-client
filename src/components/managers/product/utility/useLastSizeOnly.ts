import { useEffect, useMemo, useRef, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { ProductFormData } from './schema';

export function useLastSizeOnly(filteredSizes: Array<{ id?: number; name?: string }>) {
  const { watch, setValue, getValues } = useFormContext<ProductFormData>();
  const values = watch();
  const [osSizeNonZero, setOsSizeNonZero] = useState(false);
  // When OS/One-Size gets stock while other sizes still hold stock, ask before discarding them
  // instead of silently deleting every other row.
  const [pendingPrune, setPendingPrune] = useState(false);
  // ConfirmationModal fires onConfirm THEN onOpenChange(false); this flag lets the close handler tell
  // a real confirm apart from a dismiss/escape (which should keep the other sizes).
  const confirmedRef = useRef(false);

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
      const others = values.sizeMeasurements.filter((sm) => sm?.productSize?.sizeId !== osSizeId);
      const othersHaveStock = others.some((sm) => {
        const q = sm?.productSize?.quantity?.value;
        return q != null && q !== '' && q !== '0';
      });
      if (othersHaveStock) {
        // Real stock would be lost — surface a confirmation instead of deleting it.
        setPendingPrune(true);
      } else {
        // Nothing to lose (other rows are empty) — collapse to OS silently.
        const onlyOsSize = values.sizeMeasurements.filter(
          (sm) => sm?.productSize?.sizeId === osSizeId,
        );
        if (onlyOsSize.length !== values.sizeMeasurements.length) {
          setValue('sizeMeasurements', onlyOsSize, { shouldDirty: true });
        }
      }
    } else {
      setPendingPrune(false);
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

  // Confirm: keep OS only, dropping the other sizes' stock.
  const confirmPrune = () => {
    confirmedRef.current = true;
    if (osSizeId == null) {
      setPendingPrune(false);
      return;
    }
    const current = getValues('sizeMeasurements') ?? [];
    const onlyOsSize = current.filter((sm) => sm?.productSize?.sizeId === osSizeId);
    setValue('sizeMeasurements', onlyOsSize, { shouldDirty: true });
    setPendingPrune(false);
  };

  // Cancel/dismiss: clear the OS quantity so the other sizes are preserved. Skipped when this close is
  // the tail of a confirm (see confirmedRef) so confirming never gets undone.
  const cancelPrune = () => {
    if (confirmedRef.current) {
      confirmedRef.current = false;
      return;
    }
    if (osSizeId == null) return;
    const current = getValues('sizeMeasurements') ?? [];
    const idx = current.findIndex((sm) => sm?.productSize?.sizeId === osSizeId);
    if (idx >= 0) {
      setValue(`sizeMeasurements.${idx}.productSize.quantity.value` as const, '0', {
        shouldDirty: true,
      });
    }
    setOsSizeNonZero(false);
    setPendingPrune(false);
  };

  return {
    osSizeNonZero,
    osSizeId,
    handleLastSizeCheck,
    shouldShowSize,
    pendingPrune,
    confirmPrune,
    cancelPrune,
  };
}
