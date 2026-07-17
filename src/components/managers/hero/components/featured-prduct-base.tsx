import { ProductPickerModal } from 'components/managers/hero/components/productPickerModal';
import { useFormContext } from 'react-hook-form';
import Text from 'ui/components/text';
import { LinkField } from './link-field';
import { TagPicker } from './tag-picker';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { HeroProductEntityInterface } from '../utility/interface';
import { HeroProductTable } from './heroProductsTable';
import { HeroSchema } from './schema';
import { useProductsByTag } from './useProductsByTag';

const FEATURED_PRODUCTS_TRANSLATION_FIELDS = [
  { name: 'headline', label: 'headline', type: 'input' as const, maxLength: 30 },
  { name: 'exploreText', label: 'explore text', type: 'input' as const, maxLength: 8 },
];

export function FeaturedProductBase({
  index,
  uid,
  product,
  currentEntityUid,
  prefix,
  title,
  isModalOpen = false,
  showProductPicker = false,
  handleProductsReorder,
  handleOpenProductSelection,
  handleCloseModal = () => {},
  handleSaveNewSelection,
}: HeroProductEntityInterface) {
  const {
    formState: { errors },
    watch,
    setValue,
  } = useFormContext<HeroSchema>();

  const tag = prefix?.includes('featuredProductsTag')
    ? watch(`entities.${index}.${prefix}.tag` as any)
    : undefined;

  const { data: productsByTag = [], isLoading: isLoadingProducts } = useProductsByTag(
    tag,
    prefix?.includes('featuredProductsTag'),
  );

  const displayProducts =
    prefix?.includes('featuredProductsTag') && productsByTag.length > 0
      ? productsByTag
      : product[uid] || [];

  return (
    <div className='space-y-5 p-3 lg:p-4'>
      <Text className='font-bold leading-none' variant='uppercase' size='large'>
        {title}
      </Text>
      {prefix?.includes('featuredProductsTag') && (
        <TagPicker
          value={tag || ''}
          onChange={(v) =>
            setValue(`entities.${index}.${prefix}.tag` as any, v, { shouldDirty: true })
          }
          label='tag'
        />
      )}

      <UnifiedTranslationFields
        fieldPrefix={`entities.${index}.${prefix}.translations`}
        fields={FEATURED_PRODUCTS_TRANSLATION_FIELDS}
        editMode={true}
      />
      <LinkField name={`entities.${index}.${prefix}.exploreLink`} label='explore link (optional)' />

      {isLoadingProducts && prefix?.includes('featuredProductsTag') ? (
        <div className='py-8 text-center'>
          <Text>Loading products...</Text>
        </div>
      ) : (
        <HeroProductTable
          products={displayProducts}
          id={index}
          isFeaturedProducts={prefix === 'featuredProducts'}
          onReorder={(e: any) => handleProductsReorder?.(e, uid)}
        />
      )}

      {showProductPicker && (
        <>
          {errors.entities?.[index] &&
            prefix &&
            (errors.entities[index] as any)?.[prefix]?.productIds && (
              <Text variant='error'>
                {(errors.entities[index] as any)[prefix]?.productIds?.message}
              </Text>
            )}
          <ProductPickerModal
            open={isModalOpen && currentEntityUid === uid}
            onClose={handleCloseModal}
            selectedProductIds={(product[uid] || []).map((x) => x.id!)}
            onSave={(selectedProduct) => handleSaveNewSelection?.(selectedProduct, index, uid)}
            onOpenRequest={() => handleOpenProductSelection?.(uid)}
            // H1: featured products are homepage-facing — only ACTIVE colourways can
            // be picked, so a draft/hidden product can never be featured while
            // looking live.
            statuses={['COLORWAY_LIFECYCLE_STATUS_ACTIVE']}
          />
        </>
      )}
    </div>
  );
}
