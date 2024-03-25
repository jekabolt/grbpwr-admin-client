import { Grid } from '@mui/material';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { Product } from './product/product';
import { SizesAndMeasurements } from './sizes&measurements/sizesAndMeasurements';
import { Tag } from './tag/tag';

export const ProductIdInformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  return (
    <Grid container spacing={2}>
      <Grid item xs={8}>
        <Product product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
      <Grid item xs={10}>
        <SizesAndMeasurements product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
      <Grid item xs={8}>
        <Tag product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
