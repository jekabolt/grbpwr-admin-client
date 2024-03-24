import CheckIcon from '@mui/icons-material/Check';
import {
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from '@mui/material';
import { updateMeasurement, updateSize } from 'api/byID';
import {
  AddProductMeasurementRequest,
  UpdateProductSizeStockRequest,
  common_Dictionary,
} from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import { FC, useEffect, useState } from 'react';
import { ProductIdProps } from '../../utility/interfaces';

export const SizesAndMeasurements: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [sizeUpdates, setSizeUpdates] = useState<{ [sizeId: number]: number }>({});
  const [measurementUpdates, setMeasurementUpdates] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    const data = localStorage.getItem('dictionary');
    if (data) {
      setDictionary(JSON.parse(data));
    }
  });

  useEffect(() => {
    const initialSizeUpdates = (product?.sizes || []).reduce(
      (acc, size) => {
        if (typeof size.sizeId === 'number') {
          const quantityValue = size.quantity?.value ? parseInt(size.quantity.value, 10) : 0;
          acc[size.sizeId] = quantityValue;
        }
        return acc;
      },
      {} as { [sizeId: number]: number },
    );
    setSizeUpdates(initialSizeUpdates);
  }, [product]);

  const handleQuantityChange = (sizeId: number | undefined, newValue: number) => {
    if (typeof sizeId === 'number') {
      // Check if sizeId is a number
      setSizeUpdates({ ...sizeUpdates, [sizeId]: newValue });
    }
  };

  const handleUpdateSize = async (sizeId: number | undefined) => {
    if (typeof sizeId === 'number') {
      // Check if sizeId is a number
      const request: UpdateProductSizeStockRequest = {
        productId: Number(id),
        sizeId: sizeId,
        quantity: sizeUpdates[sizeId],
      };
      try {
        await updateSize(request);
        // Here you might want to fetch updated product sizes or signal an update
        console.log('Size updated successfully');
      } catch (error) {
        console.error('Failed to update size', error);
      }
    }
  };
  const getProductSizeQuantity = (sizeId: number | undefined) => {
    const size = product?.sizes?.find((productSize) => productSize.sizeId === sizeId);
    return size ? size.quantity?.value : '';
  };

  const getProductMeasurementValue = (
    productSizeId: number | undefined,
    measurementId: number | undefined,
  ) => {
    const sizeMeasurements = product?.measurements?.filter(
      (measurement) => measurement.productSizeId === productSizeId,
    );

    const measurement = sizeMeasurements?.find((m) => m.measurementNameId === measurementId);
    return measurement ? measurement.measurementValue?.value : '';
  };

  const handleMeasurementChange = (
    productSizeId: number | undefined,
    measurementId: number | undefined,
    newValue: string,
  ) => {
    if (typeof productSizeId === 'number' && typeof measurementId === 'number') {
      const key = `${productSizeId}-${measurementId}`;
      setMeasurementUpdates({ ...measurementUpdates, [key]: newValue });
    }
  };

  const handleUpdateMeasurement = async (
    productSizeId: number | undefined,
    measurementId: number | undefined,
  ) => {
    if (typeof productSizeId === 'number' && typeof measurementId === 'number') {
      const key = `${productSizeId}-${measurementId}`;
      const measurementValue = measurementUpdates[key];

      const request: AddProductMeasurementRequest = {
        productId: Number(id), // Assuming 'id' is your productId
        sizeId: productSizeId,
        measurementNameId: measurementId,
        measurementValue: { value: measurementValue }, // Adjust based on your actual expected value format
      };

      try {
        await updateMeasurement(request);
        console.log('Measurement updated successfully');
      } catch (error) {
        console.error('Failed to update measurement', error);
      }
    }
  };

  return (
    <TableContainer component={Paper} style={{ width: '100%', margin: 'auto' }}>
      <Table aria-label='sizes table'>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell align='center'>Quantity</TableCell>
            {dictionary?.measurements?.map((measurement) => (
              <TableCell key={measurement.id} align='center'>
                {findInDictionary(dictionary, measurement.id, 'measurement')}
              </TableCell>
            ))}
            <TableCell align='center'>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {dictionary?.sizes?.map((size) => {
            const sizeId = typeof size.id === 'number' ? size.id : null;
            const sizeUpdateValue = sizeId !== null ? sizeUpdates[sizeId] || 0 : 0;

            return (
              <TableRow key={size.id}>
                <TableCell component='th' scope='row'>
                  {findInDictionary(dictionary, size.id, 'size')}
                </TableCell>
                <TableCell align='center'>
                  <TextField
                    type='number'
                    value={sizeUpdateValue}
                    onChange={(e) =>
                      sizeId !== null && handleQuantityChange(sizeId, parseInt(e.target.value, 10))
                    }
                    inputProps={{ min: 0 }}
                    style={{ width: '80px' }} // Adjust width as needed
                  />
                </TableCell>
                {dictionary.measurements?.map((measurement) => {
                  const measurementKey = `${size.id}-${measurement.id}`;
                  const measurementValue =
                    measurementUpdates[measurementKey] ||
                    getProductMeasurementValue(size.id, measurement.id);

                  return (
                    <TableCell key={measurementKey} align='center'>
                      <TextField
                        type='number'
                        value={measurementValue}
                        onChange={(e) =>
                          handleMeasurementChange(size.id, measurement.id, e.target.value)
                        }
                        style={{ width: '80px' }} // Adjust width as needed
                      />
                      <IconButton
                        aria-label='delete'
                        color='primary'
                        onClick={() => handleUpdateMeasurement(size.id, measurement.id)}
                        size='small'
                      >
                        <CheckIcon />
                      </IconButton>
                    </TableCell>
                  );
                })}
                <TableCell align='center'>
                  <Button
                    variant='contained'
                    color='primary'
                    onClick={() => sizeId !== null && handleUpdateSize(sizeId)}
                  >
                    Update Size
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};
