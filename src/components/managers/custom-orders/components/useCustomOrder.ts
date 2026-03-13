import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { useCallback, useEffect, useState } from 'react';

const LIMIT = 50;

export function useCustomOrder() {
  const [products, setProducts] = useState<common_Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedProducts, setSelectedProducts] = useState<common_Product[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const offset = (currentPage - 1) * LIMIT;

  useEffect(() => {
    const fetchProducts = async () => {
      setIsLoading(true);
      try {
        const response = await adminService.GetProductsPaged({
          limit: LIMIT,
          offset,
          sortFactors: ['SORT_FACTOR_CREATED_AT'],
          orderFactor: 'ORDER_FACTOR_DESC',
          filterConditions: undefined,
          showHidden: true,
        });
        if (Array.isArray(response.products)) {
          const newProducts = response.products || [];
          if (newProducts.length < LIMIT) {
            setHasMore(false);
          }
          setProducts((prevProducts) => {
            const combinedProducts = [...prevProducts, ...newProducts];
            const uniqueProducts = combinedProducts.reduce<common_Product[]>((acc, current) => {
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

  const handleSelectProduct = (product: common_Product) => {
    const isSelected = selectedProducts.some((p) => p.id === product.id);
    if (isSelected) {
      setSelectedProducts((prev) => prev.filter((p) => p.id !== product.id));
    } else {
      setSelectedProducts((prev) => [...prev, product]);
    }
  };

  return {
    products,
    selectedProducts,
    handleSelectProduct,
    loadMore,
    hasMore,
    clearSelection,
  };
}
