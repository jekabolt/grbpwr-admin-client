import { genderOptions, SEASON_OPTIONS } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import CountryList from 'react-select-country-list';
import InputField from 'ui/form/fields/input-field';
import SelectField from 'ui/form/fields/select-field';
import Text from 'ui/components/text';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { Care } from './care/care';
import { CategoryFields } from './category-fields';
import { ColorFields } from './color-fields';
import { Composition } from './composition/composition';
import { PriceFields } from './price-fields';
import { SalePreorderFields } from './sale-preorder-fields';
import { TierAccessFields } from './tier-access-fields';

const FIT_OPTIONS = ['regular', 'slim', 'loose', 'relaxed', 'skinny', 'cropped', 'tailored'];

interface Country {
  value: string;
  label: string;
}

export function BodyFields({
  editMode,
  isAddingProduct,
}: {
  editMode: boolean;
  isAddingProduct?: boolean;
}) {
  const { dictionary } = useDictionary();
  const countries = useMemo(() => CountryList().getData() as Country[], []);

  // R9: collection options from the controlled dictionary (archived hidden). Free-text value kept
  // for the intermediate contract; final bump switches to collection_id on the Style.
  const collectionItems = useMemo(
    () =>
      (dictionary?.collections ?? [])
        .filter((c) => !c.archived && c.name)
        .map((c) => ({ label: c.name || '', value: c.name || '' })),
    [dictionary?.collections],
  );

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
        {/* Style facts (brand, collection, season, gender, fit, category, composition, care) are shared
            by every colourway of the style — edited on the tech card, read-only here. Only the
            colourway's own attributes (colour, country, prices, sale, tier) and model-wears (the
            per-colourway photo-shoot note) stay editable. */}
        <Text variant='inactive' size='small'>
          Brand, collection, season, gender, fit, category, composition and care are style facts —
          edit them on the tech card.
        </Text>
        <InputField name='product.productBodyInsert.brand' label='brand' readOnly />
        <SelectField
          fullWidth
          name='product.productBodyInsert.collection'
          label='collection'
          items={collectionItems}
          readOnly
        />
        <SelectField
          name='product.productBodyInsert.season'
          label='season'
          items={SEASON_OPTIONS}
          readOnly
        />
        <SelectField
          name='product.productBodyInsert.targetGender'
          label='gender'
          items={genderOptions}
          readOnly
        />
        <SelectField
          name='product.productBodyInsert.fit'
          label='fit'
          items={FIT_OPTIONS.map((fit) => ({
            label: fit,
            value: fit,
          }))}
          readOnly
        />
        <CategoryFields editMode={false} />
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
        {/* Model-wears height/size moved to the "model presentation" section (<StyleSection/>), next
            to the button that actually saves them (UpdateStyle) — keeping them here made it read as
            though the main colourway Save persisted them, which it never did. That section needs an
            existing colourway to attach the save to, so it isn't shown until the draft is created;
            surface a pointer here in the meantime rather than an input that silently goes nowhere. */}
        {isAddingProduct && (
          <Text variant='inactive' size='small'>
            model wears height/size are set after the draft is created, under “model presentation”.
          </Text>
        )}
        <Care editMode={false} />
        <Composition editMode={false} />
        <TierAccessFields editMode={editMode} />
      </div>
    </div>
  );
}
