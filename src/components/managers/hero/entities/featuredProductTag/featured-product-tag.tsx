import { Box, Grid2 as Grid, TextField, Typography } from '@mui/material';
import { common_HeroFullInsert } from 'api/proto-http/admin';
import { isValidUrlForHero } from 'features/utilitty/isValidUrl';
import { Field, useFormikContext } from 'formik';
import { FC } from 'react';
import { HeroProductTable } from '../featuredProducts/heroProductsTable';
import { HeroProductTagEntityInterface } from '../interface/interface';

export const FeaturedProductTag: FC<HeroProductTagEntityInterface> = ({
  index,
  entity,
  productTags,
}) => {
  const { errors, touched } = useFormikContext<common_HeroFullInsert>();
  const errorEntities = (errors?.entities || []) as any[];
  const touchedEntities = (touched?.entities || []) as any[];
  return (
    <>
      <Grid size={{ xs: 12 }}>
        <Typography variant='h4' textTransform='uppercase'>
          featured products tag
        </Typography>
        <Grid size={{ xs: 12 }}>
          <Box component='div' display='grid' gap={2}>
            <Field
              name={`entities.${index}.featuredProductsTag.tag`}
              as={TextField}
              label='Tag'
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
            <Field
              name={`entities.${index}.featuredProductsTag.title`}
              as={TextField}
              label='Title'
              fullWidth
            />
            <Field
              name={`entities.${index}.featuredProductsTag.exploreLink`}
              as={TextField}
              label='Explore Link'
              error={
                (Boolean(errorEntities[index]?.featuredProductsTag?.exploreLink) &&
                  Boolean(touchedEntities[index]?.featuredProductsTag?.exploreLink)) ||
                (entity?.featuredProductsTag?.exploreLink &&
                  !isValidUrlForHero(entity.featuredProductsTag?.exploreLink))
              }
              helperText={
                errorEntities[index]?.featuredProductsTag?.exploreLink &&
                touchedEntities[index]?.featuredProductsTag?.exploreLink
                  ? errorEntities[index].featuredProductsTag.exploreLink
                  : entity?.featuredProductsTag?.exploreLink &&
                      !isValidUrlForHero(entity.featuredProductsTag?.exploreLink)
                    ? 'URL is not from the allowed domain but will be saved with a warning'
                    : ''
              }
              fullWidth
            />
            <Field
              name={`entities.${index}.featuredProductsTag.exploreText`}
              as={TextField}
              label='Explore Text'
              fullWidth
            />
          </Box>
        </Grid>
        {productTags[index] && (
          <Field component={HeroProductTable} products={productTags[index] || []} id={index} />
        )}
      </Grid>
    </>
  );
};
