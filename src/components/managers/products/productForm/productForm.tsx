import { Alert, Snackbar } from '@mui/material';
import { MakeGenerics, useMatch } from '@tanstack/react-location';
import { getProductByID, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { useDictionaryStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { GenericProductForm } from '../genericProductComponent/genericProductComponent';
import { productInitialValues } from '../genericProductComponent/utility/productInitialValues';

type ProductFormProps = MakeGenerics<{
  Params: {
    id?: string;
  };
}>;

export const ProductForm: FC = () => {
  const { dictionary } = useDictionaryStore();
  const {
    params: { id },
    pathname,
  } = useMatch<ProductFormProps>();
  const isCopyMode = pathname.includes('/copy');
  const [product, setProduct] = useState<common_ProductFull | undefined>();
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

  const fetchProduct = async () => {
    if (id) {
      const response = await getProductByID({ id: parseInt(id) });
      setProduct(response.product);
      setInitialValues(productInitialValues(response.product));
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id, isCopyMode]);

  const handleFormSubmit = async (
    values: common_ProductNew,
    {
      setSubmitting,
      resetForm,
    }: { setSubmitting: (isSubmitting: boolean) => void; resetForm: () => void },
  ) => {
    try {
      const nonEmptySizeMeasurements = values.sizeMeasurements?.filter(
        (sizeMeasurement) =>
          sizeMeasurement &&
          sizeMeasurement.productSize &&
          sizeMeasurement.productSize.quantity !== null,
      );

      const productToSubmit: UpsertProductRequest = {
        id: isCopyMode ? undefined : id ? parseInt(id) : undefined,
        product: {
          ...values,
          sizeMeasurements: nonEmptySizeMeasurements,
        } as common_ProductNew,
      };

      if (parseFloat(values.product?.productBody?.price?.value || '') <= 0) {
        showMessage('PRICE CANNOT BE ZERO', 'error');
        setSubmitting(false);
        return;
      }

      await upsertProduct(productToSubmit);

      showMessage(id && !isCopyMode ? 'PRODUCT UPDATED' : 'PRODUCT UPLOADED', 'success');
      setSubmitting(false);

      if (!id || (!isCopyMode && !id)) {
        resetForm();
        setInitialValues(productInitialValues());
      }

      if (!isCopyMode) fetchProduct();
    } catch (error) {
      showMessage(
        id && !isCopyMode ? "PRODUCT CAN'T BE UPDATED" : "PRODUCT CAN'T BE UPLOADED",
        'error',
      );
    } finally {
      setSubmitting(false);
      if (id && !isCopyMode) setIsEditMode(false);
    }
  };

  return (
    <Layout>
      <GenericProductForm
        initialProductState={initialValues}
        isEditMode={isEditMode}
        isAddingProduct={isCopyMode || !id}
        isCopyMode={isCopyMode}
        product={product}
        onSubmit={handleFormSubmit}
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
