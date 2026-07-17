import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { useCallback, useEffect, useState } from 'react';

const LIMIT = 50;

export function useCustomOrder() {
  const [products, setProducts] = useState<common_Colorway[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<common_Colorway[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const offset = (currentPage - 1) * LIMIT;

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const response = await adminService.GetColorwaysPaged({
          limit: LIMIT,
          offset,
          sortFactors: ['SORT_FACTOR_CREATED_AT'],
          orderFactor: 'ORDER_FACTOR_DESC',
          filterConditions: undefined,
          statuses: undefined,
        });
        if (Array.isArray(response.colorways)) {
          const newProducts = response.colorways || [];
          if (newProducts.length < LIMIT) {
            setHasMore(false);
          }
          setProducts((prevProducts) => {
            const combinedProducts = [...prevProducts, ...newProducts];
            const uniqueProducts = combinedProducts.reduce<common_Colorway[]>((acc, current) => {
              if (!acc.find((product) => product.id === current.id)) {
                acc.push(current);
              }
              return acc;
            }, []);
            return uniqueProducts;
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProducts();
  }, [currentPage, offset]);

  const loadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      setCurrentPage((prev) => prev + 1);
    }
  }, [isLoading, hasMore]);

  const clearSelection = useCallback(() => {
    setSelectedProducts([]);
  }, []);

  const handleSaveProducts = useCallback((products: common_Colorway[]) => {
    setSelectedProducts(products);
  }, []);

  return {
    products,
    selectedProducts,
    hasMore,
    handleSaveProducts,
    loadMore,
    clearSelection,
  };
}
