import { useSearchParams } from 'react-router-dom';

import { GetProductsPagedRequest } from 'api/proto-http/admin';
import { useProductStore } from 'lib/stores/product/store';
import debounce from 'lodash/debounce';
import { FC, useCallback, useEffect } from 'react';
import { Filter } from './filterProducts/filterProducts';
import { ListProducts } from './listProducts';

export const AllProducts: FC = () => {
  const { products, isLoading, hasMore, filter, fetchProducts, updateFilter } = useProductStore();
  const [searchParams] = useSearchParams();

  const debouncedFetchProducts = useCallback(
    debounce((values: GetProductsPagedRequest) => {
      fetchProducts(50, 0, values);
    }, 500),
    [fetchProducts],
  );

  useEffect(() => {
    if (searchParams.get('filter')) {
      try {
        const filterFromUrl =
          typeof searchParams.get('filter') === 'string'
            ? JSON.parse(searchParams.get('filter')!)
            : searchParams.get('filter');
        updateFilter(filterFromUrl);
        fetchProducts(50, 0, filterFromUrl);
      } catch (error) {
        console.error('Failed to parse filter from URL:', error);
      }
    } else {
      debouncedFetchProducts(filter);
    }
  }, [searchParams.get('filter')]);

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchProducts(50, products.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, products.length, fetchProducts]);

  const handleFilterChange = (values: GetProductsPagedRequest) => {
    updateFilter(values);
    debouncedFetchProducts(values);
  };

  return (
    <div className='w-full flex flex-col gap-10'>
      <Filter onFilterChange={handleFilterChange} />

      <ListProducts
      // productClick={handleProductClick}
      // copy={handleCopyProductClick}
      // showHidden={filter.showHidden}
      />
    </div>
  );
};
