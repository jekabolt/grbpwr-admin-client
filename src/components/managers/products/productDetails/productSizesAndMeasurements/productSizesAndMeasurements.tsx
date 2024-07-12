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
    sizeIndex: number,
    sizeId: number | undefined,
  ) => {
    const { value } = event.target;
    const quantityPath = `sizeMeasurements[${sizeIndex}].productSize.quantity.value`;
    setFieldValue(quantityPath, value);
    const sizeIdPath = `sizeMeasurements[${sizeIndex}].productSize.sizeId`;
    setFieldValue(sizeIdPath, sizeId);
  };

  const handleMeasurementChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    sizeIndex: number,
    measurementNameId: number,
  ) => {
    const measurementValue = e.target.value;
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
          {sortedSizes.map((size, sizeIndex) => (
            <TableRow key={size.id}>
              <TableCell component='th' scope='row'>
                {findInDictionary(dictionary, size.id, 'size')}
              </TableCell>
              <TableCell align='center' sx={{ bgcolor: '#f0f0f0' }}>
                <Box display='flex' alignItems='center'>
                  <TextField
                    name={`sizeMeasurements[${sizeIndex}].productSize.sizeId`}
                    type='number'
                    value={values.sizeMeasurements?.[sizeIndex]?.productSize?.quantity?.value || ''}
                    onChange={(e) => handleSizeChange(e, sizeIndex, size.id)}
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
                      values.sizeMeasurements?.[sizeIndex]?.measurements?.find(
                        (m) => m.measurementNameId === measurement.id,
                      )?.measurementValue?.value || ''
                    }
                    onChange={(e) => handleMeasurementChange(e, sizeIndex, measurement.id!)}
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
