import { Alert, Grid, Snackbar } from '@mui/material';
import { useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';

import { MakeGenerics } from '@tanstack/react-location';
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
  useEffect(() => {
    fetchProduct();
  }, [id]);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);

  const showMessage = (message: string) => {
    setSnackBarMessage(message);
    setIsSnackBarOpen(!isSnackBarOpen);
  };

  const fetchProduct = async () => {
    const response = await getProductByID({
      id: Number(id),
    });
    setProduct(response.product);
  };

  return (
    <Layout>
      <Grid container spacing={2} marginTop={4} justifyContent='center'>
        <Grid item xs={9}>
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <MediaView
                product={product}
                id={id}
                fetchProduct={fetchProduct}
                showMessage={showMessage}
              />
            </Grid>
            <Grid item xs={6}>
              <Grid container spacing={2}>
                <Grid item xs={7}>
                  <BasicProductIformation
                    product={product}
                    id={id}
                    fetchProduct={fetchProduct}
                    showMessage={showMessage}
                  />
                </Grid>
                <Grid item>
                  <ProductTags
                    product={product}
                    id={id}
                    fetchProduct={fetchProduct}
                    showMessage={showMessage}
                  />
                </Grid>
              </Grid>
            </Grid>
          </Grid>
        </Grid>
        <Grid item xs={9.5}>
          <ProductSizesAndMeasurements
            product={product}
            fetchProduct={fetchProduct}
            id={id}
            showMessage={showMessage}
          />
        </Grid>
      </Grid>
      <Snackbar
        open={isSnackBarOpen}
        message={snackBarMessage}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity='success'>Save successful</Alert>
      </Snackbar>
    </Layout>
  );
};
