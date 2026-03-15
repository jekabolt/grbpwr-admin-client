import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_Product } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import Text from 'ui/components/text';
import { getProductPickerColumns } from '../utility/product-picker-columns';
import type { ProductListProps } from './mobile-product-items';
import { MobileProductItems } from './mobile-product-items';

interface ProductPickerProps {
  products: common_Product[];
  selectedProducts: common_Product[];
  hasMore: boolean;
  triggerClassName?: string;
  handleSaveProducts: (products: common_Product[]) => void;
  loadMore: () => void;
}

export function ProductPicker({
  products,
  selectedProducts,
  hasMore,
  triggerClassName,
  handleSaveProducts,
  loadMore,
}: ProductPickerProps) {
  const { dictionary } = useDictionary();
  const { ref, inView } = useInView({ rootMargin: '100px' });
  const [open, setOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<common_Product[]>([]);

  useEffect(() => {
    if (inView && hasMore && products.length > 0) {
      loadMore();
    }
  }, [inView, hasMore, products.length, loadMore]);

  useEffect(() => {
    if (open) {
      setPendingSelection([...selectedProducts]);
    }
  }, [open, selectedProducts]);

  const togglePending = useCallback((product: common_Product) => {
    setPendingSelection((prev) => {
      const isSelected = prev.some((p) => p.id === product.id);
      if (isSelected) {
        return prev.filter((p) => p.id !== product.id);
      }
      return [...prev, product];
    });
  }, []);

  const handleSave = () => {
    handleSaveProducts(pendingSelection);
    setOpen(false);
  };

  const columns = useMemo(
    () => getProductPickerColumns({ categories: dictionary?.categories }),
    [dictionary?.categories],
  );

  const productListProps = useMemo<ProductListProps>(
    () => ({
      products,
      pendingSelection,
      togglePending,
      categories: dictionary?.categories,
    }),
    [products, pendingSelection, togglePending, dictionary?.categories],
  );

  return (
    <DialogPrimitives.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitives.Trigger asChild>
        <Button variant='main' size='lg' type='button' className={triggerClassName}>
          select products
        </Button>
      </DialogPrimitives.Trigger>
      <DialogPrimitives.Portal>
        <DialogPrimitives.Overlay className='fixed inset-0 z-50 h-screen bg-overlay' />
        <DialogPrimitives.Content
          className={cn(
            'fixed z-50 flex flex-col border border-textInactiveColor bg-bgColor text-textColor',
            'inset-x-2 bottom-2 top-2 px-2.5 pb-4 pt-5',
            'lg:inset-x-auto lg:left-1/2 lg:top-1/2 lg:bottom-auto lg:h-[min(85vh,600px)] lg:w-[min(90vw,900px)] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:p-2.5',
          )}
        >
          <DialogPrimitives.Title className='sr-only'>Select products</DialogPrimitives.Title>
          <DialogPrimitives.Description className='sr-only'>
            Pick products for custom order
          </DialogPrimitives.Description>
          <div className='flex shrink-0 items-center justify-between'>
            <Text variant='uppercase'>select products</Text>
            <DialogPrimitives.Close asChild>
              <Button>[x]</Button>
            </DialogPrimitives.Close>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto mt-2'>
            <div className='hidden lg:block w-full overflow-x-auto'>
              <table className='w-full border-collapse border-2 border-textColor min-w-max'>
                <thead className='bg-textInactiveColor h-10'>
                  <tr className='border-b border-textColor'>
                    {columns.map((col) => (
                      <th
                        key={col.label}
                        className={cn(
                          'sticky top-0 z-10 bg-textInactiveColor text-center w-auto lg:min-w-26 border border-r border-textColor px-2',
                          col.className,
                        )}
                      >
                        <Text variant='uppercase' className='leading-none'>
                          {col.label}
                        </Text>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length} className='text-center py-8'>
                        <Text variant='uppercase'>no products found</Text>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => {
                      const isSelected = pendingSelection.some((p) => p.id === product.id);
                      return (
                        <tr
                          key={product.id}
                          role='button'
                          tabIndex={0}
                          onClick={() => togglePending(product)}
                          onKeyDown={(e) => e.key === 'Enter' && togglePending(product)}
                          className={cn(
                            'border-b border-text last:border-b-0 lg:w-24 cursor-pointer transition-colors',
                            { 'bg-textInactiveColor': isSelected },
                          )}
                        >
                          {columns.map((col) => {
                            const isThumbnail = col.label === 'THUMBNAIL';
                            const cellContent = col.accessor(product);
                            return (
                              <td
                                key={col.label}
                                className={cn(
                                  'border border-textColor text-center px-2 w-16 lg:w-auto',
                                  col.className,
                                )}
                              >
                                {isThumbnail ? cellContent : <Text>{cellContent}</Text>}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <MobileProductItems {...productListProps} />
            {hasMore && <div ref={ref} className='h-4 shrink-0' />}
          </div>
          <div className='flex shrink-0 justify-end gap-3 mt-3 pt-3 border-t border-textInactiveColor'>
            <DialogPrimitives.Close asChild>
              <Button variant='secondary' size='lg' type='button'>
                cancel
              </Button>
            </DialogPrimitives.Close>
            <Button variant='main' size='lg' type='button' onClick={handleSave}>
              save
            </Button>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
