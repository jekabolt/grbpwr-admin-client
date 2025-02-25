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
import { colors } from 'constants/colors';
import { genderOptions } from 'constants/dictioanary';
import { ErrorMessage, Field, getIn, useFormikContext } from 'formik';
import { generateOrUpdateSKU, generateSKU } from 'lib/features/dynamicGenerationOfSku';
import { useDictionaryStore } from 'lib/stores/store';
import React, { FC, useCallback, useEffect, useMemo, useState } from 'react';
import CountryList from 'react-select-country-list';
import { v4 as uuidv4 } from 'uuid';
import { BasicProductFieldsInterface, Country } from '../../interface/interface';
import { handleKeyDown } from '../../utility/brandNameRegExp';
import { processCategories } from '../../utility/categories';
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
  const categories = processCategories(dictionary?.categories || []);

  const selectedSubCategories = (() => {
    const topCategory = categories.find(
      (cat) => cat.id === values.product?.productBody?.topCategoryId,
    );
    return topCategory?.subCategories || [];
  })();

  const selectedTypes = (() => {
    const subCategory = selectedSubCategories.find(
      (sub) => sub.id === values.product?.productBody?.subCategoryId,
    );
    return subCategory?.types || [];
  })();

  const filteredSizes = getFilteredSizes(
    dictionary,
    values.product?.productBody?.topCategoryId || 0,
  );

  useEffect(() => {
    if (
      isCopyMode &&
      values.product?.productBody?.sku === product?.product?.productDisplay?.productBody?.sku
    ) {
      const newUuid = uuidv4();
      const selectedCategory = categories.find(
        (cat) => cat.id === values.product?.productBody?.topCategoryId,
      );

      const newSKU = generateSKU(
        values.product?.productBody?.brand,
        values.product?.productBody?.targetGender,
        selectedCategory?.name,
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

      if (field === 'topCategoryId') {
        const selectedCategory = categories.find((cat) => cat.id === newValue);

        if (selectedCategory?.subCategories.length === 0) {
          setFieldValue('product.productBody.subCategoryId', newValue, false);
        } else {
          setFieldValue('product.productBody.subCategoryId', '', false);
        }
        setFieldValue('product.productBody.typeId', '', false);
      }

      if (field === 'subCategoryId') {
        setFieldValue('product.productBody.typeId', '', false);
      }

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

      const categoryId =
        field === 'topCategoryId' ? newValue : values.product?.productBody?.topCategoryId;
      const selectedCategory = categories.find((cat) => cat.id === categoryId);
      const updatedProductBody = {
        ...values.product?.productBody,
        [field]: newValue,
        categoryName: selectedCategory?.name,
      };
      const newSku = generateOrUpdateSKU(values.product?.productBody?.sku, updatedProductBody);
      setFieldValue('product.productBody.sku', newSku);
    },
    [values.product?.productBody, setFieldValue, dictionary, categories],
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
    setFieldValue('product.productBody.preorder', formattedDate);
    setShowSales(!date);
  };

  const parseDate = (dateString: string | undefined): Date | null => {
    return parseWellKnownTimestamp(dateString || '0001-01-01T00:00:00Z');
  };

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
      <div className='grid gap-4 w-full'>
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
            {genderOptions.map((gender) => (
              <MenuItem key={gender.id} value={gender.id}>
                {gender.name?.toUpperCase()}
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
            value={values.product?.productBody?.topCategoryId || ''}
            label={'category'.toUpperCase()}
            displayEmpty
            disabled={disableFields}
          >
            {categories.map((category) => (
              <MenuItem value={category.id} key={category.id}>
                {category.name}
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

        <FormControl
          required
          fullWidth
          error={Boolean(
            getIn(errors, 'product.productBody.subCategoryId') &&
              getIn(touched, 'product.productBody.subCategoryId'),
          )}
        >
          <InputLabel shrink>{'subcategory'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBody.subCategoryId'
            onChange={(e) => handleFieldChange(e, 'subCategoryId')}
            value={values.product?.productBody?.subCategoryId || ''}
            label={'subcategory'.toUpperCase()}
            displayEmpty
            disabled={disableFields || !values.product?.productBody?.topCategoryId}
          >
            {selectedSubCategories.map((category) => (
              <MenuItem value={category.id} key={category.id}>
                {category.name}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBody.subCategoryId') &&
            getIn(errors, 'product.productBody.subCategoryId') && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.subCategoryId' />
              </FormHelperText>
            )}
        </FormControl>

        <FormControl
          required
          fullWidth
          error={Boolean(
            getIn(errors, 'product.productBody.typeId') &&
              getIn(touched, 'product.productBody.typeId'),
          )}
        >
          <InputLabel shrink>{'type'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBody.typeId'
            onChange={(e) => handleFieldChange(e, 'typeId')}
            value={values.product?.productBody?.typeId || ''}
            label={'type'.toUpperCase()}
            displayEmpty
            disabled={disableFields}
          >
            {selectedTypes.map((type) => (
              <MenuItem value={type.id} key={type.id}>
                {type.name}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBody.typeId') &&
            getIn(errors, 'product.productBody.typeId') && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.typeId' />
              </FormHelperText>
            )}
        </FormControl>

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

        <Field
          as={TextField}
          variant='outlined'
          label={'price'.toUpperCase()}
          name='product.productBody.price.value'
          type='text'
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
          onChange={(e: any) => {
            if (/^\d*\.?\d{0,2}$/.test(e.target.value)) {
              handlePriceChange(e);
            }
          }}
          onBlur={(e: any) => {
            const formattedValue = parseFloat(e.target.value).toFixed(2);
            setFieldValue('product.productBody.price.value', formattedValue);
          }}
          disabled={disableFields}
        />

        {showSales && (
          <Field
            as={TextField}
            label={'sale percentage'.toUpperCase()}
            name='product.productBody.salePercentage.value'
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
        )}

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
          name='product.productBody.modelWearsHeightCm'
          error={Boolean(
            getIn(errors, 'product.productBody.modelWearsHeightCm') &&
              getIn(touched, 'product.productBody.modelWearsHeightCm'),
          )}
          helperText={
            getIn(touched, 'product.productBody.modelWearsHeightCm') &&
            getIn(errors, 'product.productBody.modelWearsHeightCm')
          }
          onChange={(e: any) => handleFieldChange(e, 'modelWearsHeightCm')}
          InputLabelProps={{ shrink: true }}
          required
          fullWidth
          disabled={disableFields}
        />

        <FormControl
          fullWidth
          required
          error={Boolean(
            getIn(errors, 'product.productBody.modelWearsSizeId') &&
              getIn(touched, 'product.productBody.modelWearsSizeId'),
          )}
        >
          <InputLabel shrink>{'model wears size'.toUpperCase()}</InputLabel>
          <Select
            name='product.productBody.modelWearsSizeId'
            value={values.product?.productBody?.modelWearsSizeId || ''}
            onChange={(e) => handleFieldChange(e, 'modelWearsSizeId')}
            label={'model wears size'.toUpperCase()}
            displayEmpty
            disabled={disableFields || !values.product?.productBody?.topCategoryId}
          >
            {filteredSizes.map((size) => (
              <MenuItem key={size.id} value={size.id}>
                {size.name}
              </MenuItem>
            ))}
          </Select>
          {getIn(touched, 'product.productBody.modelWearsSizeId') &&
            getIn(errors, 'product.productBody.modelWearsSizeId') && (
              <FormHelperText>
                <ErrorMessage name='product.productBody.modelWearsSizeId' />
              </FormHelperText>
            )}
        </FormControl>

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

        <Field component={Care} name='product.productBody' {...{ isEditMode, isAddingProduct }} />

        <Field
          component={Composition}
          name='product.productBody'
          {...{ isAddingProduct, isEditMode }}
        />
      </div>
    </LocalizationProvider>
  );
};
