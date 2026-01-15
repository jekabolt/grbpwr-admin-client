import { common_Product } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';

export function useProductSelection(initialProducts?: Record<number, common_Product[]>) {
  const [products, setProducts] = useState<Record<number, common_Product[]>>(
    initialProducts || {},
  );
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts);
    }
  }, [initialProducts]);

  const openSelection = (index: number) => {
    setCurrentIndex(index);
    setIsOpen(true);
  };

  const closeSelection = () => {
    setIsOpen(false);
  };

  const saveSelection = (newProducts: common_Product[], index: number) => {
    setProducts((prev) => ({ ...prev, [index]: newProducts }));
  };

  const reorderProducts = (newOrder: common_Product[], index: number) => {
    setProducts((prev) => ({ ...prev, [index]: newOrder }));
  };

  return {
    products,
    currentIndex,
    isOpen,
    openSelection,
    closeSelection,
    saveSelection,
    reorderProducts,
  };
}
