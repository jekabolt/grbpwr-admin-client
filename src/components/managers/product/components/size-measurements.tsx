import { adminService } from 'api/api';
import { common_Variant } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import React, { useEffect, useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';
import { formatSizeName, getFilteredSizes } from '../utility/sizes';
import { useEditConfirmation } from '../utility/useEditConfirmation';
import { useLastSizeOnly } from '../utility/useLastSizeOnly';
import { useMeasurements } from '../utility/useMeasurements';
import { useSizeMeasurementsToggle } from '../utility/useSizeMeasurementsToggle';
import { StockHistory } from './stock/stock-history';
import { UpdateStock } from './stock/update-stock';
import { ToggleSizeNames } from './toggle-sizenames';
import { VariantsPanel } from './variants-panel';

const cellClass = 'text-center border-r border-textInactiveColor';
const qtyCellClass = 'text-center border-r-2 border-textInactiveColor';
const measurementCellClass = 'text-center border-r border-textInactiveColor w-20 lg:w-auto';
const lastCellClass = 'text-center w-20 lg:w-auto';

export function SizeMeasurements({
  editMode = false,
  productId,
  styleId,
  lockVersion,
  variants,
  onStockUpdated,
}: {
  editMode?: boolean;
  productId?: number;
  // R5: the size chart is style-owned (UpdateStyleSizeChart, full-replace); R2: stock/variants are
  // colourway-owned. All three share the tech_card.lock_version.
  styleId?: number;
  lockVersion?: number;
  variants?: common_Variant[];
  onStockUpdated?: () => void;
} = {}) {
  const { dictionary } = useDictionary();
  const { watch, setValue, getValues } = useFormContext<ProductFormData>();
  const values = watch();
  const { requireConfirmation, confirmationModal } = useEditConfirmation(editMode);
  const { measurementsNames, handleToggleChange } = useSizeMeasurementsToggle();
  const { measurements, selectedSubCategoryName, selectedTypeName } = useMeasurements(
    dictionary,
    Number(values.product?.productBodyInsert?.topCategoryId) || 0,
    Number(values.product?.productBodyInsert?.subCategoryId) || 0,
    Number(values.product?.productBodyInsert?.typeId) || 0,
  );

  const filteredSizes = getFilteredSizes(
    dictionary,
    Number(values.product?.productBodyInsert?.topCategoryId) || 0,
    Number(values.product?.productBodyInsert?.typeId) || 0,
    {
      showBottoms: measurementsNames.bottoms,
      showTailored: measurementsNames.tailored,
      gender: values.product?.productBodyInsert?.targetGender,
    },
  );

  const { handleLastSizeCheck, shouldShowSize } = useLastSizeOnly(filteredSizes);

  const sizeMeasurementsMap = useMemo(() => {
    const map = new Map();
    values.sizeMeasurements?.forEach((sm, index) => {
      if (sm?.productSize?.sizeId) {
        map.set(sm.productSize.sizeId, { index, measurements: sm.measurements || [] });
      }
    });
    return map;
  }, [values.sizeMeasurements]);

  const productSizesForStock = useMemo(() => {
    const seen = new Set<number>();
    const result: { id: number; name?: string }[] = [];
    values.sizeMeasurements?.forEach((sm) => {
      const sizeId = sm?.productSize?.sizeId;
      if (sizeId != null && !seen.has(sizeId)) {
        seen.add(sizeId);
        const fromFiltered = filteredSizes.find((s) => s.id === sizeId);
        const fromDict = dictionary?.sizes?.find((s) => s.id === sizeId);
        const rawName = fromFiltered?.name ?? fromDict?.name ?? String(sizeId);
        result.push({
          id: sizeId,
          name: (formatSizeName(rawName) || rawName) ?? String(sizeId),
        });
      }
    });
    return result;
  }, [values.sizeMeasurements, filteredSizes, dictionary?.sizes]);

  const { totalUnits, sizesInStock } = useMemo(() => {
    let units = 0;
    let inStock = 0;
    (values.sizeMeasurements || []).forEach((sm) => {
      const q = parseInt(sm?.productSize?.quantity?.value || '0', 10) || 0;
      units += q;
      if (q > 0) inStock += 1;
    });
    return { totalUnits: units, sizesInStock: inStock };
  }, [values.sizeMeasurements]);

  // Stock is per-variant now (UpdateVariantStock takes variant_id). Map the colourway's variants to
  // the modal's option list; the label is the size name, the value the variant id.
  const variantsForStock = useMemo(
    () =>
      (variants ?? [])
        .filter((v) => v.status !== 'VARIANT_LIFECYCLE_STATUS_ARCHIVED' && v.variantId != null)
        .map((v) => {
          const raw =
            dictionary?.sizes?.find((s) => s.id === v.sizeId)?.name ?? String(v.sizeId ?? '');
          return { variantId: v.variantId, name: formatSizeName(raw) || raw };
        }),
    [variants, dictionary?.sizes],
  );

  // R5: the chart is style-owned and loaded whole (UpdateStyleSizeChart is a full-replace). Merge the
  // resolved chart cells into the form so editing starts from the current chart. A draft style may not
  // have a chart yet — a miss just leaves the measurements empty.
  useEffect(() => {
    if (!styleId) return;
    let cancelled = false;
    adminService
      .GetStyleSizeChart({ styleId })
      .then((res) => {
        if (cancelled) return;
        const bySize = new Map<
          number,
          { measurementNameId: number; measurementValue: { value: string } }[]
        >();
        for (const c of res.chart?.cells ?? []) {
          if (c.sizeId == null) continue;
          const arr = bySize.get(c.sizeId) ?? [];
          arr.push({
            measurementNameId: c.measurementNameId ?? 0,
            measurementValue: { value: c.value?.value ?? '' },
          });
          bySize.set(c.sizeId, arr);
        }
        if (bySize.size === 0) return;
        const merged = [...(getValues('sizeMeasurements') ?? [])];
        bySize.forEach((measurements, sizeId) => {
          const idx = merged.findIndex((sm) => sm.productSize?.sizeId === sizeId);
          if (idx >= 0) merged[idx] = { ...merged[idx], measurements };
          else merged.push({ productSize: { sizeId, quantity: { value: '0' } }, measurements });
        });
        setValue('sizeMeasurements', merged);
      })
      .catch(() => {
        /* no chart yet (draft) — leave measurements empty */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleId]);

  const handleSizeChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    if (!sizeId) return;
    const ok = await requireConfirmation(sizeId);
    if (!ok) return;

    const sizeData = sizeMeasurementsMap.get(sizeId);

    if (!sizeData) {
      if (value && value !== '0') {
        setValue(
          'sizeMeasurements',
          [
            ...(values.sizeMeasurements || []),
            { productSize: { sizeId, quantity: { value } }, measurements: [] },
          ],
          { shouldDirty: true },
        );
      }
    } else {
      setValue(`sizeMeasurements[${sizeData.index}].productSize.quantity.value` as any, value, {
        shouldDirty: true,
      });
    }

    handleLastSizeCheck(sizeId, value);
  };

  return (
    <div className='w-full space-y-3'>
      <ConfirmationModal
        open={confirmationModal.open}
        onOpenChange={confirmationModal.onOpenChange}
        onConfirm={confirmationModal.onConfirm}
        onCancel={confirmationModal.onCancel}
      >
        <Text variant='uppercase' className='font-bold'>
          {confirmationModal.message}
        </Text>
      </ConfirmationModal>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex flex-wrap items-center gap-x-4 gap-y-2'>
          <ToggleSizeNames
            subCategoryName={selectedSubCategoryName}
            typeName={selectedTypeName}
            measurementsNames={measurementsNames}
            onToggleChange={handleToggleChange}
          />
          <Text variant='inactive' size='small'>
            {sizesInStock} size{sizesInStock === 1 ? '' : 's'} in stock · {totalUnits} unit
            {totalUnits === 1 ? '' : 's'}
            {productId != null && ' · stock is read-only here — use “update stock”'}
          </Text>
          <Text variant='inactive' size='small'>
            measurements are the style’s size chart (shared by all colourways) — edit them on the
            tech card
          </Text>
        </div>
        <div className='flex flex-wrap gap-2'>
          {productId != null && (
            <>
              <StockHistory productId={productId} sizes={productSizesForStock} />
              <UpdateStock variants={variantsForStock} onStockUpdated={onStockUpdated} />
            </>
          )}
        </div>
      </div>

      {editMode && productId != null && (
        <VariantsPanel
          colorwayId={productId}
          lockVersion={lockVersion}
          variants={variants}
          onChanged={onStockUpdated}
        />
      )}
      <div className='overflow-x-auto'>
        <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
          <thead className='bg-textInactiveColor'>
            <tr className='border-b border-text'>
              <th className={cn(cellClass, 'sticky left-0 bg-textInactiveColor z-10')}>
                <Text variant='uppercase'>size</Text>
              </th>
              <th className={qtyCellClass}>
                <Text variant='uppercase'>stock</Text>
              </th>
              {measurements.map((m, i) => (
                <th key={m.id} className={i < measurements.length - 1 ? cellClass : lastCellClass}>
                  <Text variant='uppercase'>{m.name}</Text>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className='bg-bgColor'>
            {filteredSizes.map((size) => {
              if (!shouldShowSize(size.id)) return null;

              const sizeData = sizeMeasurementsMap.get(size.id);
              const idx = sizeData?.index ?? -1;
              const qty = values.sizeMeasurements?.[idx]?.productSize?.quantity?.value;
              const isOutOfStock = !qty || qty === '0';
              // filteredSizes is a reduced {id,name} shape; the SKU-ordinal / size-system live on the
              // full dictionary size, so resolve it by id (R7, read-only metadata).
              const sizeMeta = dictionary?.sizes?.find((s) => s.id === size.id);

              return (
                <tr key={size.id} className='border-b border-text last:border-b-0'>
                  <td className={cn(cellClass, 'sticky left-0 bg-bgColor z-10')}>
                    <Text
                      variant='uppercase'
                      className={cn({ 'text-textInactiveColor': isOutOfStock })}
                    >
                      {formatSizeName(size.name)}
                    </Text>
                    {/* R7: read-only SKU-ordinal / size-system metadata from the size dictionary —
                        the ordinal is the size segment baked into every variant SKU. */}
                    {(sizeMeta?.skuOrd != null || sizeMeta?.skuSystem) && (
                      <Text variant='inactive' size='small' className='block'>
                        {sizeMeta?.skuOrd != null ? `ord ${sizeMeta.skuOrd}` : ''}
                        {sizeMeta?.skuSystem
                          ? ` · ${sizeMeta.skuSystem.replace('SIZE_SKU_SYSTEM_', '').toLowerCase()}`
                          : ''}
                      </Text>
                    )}
                  </td>
                  <td className={cn(qtyCellClass, 'bg-inactive w-12 lg:w-26')}>
                    <Input
                      name={`sizeMeasurements[${idx}].productSize.quantity.value`}
                      value={qty === '0' ? '' : qty || ''}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                        if (!e.target.value || /^\d+$/.test(e.target.value)) {
                          handleSizeChange(e, size.id);
                        }
                      }}
                      className='w-full border-none text-center bg-inactive disabled:text-textColor'
                      disabled={!editMode || productId != null}
                    />
                  </td>
                  {measurements.map((m, i) => {
                    return (
                      <td
                        key={m.id}
                        className={
                          i < measurements.length - 1 ? measurementCellClass : lastCellClass
                        }
                      >
                        <Input
                          value={
                            values.sizeMeasurements?.[idx]?.measurements?.find(
                              (measurement) => measurement.measurementNameId === m.id,
                            )?.measurementValue?.value || ''
                          }
                          readOnly
                          className='w-full border-none text-center'
                          disabled
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
