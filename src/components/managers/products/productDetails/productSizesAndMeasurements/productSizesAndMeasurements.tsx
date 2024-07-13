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
import { getDictionary } from 'api/admin';
import { common_Dictionary, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { sortItems } from 'features/filterForSizesAndMeasurements/filter';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { useFormikContext } from 'formik';
import { FC, useEffect, useState } from 'react';

interface Size {
  id?: number;
}

interface ProductSizesAndMeasurementsProps {
  product: common_ProductFull;
}

export const ProductSizesAndMeasurements: FC<ProductSizesAndMeasurementsProps> = ({ product }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [dictionary, setDictionary] = useState<common_Dictionary>();

  const sortedSizes: Size[] = dictionary && dictionary.sizes ? sortItems(dictionary.sizes) : [];
  const sortedMeasurements =
    dictionary && dictionary.measurements ? sortItems(dictionary.measurements) : [];

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const handleSizeChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    const sizeIndex = values.sizeMeasurements?.findIndex(
      (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === sizeId,
    );

    if (sizeIndex === -1) {
      // Add new sizeMeasurement entry if it doesn't exist
      const newSizeMeasurement = {
        productSize: { sizeId, quantity: { value } },
        measurements: [],
      };
      setFieldValue('sizeMeasurements', [...(values.sizeMeasurements || []), newSizeMeasurement]);
    } else if (sizeIndex !== undefined) {
      const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value`;
      setFieldValue(quantityPath, value);
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

    if (sizeIndex === -1) {
      // Add new sizeMeasurement entry if it doesn't exist
      const newSizeMeasurement = {
        productSize: { sizeId, quantity: { value: '' } },
        measurements: [{ measurementNameId, measurementValue: { value: measurementValue } }],
      };
      setFieldValue('sizeMeasurements', [...(values.sizeMeasurements || []), newSizeMeasurement]);
    } else if (sizeIndex !== undefined) {
      const measurementsPath = `sizeMeasurements[${sizeIndex}].measurements`;
      const currentMeasurements = values.sizeMeasurements?.[sizeIndex]?.measurements || [];

      const updatedMeasurements = currentMeasurements.map((measurement) =>
        measurement.measurementNameId === measurementNameId
          ? { ...measurement, measurementValue: { value: measurementValue } }
          : measurement,
      );

      if (!updatedMeasurements.find((m) => m.measurementNameId === measurementNameId)) {
        updatedMeasurements.push({
          measurementNameId,
          measurementValue: { value: measurementValue },
        });
      }
      setFieldValue(measurementsPath, updatedMeasurements);
    }
  };

  return (
    <TableContainer component={Paper} sx={{ border: '1px solid black' }}>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell>Size Name</TableCell>
            <TableCell>Quantity</TableCell>
            {sortedMeasurements.map((m) => (
              <TableCell key={m.id}>{findInDictionary(dictionary, m.id, 'measurement')}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {sortedSizes.map((size) => {
            const sizeIndex =
              values.sizeMeasurements?.findIndex(
                (sizeMeasurement) => sizeMeasurement.productSize?.sizeId === size.id,
              ) ?? -1;

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
                        sizeIndex !== -1
                          ? values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value || ''
                          : ''
                      }
                      onChange={(e) => handleSizeChange(e, size.id)}
                      inputProps={{ min: 0 }}
                      style={{ width: '80px' }}
                    />
                  </Box>
                </TableCell>
                {sortedMeasurements.map((measurement) => (
                  <TableCell key={measurement.id}>
                    <TextField
                      type='number'
                      value={
                        sizeIndex !== -1
                          ? values.sizeMeasurements?.[sizeIndex]?.measurements?.find(
                              (m) => m.measurementNameId === measurement.id,
                            )?.measurementValue?.value || ''
                          : ''
                      }
                      onChange={(e) => handleMeasurementChange(e, size.id, measurement.id)}
                      inputProps={{ min: 0 }}
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
