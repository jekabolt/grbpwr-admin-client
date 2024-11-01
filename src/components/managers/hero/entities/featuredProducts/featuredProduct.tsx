import { Box, Button, Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { ProductPickerModal } from 'components/common/productPickerModal';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { ErrorMessage, Field, useFormikContext } from 'formik';
import { FC } from 'react';
import styles from 'styles/hero.scss';
import { HeroProductEntityInterface } from '../interface/interface';
import { HeroProductTable } from './heroProductsTable';

export const FeaturedProduct: FC<HeroProductEntityInterface> = ({
  index,
  entity,
  product,
  isModalOpen,
  currentEntityIndex,
  handleProductsReorder,
  handleOpenProductSelection,
  handleCloseModal,
  handleSaveNewSelection,
}) => {
  const { errors } = useFormikContext<common_HeroFullInsert>();
  const errorEntities = (errors?.entities || []) as any[];
  return (
    <>
      <Grid item xs={12} md={10}>
        <Typography variant='h4' textTransform='uppercase'>
          featured products
        </Typography>
      </Grid>
      <Grid item xs={12} md={10}>
        <Box component='div' className={styles.fields}>
          <Field
            as={TextField}
            name={`entities.${index}.featuredProducts.title`}
            label='TITLE'
            fullWidth
          />
          <Field
            as={TextField}
            name={`entities.${index}.featuredProducts.exploreLink`}
            label='EXPLORE LINK'
            error={
              Boolean(errorEntities?.[index]?.featuredProducts?.exploreLink) ||
              (entity?.featuredProducts.exploreLink &&
                !isValidUrlForHero(entity.featuredProducts.exploreLink))
            }
            helperText={
              errorEntities?.[index]?.featuredProducts?.exploreLink
                ? errorEntities[index].featuredProducts.exploreLink
                : entity?.featuredProducts.exploreLink &&
                    !isValidUrlForHero(entity.featuredProducts.exploreLink)
                  ? 'URL is not from the allowed domain but will be saved with a warning'
                  : ''
            }
            fullWidth
          />
          <Field
            as={TextField}
            name={`entities.${index}.featuredProducts.exploreText`}
            label='EXPLORE TEXT'
            fullWidth
          />
        </Box>
        <Field
          component={HeroProductTable}
          products={product[index] || []}
          id={index}
          onReorder={(newProductsOrder: any) => handleProductsReorder(newProductsOrder, index)}
        />
        {`${errors}.entities.${index}.featuredProducts.productIds` && (
          <ErrorMessage
            className={styles.error}
            name={`entities.${index}.featuredProducts.productIds`}
            component='div'
          />
        )}
        <Button
          variant='contained'
          onClick={() => handleOpenProductSelection(index)}
          sx={{ textTransform: 'uppercase' }}
        >
          add products
        </Button>
      </Grid>
      <ProductPickerModal
        open={isModalOpen && currentEntityIndex === index}
        onClose={handleCloseModal}
        onSave={(selectedProduct) => handleSaveNewSelection(selectedProduct, index)}
        selectedProductIds={(product[index] || []).map((x) => x.id!)}
      />
    </>
  );
};
