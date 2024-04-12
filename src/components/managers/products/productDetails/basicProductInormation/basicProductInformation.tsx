import {
  Box,
  Button,
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
import { common_Dictionary, common_ProductInsert } from 'api/proto-http/admin';
import { updateProductById } from 'api/updateProductsById';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import React, { FC, useEffect, useState } from 'react';
import styles from 'styles/product-details.scss';
import { ProductIdProps } from '../utility/interfaces';

type UpdateProductPayload = Partial<common_ProductInsert>;

export const BasicProductIformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [updatePayload, setUpdatePayload] = useState<UpdateProductPayload>({
    hidden: product?.product?.productInsert?.hidden ?? false,
  });
  const [isEdit, setIsEdit] = useState(false);
  const [dict, setDict] = useState<common_Dictionary>();

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDict(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const enableEditMode = () => {
    setIsEdit(!isEdit);
  };

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent,
  ) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const name = target.name;
    const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
    const value = isCheckbox ? target.checked : target.value;

    setUpdatePayload((prev) => {
      if (name === 'price' || name === 'salePercentage') {
        return { ...prev, [name]: { ...prev[name], value } };
      }
      return { ...prev, [name]: value };
    });
  };

  const updateProduct = async () => {
    if (
      Object.entries(updatePayload).some(([key, value]) => {
        return key !== 'hidden' && !value;
      })
    ) {
      alert('Please fill out all required fields.');
      return;
    }
    const updatedDetails = { ...product?.product?.productInsert, ...updatePayload };
    const response = await updateProductById({
      id: Number(id),
      product: updatedDetails as common_ProductInsert,
    });

    setUpdatePayload(updatedDetails);
  };

  const updateProductAndToggleEditMode = () => {
    if (isEdit) {
      updateProduct();
    }
    enableEditMode();
  };

  useEffect(() => {
    setUpdatePayload((prevState) => ({
      ...prevState,
      hidden: product?.product?.productInsert?.hidden ?? false,
    }));
  }, [product?.product?.productInsert?.hidden]);
  return (
    <Grid container direction='column' spacing={2} className={styles.product_details_container}>
      <Grid item>
        <TextField
          name='name'
          onChange={handleChange}
          value={updatePayload.name || ''}
          variant='outlined'
          label='name'
          placeholder={product?.product?.productInsert?.name}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          type='number'
          name='price'
          onChange={handleChange}
          value={updatePayload.price?.value || ''}
          variant='outlined'
          label='price'
          placeholder={product?.product?.productInsert?.price?.value}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0 }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          type='number'
          name='salePercentage'
          onChange={handleChange}
          value={updatePayload.salePercentage?.value || ''}
          variant='outlined'
          label='sale'
          placeholder={product?.product?.productInsert?.salePercentage?.value}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0 }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='sku'
          onChange={handleChange}
          value={updatePayload.sku || ''}
          variant='outlined'
          label='sku'
          placeholder={product?.product?.productInsert?.sku}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='color'
          onChange={handleChange}
          value={updatePayload.color || ''}
          variant='outlined'
          label='color'
          placeholder={product?.product?.productInsert?.color}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='preorder'
          onChange={handleChange}
          value={updatePayload.preorder || ''}
          variant='outlined'
          label='preorder'
          placeholder={product?.product?.productInsert?.preorder}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='brand'
          onChange={handleChange}
          value={updatePayload.brand || ''}
          variant='outlined'
          label='brand'
          placeholder={product?.product?.productInsert?.brand}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='countryOfOrigin'
          onChange={handleChange}
          value={updatePayload.countryOfOrigin || ''}
          variant='outlined'
          label='country'
          placeholder={product?.product?.productInsert?.countryOfOrigin}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <TextField
          name='colorHex'
          onChange={handleChange}
          value={updatePayload.colorHex || product?.product?.productInsert?.colorHex || ''}
          variant='outlined'
          label='colorHEX'
          InputLabelProps={{ shrink: true }}
          type='color'
          fullWidth
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <FormControl fullWidth>
          <InputLabel shrink>gender</InputLabel>
          <Select
            name='targetGender'
            value={updatePayload.targetGender || ''}
            onChange={handleChange}
            displayEmpty
            label='gender'
            disabled={!isEdit}
          >
            <MenuItem value='' disabled>
              {product?.product?.productInsert?.targetGender?.replace('GENDER_ENUM_', '')}
            </MenuItem>
            {dict?.genders?.map((gender) => (
              <MenuItem key={gender.id} value={gender.id?.toString()}>
                {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <FormControl fullWidth>
          <InputLabel shrink>category</InputLabel>
          <Select
            name='categoryId'
            value={updatePayload.categoryId?.toString() || ''}
            onChange={handleChange}
            displayEmpty
            label='category'
            disabled={!isEdit}
          >
            <MenuItem value='' disabled>
              {findInDictionary(dict, product?.product?.productInsert?.categoryId, 'category')}
            </MenuItem>
            {dict?.categories?.map((category) => (
              <MenuItem key={category.id} value={category.id?.toString()}>
                {findInDictionary(dict, category.id, 'category')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item>
        <TextField
          name='description'
          onChange={handleChange}
          value={updatePayload.description || ''}
          variant='outlined'
          label='description'
          placeholder={product?.product?.productInsert?.description}
          InputLabelProps={{ shrink: true }}
          multiline
          rows={4}
          fullWidth
          disabled={!isEdit}
        />
      </Grid>
      <Grid item>
        <Box display='flex' alignItems='center'>
          <Typography variant='h6'>hide</Typography>
          <Checkbox
            name='hidden'
            checked={!!updatePayload.hidden}
            onChange={handleChange}
            disabled={!isEdit}
          />
        </Box>
      </Grid>

      <Grid item>
        <Button onClick={updateProductAndToggleEditMode} variant='contained' className={styles.btn}>
          {isEdit ? 'upload' : 'edit'}
        </Button>
      </Grid>
    </Grid>
  );
};
