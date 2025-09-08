import {
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
} from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { common_ProductNew } from 'api/proto-http/admin';
import { colors, genderOptions } from 'constants/filter';
import { ErrorMessage, Field, getIn, useFormikContext } from 'formik';
import { generateOrUpdateSKU, generateSKU } from 'lib/features/dynamicGenerationOfSku';
import { useCategories } from 'lib/features/useCategories';
import { useDictionaryStore } from 'lib/stores/store';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { v4 as uuidv4 } from 'uuid';
import { BasicProductFieldsInterface, Country } from '../../interface/interface';
import { handleKeyDown } from '../../utility/brandNameRegExp';
import { formatWellKnownTimestamp, parseWellKnownTimestamp } from '../../utility/preorderTime';
import { getFilteredSizes } from '../../utility/sizes';
import { Care } from './care/care';
import { Composition } from './composition/composition';

export const BasicFields: FC<BasicProductFieldsInterface> = ({
  product,
  isEditMode,
  isAddingProduct,
  isCopyMode,
}) => {
  const { dictionary } = useDictionaryStore();
  const { values, setFieldValue, errors, touched } = useFormikContext<common_ProductNew>();
  const countries = useMemo(() => CountryList().getData() as Country[], []);
  const [showPreorder, setShowPreorder] = useState(true);
  const [showSales, setShowSales] = useState(true);
  const disableFields = isAddingProduct ? false : !isEditMode;

  const { topCategoryOptions, subCategoryOptions, typeOptions, selectedTopCategoryName } =
    useCategories(
      values.product?.productBodyInsert?.topCategoryId || 0,
      values.product?.productBodyInsert?.subCategoryId || 0,
      values.product?.productBodyInsert?.typeId || undefined,
    );

  const filteredSizes = getFilteredSizes(
    dictionary,
    values.product?.productBodyInsert?.topCategoryId || 0,
  );

  useEffect(() => {
    if (
      isCopyMode &&
      values.product?.productBodyInsert?.sku ===
        product?.product?.productDisplay?.productBody?.productBodyInsert?.sku
    ) {
      const newUuid = uuidv4();

      const newSKU = generateSKU(
        values.product?.productBodyInsert?.brand,
        values.product?.productBodyInsert?.targetGender,
        selectedTopCategoryName,
        values.product?.productBodyInsert?.color,
        values.product?.productBodyInsert?.countryOfOrigin,
        newUuid.slice(-4),
      );
      setFieldValue('product.productBodyInsert.sku', newSKU, false);
    }
  }, [isCopyMode, values]);

  const handleFieldChange = useCallback(
    (
      e: SelectChangeEvent<string | number> | React.ChangeEvent<HTMLInputElement>,
      field: string,
    ) => {
      let newValue = e.target.value;

      if (field === 'topCategoryId' || field === 'subCategoryId' || field === 'typeId') {
        newValue = Number(newValue);

        if (field === 'topCategoryId') {
          const selectedCategory = topCategoryOptions.find((cat) => cat.value === newValue);
          if (selectedCategory) {
            setFieldValue('product.productBodyInsert.subCategoryId', newValue, false);
          } else {
            setFieldValue('product.productBodyInsert.subCategoryId', 0, false);
          }
          setFieldValue('product.productBodyInsert.typeId', 0, false);
        }

        if (field === 'subCategoryId') {
          setFieldValue('product.productBodyInsert.typeId', 0, false);
        }
      }

      if (field === 'color' && typeof newValue === 'string') {
        newValue = newValue.toLowerCase().replace(/\s/g, '_');
        const selectedColor = colors.find(
          (color) => color.name.toLowerCase().replace(/\s/g, '_') === newValue,
        );
        setFieldValue(
          'product.productBodyInsert.colorHex',
          selectedColor ? selectedColor.hex : '#000000',
          false,
        );
      }

      setFieldValue(`product.productBodyInsert.${field}`, newValue);

      const categoryId =
        field === 'topCategoryId' ? newValue : values.product?.productBodyInsert?.topCategoryId;
      const selectedCategory = topCategoryOptions.find((cat) => cat.value === categoryId);
      const updatedProductBody = {
        ...values.product?.productBodyInsert,
        [field]: newValue,
        categoryName: selectedCategory?.label,
      };
      const newSku = generateOrUpdateSKU(
        values.product?.productBodyInsert?.sku,
        updatedProductBody,
      );
      setFieldValue('product.productBody.sku', newSku);
    },
    [values.product?.productBodyInsert, setFieldValue, dictionary, topCategoryOptions],
  );

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>, flag: boolean = false) => {
    const { name, value } = e.target;
    let formattedValue = value;

    if (name === 'product.productBody.salePercentage.value') {
      if (value === '') {
        formattedValue = '0';
      } else {
        let numericValue = parseFloat(value);
        if (numericValue > 99) {
          return;
        }
        formattedValue = numericValue.toString();
      }
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
    setFieldValue('product.productBodyInsert.preorder', formattedDate);
    setShowSales(!date);
  };

  const parseDate = (dateString: string | undefined): Date | null => {
    return parseWellKnownTimestamp(dateString || '0001-01-01T00:00:00Z');
  };

  useEffect(() => {
    const { salePercentage, preorder } = values.product?.productBodyInsert || {};
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
  }, [values.product?.productBodyInsert]);

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <div className='grid gap-4 w-full'>
        <FormControlLabel
          control={
            <Field
              as={Checkbox}
              name='product.productBodyInsert.hidden'
              disabled={disableFields}
              checked={values.product?.productBodyInsert?.hidden || false}
            />
          }
          label={'hidden'.toUpperCase()}
        />
        {!isAddingProduct && (
          <>
            {['id', 'createdAt', 'updatedAt'].map((field) => (
              <div key={field} className='w-full'>
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
              </div>
            ))}
          </>
        )}
        //TODO: now it's placed inside the translations
        <Field
          as={TextField}
          variant='outlined'
          label={'name'.toUpperCase()}
          name='product.productBody.name'
          required
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={Boolean(
            getIn(errors, 'product.productBody.name') && getIn(touched, 'product.productBody.name'),
          )}
          helperText={
            getIn(touched, 'product.productBody.name') && getIn(errors, 'product.productBody.name')
          }
          disabled={disableFields}
          onKeyDown={handleKeyDown}
        />
        <Field
          as={TextField}
          variant='outlined'
          label={'brand'.toUpperCase()}
          name='product.productBody.brand'
          required
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={Boolean(
            getIn(errors, 'product.productBodyInsert.brand') &&
              getIn(touched, 'product.productBodyInsert.brand'),
          )}
          helperText={
            getIn(touched, 'product.productBodyInsert.brand') &&
            getIn(errors, 'product.productBodyInsert.brand')
          }
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleFieldChange(e, 'brand')}
          onKeyDown={handleKeyDown}
          disabled={disableFields}
        />
        <FormControl
          required
          fullWidth
          error={Boolean(
            getIn(errors, 'product.productBodyInsert.targetGender') &&
              getIn(touched, 'product.productBodyInsert.targetGender'),
          )}
        >
          <InputLabel shrink>{'gender'.toUpperCase()}</InputLabel>
          <Select
            value={values.product?.productBodyInsert?.targetGender || ''}
            onChange={(e) => handleFieldChange(e, 'targetGender')}
            label={'gender'.toUpperCase()}
            displayEmpty
            name='product.productBody.targetGender'
            disabled={disableFields}
          >
            {genderOptions.map((gender) => (
              <MenuItem key={gender.value} value={gender.value}>
                {gender.label?.toUpperCase()}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBodyInsert.targetGender') &&
            getIn(errors, 'product.productBodyInsert.targetGender') && (
              <FormHelperText>
                <ErrorMessage name='product.productBodyInsert.targetGender' />
              </FormHelperText>
            )}
        </FormControl>
        <FormControl
          required
          fullWidth
          error={Boolean(
            getIn(errors, 'product.productBody.topCategoryId') &&
              getIn(touched, 'product.productBody.topCategoryId'),
          )}
        >
          <InputLabel shrink>{'category'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBody.topCategoryId'
            onChange={(e) => handleFieldChange(e, 'topCategoryId')}
            value={values.product?.productBodyInsert?.topCategoryId || 0}
            label={'category'.toUpperCase()}
            displayEmpty
            disabled={disableFields}
          >
            {topCategoryOptions.map((category) => (
              <MenuItem value={category.value} key={category.value}>
                {category.label}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBody.topCategoryId') &&
            getIn(errors, 'product.productBody.topCategoryId') && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.topCategoryId' />
              </FormHelperText>
            )}
        </FormControl>
        <FormControl fullWidth>
          <InputLabel shrink>{'subcategory'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBodyInsert.subCategoryId'
            onChange={(e) => handleFieldChange(e, 'subCategoryId')}
            value={values.product?.productBodyInsert?.subCategoryId || 0}
            label={'subcategory'.toUpperCase()}
            displayEmpty
            disabled={disableFields || !values.product?.productBodyInsert?.topCategoryId}
          >
            {subCategoryOptions.map((category) => (
              <MenuItem value={category.value} key={category.value}>
                {category.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth>
          <InputLabel shrink>{'type'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBodyInsert.typeId'
            onChange={(e) => handleFieldChange(e, 'typeId')}
            value={values.product?.productBodyInsert?.typeId || ''}
            label={'type'.toUpperCase()}
            displayEmpty
            disabled={disableFields}
          >
            {typeOptions.map((type) => (
              <MenuItem value={type.value} key={type.value}>
                {type.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl
          fullWidth
          required
          error={Boolean(
            getIn(errors, 'product.productBodyInsert.color') &&
              getIn(touched, 'product.productBodyInsert.color'),
          )}
        >
          <InputLabel shrink>{'color'.toUpperCase()}</InputLabel>
          <Select
            value={values.product?.productBodyInsert?.color || ''}
            onChange={(e) => handleFieldChange(e, 'color')}
            label={'color'.toUpperCase()}
            displayEmpty
            name='product.productBodyInsert.color'
            disabled={disableFields}
          >
            {colors.map((color, id) => (
              <MenuItem key={id} value={color.name.toLowerCase().replace(/\s/g, '_')}>
                {color.name.toLowerCase().replace(/\s/g, '_')}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBodyInsert.color') &&
            getIn(errors, 'product.productBodyInsert.color') && (
              <FormHelperText>
                <ErrorMessage name='product.productBodyInsert.color' />
              </FormHelperText>
            )}
        </FormControl>
        <Field
          as={TextField}
          type='color'
          label='COLOR HEX'
          name='product.productBodyInsert.colorHex'
          InputLabelProps={{ shrink: true }}
          required
          fullWidth
          disabled={disableFields}
        />
        <FormControl
          fullWidth
          required
          error={Boolean(
            getIn(errors, 'product.productBodyInsert.countryOfOrigin') &&
              getIn(touched, 'product.productBodyInsert.countryOfOrigin'),
          )}
        >
          <InputLabel shrink>{'country'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBodyInsert.countryOfOrigin'
            value={values.product?.productBodyInsert?.countryOfOrigin || ''}
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
          {getIn(touched, 'product.productBodyInsert.countryOfOrigin') &&
            getIn(errors, 'product.productBodyInsert.countryOfOrigin') && (
              <FormHelperText>
                <ErrorMessage name='product.productBodyInsert.countryOfOrigin' />
              </FormHelperText>
            )}
        </FormControl>
        <Field
          as={TextField}
          variant='outlined'
          label={'price'.toUpperCase()}
          name='product.productBodyInsert.price.value'
          type='text'
          inputProps={{ min: 0, step: '0.01' }}
          required
          fullWidth
          error={Boolean(
            getIn(errors, 'product.productBodyInsert.price.value') &&
              getIn(touched, 'product.productBodyInsert.price.value'),
          )}
          helperText={
            getIn(touched, 'product.productBodyInsert.price.value') &&
            getIn(errors, 'product.productBodyInsert.price.value')
          }
          InputLabelProps={{ shrink: true }}
          onChange={(e: any) => {
            if (/^\d*\.?\d{0,2}$/.test(e.target.value)) {
              handlePriceChange(e);
            }
          }}
          onBlur={(e: any) => {
            const formattedValue = parseFloat(e.target.value).toFixed(2);
            setFieldValue('product.productBodyInsert.price.value', formattedValue);
          }}
          disabled={disableFields}
        />
        {showSales && (
          <Field
            as={TextField}
            label={'sale percentage'.toUpperCase()}
            name='product.productBodyInsert.salePercentage.value'
            onChange={(e: any) => {
              if (/^\d*$/.test(e.target.value)) {
                handlePriceChange(e, true);
              }
            }}
            type='text'
            inputProps={{ min: 0, max: 99 }}
            InputLabelProps={{ shrink: true }}
            fullWidth
            disabled={disableFields}
          />
        )}
        {showPreorder && (
          <DatePicker
            label={'preorder'.toUpperCase()}
            value={parseDate(values.product?.productBodyInsert?.preorder)}
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
        )}
        //TODO: now it's placed inside the translations
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
        <Field
          as={TextField}
          label={'model wears height'.toUpperCase()}
          name='product.productBodyInsert.modelWearsHeightCm'
          onChange={(e: any) => handleFieldChange(e, 'modelWearsHeightCm')}
          InputLabelProps={{ shrink: true }}
          fullWidth
          disabled={disableFields}
        />
        <FormControl fullWidth>
          <InputLabel shrink>{'model wears size'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBodyInsert.modelWearsSizeId'
            value={values.product?.productBodyInsert?.modelWearsSizeId || ''}
            onChange={(e) => handleFieldChange(e, 'modelWearsSizeId')}
            label={'model wears size'.toUpperCase()}
            displayEmpty
            disabled={disableFields || !values.product?.productBodyInsert?.topCategoryId}
          >
            {filteredSizes.map((size) => (
              <MenuItem key={size.id} value={size.id}>
                {size.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Field
          as={TextField}
          label={'sku'.toUpperCase()}
          name='product.productBodyInsert.sku'
          InputProps={{ readOnly: true }}
          InputLabelProps={{ shrink: true }}
          required
          fullWidth
          disabled={disableFields}
        />
        <Field
          component={Care}
          name='product.productBodyInsert'
          {...{ isEditMode, isAddingProduct }}
        />
        <Field
          component={Composition}
          name='product.productBodyInsert'
          {...{ isAddingProduct, isEditMode }}
        />
      </div>
    </LocalizationProvider>
  );
};
