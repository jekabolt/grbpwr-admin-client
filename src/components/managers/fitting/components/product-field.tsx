import { adminService } from 'api/api';
import { common_Product } from 'api/proto-http/admin';
import { ProductPicker } from 'components/managers/custom-orders/components/prodcut-picker';
import { useCallback, useEffect, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { FittingFormData } from './schema';

const LIMIT = 50;

function productName(product?: common_Product): string {
  return (
    product?.productDisplay?.productBody?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`
  );
}

// Single-product selector for the fitting form. Reuses the shared (multi-select)
// ProductPicker but keeps only the last picked product.
export function ProductField() {
  const { control } = useFormContext<FittingFormData>();
  const { field, fieldState } = useController({ control, name: 'productId' });

  const [products, setProducts] = useState<common_Product[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<common_Product | undefined>();

  useEffect(() => {
    let active = true;
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const res = await adminService.GetProductsPaged({
          limit: LIMIT,
          offset: (page - 1) * LIMIT,
          sortFactors: ['SORT_FACTOR_CREATED_AT'],
          orderFactor: 'ORDER_FACTOR_DESC',
          filterConditions: undefined,
          showHidden: true,
        });
        if (!active) return;
        const newProducts = res.products || [];
        if (newProducts.length < LIMIT) setHasMore(false);
        setProducts((prev) => {
          const combined = [...prev, ...newProducts];
          return combined.reduce<common_Product[]>((acc, cur) => {
            if (!acc.find((p) => p.id === cur.id)) acc.push(cur);
            return acc;
          }, []);
        });
      } catch (e) {
        console.error('Failed to load products', e);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProducts();
    return () => {
      active = false;
    };
  }, [page]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) setPage((p) => p + 1);
  }, [loading, hasMore]);

  // Resolve the selected product object for display when only the id is known.
  useEffect(() => {
    const id = field.value;
    if (!id) {
      setSelected(undefined);
      return;
    }
    const found = products.find((p) => p.id === id);
    if (found) {
      setSelected(found);
      return;
    }
    let active = true;
    adminService
      .GetProductByID({ id })
      .then((res) => {
        if (active) setSelected(res.product?.product);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [field.value, products]);

  const handleSave = (picked: common_Product[]) => {
    const chosen = picked[0];
    field.onChange(chosen?.id ?? 0);
    setSelected(chosen);
  };

  return (
    <div className='space-y-2'>
      {selected ? (
        <div className='flex items-center gap-3 border border-textInactiveColor p-2'>
          <div className='w-16 shrink-0'>
            <Media
              src={selected.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt='thumbnail'
              aspectRatio='1/1'
              fit='contain'
            />
          </div>
          <div className='min-w-0'>
            <Text>{productName(selected)}</Text>
            <Text variant='inactive' size='small'>
              #{selected.id}
            </Text>
          </div>
        </div>
      ) : (
        <Text variant='inactive'>no product selected</Text>
      )}

      <ProductPicker
        products={products}
        selectedProducts={selected ? [selected] : []}
        hasMore={hasMore}
        loadMore={loadMore}
        handleSaveProducts={handleSave}
        singleSelect
        triggerClassName='w-full uppercase'
      />
      {fieldState.error && <Text variant='error'>{fieldState.error.message}</Text>}
    </div>
  );
}
