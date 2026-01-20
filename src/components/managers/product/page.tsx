import { adminService } from 'api/api';
import { common_ProductFull } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { Layout } from 'ui/layout';
import { ProductForm } from './components';

export const Product: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { id } = useParams();
  const { pathname } = useLocation();
  const isCopyMode = pathname.includes('/copy');
  const [product, setProduct] = useState<common_ProductFull | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const fetchProduct = async () => {
    if (id) {
      const productId = parseInt(id, 10);
      if (isNaN(productId)) {
        showMessage('Invalid product ID', 'error');
        return;
      }
      const response = await adminService.GetProductByID({ id: productId });
      setProduct(response.product);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id, isCopyMode]);

  return (
    <Layout>
      <ProductForm
        key={product?.product?.id || `new-${id}`}
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
