import { Grid } from '@mui/material';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { Product } from './product/product';
import { Tag } from './tag/tag';

export const ProductIdInformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  return (
    <Grid container spacing={2}>
      <Grid item xs={10}>
        <Product product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
      <Grid item xs={10}>
        <Tag product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
