import { getProductByID } from 'api/admin';
import { common_ProductFull, common_ProductNew } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Layout } from 'ui/layout';
import { ProductForm } from './components';

const validatePrice = (values: common_ProductNew): boolean => {
  const price = parseFloat(values.product?.productBodyInsert?.price?.value || '');
  return price > 0;
};

export const Product: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { id } = useParams();
  const { pathname } = useLocation();
  const isCopyMode = pathname.includes('/copy');
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const fetchProduct = async () => {
    if (id) {
      const response = await getProductByID({ id: parseInt(id) });
      setProduct(response.product);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id, isCopyMode]);

  // const handleFormSubmit = async (values: common_ProductNew) => {
  //   try {
  //     if (!validatePrice(values)) {
  //       showMessage('price cannot be zero', 'error');
  //       return;
  //     }

  //     const payload = createProductPayload(values, id, isCopyMode);
  //     await upsertProduct(payload);

  //     showMessage(id && !isCopyMode ? 'product updated' : 'product uploaded', 'success');

  //     if (!isCopyMode) {
  //       fetchProduct();
  //     }
  //   } catch (error) {
  //     showMessage(
  //       id && !isCopyMode ? "product can't be updated" : "product can't be uploaded",
  //       'error',
  //     );
  //   } finally {
  //     if (id && !isCopyMode) {
  //       setIsEditMode(false);
  //     }
  //   }
  // };

  return (
    <Layout>
      <ProductForm
        isEditMode={isEditMode}
        isAddingProduct={isCopyMode || !id}
        isCopyMode={isCopyMode}
        product={product}
        productId={id}
        onEditModeChange={setIsEditMode}
      />
    </Layout>
  );
};
