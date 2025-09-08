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
import { common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { sortItems } from 'lib/features/filter-size-measurements';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useDictionaryStore } from 'lib/stores/store';
import React, { FC, useEffect, useState } from 'react';
import Text from 'ui/components/text';

import { useCategories } from 'lib/features/useCategories';
import { ProductSizesAndMeasurementsInterface } from '../interface/interface';
import { getMeasurementsForCategory } from '../utility/mappingMeasurementsForCategories';
import { getFilteredSizes } from '../utility/sizes';

export const SizesAndMeasurements: FC<ProductSizesAndMeasurementsInterface> = ({
  isEditMode = true,
  isAddingProduct,
}) => {
  const { dictionary } = useDictionaryStore();
  const { values, setFieldValue, errors, touched } = useFormikContext<common_ProductNew>();
  const [lastSizeNonZero, setLastSizeNonZero] = useState(false);
  const [hasChangedSize, setHasChangedSize] = useState<{ [key: number]: boolean }>({});
  const [hasConfirmedSizeChange, setHasConfirmedSizeChange] = useState(false);
  const { selectedTopCategoryName, selectedSubCategoryName, selectedTypeName } = useCategories(
    values.product?.productBodyInsert?.topCategoryId || 0,
    values.product?.productBodyInsert?.subCategoryId || 0,
    values.product?.productBodyInsert?.typeId || 0,
  );

  const filteredSizes = getFilteredSizes(
    dictionary,
    values.product?.productBodyInsert?.topCategoryId || 0,
    values.product?.productBodyInsert?.typeId || 0,
  );

  const measurementsToDisplay = (() => {
    if (!dictionary?.measurements) return [];

    const requiredMeasurements = new Set([
      ...getMeasurementsForCategory(selectedTopCategoryName?.toLowerCase()),
      ...getMeasurementsForCategory(selectedSubCategoryName?.toLowerCase(), true),
      ...getMeasurementsForCategory(selectedTypeName?.toLowerCase(), false, selectedTypeName),
    ]);

    return sortItems(dictionary.measurements).filter((measurement) => {
      const measurementName = findInDictionary(
        dictionary,
        measurement.id,
        'measurement',
      )?.toLowerCase();
      return measurementName && requiredMeasurements.has(measurementName);
    });
  })();

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
        setFieldValue('sizeMeasurements', updatedSizeMeasurements);
      }
    }
  }, [values.sizeMeasurements, filteredSizes, setFieldValue]);

  const handleSizeChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;

    if (isEditMode && sizeId && !hasChangedSize[sizeId] && !hasConfirmedSizeChange) {
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
        setFieldValue('sizeMeasurements', [...(values.sizeMeasurements || []), newSizeMeasurement]);
      }
    } else {
      const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value`;
      setFieldValue(quantityPath, value);
    }

    const lastSizeId = filteredSizes[filteredSizes.length - 1].id;
    if (sizeId === lastSizeId) {
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
      setFieldValue(
        `${measurementsPath}[${measurementIndex}].measurementValue.value`,
        measurementValue,
      );
    } else {
      const newMeasurement = {
        measurementNameId,
        measurementValue: { value: measurementValue },
      };
      const updatedMeasurements = [...currentMeasurements, newMeasurement];
      setFieldValue(measurementsPath, updatedMeasurements);
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
      {touched.sizeMeasurements && errors.sizeMeasurements && (
        <Text>{errors.sizeMeasurements}</Text>
      )}
    </>
  );
};
