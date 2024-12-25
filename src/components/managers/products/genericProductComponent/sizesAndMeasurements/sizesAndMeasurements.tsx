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
  Typography,
} from '@mui/material';
import {
  common_CategoryEnum,
  common_MeasurementNameEnum,
  common_ProductNew,
} from 'api/proto-http/admin';
import { sortItems } from 'features/filterForSizesAndMeasurements/filter';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { useFormikContext } from 'formik';
import { useDictionaryStore } from 'lib/stores/store';
import React, { FC, useCallback, useEffect, useState } from 'react';
import styles from 'styles/addProd.scss';
import { ProductSizesAndMeasurementsInterface } from '../interface/interface';
import { categoryMeasurementsMapping } from './mappingMeasurementsForCategories';

export const SizesAndMeasurements: FC<ProductSizesAndMeasurementsInterface> = ({
  isEditMode = true,
  isAddingProduct,
}) => {
  const { dictionary } = useDictionaryStore();
  const { values, setFieldValue, errors, touched } = useFormikContext<common_ProductNew>();
  const [lastSizeNonZero, setLastSizeNonZero] = useState(false);
  const [hasChangedSize, setHasChangedSize] = useState<{ [key: number]: boolean }>({});
  const [hasConfirmedSizeChange, setHasConfirmedSizeChange] = useState(false);
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];
  const disableFields = isAddingProduct ? false : !isEditMode;

  const selectedCategory = dictionary?.categories?.find(
    (category) => category.id === values.product?.productBody?.categoryId,
  );
  const relevantMeasurements = selectedCategory
    ? categoryMeasurementsMapping[selectedCategory.name as common_CategoryEnum] ?? []
    : [];
  const measurementsToDisplay = sortedMeasurements.filter((m) =>
    relevantMeasurements.includes(m.name as common_MeasurementNameEnum),
  );

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
    [values.sizeMeasurements, setFieldValue, sortedSizes, isEditMode, hasChangedSize],
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

  return (
    <>
      <TableContainer
        component={Paper}
        sx={{
          border:
            touched.sizeMeasurements && errors.sizeMeasurements
              ? '2px solid red'
              : '1px solid black',
        }}
      >
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Size Name</TableCell>
              <TableCell className={styles.table_cell}>Quantity</TableCell>
              {measurementsToDisplay.map((m) => (
                <TableCell key={m.id}>
                  {findInDictionary(dictionary, m.id, 'measurement')}
                </TableCell>
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
                        type='text'
                        value={
                          values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value === '0'
                            ? ''
                            : values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value ||
                              ''
                        }
                        onChange={(e) => {
                          if (e.target.value === '' || /^\d+$/.test(e.target.value)) {
                            handleSizeChange(e, size.id);
                          }
                        }}
                        style={{ width: '80px' }}
                        disabled={disableFields || (!isLastSize && lastSizeNonZero)}
                      />
                    </Box>
                  </TableCell>
                  {measurementsToDisplay.map((measurement) => (
                    <TableCell key={measurement.id}>
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
      {touched.sizeMeasurements && errors.sizeMeasurements && (
        <Typography color='error' variant='overline'>
          {errors.sizeMeasurements}
        </Typography>
      )}
    </>
  );
};
