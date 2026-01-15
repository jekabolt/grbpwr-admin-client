import { Button } from '@mui/material';
import { useFormContext } from 'react-hook-form';
import { ProductPickerModal } from 'ui/components/productPickerModal';
import Text from 'ui/components/text';
import InputField from 'ui/form/fields/input-field';
import { UnifiedTranslationFields } from 'ui/form/fields/unified-translation-fields';
import { HeroProductEntityInterface } from '../entities/interface/interface';
import { HeroProductTable } from './heroProductsTable';
import { HeroSchema } from './schema';

const FEATURED_PRODUCTS_TRANSLATION_FIELDS = [
  { name: 'headline', label: 'headline', type: 'input' as const },
  { name: 'exploreText', label: 'explore text', type: 'input' as const },
];

export function FeaturedProductBase({
  index,
  product,
  currentEntityIndex,
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
  } = useFormContext<HeroSchema>();

  return (
    <div>
      <Text className='text-xl font-bold leading-none' variant='uppercase'>
        {title}
      </Text>
      {prefix?.includes('featuredProductsTag') && (
        <InputField name={`entities.${index}.${prefix}.tag`} label='tag' />
      )}

      <UnifiedTranslationFields
        fieldPrefix={`entities.${index}.${prefix}.translations`}
        fields={FEATURED_PRODUCTS_TRANSLATION_FIELDS}
        editMode={true}
      />
      <InputField name={`entities.${index}.${prefix}.exploreLink`} label='explore link' />

      <HeroProductTable
        products={product[index] || []}
        id={index}
        isFeaturedProducts={prefix === 'featuredProducts'}
        onReorder={(e: any) => handleProductsReorder?.(e, index)}
      />

      {showProductPicker && (
        <>
          {errors.entities?.[index] &&
            prefix &&
            (errors.entities[index] as any)?.[prefix]?.productIds && (
              <div style={{ color: 'red' }}>
                {(errors.entities[index] as any)[prefix]?.productIds?.message}
              </div>
            )}
          <Button onClick={() => handleOpenProductSelection?.(index)}>add products</Button>
          <ProductPickerModal
            open={isModalOpen && currentEntityIndex === index}
            onClose={handleCloseModal}
            selectedProductIds={(product[index] || []).map((x) => x.id!)}
            onSave={(selectedProduct) => handleSaveNewSelection?.(selectedProduct, index)}
          />
        </>
      )}
    </div>
  );
}
