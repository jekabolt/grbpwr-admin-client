import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { sortItems } from 'features/filterForSizesAndMeasurements/filter';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { restrictNumericInput } from 'features/utilitty/removePossibilityToEnterSigns';
import { useFormikContext } from 'formik';
import React, { FC, useCallback, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';
import { ProductSizesAndMeasurementsInterface } from '../interface/interface';

export const SizesAndMeasurements: FC<ProductSizesAndMeasurementsInterface> = ({
  isEditMode = true,
  isAddingProduct,
  dictionary,
}) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [lastSizeNonZero, setLastSizeNonZero] = useState(false);
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

  const theme = useTheme();
  const matches = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    if (sortedSizes.length > 0) {
      const lastSize = sortedSizes[sortedSizes.length - 1];
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
  }, [values.sizeMeasurements, sortedSizes, setFieldValue]);

  const handleSizeChange = useCallback(
    (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      sizeId: number | undefined,
    ) => {
      const { value } = event.target;

      const sizeIndex = values.sizeMeasurements?.findIndex(
        (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === sizeId,
      );

      if (sizeIndex === -1 || sizeIndex === undefined) {
        if (value !== '0' && value !== '') {
          const newSizeMeasurement = {
            productSize: { sizeId, quantity: { value } },
            measurements: [],
          };
          setFieldValue('sizeMeasurements', [
            ...(values.sizeMeasurements || []),
            newSizeMeasurement,
          ]);
        }
      } else {
        const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value`;
        setFieldValue(quantityPath, value);
      }

      const lastSizeId = sortedSizes[sortedSizes.length - 1].id;
      if (sizeId === lastSizeId) {
        setLastSizeNonZero(value !== '0' && value !== '');
      }
    },
    [values.sizeMeasurements, setFieldValue, sortedSizes],
  );

  const handleMeasurementChange = useCallback(
    (
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
    },
    [values.sizeMeasurements, setFieldValue],
  );

  const disableFields = isAddingProduct ? false : !isEditMode;

  return (
    <TableContainer component={Paper} sx={{ border: '1px solid black' }}>
      <Table size={matches ? 'small' : 'medium'}>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell className={styles.table_cell}>Quantity</TableCell>
            {sortedMeasurements.map((m) => (
              <TableCell key={m.id}>{findInDictionary(dictionary, m.id, 'measurement')}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSizes.map((size, index) => {
            const sizeIndex =
              values.sizeMeasurements?.findIndex(
                (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === size.id,
              ) ?? -1;

            const isLastSize = index === sortedSizes.length - 1;

            if (!isLastSize && lastSizeNonZero) {
              return null;
            }

            return (
              <TableRow key={size.id}>
                <TableCell component='th' scope='row'>
                  {findInDictionary(dictionary, size.id, 'size')}
                </TableCell>
                <TableCell align='center' sx={{ bgcolor: '#f0f0f0' }}>
                  <Box display='flex' alignItems='center'>
                    <TextField
                      name={`sizeMeasurements[${sizeIndex}].productSize.sizeId`}
                      type='number'
                      value={
                        values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value === '0'
                          ? ''
                          : values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value || ''
                      }
                      onChange={(e) => handleSizeChange(e, size.id)}
                      onKeyDown={restrictNumericInput}
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                      disabled={disableFields || (!isLastSize && lastSizeNonZero)}
                    />
                  </Box>
                </TableCell>
                {sortedMeasurements.map((measurement) => (
                  <TableCell key={measurement.id}>
                    <TextField
                      type='number'
                      value={
                        values.sizeMeasurements?.[sizeIndex]?.measurements?.find(
                          (m) => m.measurementNameId === measurement.id,
                        )?.measurementValue?.value || ''
                      }
                      onChange={(e) => handleMeasurementChange(e, size.id, measurement.id)}
                      onKeyDown={restrictNumericInput}
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                      disabled={disableFields || (!isLastSize && lastSizeNonZero)}
                    />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};