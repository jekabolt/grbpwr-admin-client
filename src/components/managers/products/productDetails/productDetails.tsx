import { Alert, Snackbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getDictionary, getProductByID, upsertProduct } from 'api/admin';
import {
  UpsertProductRequest,
  common_Dictionary,
  common_ProductFull,
  common_ProductNew,
} from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { GenericProductForm } from '../genericProductComponent/genericProductComponent';
import { productInitialValues } from '../genericProductComponent/utility/productInitialValues';

type ProductIdProps = MakeGenerics<{
  Params: {
    id: string;
  };
}>;

export const ProductDetails: FC = () => {
  const {
    params: { id },
  } = useMatch<ProductIdProps>();

  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [initialValues, setInitialValues] = useState<common_ProductNew>(productInitialValues());
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [isSnackBarOpen, setIsSnackBarOpen] = useState<boolean>(false);
  const [snackBarSeverity, setSnackBarSeverity] = useState<'success' | 'error'>('success');

  const showMessage = (message: string, severity: 'success' | 'error') => {
    setSnackBarMessage(message);
    setSnackBarSeverity(severity);
    setIsSnackBarOpen(true);
  };

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setDictionary(response.dictionary);
    };
    fetchDictionary();
  }, []);

  const fetchProduct = async () => {
    const response = await getProductByID({ id: parseInt(id) });
    setProduct(response.product);
    setInitialValues(productInitialValues(response.product));
  };

  useEffect(() => {
    fetchProduct();
  }, [id]);

  const handleFormSubmit = async (
    values: common_ProductNew,
    { setSubmitting }: { setSubmitting: (isSubmitting: boolean) => void; resetForm: () => void },
  ) => {
    const updatePayload: UpsertProductRequest = {
      id: parseInt(id),
      product: values,
    };

    try {
      await upsertProduct(updatePayload);
      showMessage('PRODUCT UPDATED', 'success');
      fetchProduct();
    } catch (error) {
      showMessage("PRODUCT CAN'T BE UPDATED", 'error');
    } finally {
      setSubmitting(false);
      setIsEditMode(false);
    }
  };

  return (
    <Layout>
      <GenericProductForm
        initialProductState={initialValues}
        isEditMode={isEditMode}
        product={product}
        onSubmit={handleFormSubmit}
        dictionary={dictionary}
        onEditModeChange={setIsEditMode}
      />
      <Snackbar
        open={isSnackBarOpen}
        autoHideDuration={6000}
        onClose={() => setIsSnackBarOpen(false)}
      >
        <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
      </Snackbar>
    </Layout>
  );
};
