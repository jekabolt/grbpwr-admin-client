import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { DEFAULT_PRODUCT_LIMIT } from 'constants/filter';
import { ROUTES, SECTION } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import debounce from 'lodash/debounce';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { ActiveFilters } from './components/active-filters';
import { Categories } from './components/categories';
import Filter from './components/filter';
import { InfinityScroll } from './components/infinity-scroll';
import { MobileFiltration } from './components/mobile-filtration';
import { getProductPagedParans } from './components/utility';

export default function ProductsCatalog() {
  const [searchParams] = useSearchParams();
  const [products, setProducts] = useState<common_Colorway[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [count, setCount] = useState({ loaded: 0, hasMore: false });
  const { dictionary } = useDictionary();
  const baseCurrency = dictionary?.baseCurrency || 'USD';
  const { canWrite } = usePermissions();

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
      try {
        const response = await adminService.GetColorwaysPaged({
          limit,
          offset: 0,
          ...getProductPagedParans({ ...params, currency: baseCurrency }),
        });
        setProducts(response.colorways || []);
      } finally {
        setIsFetching(false);
      }
    }, 1000),
    [],
  );

  const searchString = searchParams.toString();

  useEffect(() => {
    setIsFetching(true);
    debouncedFetch(fetchParams);
    return () => debouncedFetch.cancel();
  }, [searchString, debouncedFetch]);

  const handleCreateNewProduct = () => {
    navigate(`${ROUTES.addProduct}`);
  };

  const handleCountChange = useCallback((loaded: number, hasMore: boolean) => {
    setCount({ loaded, hasMore });
  }, []);

  return (
    <div className='flex flex-col gap-6 pb-20'>
      <div className='-mx-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-textInactiveColor bg-bgColor px-2.5 py-3'>
        <div className='flex items-baseline gap-2'>
          <Text variant='uppercase' size='large'>
            products
          </Text>
          {!isFetching && count.loaded > 0 && (
            <Text variant='inactive'>
              {count.loaded}
              {count.hasMore ? '+' : ''}
            </Text>
          )}
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='secondary'
            size='lg'
            className='uppercase hidden lg:inline-block'
            onClick={toggleModal}
          >
            filter +
          </Button>
          {canWrite(SECTION.products) && (
            <Button variant='main' size='lg' className='uppercase' onClick={handleCreateNewProduct}>
              create new
            </Button>
          )}
        </div>
      </div>

      <div className='hidden lg:block'>
        <Categories />
      </div>
      <div className='block lg:hidden'>
        <MobileFiltration />
      </div>

      <ActiveFilters />

      <Filter isOpen={isModalOpen} toggleModal={toggleModal} />
      <InfinityScroll
        firstItems={products}
        initialLoading={isFetching}
        onCountChange={handleCountChange}
      />
    </div>
  );
}
