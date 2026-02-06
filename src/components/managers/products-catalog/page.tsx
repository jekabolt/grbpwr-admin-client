import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { DEFAULT_PRODUCT_LIMIT } from 'constants/filter';
import { ROUTES } from 'constants/routes';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Categories } from './components/categories';
import Filter from './components/filter';
import { InfinityScroll } from './components/infinity-scroll';
import { getProductPagedParans } from './components/utility';

export default function ProductsCatalog() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<common_Product[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  function toggleModal() {
    setIsModalOpen(!isModalOpen);
  }

  const params = Object.fromEntries(searchParams.entries());
  const navigate = useNavigate();

  const fetchParams: Record<string, string> = {
    ...params,
    sizes: params.sizes ?? params.size,
    hidden: params.hidden ?? 'true',
  };

  const debouncedFetch = useCallback(
    debounce(async (params: Record<string, string>) => {
      const limit = params.limit
        ? Math.max(1, parseInt(params.limit, 10) || DEFAULT_PRODUCT_LIMIT)
        : DEFAULT_PRODUCT_LIMIT;
      const response = await adminService.GetProductsPaged({
        limit,
        offset: 0,
        ...getProductPagedParans(params),
      });
      setProducts(response.products || []);
    }, 1000),
    [],
  );

  const searchString = searchParams.toString();

  useEffect(() => {
    debouncedFetch(fetchParams);
    return () => debouncedFetch.cancel();
  }, [searchString, debouncedFetch]);

  const handleCreateNewProduct = () => {
    navigate(`${ROUTES.addProduct}`);
  };

  return (
    <>
      <div className='flex flex-col grid gap-10 pb-20'>
        <div className='flex items-end justify-between'>
          <Categories />
          <Button className='uppercase' onClick={toggleModal}>
            filter +
          </Button>
        </div>
        <Filter isOpen={isModalOpen} toggleModal={toggleModal} />
        <InfinityScroll firstItems={products} />
      </div>
      <Button
        variant='main'
        className='fixed bottom-4 right-4 z-20'
        size='lg'
        onClick={handleCreateNewProduct}
      >
        create new
      </Button>
    </>
  );
}
