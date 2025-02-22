import { Checkbox, FormControlLabel } from '@mui/material';
import { GetProductsPagedRequest } from 'api/proto-http/admin';
import { colors } from 'constants/colors';
import { Field, FieldProps, Form, Formik } from 'formik';
import { findInDictionary } from 'lib/features/findInDictionary';
import { useProductStore } from 'lib/stores/product/store';
import { useDictionaryStore } from 'lib/stores/store';
import { FC } from 'react';
import Input from 'ui/components/input';
import Selector from 'ui/components/selector';
import {
  genderOptions,
  orderFactors,
  sortFactors,
} from '../../genericProductComponent/utility/dictionaryConst';

interface FilterProps {
  onFilterChange: (values: GetProductsPagedRequest) => void;
}

export const Filter: FC<FilterProps> = ({ onFilterChange }) => {
  const { filter, updateFilter } = useProductStore();
  const { dictionary } = useDictionaryStore();

  const handleFieldChange = (setFieldValue: Function, fieldName: string, value: any) => {
    setFieldValue(fieldName, value);

    let updatedFilter = {};
    if (fieldName.includes('filterConditions')) {
      const keys = fieldName.split('.');
      if (keys[1] === 'categoryIds') {
        updatedFilter = {
          filterConditions: {
            categoryIds: Array.isArray(value) ? value : [value],
          },
        };
      } else if (keys[1] === 'sizesIds' && value.includes('')) {
        updatedFilter = {
          filterConditions: {
            sizesIds: [],
          },
        };
      } else {
        updatedFilter = {
          filterConditions: {
            [keys[1]]: value,
          },
        };
      }
    } else {
      updatedFilter = {
        [fieldName]: value,
      };
    }

    updateFilter(updatedFilter);
    onFilterChange({ ...filter, ...updatedFilter });
  };

  return (
    <Formik initialValues={filter} onSubmit={() => {}}>
      {({ setFieldValue }) => (
        <Form>
          <Field name='sortFactors'>
            {({ field }: FieldProps) => (
              <Selector
                label='SORT FACTORS'
                value={field.value || ''}
                options={sortFactors.map((s) => ({
                  value: s.id ?? '',
                  label: s.name?.toUpperCase() || '',
                }))}
                onChange={(value) => handleFieldChange(setFieldValue, field.name, [value])}
              />
            )}
          </Field>

          <Field name='orderFactor'>
            {({ field }: FieldProps) => (
              <Selector
                label='ORDER'
                value={field.value || ''}
                options={orderFactors.map((order) => ({
                  value: order.id ?? '',
                  label: order.name?.toUpperCase() || '',
                }))}
                onChange={(value) => handleFieldChange(setFieldValue, field.name, value)}
              />
            )}
          </Field>

          <Field name='filterConditions.categoryIds'>
            {({ field }: FieldProps) => (
              <Selector
                label='CATEGORY'
                value={field.value || []}
                options={
                  dictionary?.categories?.map((category) => ({
                    value: category.id ?? '',
                    label: findInDictionary(dictionary, category.id, 'category') || '',
                  })) || []
                }
                onChange={(value) =>
                  handleFieldChange(setFieldValue, field.name, value === '' ? [] : [value])
                }
                multiple
              />
            )}
          </Field>

          <Field name='filterConditions.sizesIds'>
            {({ field }: FieldProps) => (
              <Selector
                label='SIZES'
                value={field.value || []}
                options={
                  dictionary?.sizes?.map((s) => ({
                    value: s.id ?? '',
                    label: findInDictionary(dictionary, s.id, 'size') || '',
                  })) || []
                }
                onChange={(value) =>
                  handleFieldChange(setFieldValue, field.name, value === '' ? [] : [value])
                }
                multiple
                fullWidth
              />
            )}
          </Field>

          <Input
            name='filterConditions.from'
            placeholder='FROM'
            type='number'
            onChange={(e: any) => {
              if (/^\d*$/.test(e.target.value)) {
                handleFieldChange(setFieldValue, 'filterConditions.from', e.target.value);
              }
            }}
            value={filter.filterConditions?.from}
          />

          <Input
            name='filterConditions.to'
            placeholder='TO'
            type='number'
            onChange={(e: any) => {
              if (/^\d*$/.test(e.target.value)) {
                handleFieldChange(setFieldValue, 'filterConditions.to', e.target.value);
              }
            }}
            value={filter.filterConditions?.to}
          />

          <Field name='filterConditions.color'>
            {({ field }: FieldProps) => (
              <Selector
                label='COLOR'
                value={field.value || ''}
                options={colors.map((color, id) => ({
                  value: color.name.toLowerCase().replace(/\s/g, '_'),
                  label: color.name.toLowerCase().replace(/\s/g, '_'),
                }))}
                onChange={(value) => handleFieldChange(setFieldValue, field.name, value)}
                fullWidth
              />
            )}
          </Field>

          <Field name='filterConditions.gender'>
            {({ field }: FieldProps) => (
              <Selector
                label='GENDER'
                value={field.value || ''}
                options={genderOptions.map((gender) => ({
                  value: gender.id ?? '',
                  label: gender.name?.toUpperCase() || '',
                }))}
                onChange={(value) => handleFieldChange(setFieldValue, field.name, value)}
                fullWidth
              />
            )}
          </Field>

          <Input
            name='filterConditions.byTag'
            placeholder='TAG'
            value={filter.filterConditions?.byTag}
            onChange={(e: any) =>
              handleFieldChange(setFieldValue, 'filterConditions.byTag', e.target.value)
            }
          />

          <Field name='filterConditions.onSale'>
            {({ field }: FieldProps) => (
              <FormControlLabel
                label='SALE'
                control={
                  <Checkbox
                    {...field}
                    checked={field.value || false}
                    onChange={(e) => handleFieldChange(setFieldValue, field.name, e.target.checked)}
                  />
                }
              />
            )}
          </Field>

          <Field name='filterConditions.preorder'>
            {({ field }: FieldProps) => (
              <FormControlLabel
                label='PREORDER'
                control={
                  <Checkbox
                    {...field}
                    checked={field.value || false}
                    onChange={(e) => handleFieldChange(setFieldValue, field.name, e.target.checked)}
                  />
                }
              />
            )}
          </Field>

          <Field name='showHidden'>
            {({ field }: FieldProps) => (
              <FormControlLabel
                label='HIDDEN'
                control={
                  <Checkbox
                    {...field}
                    checked={field.value || false}
                    onChange={(e) => handleFieldChange(setFieldValue, field.name, e.target.checked)}
                  />
                }
              />
            )}
          </Field>
        </Form>
      )}
    </Formik>
  );
};
