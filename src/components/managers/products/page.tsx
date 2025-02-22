import { ROUTES } from 'constants/routes';
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Layout } from 'ui/layout';
import { AllProducts } from './listProducts/allProducts';

export const Product: FC = () => {
  const navigate = useNavigate();

  const navigateAddProduct = () => {
    navigate(ROUTES.addProduct);
  };

  return (
    <Layout>
      <div className='fixed bottom-2 right-2'>
        <Button onClick={navigateAddProduct} size='lg'>
          add
        </Button>
      </div>
      <AllProducts />
    </Layout>
  );
};
