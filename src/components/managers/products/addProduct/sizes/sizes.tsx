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
import { findInDictionary } from 'components/managers/orders/utility';
import React, { FC } from 'react';
import { AddproductSizesInterface } from '../interface/interface';

export function sortItems(item: { id?: number }[]) {
  return [...(item || [])]
    .filter((item) => item !== undefined)
    .sort((a, b) => {
      if (a.id !== undefined && b.id !== undefined) {
        return a.id - b.id;
      }
      return 0;
    });
}

export const Sizes: FC<AddproductSizesInterface> = ({ setProduct, dictionary }) => {
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

  const theme = useTheme();
  const matches = useMediaQuery(theme.breakpoints.down('sm'));

  const handleSizeChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeIndex: number | undefined,
  ) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }

    const { value } = e.target;
    setProduct((prevProduct) => {
      const updatedSizeMeasurements = [...(prevProduct.sizeMeasurements || [])];
      const sizeQuantity = { value };

      updatedSizeMeasurements[sizeIndex] = {
        productSize: {
          quantity: sizeQuantity,
          sizeId: sizeIndex,
        },
        measurements: [],
      };

      return { ...prevProduct, sizeMeasurements: updatedSizeMeasurements };
    });
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeIndex: number | undefined,
    measurementIndex: number,
  ) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }
    const measurementValue = e.target.value;

    setProduct((prevProduct) => {
      const updatedProduct = JSON.parse(JSON.stringify(prevProduct));
      if (!updatedProduct.sizeMeasurements[sizeIndex]) {
        updatedProduct.sizeMeasurements[sizeIndex] = {
          productSize: { sizeId: sizeIndex, quantity: {} },
          measurements: [],
        };
      }
      const existingMeasurementIndex = updatedProduct.sizeMeasurements[
        sizeIndex
      ].measurements.findIndex((m: any) => m.measurementId === measurementIndex);
      if (existingMeasurementIndex !== -1) {
        updatedProduct.sizeMeasurements[sizeIndex].measurements[existingMeasurementIndex] = {
          measurementId: measurementIndex,
          value: measurementValue,
        };
      } else {
        updatedProduct.sizeMeasurements[sizeIndex].measurements.push({
          measurementId: measurementIndex,
          value: measurementValue,
        });
      }

      return updatedProduct;
    });
  };

  return (
    <TableContainer component={Paper} sx={{ border: '1px solid black' }}>
      <Table size={matches ? 'small' : 'medium'}>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell sx={{ bgcolor: '#f0f0f0' }}>Quantity</TableCell>
            {sortedMeasurements.map((m) => (
              <TableCell>{findInDictionary(dictionary, m.id, 'measurement')}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSizes.map((size) => (
            <TableRow key={size.id}>
              <TableCell component='th' scope='row'>
                {findInDictionary(dictionary, size.id, 'size')}
              </TableCell>
              <TableCell align='center' sx={{ bgcolor: '#f0f0f0' }}>
                <Box display='flex' alignItems='center'>
                  <TextField
                    type='number'
                    onChange={(e) => handleSizeChange(e, size.id)}
                    inputProps={{ min: 0 }}
                    style={{ width: '80px' }}
                  />
                </Box>
              </TableCell>
              {sortedMeasurements.map((measurement, measurementIndex) => (
                <TableCell key={measurement.id}>
                  <TextField
                    type='number'
                    onChange={(e) => handleMeasurementChange(e, size.id, measurement.id!)}
                    inputProps={{ min: 0 }}
                    style={{ width: '80px' }}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
