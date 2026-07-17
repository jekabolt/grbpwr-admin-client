import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { ProductPicker } from 'components/managers/custom-orders/components/prodcut-picker';
import { useEffect, useState } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { useProductCatalog } from './useProductCatalog';

// Standalone (non-form) product filter for the fittings list. Drives the
// server-side ListFittings product_id filter.
export function FittingProductFilter({
  productId,
  onChange,
}: {
  productId: number;
  onChange: (id: number) => void;
}) {
  const { products, hasMore, loadMore } = useProductCatalog();
  const [selected, setSelected] = useState<common_Colorway | undefined>();

  useEffect(() => {
    if (!productId) {
      setSelected(undefined);
      return;
    }
    const found = products.find((p) => p.id === productId);
    if (found) {
      setSelected(found);
      return;
    }
    let active = true;
    adminService
      .GetColorwayByID({ id: productId })
      .then((res) => {
        if (active) setSelected(res.product?.colorway);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [productId, products]);

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <Text variant='inactive' size='small'>
        product:
      </Text>
      {selected && (
        <div className='flex items-center gap-2 border border-textInactiveColor p-1'>
          <span className='w-8 shrink-0'>
            <Media
              src={selected.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt=''
              aspectRatio='1/1'
              fit='contain'
            />
          </span>
          <Text size='small'>
            {selected.display?.productBody?.translations?.[0]?.name ?? `#${selected.id}`}
          </Text>
        </div>
      )}
      <ProductPicker
        products={products}
        selectedProducts={selected ? [selected] : []}
        hasMore={hasMore}
        loadMore={loadMore}
        handleSaveProducts={(picked) => {
          const chosen = picked[0];
          onChange(chosen?.id ?? 0);
          setSelected(chosen);
        }}
        singleSelect
        triggerClassName='uppercase'
      />
      {productId > 0 && (
        <Button
          type='button'
          variant='secondary'
          onClick={() => {
            onChange(0);
            setSelected(undefined);
          }}
        >
          clear
        </Button>
      )}
    </div>
  );
}
