import CheckIcon from '@mui/icons-material/Check';
import {
  Box,
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
import { getDictionary } from 'api/admin';
import { UpdateProductSizeStockRequest, common_Dictionary } from 'api/proto-http/admin';
import { updateSize } from 'api/updateProductsById';
import { sortItems } from 'features/filterForSizesAndMeasurements/filter';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { FC, useEffect, useState } from 'react';
import { ProductIdProps } from '../utility/interfaces';

interface Size {
  id?: number;
}

export const ProductSizesAndMeasurements: FC<ProductIdProps> = ({
  product,
  id,
  fetchProduct,
  showMessage,
}) => {
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const [sizeQuantity, setSizeQuantity] = useState<{ [sizeId: number]: number }>({});
  const [measurementQuantity, setMeasurementQuantity] = useState<{ [key: string]: string }>({});
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

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

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
    setSizeQuantity(initialSizeUpdates);
  }, [product]);

  const handleQuantityChange = (sizeId: number | undefined, newValue: number) => {
    if (typeof sizeId === 'number') {
      const newSizeQuantity = { ...sizeQuantity, [sizeId]: newValue };
      setSizeQuantity(newSizeQuantity);
    }
  };

  const handleUpdateSize = async (sizeId: number | undefined) => {
    if (typeof sizeId === 'number') {
      const isConfirmed = window.confirm('Are you sure you want to update the size?');

      try {
        if (isConfirmed) {
          const newSizeQuantity = { ...sizeQuantity };

          if (newSizeQuantity[updatedSizes[0].id!] > 0) {
            for (const size of updatedSizes.slice(1)) {
              if (typeof size.id === 'number') {
                newSizeQuantity[size.id] = 0;
              }
            }
          }

          setSizeQuantity(newSizeQuantity);

          const request: UpdateProductSizeStockRequest = {
            productId: Number(id),
            sizeId: sizeId,
            quantity: newSizeQuantity[sizeId],
          };
          const response = await updateSize(request);
          showMessage('PRODUCT HAS BEEN UPLOADED', 'success');
          if (response) {
            fetchProduct();
          }
        }
      } catch (error) {
        showMessage('SIZES CANNOT BE UPDATED', 'error');
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
      setMeasurementQuantity({ ...measurementQuantity, [key]: newValue });
    }
  };

  // const handleBatchUpdateMeasurements = async () => {
  //   const measurementQuantityArray = Object.entries(measurementQuantity).map(([key, value]) => {
  //     const [productSizeId, measurementNameId] = key.split('-').map(Number);
  //     return {
  //       sizeId: productSizeId,
  //       measurementNameId: measurementNameId,
  //       measurementValue: { value: value },
  //     };
  //   });

  //   try {
  //     const request = {
  //       productId: Number(id),
  //       measurements: measurementQuantityArray,
  //     };
  //     const response = await updateMeasurement(request);
  //     showMessage('PRODUCT HAS BEEN UPLOADED', 'success');
  //     if (response) {
  //       setMeasurementQuantity({});
  //       fetchProduct();
  //     }
  //   } catch (error) {
  //     showMessage('MEASUREMENTS CANNOT BE UPDATED', 'error');
  //   }
  // };

  const firstSizeQuantity = sizeQuantity[updatedSizes[0]?.id!] || 0;
  const shouldHideFirstSize = updatedSizes.slice(1).some((size) => sizeQuantity[size.id!] > 0);

  return (
    <TableContainer component={Paper}>
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
          </TableRow>
        </TableHead>
        <TableBody>
          {updatedSizes.map((size, index) => {
            if ((shouldHideFirstSize && index === 0) || (firstSizeQuantity > 0 && index > 0)) {
              return null;
            }

            const sizeId = typeof size.id === 'number' ? size.id : null;
            const sizeUpdateValue = sizeId !== null ? sizeQuantity[sizeId] || 0 : 0;

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
                      onKeyDown={removePossibilityToUseSigns}
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
                    measurementQuantity[measurementKey] ??
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
                        inputProps={{ min: 0 }}
                        onKeyDown={removePossibilityToUseSigns}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {/* <Button
        variant='contained'
        color='primary'
        onClick={handleBatchUpdateMeasurements}
        style={{ margin: '20px' }}
      >
        Update All Measurements
      </Button> */}
    </TableContainer>
  );
};
