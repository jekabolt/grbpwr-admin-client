import { common_Product } from 'api/proto-http/admin';
import { useEffect, useState } from 'react';

export interface ProductSelectionApi {
  /** Resolved product objects keyed by entity _uid (display cache; source of truth is form productIds). */
  products: Record<string, common_Product[]>;
  currentUid: string | null;
  isOpen: boolean;
  openSelection: (uid: string) => void;
  closeSelection: () => void;
  saveSelection: (newProducts: common_Product[], uid: string) => void;
  reorderProducts: (newOrder: common_Product[], uid: string) => void;
}

export function useProductSelection(
  initialProducts?: Record<string, common_Product[]>,
): ProductSelectionApi {
  const [products, setProducts] = useState<Record<string, common_Product[]>>(initialProducts || {});
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (initialProducts) {
      setProducts(initialProducts);
    }
  }, [initialProducts]);

  const openSelection = (uid: string) => {
    setCurrentUid(uid);
    setIsOpen(true);
  };

  const closeSelection = () => {
    setIsOpen(false);
  };

  const saveSelection = (newProducts: common_Product[], uid: string) => {
    setProducts((prev) => ({ ...prev, [uid]: newProducts }));
  };

  const reorderProducts = (newOrder: common_Product[], uid: string) => {
    setProducts((prev) => ({ ...prev, [uid]: newOrder }));
  };

  return {
    products,
    currentUid,
    isOpen,
    openSelection,
    closeSelection,
    saveSelection,
    reorderProducts,
  };
}
