import { genderOptions } from 'constants/filter';
import { useDictionaryStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import CountryList from 'react-select-country-list';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { getFilteredSizes } from '../utility/sizes';
import { Care } from './care/care';
import { CategoryFields } from './category-fields';
import { ColorFields } from './color-fields';
import { Composition } from './composition/composition';
import { SalePreorderFields } from './sale-preorder-fields';

interface Country {
  value: string;
  label: string;
}

export function BodyFields() {
  const { dictionary } = useDictionaryStore();
  const { getValues, watch } = useFormContext();
  const countries = useMemo(() => CountryList().getData() as Country[], []);

  watch('product.productBodyInsert.topCategoryId');

  const topCategoryRaw = getValues('product.productBodyInsert.topCategoryId');
  const topCategoryId =
    typeof topCategoryRaw === 'string' ? parseInt(topCategoryRaw) : topCategoryRaw || 0;

  const filteredSizes = getFilteredSizes(dictionary, topCategoryId || 0);

  return (
    <div className='space-y-3'>
      <TranslationField fieldPrefix='product.translations' fieldName='name' label='name' />
      <InputField name='product.productBodyInsert.brand' label='brand' />
      <InputField name='product.productBodyInsert.version' label='version' />
      <InputField name='product.productBodyInsert.collection' label='collection' />
      <SelectField
        name='product.productBodyInsert.targetGender'
        label='gender'
        items={genderOptions}
      />
      <CategoryFields />
      <ColorFields />
      <SelectField
        fullWidth
        name='product.productBodyInsert.countryOfOrigin'
        label='country of origin'
        items={countries}
      />
      <InputField name='product.productBodyInsert.price.value' label='price' />
      <SalePreorderFields />
      <InputField name='product.productBodyInsert.modelWearsHeightCm' label='model wears height' />
      <SelectField
        fullWidth
        name='product.productBodyInsert.modelWearsSizeId'
        label='model wears size'
        items={filteredSizes.map((size) => ({
          label: size.name || '',
          value: size.id?.toString() || '',
        }))}
      />
      <Care />
      <Composition />
      <TranslationField
        fieldPrefix='product.translations'
        fieldName='description'
        label='description'
      />
    </div>
  );
}

{
  /* <div className='grid gap-4 w-full'>
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
</div> */
}
