import {
  Checkbox,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { common_ProductNew } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { isValid, parseISO } from 'date-fns';
import { generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { restrictNumericInput } from 'features/utilitty/removePossibilityToEnterSigns';
import { Field, useFormikContext } from 'formik';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { BasicProductFieldsInterface, Country } from '../interface/interface';

export const BasicFields: FC<BasicProductFieldsInterface> = ({
  dictionary,
  product,
  isEditMode,
  isAddingProduct,
}) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const [showPreorder, setShowPreorder] = useState(true);
  const [showSales, setShowSales] = useState(true);

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
    [values.product?.productBody, setFieldValue, dictionary],
  );

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>, flag: boolean = false) => {
    const { name, value } = e.target;
    setFieldValue(name, value.toString());
    if (flag) {
      const saleValue = value.trim();
      if (saleValue === '') {
        setShowPreorder(true);
        setFieldValue('product.productBody.preorder', '');
      } else {
        const saleNumber = parseFloat(saleValue);
        setShowPreorder(saleNumber <= 0);
        setFieldValue('product.productBody.preorder', '');
      }
    }
  };

  const handlePreorderChange = (date: Date | null) => {
    if (date) {
      setFieldValue('product.productBody.preorder', date.toISOString());
      setShowSales(false);
      setFieldValue('product.productBody.salePercentage.value', '');
    } else {
      setFieldValue('product.productBody.preorder', null);
      setShowSales(true);
    }
  };

  const parseDate = (dateString: string | undefined) => {
    if (!dateString) return null;
    const parsedDate = parseISO(dateString);
    return isValid(parsedDate) ? parsedDate : null;
  };

  const disableFields = isAddingProduct ? false : !isEditMode;

  useEffect(() => {
    const salePercentage = values.product?.productBody?.salePercentage?.value;
    const preorderValue = values.product?.productBody?.preorder;
    if (salePercentage && parseFloat(salePercentage) > 0) {
      setShowPreorder(false);
      setFieldValue('product.productBody.preorder', '');
    } else if (preorderValue) {
      setShowSales(false);
    }
  }, [values.product?.productBody?.salePercentage?.value, setFieldValue]);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Grid container spacing={2}>
        {!isAddingProduct && (
          <>
            <Grid item xs={12}>
              <TextField
                label='PRODUCT ID'
                InputLabelProps={{ shrink: true }}
                InputProps={{ readOnly: true }}
                value={product?.product?.id}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='CREATED'
                InputLabelProps={{ shrink: true }}
                InputProps={{ readOnly: true }}
                value={product?.product?.createdAt || ''}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                label='UPDATED'
                InputLabelProps={{ shrink: true }}
                InputProps={{ readOnly: true }}
                value={product?.product?.updatedAt || ''}
                fullWidth
              />
            </Grid>
          </>
        )}

        <Grid item xs={12}>
          <Field
            as={TextField}
            variant='outlined'
            label='NAME'
            name='product.productBody.name'
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            disabled={disableFields}
          />
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            variant='outlined'
            label='BRAND'
            name='product.productBody.brand'
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
            disabled={disableFields}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl required fullWidth>
            <InputLabel shrink>GENDER</InputLabel>
            <Select
              value={values.product?.productBody?.targetGender || ''}
              onChange={(e) => handleFieldChange(e, 'targetGender')}
              label='GENDER'
              displayEmpty
              name='product.productBody.targetGender'
              disabled={disableFields}
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
          <FormControl required fullWidth>
            <InputLabel shrink>CATEGORY</InputLabel>
            <Select
              name='product.productBody.categoryId'
              onChange={(e) => handleFieldChange(e, 'categoryId')}
              value={values.product?.productBody?.categoryId || ''}
              label='CATEGORY'
              displayEmpty
              disabled={disableFields}
            >
              {dictionary?.categories?.map((category) => (
                <MenuItem value={category.id} key={category.id}>
                  {findInDictionary(dictionary, category.id, 'category')}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth required>
            <InputLabel shrink>COLOR</InputLabel>
            <Select
              value={values.product?.productBody?.color || ''}
              onChange={(e) => handleFieldChange(e, 'color')}
              label='COLOR'
              displayEmpty
              name='product.productBody.color'
              disabled={disableFields}
            >
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
            type='color'
            label='COLOR HEX'
            name='product.productBody.colorHex'
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            disabled={disableFields}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl fullWidth required>
            <InputLabel shrink>COUNTRY</InputLabel>
            <Select
              name='product.productBody.countryOfOrigin'
              value={values.product?.productBody?.countryOfOrigin || ''}
              onChange={(e) => handleFieldChange(e, 'countryOfOrigin')}
              label='COUNTRY'
              displayEmpty
              disabled={disableFields}
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
            variant='outlined'
            label='PRICE'
            name='product.productBody.price.value'
            type='number'
            inputProps={{ min: 0 }}
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            onChange={handlePriceChange}
            onKeyDown={restrictNumericInput}
            disabled={disableFields}
          />
        </Grid>

        {showSales && (
          <Grid item xs={12}>
            <Field
              as={TextField}
              label='SALE PERCENTAGE'
              name='product.productBody.salePercentage.value'
              onChange={(e: any) => handlePriceChange(e, true)}
              type='number'
              inputProps={{ min: 0, max: 99 }}
              InputLabelProps={{ shrink: true }}
              onKeyDown={restrictNumericInput}
              fullWidth
              disabled={disableFields}
            />
          </Grid>
        )}

        {showPreorder && (
          <Grid item xs={12}>
            <DatePicker
              label='PREORDER'
              value={parseDate(values.product?.productBody?.preorder)}
              onChange={handlePreorderChange}
              minDate={new Date()}
              slotProps={{
                textField: { fullWidth: true, InputLabelProps: { shrink: true } },
                field: { clearable: true },
              }}
              disabled={disableFields}
            />
          </Grid>
        )}
        <Grid item xs={12}>
          <Field
            as={TextField}
            label='DESCRIPTION'
            name='product.productBody.description'
            InputLabelProps={{ shrink: true }}
            fullWidth
            multiline
            required
            disabled={disableFields}
          />
        </Grid>

        <Grid item xs={12}>
          <Field
            as={TextField}
            label='SKU'
            name='product.productBody.sku'
            InputProps={{ readOnly: true }}
            InputLabelProps={{ shrink: true }}
            required
            fullWidth
            disabled={disableFields}
          />
        </Grid>
        <Grid item>
          <FormControlLabel
            control={
              <Field as={Checkbox} name='product.productBody.hidden' disabled={disableFields} />
            }
            label='HIDDEN'
          />
        </Grid>
      </Grid>
    </LocalizationProvider>
  );
};
