import { Alert, AppBar, Button, Grid, Snackbar, Toolbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID } from 'api/admin';
import { common_ProductFull, common_ProductInsert } from 'api/proto-http/admin';
import { updateProductById } from 'api/updateProductsById';
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
  const [isEdit, setIsEdit] = useState<boolean>(false);
  const [currentPayload, setCurrentPayload] = useState<Partial<common_ProductInsert>>({});

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

  const updateProduct = async (updatePayload: Partial<common_ProductInsert>) => {
    if (
      Object.entries(updatePayload).some(([key, value]) => {
        return key !== 'hidden' && key !== 'preorder' && !value;
      })
    ) {
      showMessage('PLEASE FILL OUT ALL REQUIRED FIELDS', 'error');
      return;
    }
    try {
      const updatedDetails = {
        ...product?.product?.productInsert,
        ...updatePayload,
      };
      if (updatedDetails.preorder !== '' && updatedDetails.salePercentage?.value) {
        updatedDetails.salePercentage.value = '0';
      }
      await updateProductById({
        id: Number(id),
        product: updatedDetails as common_ProductInsert,
      });
      showMessage('PRODUCT HAS BEEN UPLOADED', 'success');
      setProduct((prev) =>
        prev
          ? ({
              ...prev,
              product: { ...prev.product, productInsert: updatedDetails },
            } as common_ProductFull)
          : prev,
      );
    } catch (error) {
      const message = sessionStorage.getItem('errorcode');
      message ? showMessage(message, 'error') : showMessage('PRODUCT CANNOT BE UPDATED', 'error');
    }
  };

  const enableEditMode = () => {
    setIsEdit(!isEdit);
  };

  const saveAndToggleEditMode = () => {
    if (isEdit) {
      updateProduct(currentPayload);
    }
    enableEditMode();
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  return (
    <Layout>
      <AppBar
        position='fixed'
        sx={{ top: 'auto', bottom: 0, backgroundColor: 'transparent', boxShadow: 'none' }}
      >
        <Toolbar sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size='small' onClick={saveAndToggleEditMode} variant='contained'>
            {isEdit ? 'Save' : 'Edit'}
          </Button>
        </Toolbar>
      </AppBar>
      <Grid container spacing={2} padding='2%' justifyContent='center'>
        <Grid item xs={12} sm={6}>
          <MediaView
            product={product}
            id={id}
            fetchProduct={fetchProduct}
            showMessage={showMessage}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <BasicProductIformation
                product={product}
                onPayloadChange={setCurrentPayload}
                isEdit={isEdit}
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
