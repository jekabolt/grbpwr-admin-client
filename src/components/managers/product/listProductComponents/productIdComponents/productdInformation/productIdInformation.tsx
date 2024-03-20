import { Grid } from '@mui/material';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { Product } from './product/product';

export const ProductIdInformation: FC<ProductIdProps> = ({
  product,
  setProduct,
  id,
  fetchProduct,
}) => {
  return (
    <Grid container style={{ border: '1px solid black' }}>
      <Grid item>
        <Product product={product} setProduct={setProduct} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
