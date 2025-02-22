import { Button, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { ProductPickerModal } from 'components/ui/components/productPickerModal';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import { isValidURL, isValidUrlForHero } from 'lib/features/isValidUrl';
import { HeroProductEntityInterface } from '../interface/interface';
import { HeroProductTable } from './heroProductsTable';

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
  const { errors, touched } = useFormikContext<common_HeroFullInsert>();
  const errorEntities = (errors?.entities || []) as any[];
  const touchedEntities = (touched?.entities || []) as any[];
  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          {title}
        </Typography>
      </Grid>
      {prefix?.includes('featuredProductsTag') && (
        <Grid size={{ xs: 12 }}>
          <Field
            as={TextField}
            name={`entities.${index}.${prefix}.tag`}
            label='tag'
            error={
              Boolean(errorEntities[index]?.featuredProductsTag?.tag) &&
              Boolean(touchedEntities[index]?.featuredProductsTag?.tag)
            }
            helperText={
              errorEntities[index]?.featuredProductsTag?.tag &&
              touchedEntities[index]?.featuredProductsTag?.tag
                ? errorEntities[index].featuredProductsTag.tag
                : ''
            }
            fullWidth
          />
        </Grid>
      )}
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.${prefix}.headline`}
          label='headline'
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.${prefix}.exploreLink`}
          label='explore link'
          error={
            (entity?.[prefix!]?.exploreLink &&
              !isValidUrlForHero(entity?.[prefix!]?.exploreLink)) ||
            (entity?.[prefix!]?.exploreLink && !isValidURL(entity?.[prefix!]?.exploreLink))
          }
          helperText={
            entity?.[prefix!]?.exploreLink && !isValidURL(entity?.[prefix!]?.exploreLink)
              ? 'Invalid URL format'
              : entity?.[prefix!]?.exploreLink && !isValidUrlForHero(entity?.[prefix!]?.exploreLink)
                ? 'URL is not from the allowed domain but will be saved with a warning'
                : ''
          }
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          as={TextField}
          name={`entities.${index}.${prefix}.exploreText`}
          label='explore text'
          fullWidth
        />
      </Grid>
      <Grid size={{ xs: 12 }}>
        <Field
          component={HeroProductTable}
          products={product[index] || []}
          id={index}
          isFeaturedProducts={prefix === 'featuredProducts'}
          onReorder={(e: any) => handleProductsReorder?.(e, index)}
        />
      </Grid>
      {showProductPicker && (
        <>
          <ErrorMessage name={`entities.${index}.${prefix}.productIds`} component='div' />
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
