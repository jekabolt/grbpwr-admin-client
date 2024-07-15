import {
  Box,
  Checkbox,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Typography,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { getDictionary } from 'api/admin';
import { common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { isValid, parseISO } from 'date-fns';
import { generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { formatDate } from 'features/utilitty/formateDate';
import { restrictNumericInput } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, useFormikContext } from 'formik';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { Country } from '../../addProduct/addProductInterface/addProductInterface';
import { BasicProductInterface } from '../utility/interfaces';

export const BasicProductIformation: FC<BasicProductInterface> = ({ product, isEditMode }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [dictionary, setDictionary] = useState<common_Dictionary>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const handleFieldChange = useCallback(
    (
      e: SelectChangeEvent<string | number> | React.ChangeEvent<HTMLInputElement>,
      field: string,
    ) => {
      let newValue = e.target.value;
      if (field === 'color' && typeof newValue === 'string') {
        newValue = newValue.toLowerCase().replace(/\s/g, '_');
        const selectedColor = colors.find(
          (color) => color.name.toLowerCase().replace(/\s/g, '_') === newValue,
        );
        setFieldValue(
          'product.productBody.colorHex',
          selectedColor ? selectedColor.hex : '#000000',
          false,
        );
      }
      setFieldValue(`product.productBody.${field}`, newValue);

      const updatedValues = {
        ...values.product?.productBody,
        [field]: newValue,
      };

      const newSKU = generateSKU(
        updatedValues.brand,
        updatedValues.targetGender,
        findInDictionary(dictionary, updatedValues.categoryId, 'category'),
        updatedValues.color,
        updatedValues.countryOfOrigin,
      );
      setFieldValue('product.productBody.sku', newSKU);
    },
    [values.product?.productBody, setFieldValue],
  );

  const parseDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    const parsedDate = parseISO(dateString);
    return isValid(parsedDate) ? parsedDate : null;
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            label='PRODUCT ID'
            InputLabelProps={{ shrink: true }}
            InputProps={{ readOnly: true }}
            value={product?.product?.id || ''}
            fullWidth
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label='CREATED'
            InputLabelProps={{ shrink: true }}
            InputProps={{ readOnly: true }}
            value={product?.product?.createdAt ? formatDate(product?.product?.createdAt) : ''}
            fullWidth
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label='UPDATED'
            InputLabelProps={{ shrink: true }}
            InputProps={{ readOnly: true }}
            value={product?.product?.updatedAt ? formatDate(product?.product?.updatedAt) : ''}
            fullWidth
          />
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            name='product.productBody.name'
            variant='outlined'
            label='NAME'
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            name='product.productBody.brand'
            variant='outlined'
            label='BRAND'
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel shrink>GENDER</InputLabel>
            <Select
              name='product.productBody.targetGender'
              value={values.product?.productBody?.targetGender || ''}
              onChange={(e) => {
                handleFieldChange(e, 'targetGender');
              }}
              displayEmpty
              label='GENDER'
              disabled={!isEditMode}
            >
              {dictionary?.genders?.map((gender) => (
                <MenuItem key={gender.id} value={gender.id}>
                  {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel shrink>CATEGORY</InputLabel>
            <Select
              name='product.productBody.categoryId'
              onChange={(e) => handleFieldChange(e, 'categoryId')}
              value={values.product?.productBody?.categoryId || ''}
              displayEmpty
              label='CATEGORY'
              disabled={!isEditMode}
            >
              {dictionary?.categories?.map((category) => (
                <MenuItem key={category.id} value={category.id?.toString()}>
                  {findInDictionary(dictionary, category.id, 'category')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel shrink>COLOR</InputLabel>
            <Select
              name='product.product.productBody.color'
              value={values.product?.productBody?.color || ''}
              onChange={(e) => handleFieldChange(e, 'color')}
              displayEmpty
              label='COLOR'
              disabled={!isEditMode}
            >
              <MenuItem value='' disabled>
                {product?.product?.productDisplay?.productBody?.color}
              </MenuItem>
              {colors.map((color, id) => (
                <MenuItem key={id} value={color.name.toLowerCase().replace(/\s/g, '_')}>
                  {color.name.toLowerCase().replace(/\s/g, '_')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            name='product.productBody.colorHex'
            variant='outlined'
            label='COLOR HEX'
            InputLabelProps={{ shrink: true }}
            type='color'
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth>
            <InputLabel shrink>COUNTRY</InputLabel>
            <Select
              name='product.productBody.countryOfOrigin'
              value={values.product?.productBody?.countryOfOrigin || ''}
              onChange={(e) => handleFieldChange(e, 'countryOfOrigin')}
              displayEmpty
              label='COUNTRY'
              disabled={!isEditMode}
            >
              {countries.map((country) => (
                <MenuItem key={country.value} value={country.value}>
                  {country.label}, {country.value}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            type='number'
            name='product.productBody.price.value'
            variant='outlined'
            label='PRICE'
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 0, pattern: '[0-9]*' }}
            onKeyDown={restrictNumericInput}
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>

        <Grid item xs={12}>
          <TextField
            type='number'
            name='product.productBody.salePercentage.value'
            variant='outlined'
            label='SALE PERCENTAGE'
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 0 }}
            onKeyDown={restrictNumericInput}
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>

        <Grid item xs={12}>
          <DatePicker
            name='product.productBody.preorder'
            value={parseDate(values.product?.productBody?.preorder)}
            label='PREORDER'
            minDate={new Date()}
            slotProps={{
              textField: { fullWidth: true, InputLabelProps: { shrink: true } },
            }}
            disabled={!isEditMode}
          />
        </Grid>

        <Grid item xs={12}>
          <Field
            as={TextField}
            name='product.productBody.description'
            variant='outlined'
            label='DESCRIPTION'
            InputLabelProps={{ shrink: true }}
            multiline
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            name='product.productBody.sku'
            variant='outlined'
            label='SKU'
            InputProps={{ readOnly: true }}
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={!isEditMode}
          />
        </Grid>
        <Grid item xs={12}>
          <Box display='flex' alignItems='center'>
            <Typography textTransform='uppercase' variant='h6'>
              hiden
            </Typography>
            <Checkbox name='product.productBody.hidden' disabled={!isEditMode} />
          </Box>
        </Grid>
      </Grid>
    </LocalizationProvider>
  );
};
