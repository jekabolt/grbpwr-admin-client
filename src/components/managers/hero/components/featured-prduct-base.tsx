import { Button, Grid2 as Grid, Typography } from '@mui/material';
import { useFormContext } from 'react-hook-form';
import { ProductPickerModal } from 'ui/components/productPickerModal';
import InputField from 'ui/form/fields/input-field';
import { TranslationField } from 'ui/form/fields/translation-field';
import { HeroProductEntityInterface } from '../entities/interface/interface';
import { HeroProductTable } from './heroProductsTable';
import { HeroSchema } from './schema';

export function FeaturedProductBase({
  entity,
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
    control,
    formState: { errors },
  } = useFormContext<HeroSchema>();
  // const prefixBase = 'featuredProductsTag';
  // const prefix = `${prefixBase}`;
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          {title}
        </Typography>
      </Grid>
      {prefix?.includes('featuredProductsTag') && (
        <InputField name={`entities.${index}.${prefix}.tag`} label='tag' />
      )}

      <TranslationField
        label='headline'
        fieldPrefix={`entities.${index}.${prefix}.translations`}
        fieldName='headline'
      />
      <TranslationField
        label='explore text'
        fieldPrefix={`entities.${index}.${prefix}.translations`}
        fieldName='exploreText'
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
    </Grid>
  );
}
