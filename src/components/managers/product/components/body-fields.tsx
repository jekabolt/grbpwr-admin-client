import { genderOptions, SEASON_OPTIONS } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';
import CountryList from 'react-select-country-list';
import Text from 'ui/components/text';
import SelectField from 'ui/form/fields/select-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { Care } from './care/care';
import { ColorFields } from './color-fields';
import { Composition } from './composition/composition';
import { PriceFields } from './price-fields';
import { ReadOnlyField, TechCardLink } from './read-only-field';
import { SalePreorderFields } from './sale-preorder-fields';
import { TierAccessFields } from './tier-access-fields';

interface Country {
  value: string;
  label: string;
}

const labelFor = (
  options: ReadonlyArray<{ value: string; label: string }>,
  value?: string,
): string => (value ? options.find((o) => o.value === value)?.label ?? value : '');

// Capitalise a free-text style fact (e.g. `fit`) for read-only display without forcing it into a
// fixed vocabulary — a value set outside the usual list still renders as its stored text (P3 #15).
const titleCase = (value?: string): string =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

export function BodyFields({
  editMode,
  isAddingProduct,
  styleId,
}: {
  editMode: boolean;
  isAddingProduct?: boolean;
  // Owning style id — turns the derived-facts panel's "edit on tech card" hint into a real link.
  styleId?: number;
}) {
  const { dictionary } = useDictionary();
  const countries = useMemo(() => CountryList().getData() as Country[], []);

  const brand = useWatch({ name: 'product.productBodyInsert.brand' }) as string | undefined;
  const collection = useWatch({ name: 'product.productBodyInsert.collection' }) as
    | string
    | undefined;
  const season = useWatch({ name: 'product.productBodyInsert.season' }) as string | undefined;
  const gender = useWatch({ name: 'product.productBodyInsert.targetGender' }) as string | undefined;
  const fit = useWatch({ name: 'product.productBodyInsert.fit' }) as string | undefined;
  const topCategoryId = useWatch({ name: 'product.productBodyInsert.topCategoryId' }) as
    | string
    | undefined;
  const subCategoryId = useWatch({ name: 'product.productBodyInsert.subCategoryId' }) as
    | string
    | undefined;
  const typeId = useWatch({ name: 'product.productBodyInsert.typeId' }) as string | undefined;

  // Resolve the category chain to names for a readable "Top › Sub › Type" display (ids are the
  // style-owned truth, edited on the tech card).
  const categoryPath = useMemo(() => {
    const nameById = (id?: string) => {
      const n = id ? parseInt(id) : 0;
      if (!n) return '';
      return dictionary?.categories?.find((c) => c.id === n)?.name ?? '';
    };
    return [nameById(topCategoryId), nameById(subCategoryId), nameById(typeId)]
      .filter(Boolean)
      .join(' › ');
  }, [dictionary?.categories, topCategoryId, subCategoryId, typeId]);

  // From-scratch create has no style facts yet (they arrive once a style is attached and the draft is
  // created). Copy mode prefills them from the source, so show the real facts there.
  const hasStyleFacts = Boolean(brand || categoryPath || collection || season || gender || fit);

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

      {/* Style facts (brand, collection, season, gender, fit, category, composition, care) are shared
          by every colourway of the style and edited on the tech card — shown here as clean read-only
          facts, not as inert-but-editable-looking inputs. Only the colourway's own attributes stay
          editable below. */}
      <section className='space-y-3 border border-textInactiveColor p-4'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <Text variant='uppercase' size='small'>
            style facts · read-only
          </Text>
          <TechCardLink styleId={styleId} />
        </div>

        {isAddingProduct && !hasStyleFacts ? (
          <Text variant='inactive' size='small'>
            Brand, category, collection, season, gender, fit, composition and care come from the
            style you attach this colourway to — set them on that style’s tech card. They appear
            here once the draft is created.
          </Text>
        ) : (
          <>
            <div className='grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3'>
              <ReadOnlyField label='brand' value={brand} />
              <ReadOnlyField label='category' value={categoryPath} />
              <ReadOnlyField label='collection' value={collection} />
              <ReadOnlyField label='season' value={labelFor(SEASON_OPTIONS, season)} />
              <ReadOnlyField label='gender' value={labelFor(genderOptions, gender)} />
              <ReadOnlyField label='fit' value={titleCase(fit)} />
            </div>
            <Composition editMode={false} />
            <Care editMode={false} />
          </>
        )}
      </section>

      {/* Colourway-owned attributes — editable on this form. */}
      <div className='space-y-3'>
        <ColorFields editMode={editMode} />
        {/* Single source of truth for the manufacture country: this one field feeds both the
            colourway's merchandising country (UpdateColorway) and its customs declaration
            (SetColorwayCustoms), which is shown read-only in the Customs section. */}
        <div className='space-y-1'>
          <SelectField
            fullWidth
            name='product.productBodyInsert.countryOfOrigin'
            label='country of origin'
            items={countries}
            readOnly={!editMode}
          />
          <Text variant='label' size='small'>
            Set once here; this value feeds both the product’s country of origin and its customs
            declaration.
          </Text>
        </div>
        <PriceFields editMode={editMode} />
        <SalePreorderFields editMode={editMode} />
        {/* Model-wears height/size moved to the "model presentation" section (<StyleSection/>), next
            to the button that actually saves them (UpdateStyle). That section needs an existing
            colourway to attach the save to, so it isn't shown until the draft is created; surface a
            pointer here in the meantime rather than an input that silently goes nowhere. */}
        {isAddingProduct && (
          <Text variant='inactive' size='small'>
            model wears height/size are set after the draft is created, under “model presentation”.
          </Text>
        )}
        <TierAccessFields editMode={editMode} />
      </div>
    </div>
  );
}
