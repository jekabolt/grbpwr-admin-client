import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
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
import { ErrorMessage, Field, useFormikContext } from 'formik';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { BasicProductFieldsInterface, Country } from '../interface/interface';
import { handleKeyDown } from '../utility/brandNameRegExp';

const parseWellKnownTimestamp = (timestamp: string): Date | null => {
  if (!timestamp || timestamp === '0001-01-01T00:00:00Z') return null;
  const parsedDate = parseISO(timestamp);
  return isValid(parsedDate) ? parsedDate : null;
};

const formatWellKnownTimestamp = (date: Date | null): string => {
  if (!date) return '0001-01-01T00:00:00Z';
  return date.toISOString();
};

export const BasicFields: FC<BasicProductFieldsInterface> = ({
  dictionary,
  product,
  isEditMode,
  isAddingProduct,
}) => {
  const { values, setFieldValue, submitCount, errors, touched } =
    useFormikContext<common_ProductNew>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const [showPreorder, setShowPreorder] = useState(true);
  const [showSales, setShowSales] = useState(true);
  const disableFields = isAddingProduct ? false : !isEditMode;

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

      const currentSKU = values.product?.productBody?.sku || '';
      const existingUuid = currentSKU.slice(-4);

      const newSKU = generateSKU(
        updatedValues.brand,
        updatedValues.targetGender,
        findInDictionary(dictionary, updatedValues.categoryId, 'category'),
        updatedValues.color,
        updatedValues.countryOfOrigin,
        existingUuid,
      );
      setFieldValue('product.productBody.sku', newSKU);
    },
    [values.product?.productBody, setFieldValue, dictionary],
  );

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>, flag: boolean = false) => {
    const { name, value } = e.target;

    let formattedValue = value;

    if (name === 'product.productBody.salePercentage.value') {
      let numericValue = parseFloat(value);
      if (numericValue > 99) {
        return;
      }
      formattedValue = numericValue.toString();
    } else if (value.includes('.') && value.split('.')[1].length > 2) {
      formattedValue = parseFloat(value).toFixed(2);
    }
    setFieldValue(name, formattedValue);

    if (flag) {
      const saleValue = formattedValue.trim();
      if (saleValue === '') {
        setShowPreorder(true);
      } else {
        const saleNumber = parseFloat(saleValue);
        setShowPreorder(saleNumber <= 0);
      }
    }
  };

  const handlePreorderChange = (date: Date | null) => {
    const formattedDate = formatWellKnownTimestamp(date);
    setFieldValue('product.productBody.preorder', formattedDate);
    setShowSales(!date);
  };

  const parseDate = (dateString: string | undefined): Date | null => {
    return parseWellKnownTimestamp(dateString || '0001-01-01T00:00:00Z');
  };

  useEffect(() => {
    const salePercentage = values.product?.productBody?.salePercentage?.value;
    const preorderValue = values.product?.productBody?.preorder;

    if (salePercentage && parseFloat(salePercentage) > 0) {
      setShowPreorder(false);
    } else if (preorderValue && preorderValue !== '0001-01-01T00:00:00Z') {
      setShowSales(false);
    } else if (
      (preorderValue === '' || preorderValue === '0001-01-01T00:00:00Z') &&
      salePercentage === ''
    ) {
      setShowSales(true);
      setShowPreorder(true);
    }
  }, [values.product?.productBody?.salePercentage?.value, values.product?.productBody?.preorder]);

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
            error={!!(errors.product && touched.product && !values.product?.productBody?.name)}
            helperText={<ErrorMessage name='product.productBody.name' />}
            InputLabelProps={{ shrink: true }}
            disabled={disableFields}
            onKeyDown={handleKeyDown}
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
            error={!!(errors.product && touched.product && !values.product?.productBody?.brand)}
            helperText={<ErrorMessage name='product.productBody.brand' />}
            InputLabelProps={{ shrink: true }}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
            onKeyDown={handleKeyDown}
            disabled={disableFields}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl
            required
            fullWidth
            error={
              !!(errors.product && touched.product && !values.product?.productBody?.targetGender)
            }
          >
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
            {!values.product?.productBody?.targetGender && submitCount > 0 && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.targetGender' />
              </FormHelperText>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl
            required
            fullWidth
            error={
              !!(errors.product && touched.product && !values.product?.productBody?.categoryId)
            }
          >
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
            {!values.product?.productBody?.categoryId && submitCount > 0 && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.categoryId' />
              </FormHelperText>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <FormControl
            fullWidth
            required
            error={!!(errors.product && touched.product && !values.product?.productBody?.color)}
          >
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
            {!values.product?.productBody?.color && submitCount > 0 && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.color' />
              </FormHelperText>
            )}
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
          <FormControl
            fullWidth
            required
            error={
              !!(errors.product && touched.product && !values.product?.productBody?.countryOfOrigin)
            }
          >
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
            {!values.product?.productBody?.countryOfOrigin && submitCount > 0 && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.countryOfOrigin' />
              </FormHelperText>
            )}
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            variant='outlined'
            label='PRICE'
            name='product.productBody.price.value'
            type='number'
            inputProps={{ min: 0, type: 'number', step: '0.01' }}
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            onChange={handlePriceChange}
            onKeyDown={restrictNumericInput}
            disabled={disableFields}
            error={
              !!(
                errors.product &&
                touched.product &&
                values.product?.productBody?.price?.value === '0'
              )
            }
            helperText={<ErrorMessage name='product.productBody.price.value' />}
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
                textField: {
                  fullWidth: true,
                  InputLabelProps: { shrink: true },
                },
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
            error={
              !!(errors.product && touched.product && !values.product?.productBody?.description)
            }
            helperText={<ErrorMessage name='product.productBody.description' />}
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
