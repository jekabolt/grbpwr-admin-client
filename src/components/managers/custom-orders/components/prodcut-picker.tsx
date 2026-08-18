import { common_Colorway } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Input from 'ui/components/input';
import Media from 'ui/components/media';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { Tile, Tiles } from 'ui/components/tiles';

/**
 * custPicker v2 — thumbnail grid + basket.
 *
 * The table-in-a-dialog is gone: products are now a `Tiles` grid you pick by looking at, with a
 * live basket beside it that shows what is staged. Clicking a tile toggles it into the basket;
 * saving commits the basket to the order. The dialog is the app's one modal shell
 * (`ConfirmationModal`, width lg) instead of a hand-rolled Radix dialog. The external props
 * contract is unchanged, so the custom-order form (its only caller) needs no changes.
 *
 * The name/SKU filter and infinite scroll are preserved: `filterConditions` still has no text field
 * server-side (admin/index.ts common_FilterConditions — price/gender/category/type/size/preorder/
 * tag/collection/season/colour only), so we filter client-side over the loaded pages while the
 * scroll sentinel keeps paging the catalogue in.
 */
interface ProductPickerProps {
  products: common_Colorway[];
  selectedProducts: common_Colorway[];
  hasMore: boolean;
  triggerClassName?: string;
  /** When true, only one product can be selected (picking another replaces it). */
  singleSelect?: boolean;
  handleSaveProducts: (products: common_Colorway[]) => void;
  loadMore: () => void;
}

export function ProductPicker({
  products,
  selectedProducts,
  hasMore,
  triggerClassName,
  singleSelect = false,
  handleSaveProducts,
  loadMore,
}: ProductPickerProps) {
  const { dictionary } = useDictionary();
  const { ref, inView } = useInView({ rootMargin: '100px' });
  const [open, setOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<common_Colorway[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (inView && hasMore && products.length > 0) {
      loadMore();
    }
  }, [inView, hasMore, products.length, loadMore]);

  useEffect(() => {
    if (open) {
      setPendingSelection([...selectedProducts]);
    } else {
      setSearch('');
    }
  }, [open, selectedProducts]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => {
      const name = p.display?.translations?.[0]?.name?.toLowerCase() ?? '';
      const sku = p.baseSku?.toLowerCase() ?? '';
      return name.includes(term) || sku.includes(term);
    });
  }, [products, search]);

  const togglePending = useCallback(
    (product: common_Colorway) => {
      setPendingSelection((prev) => {
        const isSelected = prev.some((p) => p.id === product.id);
        if (isSelected) return prev.filter((p) => p.id !== product.id);
        return singleSelect ? [product] : [...prev, product];
      });
    },
    [singleSelect],
  );

  const removePending = (id?: number) =>
    setPendingSelection((prev) => prev.filter((p) => p.id !== id));

  const categoryName = useCallback(
    (product: common_Colorway) => {
      const categoryId = product.display?.merchandising?.topCategoryId;
      const category = dictionary?.categories?.find((c) => c.id === categoryId);
      return category ? category.name?.replace('CATEGORY_ENUM_', '') : undefined;
    },
    [dictionary?.categories],
  );

  const handleSave = () => handleSaveProducts(pendingSelection);

  return (
    <>
      <Button
        variant='main'
        size='lg'
        type='button'
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        {singleSelect ? 'select product' : 'add products'}
      </Button>

      <ConfirmationModal
        open={open}
        onOpenChange={setOpen}
        onConfirm={handleSave}
        title={singleSelect ? 'select product' : 'add products'}
        confirmLabel={
          singleSelect
            ? 'select'
            : `add${pendingSelection.length ? ` ${pendingSelection.length}` : ''} to order`
        }
        width='lg'
      >
        <div className='flex flex-col gap-2.5'>
          <Input
            name='product-picker-search'
            type='text'
            placeholder='search by name or SKU'
            value={search}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
          />

          <div className='grid gap-3 lg:grid-cols-[1fr_15rem]'>
            {/* grid pane — its own scroll region so the basket stays put; sentinel pages the catalog */}
            <div className='max-h-[58vh] min-h-0 overflow-y-auto pr-0.5'>
              {filteredProducts.length === 0 ? (
                <Placeholder
                  label={search ? 'no products match your search' : 'no products found'}
                  className='py-12'
                />
              ) : (
                <Tiles min={104}>
                  {filteredProducts.map((product) => (
                    <Tile
                      key={product.id}
                      selected={pendingSelection.some((p) => p.id === product.id)}
                      // Плитка здесь — переключатель (повторный клик снимает), значит состояние
                      // обязано звучать, а не только краситься рамкой.
                      pressed={pendingSelection.some((p) => p.id === product.id)}
                      onClick={() => togglePending(product)}
                      name={product.display?.translations?.[0]?.name}
                      sub={categoryName(product)}
                      media={
                        <Media
                          src={product.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
                          alt={product.display?.translations?.[0]?.name || 'product'}
                          aspectRatio='1/1'
                          fit='contain'
                        />
                      }
                    />
                  ))}
                </Tiles>
              )}
              {hasMore && <div ref={ref} className='h-4 shrink-0' />}
            </div>

            {/* basket pane — what is staged for the order */}
            <aside className='flex max-h-[58vh] flex-col gap-2 border border-borderColor bg-bgSecondary p-2'>
              <GroupLabel flush>basket · {pendingSelection.length}</GroupLabel>
              {pendingSelection.length === 0 ? (
                <Text size='micro' variant='label' component='span'>
                  nothing selected yet — tap a product to add it
                </Text>
              ) : (
                <div className='flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto'>
                  {pendingSelection.map((product) => (
                    <div
                      key={product.id}
                      className='flex items-center gap-1.5 border border-borderColor bg-bgColor p-1'
                    >
                      <div className='h-9 w-9 shrink-0'>
                        <Media
                          src={product.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
                          alt={product.display?.translations?.[0]?.name || 'product'}
                          aspectRatio='1/1'
                          fit='contain'
                        />
                      </div>
                      <Text size='micro' component='span' className='min-w-0 flex-1 truncate uppercase'>
                        {product.display?.translations?.[0]?.name || `#${product.id}`}
                      </Text>
                      <Button
                        variant='underline'
                        size='xs'
                        type='button'
                        title='remove'
                        onClick={() => removePending(product.id)}
                      >
                        remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {pendingSelection.length > 0 && (
                <Button
                  variant='underline'
                  size='xs'
                  type='button'
                  className='self-start'
                  onClick={() => setPendingSelection([])}
                >
                  clear all
                </Button>
              )}
            </aside>
          </div>
        </div>
      </ConfirmationModal>
    </>
  );
}
