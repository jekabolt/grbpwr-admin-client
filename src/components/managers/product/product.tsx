import { useNavigate } from '@tanstack/react-location';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import styles from 'styles/product.scss';

export const Product: FC = () => {
  const navigate = useNavigate();

  const navigateAddProduct = () => {
    navigate({ to: ROUTES.addProduct, replace: true });
  };

  const navigatePagedProduct = () => {
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
