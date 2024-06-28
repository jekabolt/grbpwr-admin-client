import { Alert, Grid, Snackbar, Theme, useMediaQuery } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { BasicProductIformation } from './basicProductInormation/basicProductInformation';
import { MediaView } from './productMedia/mediaView';
import { ProductSizesAndMeasurements } from './productSizesAndMeasurements/productSizesAndMeasurements';
import { ProductTags } from './productTags/productTags';

export type ProductIdProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const ProductDetails: FC = () => {
  const {
    params: { id },
  } = useMatch<ProductIdProps>();

  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(!isSnackBarOpen);
  };

  const fetchProduct = async () => {
    try {
      const response = await getProductByID({
        id: parseInt(id),
      });
      setProduct(response.product);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  return (
    <Layout>
      <Grid container spacing={2} padding={isMobile ? '5%' : 'x6%'} justifyContent='center'>
        <Grid item xs={12} sm={6}>
          <MediaView
            product={product}
            id={id}
            fetchProduct={fetchProduct}
            showMessage={showMessage}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <Grid container spacing={2} padding='2%'>
            <Grid item xs={12}>
              <BasicProductIformation
                product={product}
                id={id}
                fetchProduct={fetchProduct}
                showMessage={showMessage}
              />
            </Grid>
            <Grid item xs={12}>
              <ProductTags
                product={product}
                id={id}
                fetchProduct={fetchProduct}
                showMessage={showMessage}
              />
            </Grid>
          </Grid>
        </Grid>

        <Grid item xs={12}>
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
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(!isSnackBarOpen)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
