import { getProductByID, upsertProduct } from 'api/admin';
import { UpsertProductRequest, common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { productInitialValues } from 'constants/product/initial-values';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Layout } from 'ui/layout';
import { GenericProductForm } from './components/genericProductComponent';

const validatePrice = (values: common_ProductNew): boolean => {
  const price = parseFloat(values.product?.productBody?.price?.value || '');
  return price > 0;
};

const getNonEmptySizeMeasurements = (values: common_ProductNew) => {
  return values.sizeMeasurements?.filter(
    (sizeMeasurement) =>
      sizeMeasurement &&
      sizeMeasurement.productSize &&
      sizeMeasurement.productSize.quantity !== null,
  );
};

const createProductPayload = (
  values: common_ProductNew,
  id: string | undefined,
  isCopyMode: boolean,
): UpsertProductRequest => ({
  id: isCopyMode ? undefined : id ? parseInt(id) : undefined,
  product: {
    ...values,
    sizeMeasurements: getNonEmptySizeMeasurements(values),
  } as common_ProductNew,
});

const handleFormReset = (
  id: string | undefined,
  isCopyMode: boolean,
  resetForm: () => void,
  setInitialValues: (values: common_ProductNew) => void,
) => {
  if (!id || (!isCopyMode && !id)) {
    resetForm();
    setInitialValues(productInitialValues());
  }
};

export const Product: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { id } = useParams();
  const { pathname } = useLocation();
  const isCopyMode = pathname.includes('/copy');
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [initialValues, setInitialValues] = useState<common_ProductNew>(productInitialValues());

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
      if (!validatePrice(values)) {
        showMessage('price cannot be zero', 'error');
        return;
      }

      const payload = createProductPayload(values, id, isCopyMode);
      await upsertProduct(payload);

      showMessage(id && !isCopyMode ? 'product updated' : 'product uploaded', 'success');
      handleFormReset(id, isCopyMode, resetForm, setInitialValues);

      if (!isCopyMode) {
        fetchProduct();
      }
    } catch (error) {
      showMessage(
        id && !isCopyMode ? "product can't be updated" : "product can't be uploaded",
        'error',
      );
    } finally {
      setSubmitting(false);
      if (id && !isCopyMode) {
        setIsEditMode(false);
      }
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
    </Layout>
  );
};
