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
import { getDictionary } from 'api/admin';
import { common_Dictionary } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { format } from 'date-fns';
import { generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { formatDate } from 'features/utilitty/formateDate';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, useFormikContext } from 'formik';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { Country } from '../../addProduct/addProductInterface/addProductInterface';
import { BasicProductInterface } from '../utility/interfaces';

export const BasicProductIformation: FC<BasicProductInterface> = ({ product, isEdit }) => {
  const { values, setFieldValue } = useFormikContext<any>();
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
        ...values.product,
        [field]: newValue,
      };

      const newSKU = generateSKU(
        updatedValues.productBody?.brand,
        updatedValues.productBody?.targetGender,
        findInDictionary(dictionary, updatedValues.productBody?.categoryId, 'category'),
        updatedValues.productBody?.color,
        updatedValues.productBody?.countryOfOrigin,
      );
      setFieldValue('product.productBody.sku', newSKU);
    },
    [values.product, setFieldValue],
  );

  const getCountryLabel = (countryValue: string | undefined) => {
    if (!countryValue || !countries) return '';
    const matchingCountry = countries.find((country) => country.value === countryValue);
    return matchingCountry ? matchingCountry.label : '';
  };

  const getCurrentDate = () => {
    const today = new Date();
    return format(today, 'yyyy-MM-dd');
  };

  return (
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
          >
            <MenuItem value='' disabled>
              {product?.product?.productDisplay?.productBody?.targetGender}
            </MenuItem>
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
          >
            <MenuItem value='' disabled>
              {findInDictionary(
                dictionary,
                product?.product?.productDisplay?.productBody?.categoryId,
                'category',
              )}
            </MenuItem>
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
            name='product.productBody.color'
            value={values.product?.productBody?.color || ''}
            onChange={(e) => handleFieldChange(e, 'color')}
            displayEmpty
            label='COLOR'
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
          >
            <MenuItem value='' disabled>
              {getCountryLabel(product?.product?.productDisplay?.productBody?.countryOfOrigin)}
            </MenuItem>
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
          onKeyDown={removePossibilityToUseSigns}
          fullWidth
        />
      </Grid>

      <Grid item xs={12}>
        <TextField
          type='number'
          name='salePercentage'
          variant='outlined'
          label='SALE PERCENTAGE'
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0 }}
          onKeyDown={removePossibilityToUseSigns}
          fullWidth
        />
      </Grid>

      <Grid item xs={12}>
        <TextField
          name='preorder'
          type='date'
          variant='outlined'
          label='PREORDER'
          InputLabelProps={{ shrink: true }}
          inputProps={{
            min: isEdit ? getCurrentDate() : undefined,
          }}
          fullWidth
        />
      </Grid>

      <Grid item xs={12}>
        <Field
          as={TextField}
          name='product.productBody.description'
          variant='outlined'
          label='DESCRIPTION'
          placeholder={product?.product?.productDisplay?.productBody?.description}
          InputLabelProps={{ shrink: true }}
          multiline
          fullWidth
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
        />
      </Grid>
      <Grid item xs={12}>
        <Box display='flex' alignItems='center'>
          <Typography textTransform='uppercase' variant='h6'>
            hiden
          </Typography>
          <Checkbox name='product.productBody.hidden' />
        </Box>
      </Grid>
    </Grid>
  );
};
