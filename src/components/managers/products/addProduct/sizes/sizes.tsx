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
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import styles from 'styles/addProd.scss';
import { AddProductInterface } from '../addProductInterface/addProductInterface';

interface Size {
  id?: number;
}

export const Sizes: FC<AddProductInterface> = ({ dictionary }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const moveLastToFirst = (arr: Size[]): Size[] => {
    if (arr.length > 1) {
      const lastItem = arr.pop();
      if (lastItem !== undefined) {
        arr.unshift(lastItem);
      }
    }
    return arr;
  };

  const sortedSizes: Size[] = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const updatedSizes = moveLastToFirst([...sortedSizes]);
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];
  const theme = useTheme();
  const matches = useMediaQuery(theme.breakpoints.down('sm'));
  const [isSizeFilled, setIsSizeFilled] = useState(false);

  const initialHiddenSizes = {
    firstSize: false,
    otherSizes: Array(Math.max(0, sortedSizes.length - 1)).fill(false),
  };

  const [hiddenSizes, setHiddenSizes] = useState<{ firstSize: boolean; otherSizes: boolean[] }>(
    initialHiddenSizes,
  );

  const handleSizeChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeIndex: number,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value`;
    setFieldValue(quantityPath, value);
    const sizeIdPath = `sizeMeasurements[${sizeIndex}].productSize.sizeId`;
    setFieldValue(sizeIdPath, sizeId);

    const numericValue = parseInt(value, 10);
    const newHiddenSizes = { ...hiddenSizes };
    if (sizeIndex === 0) {
      newHiddenSizes.firstSize = numericValue > 0;
    } else {
      newHiddenSizes.otherSizes[sizeIndex - 1] = numericValue > 0;
    }

    setHiddenSizes(newHiddenSizes);
    setIsSizeFilled(newHiddenSizes.firstSize || newHiddenSizes.otherSizes.some((s) => s));
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeIndex: number,
    measurementNameId: number,
  ) => {
    const measurementValue = e.target.value;
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
          {updatedSizes.map((size, sizeIndex) => {
            if (
              (sizeIndex === 0 && hiddenSizes.otherSizes.some((s) => s)) ||
              (sizeIndex !== 0 && hiddenSizes.firstSize)
            ) {
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
                        values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value || ''
                      }
                      onChange={(e) => handleSizeChange(e, sizeIndex, size.id)}
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                      onKeyDown={removePossibilityToUseSigns}
                      required={!isSizeFilled}
                    />
                  </Box>
                </TableCell>
                {sortedMeasurements.map((measurement) => (
                  <TableCell key={measurement.id}>
                    <TextField
                      type='number'
                      onChange={(e) => handleMeasurementChange(e, sizeIndex, measurement.id!)}
                      inputProps={{ min: 0 }}
                      onKeyDown={removePossibilityToUseSigns}
                      style={{ width: '80px' }}
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
