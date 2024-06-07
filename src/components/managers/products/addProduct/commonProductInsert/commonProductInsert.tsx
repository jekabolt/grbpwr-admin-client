import {
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { formatPreorderDate } from 'features/utilitty/formatPreorderDate';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, useFormikContext } from 'formik';
import React, { FC, useCallback, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { AddProductInterface, Country } from '../addProductInterface/addProductInterface';

export const CommonProductInsert: FC<AddProductInterface> = ({ dictionary }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const [showPreorder, setShowPreorder] = useState(true);
  const [showSales, setShowSales] = useState(true);
  const [preorderDate, setPreorderDate] = useState({
    initial: values.product?.preorder || '',
    formatted: formatPreorderDate(values.product?.preorder) || '',
  });

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>, flag: boolean = false) => {
    const { name, value } = e.target;
    setFieldValue(name, value.toString());
    if (flag) {
      const saleValue = value.trim();
      if (saleValue === '') {
        setShowPreorder(true);
      } else {
        const saleNumber = parseFloat(saleValue);
        setShowPreorder(saleNumber <= 0);
      }
    }
  };

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
        setFieldValue('product.colorHex', selectedColor ? selectedColor.hex : '#000000', false);
      }
      setFieldValue(`product.${field}`, newValue);

      const updatedValues = {
        ...values.product,
        [field]: newValue,
      };

      const newSKU = generateSKU(
        updatedValues.brand,
        updatedValues.targetGender,
        findInDictionary(dictionary, updatedValues.categoryId, 'category'),
        updatedValues.color,
        updatedValues.countryOfOrigin,
      );
      setFieldValue('product.sku', newSKU);
    },
    [values.product, setFieldValue],
  );

  const handlePreorderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawDate = e.target.value;
    if (rawDate !== '') {
      const formattedDate = formatPreorderDate(rawDate);
      setPreorderDate({
        initial: rawDate,
        formatted: formattedDate,
      });
      setFieldValue('product.preorder', formattedDate);
      setShowSales(false);
    } else {
      setPreorderDate({
        initial: '',
        formatted: '',
      });
      setFieldValue('product.preorder', '');
      setShowSales(true);
    }
  };

  return (
    <Grid container display='grid' spacing={2}>
      <Grid item>
        <Field
          as={TextField}
          variant='outlined'
          label='NAME'
          name='product.name'
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>
      <Grid item>
        <Field
          as={TextField}
          variant='outlined'
          label='BRAND'
          name='product.brand'
          required
          InputLabelProps={{ shrink: true }}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
        />
      </Grid>
      <Grid item>
        <FormControl required fullWidth>
          <InputLabel shrink>GENDER</InputLabel>
          <Select
            value={values.product?.targetGender || ''}
            onChange={(e) => {
              handleFieldChange(e, 'targetGender');
            }}
            label='GENDER'
            displayEmpty
            name='product.targetGender'
          >
            {dictionary?.genders?.map((gender) => (
              <MenuItem key={gender.id} value={gender.id}>
                {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <FormControl required fullWidth>
          <InputLabel shrink>CATEGORY</InputLabel>
          <Select
            name='prodcut.categoryId'
            onChange={(e) => handleFieldChange(e, 'categoryId')}
            value={values.product?.categoryId || ''}
            label='CATEGORY'
            displayEmpty
          >
            {dictionary?.categories?.map((category) => (
              <MenuItem value={category.id} key={category.id}>
                {findInDictionary(dictionary, category.id, 'category')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <FormControl fullWidth required>
          <InputLabel shrink>COLOR</InputLabel>
          <Select
            value={values.product?.color || ''}
            onChange={(e) => handleFieldChange(e, 'color')}
            label='COLOR'
            displayEmpty
            name='product.color'
          >
            {colors.map((color, id) => (
              <MenuItem key={id} value={color.name.toLowerCase().replace(/\s/g, '_')}>
                {color.name.toLowerCase().replace(/\s/g, '_')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <Field
          as={TextField}
          type='color'
          label='COLOR HEX'
          name='product.colorHex'
          InputLabelProps={{ shrink: true }}
          required
          fullWidth
        />
      </Grid>
      <Grid item>
        <FormControl fullWidth required>
          <InputLabel shrink>COUNTRY</InputLabel>
          <Select
            name='product.countryOfOrigin'
            value={values.product?.countryOfOrigin || ''}
            onChange={(e) => handleFieldChange(e, 'countryOfOrigin')}
            label='COUNTRY'
            displayEmpty
          >
            {countries.map((country) => (
              <MenuItem key={country.value} value={country.value}>
                {country.label},{country.value}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <Field
          as={TextField}
          variant='outlined'
          label='PRICE'
          name='product.price.value'
          type='number'
          inputProps={{ min: 0 }}
          required
          InputLabelProps={{ shrink: true }}
          onChange={handlePriceChange}
          onKeyDown={removePossibilityToUseSigns}
        />
      </Grid>

      {showSales && (
        <Grid item>
          <Field
            as={TextField}
            label='SALE PERCENTAGE'
            name='product.salePercentage.value'
            onChange={(e: any) => handlePriceChange(e, true)}
            type='number'
            inputProps={{ min: 0, max: 99 }}
            InputLabelProps={{ shrink: true }}
            onKeyDown={removePossibilityToUseSigns}
            fullWidth
          />
        </Grid>
      )}

      {showPreorder && (
        <Grid item>
          <Field
            as={TextField}
            label='PREORDER'
            type='date'
            name='product.preorder'
            value={preorderDate.initial}
            onChange={handlePreorderChange}
            helperText={preorderDate.formatted}
            InputLabelProps={{ shrink: true }}
            fullWidth
          />
        </Grid>
      )}
      <Grid item>
        <Field
          as={TextField}
          label='DESCRIPTION'
          name='product.description'
          InputLabelProps={{ shrink: true }}
          multiline
          required
        />
      </Grid>

      <Grid item>
        <Field
          as={TextField}
          label='SKU'
          name='product.sku'
          InputProps={{ readOnly: true }}
          InputLabelProps={{ shrink: true }}
          required
          fullWidth
        />
      </Grid>
    </Grid>
  );
};
