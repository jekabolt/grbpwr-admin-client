import { FormControl, Grid, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { Field, useFormikContext } from 'formik';
import React, { FC } from 'react';
import { AddProductInterface } from '../addProductInterface/addProductInterface';

export const CommonProductInsert: FC<AddProductInterface> = ({ dictionary }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFieldValue(name, value.toString());
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
          label='COUNTRY'
          name='product.countryOfOrigin'
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
        />
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
        />
      </Grid>

      <Grid item>
        <Field
          as={TextField}
          label='SALES'
          name='product.salePercentage.value'
          onChange={handlePriceChange}
          type='number'
          inputProps={{ min: 0, max: 99 }}
          required
          InputLabelProps={{ shrink: true }}
          fullWidth
        />
      </Grid>

      <Grid item>
        <Field
          as={TextField}
          label='PREORDER'
          name='product.preorder'
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <FormControl fullWidth required>
          <InputLabel shrink>GENDER</InputLabel>
          <Select
            value={values.product?.targetGender || ''}
            onChange={(e) => setFieldValue('product.targetGender', e.target.value)}
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
          label='VENDORE CODE'
          name='product.sku'
          InputLabelProps={{ shrink: true }}
          required
        />
      </Grid>

      <Grid item>
        <Field
          as={TextField}
          label='COLOR'
          name='product.color'
          InputLabelProps={{ shrink: true }}
          required
        />
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
        <FormControl required fullWidth>
          <InputLabel shrink>CATEGORY</InputLabel>
          <Select
            name='prodcut.categoryId'
            onChange={(e) => setFieldValue('product.categoryId', e.target.value)}
            value={values.product?.categoryId}
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
    </Grid>
  );
};
