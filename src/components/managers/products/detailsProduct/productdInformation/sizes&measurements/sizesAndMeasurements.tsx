import CheckIcon from '@mui/icons-material/Check';
import {
  Box,
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
import { UpdateProductSizeStockRequest, common_Dictionary } from 'api/proto-http/admin';
import { findInDictionary } from 'components/managers/orders/utility';
import { sortItems } from 'components/managers/products/addProduct/sizes';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/product-details.scss';
import { ProductIdProps } from '../../utility/interfaces';

export const SizesAndMeasurements: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [sizeUpdates, setSizeUpdates] = useState<{ [sizeId: number]: number }>({});
  const [measurementUpdates, setMeasurementUpdates] = useState<{ [key: string]: string }>({});
  const sortedSizes = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

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
      setSizeUpdates({ ...sizeUpdates, [sizeId]: newValue });
    }
  };

  const handleUpdateSize = async (sizeId: number | undefined) => {
    if (typeof sizeId === 'number') {
      const request: UpdateProductSizeStockRequest = {
        productId: Number(id),
        sizeId: sizeId,
        quantity: sizeUpdates[sizeId],
      };
      try {
        await updateSize(request);
        console.log('Size updated successfully');
      } catch (error) {
        console.error('Failed to update size', error);
      }
    }
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
      const newValue = measurementUpdates[key];

      // Constructing the request object for the batch update, even though we're updating only one measurement here
      const request = {
        productId: Number(id), // assuming 'id' is your product ID
        measurements: [
          {
            sizeId: productSizeId,
            measurementNameId: measurementId,
            measurementValue: { value: newValue }, // Make sure this matches the expected structure in your backend
          },
        ],
      };

      try {
        await updateMeasurement(request);
        console.log('Measurement updated successfully');
      } catch (error) {
        console.error('Failed to update measurement', error);
      }
    }
  };

  const handleBatchUpdateMeasurements = async () => {
    const measurementUpdatesArray = Object.entries(measurementUpdates).map(([key, value]) => {
      const [productSizeId, measurementNameId] = key.split('-').map(Number);
      return {
        sizeId: productSizeId,
        measurementNameId: measurementNameId,
        measurementValue: { value }, // Make sure this format matches what your API expects
      };
    });

    const request = {
      productId: Number(id),
      measurements: measurementUpdatesArray,
    };

    try {
      await updateMeasurement(request);
      console.log('All measurements updated successfully');
      setMeasurementUpdates({});

      fetchProduct();
    } catch (error) {
      console.error('Failed to update measurements', error);
    }
  };

  return (
    <TableContainer component={Paper} className={styles.size_measurement_table}>
      <Table aria-label='sizes table'>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell align='center'>Quantity</TableCell>
            {sortedMeasurements.map((measurement) => (
              <TableCell key={measurement.id} align='center'>
                {findInDictionary(dictionary, measurement.id, 'measurement')}
              </TableCell>
            ))}
            <TableCell align='center'>Actions</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSizes.map((size) => {
            const sizeId = typeof size.id === 'number' ? size.id : null;
            const sizeUpdateValue = sizeId !== null ? sizeUpdates[sizeId] || 0 : 0;

            return (
              <TableRow key={size.id}>
                <TableCell component='th' scope='row'>
                  {findInDictionary(dictionary, size.id, 'size')}
                </TableCell>
                <TableCell align='center'>
                  <Box display='flex' alignItems='center'>
                    <TextField
                      type='number'
                      value={sizeUpdateValue}
                      onChange={(e) =>
                        sizeId !== null &&
                        handleQuantityChange(sizeId, parseInt(e.target.value, 10))
                      }
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                    />
                    <IconButton
                      color='primary'
                      onClick={() => sizeId !== null && handleUpdateSize(sizeId)}
                    >
                      <CheckIcon />
                    </IconButton>
                  </Box>
                </TableCell>

                {sortedMeasurements.map((measurementDict) => {
                  const measurementKey = `${size.id}-${measurementDict.id}`;
                  const currentMeasurement = product?.measurements?.find(
                    (m) => m.productSizeId === sizeId && m.measurementNameId === measurementDict.id,
                  );
                  const measurementValue =
                    measurementUpdates[measurementKey] ??
                    currentMeasurement?.measurementValue?.value ??
                    '';

                  return (
                    <TableCell key={measurementKey} align='center'>
                      <TextField
                        type='number'
                        value={measurementValue}
                        onChange={(e) =>
                          handleMeasurementChange(size.id, measurementDict.id, e.target.value)
                        }
                        style={{ width: '80px' }}
                      />
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
      <Button
        variant='contained'
        color='primary'
        onClick={handleBatchUpdateMeasurements}
        style={{ margin: '20px' }} // Adjust styling as needed
      >
        Update All Measurements
      </Button>
    </TableContainer>
  );
};
