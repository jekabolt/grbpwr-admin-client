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
} from '@mui/material';
import { common_Dictionary, common_ProductNew, googletype_Decimal } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import React, { FC, useState } from 'react';

interface sizeProps {
  product: common_ProductNew;
  setProduct: React.Dispatch<React.SetStateAction<common_ProductNew>>;
  dictionary: common_Dictionary | undefined;
}

interface SelectedMeasurements {
  [sizeIndex: number]: number | undefined;
}

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

export const Sizes: FC<sizeProps> = ({ setProduct, dictionary, product }) => {
  const [selectedMeasurements, setSelectedMeasurements] = useState<SelectedMeasurements>({});
  const [tempMeasurementValues, setTempMeasurementValues] = useState<{ [key: number]: string }>({});
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

  const handleDeleteMeasurement = (sizeId: number, measurementId: number | undefined) => {
    setProduct((prevProduct) => {
      const updatedProduct = { ...prevProduct };
      if (updatedProduct.sizeMeasurements?.[sizeId]?.measurements) {
        updatedProduct.sizeMeasurements[sizeId].measurements = updatedProduct.sizeMeasurements[
          sizeId
        ].measurements?.filter((m) => m.measurementNameId !== measurementId);
      }
      return updatedProduct;
    });
  };

  const handleMeasurementSelection = (sizeIndex: number | undefined, measurementId: number) => {
    if (typeof sizeIndex === 'undefined') {
      return;
    }
    setSelectedMeasurements((prev) => ({ ...prev, [sizeIndex]: measurementId }));
  };

  const handleMeasurementValueChange = (
    sizeIndex: number | undefined,
    measurementId: number | undefined,
    value: string,
  ) => {
    if (typeof sizeIndex === 'undefined' || typeof measurementId === 'undefined') {
      return;
    }
    setTempMeasurementValues((prev) => ({ ...prev, [sizeIndex]: value }));
  };

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
      const sizeQuantity: googletype_Decimal = { value };

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

  const handleConfirmMeasurement = (
    sizeIndex: number | undefined,
    e: React.MouseEvent<HTMLButtonElement, MouseEvent>,
    measurementId: number | undefined,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof sizeIndex === 'undefined' || typeof measurementId === 'undefined') {
      return;
    }

    const measurementValue = tempMeasurementValues[sizeIndex];
    if (!measurementValue) {
      return;
    }

    setProduct((prevProduct) => {
      const updatedProduct = JSON.parse(JSON.stringify(prevProduct));

      if (!updatedProduct.sizeMeasurements) {
        updatedProduct.sizeMeasurements = [];
      }

      if (!updatedProduct.sizeMeasurements[sizeIndex]) {
        updatedProduct.sizeMeasurements[sizeIndex] = {
          productSize: { sizeId: sizeIndex },
          measurements: [],
        };
      }

      const measurementIndex = updatedProduct.sizeMeasurements[sizeIndex].measurements.findIndex(
        (m: { measurementNameId: number }) => m.measurementNameId === measurementId,
      );
      if (measurementIndex === -1) {
        updatedProduct.sizeMeasurements[sizeIndex].measurements.push({
          measurementNameId: measurementId,
          measurementValue: { value: measurementValue },
        });
      } else {
        updatedProduct.sizeMeasurements[sizeIndex].measurements[measurementIndex].measurementValue =
          { value: measurementValue };
      }

      return updatedProduct;
    });

    setTempMeasurementValues((prev) => ({ ...prev, [sizeIndex]: '' }));
  };

  return (
    <TableContainer component={Paper}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell>Quantity</TableCell>
            {sortedMeasurements.map((m) => (
              <TableCell>{findInDictionary(dictionary, m.id, 'measurement')}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSizes.map((size) => {
            if (typeof size.id !== 'number') return null; // Skip if size.id is not a number

            const sizeId = size.id;
            const sizeMeasurementsForCurrentSize = product.sizeMeasurements?.filter(
              (sm) => sm.productSize?.sizeId === sizeId,
            );

            return (
              <TableRow key={size.id}>
                <TableCell component='th' scope='row'>
                  {findInDictionary(dictionary, size.id, 'size')}
                </TableCell>
                <TableCell align='center'>
                  <Box>
                    <TextField
                      type='number'
                      name='quantity'
                      value={
                        product.sizeMeasurements?.find((sm) => sm.productSize?.sizeId === sizeId)
                          ?.productSize?.quantity?.value ?? ''
                      }
                      onChange={(e) => handleSizeChange(e, sizeId)}
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                    />
                  </Box>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
