import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { Categories } from './components/categories';
import Filter from './components/filter';
import { InfinityScroll } from './components/infinity-scroll';
import { getProductPagedParans } from './components/utility';

const ITEMS_PER_PAGE = 30;

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
    debouncedFetch(fetchParams);
    return () => debouncedFetch.cancel();
  }, [searchParams, debouncedFetch]);

  const handleCreateNewProduct = () => {
    navigate(`${ROUTES.addProduct}`);
  };

  return (
    <>
      <div className='flex flex-col grid gap-10 pb-20'>
        <Categories />
        <Button className='flex w-auto uppercase' onClick={toggleModal}>
          filter +
        </Button>
        <Filter isOpen={isModalOpen} toggleModal={toggleModal} />
        <InfinityScroll firstItems={products} />
      </div>
      <Button className='fixed bottom-4 right-4 z-20' size='lg' onClick={handleCreateNewProduct}>
        create new
      </Button>
    </>
  );
}
