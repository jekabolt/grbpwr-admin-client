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
import { common_Dictionary, common_ProductInsert } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { format } from 'date-fns';
import { generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import {
  convertFormattedStringToDate,
  formatPreorderDate,
} from 'features/utilitty/formatPreorderDate';
import { formatDate } from 'features/utilitty/formateDate';
import { removePossibilityToUseSigns } from 'features/utilitty/removePossibilityToEnterSigns';
import React, { FC, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { Country } from '../../addProduct/addProductInterface/addProductInterface';
import { BasicProductInterface } from '../utility/interfaces';

type UpdateProductPayload = Partial<common_ProductInsert>;

export const BasicProductIformation: FC<BasicProductInterface> = ({
  product,
  isEdit,
  onPayloadChange,
}) => {
  const [updatePayload, setUpdatePayload] = useState<UpdateProductPayload>({
    hidden: product?.product?.productInsert?.hidden ?? false,
  });
  const [dict, setDict] = useState<common_Dictionary>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const extractDate = convertFormattedStringToDate(product?.product?.productInsert?.preorder);
  const [preorderDate, setPreorderDate] = useState({
    initial: product?.product?.productInsert?.preorder || '',
    formatted: formatPreorderDate(product?.product?.productInsert?.preorder) || '',
  });
  const initialSaleValue =
    product?.product?.productInsert?.salePercentage?.value !== '' &&
    product?.product?.productInsert?.salePercentage?.value !== '0';
  const initialPreorderValue = product?.product?.productInsert?.preorder !== '';
  const [showSales, setShowSales] = useState(initialSaleValue);
  const [showPreorder, setShowPreorder] = useState(initialPreorderValue);

  useEffect(() => {
    const showSalesField =
      updatePayload.salePercentage?.value !== '' && updatePayload.salePercentage?.value !== '0';
    const showPreorderField = updatePayload.preorder !== '';

    const bothEmpty =
      (updatePayload.salePercentage?.value === '' || updatePayload.salePercentage?.value === '0') &&
      !updatePayload.preorder;

    setShowSales(showSalesField || bothEmpty);
    setShowPreorder(showPreorderField || bothEmpty);
  }, [updatePayload.salePercentage?.value, updatePayload.preorder]);

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDict(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const handleChange = (
    event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement> | SelectChangeEvent,
  ) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    const name = target.name;
    const isCheckbox = target instanceof HTMLInputElement && target.type === 'checkbox';
    const value = isCheckbox ? target.checked : target.value;

    setUpdatePayload((prev) => {
      let updatedPayload: UpdateProductPayload = { ...prev };

      if (name === 'color' && typeof value === 'string') {
        const selectedColor = colors.find(
          (color) => color.name.toLowerCase().replace(/\s/g, '_') === value,
        );
        updatedPayload = {
          ...updatedPayload,
          color: value,
          colorHex: selectedColor ? selectedColor.hex : '#000000',
        };
      } else if (name === 'price' || (name === 'salePercentage' && typeof value === 'string')) {
        updatedPayload = {
          ...updatedPayload,
          [name]: { ...prev[name], value },
        };
      } else if (name === 'preorder' && typeof value === 'string') {
        const formattedDate = value ? formatPreorderDate(value) : '';
        setPreorderDate({
          initial: value,
          formatted: formattedDate,
        });
        updatedPayload.preorder = formattedDate;
      } else if (name === 'categoryId' && typeof value === 'string') {
        updatedPayload = {
          ...updatedPayload,
          categoryId: Number(value),
        };
      } else {
        updatedPayload = {
          ...updatedPayload,
          [name]: value,
        };
      }

      updatedPayload.sku = generateSKU(
        updatedPayload.brand || product?.product?.productInsert?.brand,
        updatedPayload.targetGender || product?.product?.productInsert?.targetGender,
        findInDictionary(dict, updatedPayload.categoryId, 'category') ||
          findInDictionary(dict, product?.product?.productInsert?.categoryId, 'category'),
        updatedPayload.color || product?.product?.productInsert?.color,
        updatedPayload.countryOfOrigin ||
          product?.product?.productInsert?.countryOfOrigin?.substring(0, 2),
      );
      onPayloadChange(updatedPayload);
      return updatedPayload;
    });
  };

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
        <TextField
          name='name'
          onChange={handleChange}
          value={updatePayload.name ?? product?.product?.productInsert?.name ?? ''}
          variant='outlined'
          label='NAME'
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
          required={isEdit}
          fullWidth
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          name='brand'
          onChange={handleChange}
          value={updatePayload.brand ?? product?.product?.productInsert?.brand ?? ''}
          variant='outlined'
          label='BRAND'
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
          required={isEdit}
          fullWidth
        />
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth required={isEdit}>
          <InputLabel shrink>GENDER</InputLabel>
          <Select
            name='targetGender'
            value={
              updatePayload.targetGender ||
              product?.product?.productInsert?.targetGender ||
              'GENDER_ENUM_MALE'
            }
            onChange={handleChange}
            displayEmpty
            label='GENDER'
            disabled={!isEdit}
          >
            {dict?.genders?.map((gender) => (
              <MenuItem key={gender.id} value={gender.id}>
                {gender.name?.replace('GENDER_ENUM_', '').toUpperCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth required={isEdit}>
          <InputLabel shrink>CATEGORY</InputLabel>
          <Select
            name='categoryId'
            value={updatePayload.categoryId?.toString() || ''}
            onChange={handleChange}
            displayEmpty
            label='CATEGORY'
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
      <Grid item xs={12}>
        <FormControl fullWidth required={isEdit}>
          <InputLabel shrink>COLOR</InputLabel>
          <Select
            name='color'
            value={updatePayload.color || ''}
            onChange={handleChange}
            displayEmpty
            label='COLOR'
            disabled={!isEdit}
          >
            <MenuItem value='' disabled>
              {product?.product?.productInsert?.color}
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
        <TextField
          name='colorHex'
          onChange={handleChange}
          value={updatePayload.colorHex || product?.product?.productInsert?.colorHex || ''}
          variant='outlined'
          label='COLOR HEX'
          InputLabelProps={{ shrink: true }}
          type='color'
          fullWidth
          disabled={!isEdit}
          required={isEdit}
        />
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth required={isEdit}>
          <InputLabel shrink>COUNTRY</InputLabel>
          <Select
            name='countryOfOrigin'
            value={updatePayload.countryOfOrigin || ''}
            onChange={handleChange}
            displayEmpty
            label='COUNTRY'
            disabled={!isEdit}
          >
            <MenuItem value='' disabled>
              {getCountryLabel(product?.product?.productInsert?.countryOfOrigin)}
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
        <TextField
          type='number'
          name='price'
          onChange={handleChange}
          value={updatePayload.price?.value || ''}
          variant='outlined'
          label='PRICE'
          placeholder={product?.product?.productInsert?.price?.value}
          InputLabelProps={{ shrink: true }}
          inputProps={{ min: 0, pattern: '[0-9]*' }}
          disabled={!isEdit}
          required={isEdit}
          onKeyDown={removePossibilityToUseSigns}
          fullWidth
        />
      </Grid>
      {showSales && (
        <Grid item xs={12}>
          <TextField
            type='number'
            name='salePercentage'
            onChange={handleChange}
            value={
              updatePayload.salePercentage?.value ||
              product?.product?.productInsert?.salePercentage?.value ||
              ''
            }
            variant='outlined'
            label='SALE PERCENTAGE'
            InputLabelProps={{ shrink: true }}
            inputProps={{ min: 0 }}
            disabled={!isEdit}
            onKeyDown={removePossibilityToUseSigns}
            fullWidth
          />
        </Grid>
      )}

      {showPreorder && (
        <Grid item xs={12}>
          <TextField
            key={preorderDate.initial}
            name='preorder'
            type={isEdit ? 'date' : 'text'}
            onChange={handleChange}
            value={
              isEdit
                ? preorderDate.initial || extractDate || ''
                : updatePayload.preorder || product?.product?.productInsert?.preorder || ''
            }
            variant='outlined'
            label='PREORDER'
            InputLabelProps={{ shrink: true }}
            inputProps={{
              min: isEdit ? getCurrentDate() : undefined,
            }}
            disabled={!isEdit}
            fullWidth
          />
        </Grid>
      )}
      <Grid item xs={12}>
        <TextField
          name='description'
          onChange={handleChange}
          value={updatePayload.description || ''}
          variant='outlined'
          label='DESCRIPTION'
          placeholder={product?.product?.productInsert?.description}
          InputLabelProps={{ shrink: true }}
          multiline
          fullWidth
          disabled={!isEdit}
          required={isEdit}
        />
      </Grid>
      <Grid item xs={12}>
        <TextField
          name='sku'
          onChange={handleChange}
          value={updatePayload.sku || ''}
          variant='outlined'
          label='SKU'
          placeholder={product?.product?.productInsert?.sku}
          InputProps={{ readOnly: true }}
          InputLabelProps={{ shrink: true }}
          disabled={!isEdit}
          fullWidth
        />
      </Grid>
      <Grid item xs={12}>
        <Box display='flex' alignItems='center'>
          <Typography textTransform='uppercase' variant='h6'>
            hiden
          </Typography>
          <Checkbox
            name='hidden'
            checked={!!updatePayload.hidden || false}
            onChange={handleChange}
            disabled={!isEdit}
          />
        </Box>
      </Grid>
    </Grid>
  );
};
