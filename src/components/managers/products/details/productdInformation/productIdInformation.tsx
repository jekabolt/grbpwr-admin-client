import { Grid } from '@mui/material';
import { FC } from 'react';
import { BasicProductIformation } from '../basicProductInormation/basicProductInformation';
import { ProductTags } from '../productTags/productTags';
import { ProductIdProps } from '../utility/interfaces';

export const ProductIdInformation: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  return (
    <Grid container spacing={2}>
      <Grid item xs={10}>
        <BasicProductIformation product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
      <Grid item xs={10}>
        <ProductTags product={product} id={id} fetchProduct={fetchProduct} />
      </Grid>
    </Grid>
  );
};
