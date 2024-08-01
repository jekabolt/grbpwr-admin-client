import { Alert, Snackbar } from '@mui/material';
import { getDictionary, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_Dictionary, common_ProductNew } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { FC, useEffect, useState } from 'react';
import { GenericProductForm } from '../genericProductComponent/genericProductComponent';
import { initialProductState } from '../genericProductComponent/utility/productInitialValues';

export const AddProducts: FC = () => {
  const [dictionary, setDictionary] = useState<common_Dictionary | undefined>();
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

  const handleSubmit = async (
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
        id: undefined,
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

      showMessage('PRODUCT UPLOADED', 'success');
      resetForm();
    } catch (error) {
      showMessage("PRODUCT CAN'T BE UPLOADED", 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <GenericProductForm
        initialProductState={initialProductState}
        dictionary={dictionary}
        isEditMode={false}
        isAddingProduct={true}
        onSubmit={handleSubmit}
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
