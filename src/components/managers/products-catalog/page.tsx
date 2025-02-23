import { getProductsPaged } from 'api/admin';
import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Layout } from 'ui/layout';
import { InfinityScroll } from './components/infinity-scroll';
import { getProductPagedParans } from './components/utility';

const ITEMS_PER_PAGE = 16;

export default function ProductsCatalog() {
  const [searchParams] = useSearchParams();
  const params = Object.fromEntries(searchParams.entries());
  const [products, setProducts] = useState<common_Product[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchProducts = async () => {
      const response = await getProductsPaged({
        limit: ITEMS_PER_PAGE,
        offset: 0,
        ...getProductPagedParans(params),
      });
      setProducts(response.products || []);
    };

    fetchProducts();
  }, [searchParams]);

  const handleCreateNewProduct = () => {
    navigate(`${ROUTES.addProduct}`);
  };

  return (
    <Layout>
      <InfinityScroll firstItems={products} />
      <Button className='fixed bottom-4 right-4 z-20' size='lg' onClick={handleCreateNewProduct}>
        create new
      </Button>
    </Layout>
  );
}
