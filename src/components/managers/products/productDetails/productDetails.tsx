import { Grid } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';

import { MakeGenerics, useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { BasicProductIformation } from './basicProductInormation/basicProductInformation';
import { ProductTags } from './productTags/productTags';

export type ProductIdProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const ProductDetails: FC = () => {
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const {
    params: { id: id },
  } = useMatch<ProductIdProps>();
  const navigate = useNavigate();

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const fetchProduct = async () => {
    try {
      const response = await getProductByID({
        id: Number(id),
      });
      setProduct(response.product);
    } catch (error) {
      if (error instanceof Error) {
        if (error) {
          sessionStorage.setItem('errorCode', error.message);
        }
        navigate({
          to: ROUTES.error,
          replace: true,
        });
      }
    }
  };

  return (
    <Layout>
      <Grid container spacing={2} marginTop={4} justifyContent='center'>
        <Grid item xs={9}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <MediaView product={product} id={id} fetchProduct={fetchProduct} />
            </Grid>
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={7}>
                  <BasicProductIformation product={product} id={id} fetchProduct={fetchProduct} />
                </Grid>
                <Grid item>
                  <ProductTags product={product} id={id} fetchProduct={fetchProduct} />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={9.5}>
          <ProductSizesAndMeasurements product={product} fetchProduct={fetchProduct} id={id} />
        </Grid>
      </Grid>
    </Layout>
  );
};
