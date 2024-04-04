import { FormControl, Grid, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { findInDictionary } from 'components/managers/orders/utility';
import { FC } from 'react';
import { CommonProductInsertInterface } from '../interface/interface';
import { Tags } from '../tag/tag';

export const CommonProductInsert: FC<CommonProductInsertInterface> = ({
  product,
  setProduct,
  handleInputChange,
  dictionary,
}) => {
  return (
    <Grid container display='grid' spacing={2} style={{ width: '80%' }}>
      <Grid item>
        <TextField
          variant='outlined'
          label='NAME'
          name='name'
          value={product.product?.name || ''}
          onChange={handleInputChange}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <TextField
          variant='outlined'
          label='COUNTRY'
          name='countryOfOrigin'
          value={product?.product?.countryOfOrigin || ''}
          onChange={handleInputChange}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <TextField
          variant='outlined'
          label='BRAND'
          name='brand'
          value={product?.product?.brand || ''}
          onChange={handleInputChange}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <TextField
          variant='outlined'
          label='PRICE'
          name='price'
          value={product?.product?.price?.value || ''}
          onChange={handleInputChange}
          type='number'
          inputProps={{ min: 0 }}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <TextField
          label='SALES'
          name='salePercentage'
          value={product?.product?.salePercentage?.value || ''}
          onChange={handleInputChange}
          sx={{ width: 193 }}
          type='number'
          inputProps={{ min: 0, max: 99 }}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <TextField
          label='PREORDER'
          name='preorder'
          value={product?.product?.preorder || ''}
          onChange={handleInputChange}
          required
          InputLabelProps={{ shrink: true }}
        />
      </Grid>

      <Grid item>
        <FormControl sx={{ width: 193 }} required>
          <InputLabel shrink>GENDER</InputLabel>
          <Select
            value={product.product?.targetGender}
            onChange={handleInputChange}
            autoWidth
            label='GENDER'
            displayEmpty
            name='targetGender'
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
        <TextField
          label='DESCRIPTION'
          name='description'
          value={product.product?.description}
          InputLabelProps={{ shrink: true }}
          onChange={handleInputChange}
          multiline
          required
        />
      </Grid>

      <Grid item>
        <TextField
          label='VENDORE CODE'
          name='sku'
          value={product?.product?.sku || ''}
          onChange={handleInputChange}
          InputLabelProps={{ shrink: true }}
          required
        />
      </Grid>

      <Grid item>
        <TextField
          label='COLOR'
          name='color'
          value={product?.product?.color || ''}
          onChange={handleInputChange}
          InputLabelProps={{ shrink: true }}
          required
        />
      </Grid>

      <Grid item>
        <TextField
          type='color'
          label='COLOR HEX'
          name='colorHex'
          value={product.product?.colorHex}
          onChange={handleInputChange}
          InputLabelProps={{ shrink: true }}
          sx={{ width: 193 }}
          required
        />
      </Grid>

      <Grid item>
        <FormControl required sx={{ width: 193 }}>
          <InputLabel shrink>CATEGORY</InputLabel>
          <Select
            name='categoryId'
            value={product.product?.categoryId?.toString() || ''}
            onChange={handleInputChange}
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
        <Tags setProduct={setProduct} />
      </Grid>
    </Grid>
  );
};
