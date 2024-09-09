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
import { generateOrUpdateSKU, generateSKU } from 'features/utilitty/dynamicGenerationOfSku';
import { findInDictionary } from 'features/utilitty/findInDictionary';
import { restrictNumericInput } from 'features/utilitty/removePossibilityToEnterSigns';
import { ErrorMessage, Field, getIn, useFormikContext } from 'formik';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { v4 as uuidv4 } from 'uuid';
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
  isCopyMode,
}) => {
  const { values, setFieldValue, submitCount, errors, touched } =
    useFormikContext<common_ProductNew>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const [showPreorder, setShowPreorder] = useState(true);
  const [showSales, setShowSales] = useState(true);
  const disableFields = isAddingProduct ? false : !isEditMode;

  useEffect(() => {
    if (
      isCopyMode &&
      values.product?.productBody?.sku === product?.product?.productDisplay?.productBody?.sku
    ) {
      const newUuid = uuidv4();
      const newSKU = generateSKU(
        values.product?.productBody?.brand,
        values.product?.productBody?.targetGender,
        findInDictionary(dictionary, values.product?.productBody?.categoryId, 'category'),
        values.product?.productBody?.color,
        values.product?.productBody?.countryOfOrigin,
        newUuid.slice(-4),
      );
      setFieldValue('product.productBody.sku', newSKU, false);
    }
  }, [isCopyMode, values]);

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
      setFieldValue(
        'product.productBody.sku',
        generateOrUpdateSKU(
          values.product?.productBody?.sku,
          { ...values.product?.productBody, [field]: newValue },
          dictionary,
        ),
      );
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

  console.log(dictionary?.categories?.length); // Should log 20
  console.log(dictionary?.categories); // Inspect if any category is missing

  useEffect(() => {
    const { salePercentage, preorder } = values.product?.productBody || {};
    const saleValue = salePercentage?.value || '';
    const parsedSaleValue = parseFloat(saleValue);

    if (parsedSaleValue > 0) {
      setShowPreorder(false);
    } else if (preorder && preorder !== '0001-01-01T00:00:00Z') {
      setShowSales(false);
    } else if ((!preorder || preorder === '0001-01-01T00:00:00Z') && saleValue === '') {
      setShowSales(true);
      setShowPreorder(true);
    }
  }, [values.product?.productBody]);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Grid container spacing={2}>
        {!isAddingProduct && (
          <>
            {['id', 'createdAt', 'updatedAt'].map((field) => (
              <Grid item xs={12} key={field}>
                <TextField
                  label={
                    field === 'id'
                      ? 'product id'.toUpperCase()
                      : field === 'createdAt'
                        ? 'created at'.toUpperCase()
                        : field === 'updatedAt'
                          ? 'updated at'.toUpperCase()
                          : ''
                  }
                  value={(product?.product as any)?.[field] || ''}
                  InputLabelProps={{ shrink: true }}
                  InputProps={{ readOnly: true }}
                  fullWidth
                />
              </Grid>
            ))}
          </>
        )}

        <Grid item xs={12}>
          <Field
            as={TextField}
            variant='outlined'
            label={'name'.toUpperCase()}
            name='product.productBody.name'
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={Boolean(
              getIn(errors, 'product.productBody.name') &&
                getIn(touched, 'product.productBody.name'),
            )}
            helperText={
              getIn(touched, 'product.productBody.name') &&
              getIn(errors, 'product.productBody.name')
            }
            disabled={disableFields}
            onKeyDown={handleKeyDown}
          />
        </Grid>
        <Grid item xs={12}>
          <Field
            as={TextField}
            variant='outlined'
            label={'brand'.toUpperCase()}
            name='product.productBody.brand'
            required
            fullWidth
            InputLabelProps={{ shrink: true }}
            error={Boolean(
              getIn(errors, 'product.productBody.brand') &&
                getIn(touched, 'product.productBody.brand'),
            )}
            helperText={
              getIn(touched, 'product.productBody.brand') &&
              getIn(errors, 'product.productBody.brand')
            }
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
            onKeyDown={handleKeyDown}
            disabled={disableFields}
          />
        </Grid>
        <Grid item xs={12}>
          <FormControl
            required
            fullWidth
            error={Boolean(
              getIn(errors, 'product.productBody.targetGender') &&
                getIn(touched, 'product.productBody.targetGender'),
            )}
          >
            <InputLabel shrink>{'gender'.toUpperCase()}</InputLabel>
            <Select
              value={values.product?.productBody?.targetGender || ''}
              onChange={(e) => handleFieldChange(e, 'targetGender')}
              label={'gender'.toUpperCase()}
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
            {getIn(touched, 'product.productBody.targetGender') &&
              getIn(errors, 'product.productBody.targetGender') && (
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
            error={Boolean(
              getIn(errors, 'product.productBody.categoryId') &&
                getIn(touched, 'product.productBody.categoryId'),
            )}
          >
            <InputLabel shrink>{'category'.toUpperCase()}</InputLabel>
            <Select
              name='product.productBody.categoryId'
              onChange={(e) => handleFieldChange(e, 'categoryId')}
              value={values.product?.productBody?.categoryId || ''}
              label={'category'.toUpperCase()}
              displayEmpty
              disabled={disableFields}
            >
              {dictionary?.categories?.map((category) => (
                <MenuItem value={category.id} key={category.id}>
                  {findInDictionary(dictionary, category.id, 'category')}
                </MenuItem>
              ))}
            </Select>
            {getIn(touched, 'product.productBody.categoryId') &&
              getIn(errors, 'product.productBody.categoryId') && (
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
            error={Boolean(
              getIn(errors, 'product.productBody.color') &&
                getIn(touched, 'product.productBody.color'),
            )}
          >
            <InputLabel shrink>{'color'.toUpperCase()}</InputLabel>
            <Select
              value={values.product?.productBody?.color || ''}
              onChange={(e) => handleFieldChange(e, 'color')}
              label={'color'.toUpperCase()}
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
            {getIn(touched, 'product.productBody.color') &&
              getIn(errors, 'product.productBody.color') && (
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
            error={Boolean(
              getIn(errors, 'product.productBody.countryOfOrigin') &&
                getIn(touched, 'product.productBody.countryOfOrigin'),
            )}
          >
            <InputLabel shrink>{'country'.toUpperCase()}</InputLabel>
            <Select
              name='product.productBody.countryOfOrigin'
              value={values.product?.productBody?.countryOfOrigin || ''}
              onChange={(e) => handleFieldChange(e, 'countryOfOrigin')}
              label={'country'.toUpperCase()}
              displayEmpty
              disabled={disableFields}
            >
              {countries.map((country) => (
                <MenuItem key={country.value} value={country.value}>
                  {country.label}, {country.value}
                </MenuItem>
              ))}
            </Select>
            {getIn(touched, 'product.productBody.countryOfOrigin') &&
              getIn(errors, 'product.productBody.countryOfOrigin') && (
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
            label={'price'.toUpperCase()}
            name='product.productBody.price.value'
            type='number'
            inputProps={{ min: 0, step: '0.01' }}
            required
            fullWidth
            error={Boolean(
              getIn(errors, 'product.productBody.price.value') &&
                getIn(touched, 'product.productBody.price.value'),
            )}
            helperText={
              getIn(touched, 'product.productBody.price.value') &&
              getIn(errors, 'product.productBody.price.value')
            }
            InputLabelProps={{ shrink: true }}
            onChange={handlePriceChange}
            onKeyDown={restrictNumericInput}
            onBlur={(e: any) => {
              const formattedValue = parseFloat(e.target.value).toFixed(2);
              setFieldValue('product.productBody.price.value', formattedValue);
            }}
            disabled={disableFields}
          />
        </Grid>

        {showSales && (
          <Grid item xs={12}>
            <Field
              as={TextField}
              label={'sale percentage'.toUpperCase()}
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
              label={'preorder'.toUpperCase()}
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
            label={'description'.toUpperCase()}
            name='product.productBody.description'
            error={Boolean(
              getIn(errors, 'product.productBody.description') &&
                getIn(touched, 'product.productBody.description'),
            )}
            helperText={
              getIn(touched, 'product.productBody.description') &&
              getIn(errors, 'product.productBody.description')
            }
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
            label={'sku'.toUpperCase()}
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
              <Field
                as={Checkbox}
                name='product.productBody.hidden'
                disabled={disableFields}
                checked={values.product?.productBody?.hidden || false}
              />
            }
            label={'hidden'.toUpperCase()}
          />
        </Grid>
      </Grid>
    </LocalizationProvider>
  );
};
