import { common_Product } from 'api/proto-http/admin';
import { ProductPicker } from 'components/managers/custom-orders/components/prodcut-picker';
import { useProductCatalog } from 'components/managers/fittings/components/useProductCatalog';
import { useProductsByIds } from 'components/managers/fittings/components/useResolvers';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import Text from 'ui/components/text';
import { TechCardFormData } from './schema';

function productName(product?: common_Product): string {
  return (
    product?.productDisplay?.productBody?.translations?.[0]?.name ?? `product #${product?.id ?? ''}`
  );
}

// Catalog products linked to this tech card (FK product ids). Multi-select via the
// shared ProductPicker. A colourway's product_id in later phases must reference one
// of these ids.
export function ProductIdsField() {
  const { control, setValue } = useFormContext<TechCardFormData>();
  const productIds = (useWatch({ control, name: 'productIds' }) ?? []) as number[];

  const { products, hasMore, loadMore } = useProductCatalog();
  const productMap = useProductsByIds(productIds);

  const selectedProducts = productIds
    .map((id) => productMap.get(id) ?? products.find((p) => p.id === id))
    .filter((p): p is common_Product => !!p);

  const handleSave = (picked: common_Product[]) => {
    const ids = picked.map((p) => p.id).filter((id): id is number => id != null);
    setValue('productIds', ids, { shouldDirty: true });
  };

  const remove = (id: number) => {
    setValue(
      'productIds',
      productIds.filter((x) => x !== id),
      { shouldDirty: true },
    );
  };

  return (
    <div className='space-y-3'>
      <ProductPicker
        products={products}
        selectedProducts={selectedProducts}
        hasMore={hasMore}
        loadMore={loadMore}
        handleSaveProducts={handleSave}
        triggerClassName='w-full uppercase'
      />

      {productIds.length === 0 ? (
        <Text variant='inactive' size='small'>
          no products linked
        </Text>
      ) : (
        <div className='space-y-2'>
          {productIds.map((id) => {
            const product = productMap.get(id) ?? products.find((p) => p.id === id);
            return (
              <div key={id} className='flex items-center gap-3 border border-textInactiveColor p-2'>
                <div className='w-12 shrink-0'>
                  <Media
                    src={product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
                    alt='thumbnail'
                    aspectRatio='1/1'
                    fit='contain'
                  />
                </div>
                <div className='min-w-0 flex-1'>
                  <Text>{product ? productName(product) : `#${id}`}</Text>
                  <Text variant='inactive' size='small'>
                    #{id}
                  </Text>
                </div>
                <Button
                  type='button'
                  variant='secondary'
                  aria-label='remove product'
                  onClick={() => remove(id)}
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
