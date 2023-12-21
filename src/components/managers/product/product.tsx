import { FC } from 'react';
import { useNavigate } from '@tanstack/react-location';
import { ROUTES } from 'constants/routes';
import { Layout } from 'components/layout/layout';
import styles from 'styles/product.scss';

export const Product: FC = () => {
  const navigate = useNavigate();

  const navigateAddProduct = () => {
    navigate({ to: ROUTES.addProduct, replace: true });
  };

  const navigatePagedProduct = () => {
    console.log('Navigate to LIST PRODUCTS');
    navigate({ to: ROUTES.pagedProduct, replace: true });
  };
  return (
    <Layout>
      <div className={styles.product_operation_wrapper}>
        <button onClick={navigatePagedProduct}>LIST PRODUCTS</button>
        <button onClick={navigateAddProduct}>ADD PRODUCT</button>
      </div>
    </Layout>
  );
};
