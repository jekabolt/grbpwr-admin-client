import { adminService } from 'api/api';
import { common_ColorwayFull, ColorwayCostInfo } from 'api/proto-http/admin';
import { useSnackBarStore } from 'lib/stores/store';
import { FC, useEffect, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { ProductForm } from './components';

export const Product: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { id } = useParams();
  const { pathname } = useLocation();
  const isCopyMode = pathname.includes('/copy');
  const [product, setProduct] = useState<common_ColorwayFull | undefined>();
  // cost_info is null when the caller lacks costing:read — the block stays hidden.
  const [costInfo, setCostInfo] = useState<ColorwayCostInfo | undefined>();
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const fetchProduct = async () => {
    if (id) {
      const productId = parseInt(id, 10);
      if (isNaN(productId)) {
        showMessage('Invalid product ID', 'error');
        return;
      }
      const response = await adminService.GetColorwayByID({ id: productId });
      setProduct(response.product);
      setCostInfo(response.costInfo);
    }
  };

  useEffect(() => {
    fetchProduct();
  }, [id, isCopyMode]);

  return (
    <ProductForm
      key={product?.colorway?.id || `new-${id}`}
      isEditMode={isEditMode}
      isAddingProduct={isCopyMode || !id}
      isCopyMode={isCopyMode}
      product={product}
      costInfo={costInfo}
      productId={id}
      onEditModeChange={setIsEditMode}
      onStockUpdated={fetchProduct}
    />
  );
};
