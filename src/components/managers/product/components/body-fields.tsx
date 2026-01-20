import { genderOptions } from 'constants/filter';
import { useDictionaryStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useFormContext } from 'react-hook-form';
import CountryList from 'react-select-country-list';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { getFilteredSizes } from '../utility/sizes';
import { Care } from './care/care';
import { CategoryFields } from './category-fields';
import { ColorFields } from './color-fields';
import { Composition } from './composition/composition';
import { PriceFields } from './price-fields';
import { SalePreorderFields } from './sale-preorder-fields';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'];

interface Country {
  value: string;
  label: string;
}

export function BodyFields({ editMode }: { editMode: boolean }) {
  const { dictionary } = useDictionaryStore();
  const { getValues, watch } = useFormContext();
  const countries = useMemo(() => CountryList().getData() as Country[], []);

  watch('product.productBodyInsert.topCategoryId');

  const topCategoryRaw = getValues('product.productBodyInsert.topCategoryId');
  const topCategoryId =
    typeof topCategoryRaw === 'string' ? parseInt(topCategoryRaw) : topCategoryRaw || 0;

  const filteredSizes = getFilteredSizes(dictionary, topCategoryId || 0);

  return (
    <div className='space-y-10'>
      <UnifiedTranslationFields
        fieldPrefix='product.translations'
        fields={[
          { name: 'name', label: 'Name', type: 'input' },
          { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
        ]}
        editMode={editMode}
      />

      <div className='space-y-3'>
        <InputField name='product.productBodyInsert.brand' label='brand' readOnly={!editMode} />
        <InputField name='product.productBodyInsert.version' label='version' readOnly={!editMode} />
        <InputField
          name='product.productBodyInsert.collection'
          label='collection'
          readOnly={!editMode}
        />
        <SelectField
          name='product.productBodyInsert.targetGender'
          label='gender'
          items={genderOptions}
          readOnly={!editMode}
        />
        <SelectField
          name='product.productBodyInsert.fit'
          label='fit'
          items={FIT_OPTIONS.map((fit) => ({
            label: fit,
            value: fit,
          }))}
          readOnly={!editMode}
        />
        <CategoryFields editMode={editMode} />
        <ColorFields editMode={editMode} />
        <SelectField
          fullWidth
          name='product.productBodyInsert.countryOfOrigin'
          label='country of origin'
          items={countries}
          readOnly={!editMode}
        />
        <PriceFields editMode={editMode} />
        <SalePreorderFields editMode={editMode} />
        <InputField
          name='product.productBodyInsert.modelWearsHeightCm'
          label='model wears height'
          readOnly={!editMode}
        />
        <SelectField
          fullWidth
          name='product.productBodyInsert.modelWearsSizeId'
          label='model wears size'
          items={filteredSizes.map((size) => ({
            label: size.name || '',
            value: size.id?.toString() || '',
          }))}
          readOnly={!editMode}
        />
        <Care editMode={editMode} />
        <Composition editMode={editMode} />
      </div>
    </div>
  );
}
