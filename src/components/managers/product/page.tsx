import { adminService } from 'api/api';
import { common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { productInitialValues } from 'constants/product/initial-values';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ProductForm } from './components/product-form';
import { createProductPayload, handleFormReset } from './utility/form';

const validatePrice = (values: common_ProductNew): boolean => {
  const price = parseFloat(values.product?.productBody?.price?.value || '');
  return price > 0;
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
      const response = await adminService.GetProductByID({ id: parseInt(id) });
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
      await adminService.UpsertProduct(payload);

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
    <>
      <ProductForm
        initialProductState={initialValues}
        isEditMode={isEditMode}
        isAddingProduct={isCopyMode || !id}
        isCopyMode={isCopyMode}
        product={product}
        onSubmit={handleFormSubmit}
        onEditModeChange={setIsEditMode}
      />
    </>
  );
};
