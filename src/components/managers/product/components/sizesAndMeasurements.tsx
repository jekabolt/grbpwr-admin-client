import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionaryStore } from 'lib/stores/store';
import React, { useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';

import { sortItems } from 'lib/features/filter-size-measurements';
import { useCategories } from 'lib/features/useCategories';
import { getMeasurementsForCategory } from '../utility/mappingMeasurementsForCategories';
import { ProductFormData } from '../utility/schema';
import { getFilteredSizes } from '../utility/sizes';

export function SizesAndMeasurements({
  isEditMode = false,
  isAddingProduct,
}: {
  isEditMode: boolean;
  isAddingProduct: boolean;
}) {
  const { dictionary } = useDictionaryStore();
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<ProductFormData>();
  const values = watch();
  const [lastSizeNonZero, setLastSizeNonZero] = useState(false);
  const [hasChangedSize, setHasChangedSize] = useState<{ [key: number]: boolean }>({});
  const [hasConfirmedSizeChange, setHasConfirmedSizeChange] = useState(false);
  const { selectedTopCategoryName, selectedSubCategoryName, selectedTypeName } = useCategories(
    Number(values.product?.productBodyInsert?.topCategoryId) || 0,
    Number(values.product?.productBodyInsert?.subCategoryId) || 0,
    Number(values.product?.productBodyInsert?.typeId) || 0,
  );

  const filteredSizes = getFilteredSizes(
    dictionary,
    Number(values.product?.productBodyInsert?.topCategoryId) || 0,
    Number(values.product?.productBodyInsert?.typeId) || 0,
  );

  const measurementsToDisplay: { id: number }[] = useMemo(() => {
    if (!dictionary?.measurements) return [] as { id: number }[];

    const requiredMeasurements = new Set([
      ...getMeasurementsForCategory(selectedTopCategoryName?.toLowerCase()),
      ...getMeasurementsForCategory(selectedSubCategoryName?.toLowerCase(), true),
      ...getMeasurementsForCategory(selectedTypeName?.toLowerCase(), false, selectedTypeName),
    ]);

    return sortItems(dictionary.measurements)
      .filter((m: any): m is { id: number } => typeof m?.id === 'number')
      .filter((m) => {
        const measurementName = findInDictionary(dictionary, m.id, 'measurement')?.toLowerCase();
        return measurementName && requiredMeasurements.has(measurementName);
      })
      .map((m) => ({ id: m.id }));
  }, [dictionary, selectedTopCategoryName, selectedSubCategoryName, selectedTypeName]);

  useEffect(() => {
    if (filteredSizes.length > 0) {
      const lastSize = filteredSizes[filteredSizes.length - 1];
      const lastSizeMeasurement = values.sizeMeasurements?.find(
        (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === lastSize.id,
      );

      const lastSizeValue = lastSizeMeasurement?.productSize?.quantity?.value || '0';

      setLastSizeNonZero(
        lastSizeValue !== '0' && lastSizeValue !== undefined && lastSizeValue !== '',
      );

      if (
        lastSizeValue !== '0' &&
        lastSizeValue !== undefined &&
        lastSizeValue !== '' &&
        values.sizeMeasurements &&
        values.sizeMeasurements.length > 1
      ) {
        const updatedSizeMeasurements = values.sizeMeasurements?.filter(
          (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === lastSize.id,
        );
        setValue('sizeMeasurements', updatedSizeMeasurements, { shouldDirty: true });
      }
    }
  }, [values.sizeMeasurements, filteredSizes, setValue]);

  const handleSizeChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    if (!sizeId) return;

    if (
      !isAddingProduct &&
      isEditMode &&
      sizeId &&
      !hasChangedSize[sizeId] &&
      !hasConfirmedSizeChange
    ) {
      const confirmed = window.confirm('Are you sure you want to change the size quantity?');
      if (!confirmed) {
        return;
      }
      setHasChangedSize((prev) => ({ ...prev, [sizeId]: true }));
      setHasConfirmedSizeChange(true);
    }

    const sizeIndex = values.sizeMeasurements?.findIndex(
      (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === sizeId,
    );

    if (sizeIndex === -1 || sizeIndex === undefined) {
      if (value !== '0' && value !== '') {
        const newSizeMeasurement = {
          productSize: { sizeId, quantity: { value } },
          measurements: [],
        };
        setValue('sizeMeasurements', [...(values.sizeMeasurements || []), newSizeMeasurement], {
          shouldDirty: true,
        });
      }
    } else {
      const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value` as const;
      setValue(quantityPath as any, value, { shouldDirty: true });
    }

    const lastSizeId = filteredSizes[filteredSizes.length - 1]?.id;
    if (lastSizeId && sizeId === lastSizeId) {
      setLastSizeNonZero(value !== '0' && value !== '');
    }
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeId: number | undefined,
    measurementNameId: number | undefined,
  ) => {
    const measurementValue = e.target.value;
    const sizeIndex = values.sizeMeasurements?.findIndex(
      (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === sizeId,
    );

    if (sizeIndex === -1 || sizeIndex === undefined) {
      return;
    }

    const measurementsPath = `sizeMeasurements[${sizeIndex}].measurements`;
    const currentMeasurements = values.sizeMeasurements?.[sizeIndex]?.measurements || [];
    const measurementIndex = currentMeasurements.findIndex(
      (m) => m.measurementNameId === measurementNameId,
    );

    if (measurementIndex > -1) {
      setValue(
        `${measurementsPath}[${measurementIndex}].measurementValue.value` as any,
        measurementValue,
        { shouldDirty: true },
      );
    } else {
      const newMeasurement = {
        measurementNameId,
        measurementValue: { value: measurementValue },
      };
      const updatedMeasurements = [...currentMeasurements, newMeasurement];
      setValue(measurementsPath as any, updatedMeasurements, { shouldDirty: true });
    }
  };

  return (
    <>
      <TableContainer component={Paper} className='border-2 border-text'>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell className='uppercase'>Size Name</TableCell>
              <TableCell align='center' className='uppercase'>
                Quantity
              </TableCell>
              {measurementsToDisplay.map((m) => (
                <TableCell align='center' className='uppercase' key={m.id}>
                  {findInDictionary(dictionary, m.id, 'measurement')}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSizes.map((size, index) => {
              const sizeIndex =
                values.sizeMeasurements?.findIndex(
                  (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === size.id,
                ) ?? -1;

              const isLastSize = index === filteredSizes.length - 1;

              if (!isLastSize && lastSizeNonZero) {
                return null;
              }

              return (
                <TableRow key={size.id}>
                  <TableCell component='th' scope='row'>
                    {findInDictionary(dictionary, size.id, 'size')}
                  </TableCell>
                  <TableCell align='center' className='bg-inactive'>
                    <TextField
                      name={`sizeMeasurements[${sizeIndex}].productSize.sizeId`}
                      type='text'
                      value={
                        values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value === '0'
                          ? ''
                          : values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value || ''
                      }
                      onChange={(e) => {
                        if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                          handleSizeChange(e, size.id);
                        }
                      }}
                      className='w-20'
                      disabled={!isLastSize && lastSizeNonZero}
                    />
                  </TableCell>
                  {measurementsToDisplay.map((measurement) => (
                    <TableCell align='center' key={measurement.id}>
                      <TextField
                        type='text'
                        value={
                          values.sizeMeasurements?.[sizeIndex]?.measurements?.find(
                            (m) => m.measurementNameId === measurement.id,
                          )?.measurementValue?.value || ''
                        }
                        onChange={(e) => {
                          if (/^\d*$/.test(e.target.value)) {
                            handleMeasurementChange(e, size.id, measurement.id);
                          }
                        }}
                        inputProps={{ min: 0 }}
                        className='w-20'
                        disabled={!isLastSize && lastSizeNonZero}
                      />
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      {errors?.sizeMeasurements && (
        <Text>{(errors.sizeMeasurements as any)?.message || 'Invalid sizes'}</Text>
      )}
    </>
  );
}
