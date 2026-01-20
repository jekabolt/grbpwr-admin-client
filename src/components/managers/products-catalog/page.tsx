import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Layout } from 'ui/layout';
import Filter from './components/filter';
import { InfinityScroll } from './components/infinity-scroll';
import { getProductPagedParans } from './components/utility';

const ITEMS_PER_PAGE = 16;

export default function ProductsCatalog() {
  const [searchParams] = useSearchParams();
  const params = Object.fromEntries(searchParams.entries());
  const [products, setProducts] = useState<common_Product[]>([]);
  const navigate = useNavigate();

  const debouncedFetch = useCallback(
    debounce(async (params) => {
      const response = await adminService.GetProductsPaged({
        limit: ITEMS_PER_PAGE,
        offset: 0,
        ...getProductPagedParans(params),
      });
      setProducts(response.products || []);
    }, 1000),
    [],
  );

  useEffect(() => {
    debouncedFetch(params);
    return () => debouncedFetch.cancel();
  }, [searchParams, debouncedFetch]);

  const handleCreateNewProduct = () => {
    navigate(`${ROUTES.addProduct}`);
  };

  return (
    <Layout>
      <div className='flex flex-col grid gap-10 pb-20'>
        <Filter />
        <InfinityScroll firstItems={products} />
      </div>
      <Button className='fixed bottom-4 right-4 z-20' size='lg' onClick={handleCreateNewProduct}>
        create new
      </Button>
    </Layout>
  );
}
