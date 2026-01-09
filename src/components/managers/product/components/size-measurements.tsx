import { useDictionaryStore } from 'lib/stores/store';
import { cn } from 'lib/utility';
import React, { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import Input from 'ui/components/input';
import Text from 'ui/components/text';
import { ProductFormData } from '../utility/schema';
import { formatSizeName, getFilteredSizes } from '../utility/sizes';
import { useEditConfirmation } from '../utility/useEditConfirmation';
import { useLastSizeOnly } from '../utility/useLastSizeOnly';
import { useMeasurements } from '../utility/useMeasurements';
import { useSizeMeasurementsToggle } from '../utility/useSizeMeasurementsToggle';
import { ToggleSizeNames } from './toggle-sizenames';

const cellClass = 'text-center border-r border-text font-normal h-10';
const lastCellClass = 'text-center font-normal';

export function SizeMeasurements({
  isEditMode = false,
  isAddingProduct = false,
}: {
  isEditMode?: boolean;
  isAddingProduct?: boolean;
} = {}) {
  const { dictionary } = useDictionaryStore();
  const { watch, setValue } = useFormContext<ProductFormData>();
  const values = watch();
  const { requireConfirmation } = useEditConfirmation(isEditMode, isAddingProduct);
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

  const handleSizeChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    if (!sizeId || !requireConfirmation(sizeId)) return;

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

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    sizeId: number | undefined,
    measurementNameId: number | undefined,
  ) => {
    if (!sizeId || !measurementNameId) return;
    const sizeData = sizeMeasurementsMap.get(sizeId);
    const measurementValue = e.target.value;

    if (!sizeData) {
      if (measurementValue) {
        setValue(
          'sizeMeasurements',
          [
            ...(values.sizeMeasurements || []),
            {
              productSize: { sizeId, quantity: { value: '0' } },
              measurements: [{ measurementNameId, measurementValue: { value: measurementValue } }],
            },
          ],
          { shouldDirty: true },
        );
      }
      return;
    }

    const path = `sizeMeasurements[${sizeData.index}].measurements`;
    const measurementIndex = sizeData.measurements.findIndex(
      (m: any) => m.measurementNameId === measurementNameId,
    );

    if (measurementIndex !== -1) {
      setValue(`${path}[${measurementIndex}].measurementValue.value` as any, measurementValue, {
        shouldDirty: true,
      });
    } else {
      setValue(
        path as any,
        [
          ...sizeData.measurements,
          { measurementNameId, measurementValue: { value: measurementValue } },
        ],
        { shouldDirty: true },
      );
    }
  };

  return (
    <div className='w-full overflow-x-auto'>
      <table className='w-full border-collapse border-2 border-text min-w-max'>
        <thead className='bg-inactive h-10'>
          <tr className='border-b border-text'>
            <th className={cn(cellClass, 'sticky left-0 bg-inactive z-10')}>
              <ToggleSizeNames
                subCategoryName={selectedSubCategoryName}
                typeName={selectedTypeName}
                measurementsNames={measurementsNames}
                onToggleChange={handleToggleChange}
              />
            </th>
            <th className={cellClass}>
              <Text variant='uppercase'>quantity</Text>
            </th>
            {measurements.map((m, i) => (
              <th key={m.id} className={i < measurements.length - 1 ? cellClass : lastCellClass}>
                <Text variant='uppercase'>{m.name}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className='bg-bgColor'>
          {filteredSizes.map((size, index) => {
            if (!shouldShowSize(size.id, index)) return null;

            const sizeData = sizeMeasurementsMap.get(size.id);
            const idx = sizeData?.index ?? -1;
            const qty = values.sizeMeasurements?.[idx]?.productSize?.quantity?.value;

            return (
              <tr key={size.id} className='border-b border-text last:border-b-0'>
                <td className={cn(cellClass, 'sticky left-0 bg-bgColor z-10')}>
                  <Text variant='uppercase'>{formatSizeName(size.name)}</Text>
                </td>
                <td className={cn(cellClass, 'bg-inactive w-26')}>
                  <Input
                    name={`sizeMeasurements[${idx}].productSize.quantity.value`}
                    value={qty === '0' ? '' : qty || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      if (!e.target.value || /^\d+$/.test(e.target.value)) {
                        handleSizeChange(e, size.id);
                      }
                    }}
                    className='w-full border-none text-center bg-inactive'
                  />
                </td>
                {measurements.map((m, i) => {
                  const mIdx =
                    sizeData?.measurements.findIndex((x: any) => x?.measurementNameId === m.id) ??
                    -1;
                  const mVal = sizeData?.measurements.find((x: any) => x.measurementNameId === m.id)
                    ?.measurementValue?.value;

                  return (
                    <td
                      key={m.id}
                      className={i < measurements.length - 1 ? cellClass : lastCellClass}
                    >
                      <Input
                        name={`sizeMeasurements[${idx}].measurements[${mIdx}].measurementValue.value`}
                        value={mVal || ''}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                          if (/^\d*$/.test(e.target.value))
                            handleMeasurementChange(e, size.id, m.id);
                        }}
                        className='w-full border-none text-center'
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
  );
}
