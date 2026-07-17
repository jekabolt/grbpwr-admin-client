import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { ProductPicker } from 'components/managers/custom-orders/components/prodcut-picker';
import { useProductCatalog } from 'components/managers/fittings/components/useProductCatalog';
import { useEffect, useState } from 'react';
import { useController, useFormContext } from 'react-hook-form';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { FittingFormData } from './schema';

function productName(product?: common_Colorway): string {
  return (
    product?.display?.productBody?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`
  );
}

// Single-product selector for the fitting form. Reuses the shared (multi-select)
// ProductPicker but keeps only the last picked product.
export function ProductField() {
  const { control } = useFormContext<FittingFormData>();
  const { field, fieldState } = useController({ control, name: 'productId' });

  const { products, hasMore, loadMore } = useProductCatalog();
  const [selected, setSelected] = useState<common_Colorway | undefined>();

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
      .GetColorwayByID({ id })
      .then((res) => {
        if (active) setSelected(res.product?.colorway);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [field.value, products]);

  const handleSave = (picked: common_Colorway[]) => {
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
              src={selected.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
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
