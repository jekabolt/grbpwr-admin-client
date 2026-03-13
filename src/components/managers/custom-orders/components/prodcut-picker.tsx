import * as DialogPrimitives from '@radix-ui/react-dialog';
import { common_Product } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useInView } from 'react-intersection-observer';
import { Button } from 'ui/components/button';
import CheckboxCommon from 'ui/components/checkbox';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

type ColumnDef = {
  label: string;
  className?: string;
  accessor: (product: common_Product) => React.ReactNode;
};

interface ProductPickerProps {
  products: common_Product[];
  selectedProducts: common_Product[];
  handleSelectProduct: (product: common_Product) => void;
  loadMore: () => void;
  hasMore: boolean;
  onSave?: () => void;
  triggerClassName?: string;
}

export function ProductPicker({
  products,
  selectedProducts,
  handleSelectProduct,
  loadMore,
  hasMore,
  onSave,
  triggerClassName,
}: ProductPickerProps) {
  const { dictionary } = useDictionary();
  const { ref, inView } = useInView({ rootMargin: '100px' });

  useEffect(() => {
    if (inView && hasMore && products.length > 0) {
      loadMore();
    }
  }, [inView, hasMore, products.length, loadMore]);

  const COLUMNS = useMemo<ColumnDef[]>(
    () => [
      {
        label: 'SELECT',
        accessor: (product: common_Product) => {
          const isSelected = selectedProducts.some((p) => p.id === product.id);
          return (
            <div className='flex items-center justify-center'>
              <CheckboxCommon
                name={`select-${product.id}`}
                checked={isSelected}
                onChange={() => handleSelectProduct(product)}
                className='cursor-pointer'
              />
            </div>
          );
        },
      },
      {
        label: 'ID',
        accessor: (product: common_Product) => (
          <Link
            to={`${BASE_PATH}/products/${product.id}`}
            target='_blank'
            className='cursor-pointer text-blue-500 underline hover:text-blue-700'
          >
            {product.id}
          </Link>
        ),
      },
      {
        label: 'THUMBNAIL',
        accessor: (product: common_Product) => (
          <div className='flex items-center justify-center w-24 max-w-full h-full mx-auto overflow-hidden'>
            <Media
              src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt='thumbnail'
              aspectRatio='1/1'
              fit='contain'
            />
          </div>
        ),
      },
      {
        label: 'NAME',
        accessor: (product: common_Product) =>
          product.productDisplay?.productBody?.translations?.[0]?.name ??
          (product.productDisplay?.productBody as any)?.name,
      },
      {
        label: 'CATEGORY',
        accessor: (product: common_Product) => {
          const categoryId =
            product.productDisplay?.productBody?.productBodyInsert?.topCategoryId ??
            (product.productDisplay?.productBody as any)?.categoryId;
          const category = dictionary?.categories?.find((c) => c.id === categoryId);
          return category ? category.name?.replace('CATEGORY_ENUM_', '') : 'Unknown';
        },
      },
    ],
    [selectedProducts, dictionary?.categories],
  );

  return (
    <DialogPrimitives.Root>
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
            {/* Desktop: table */}
            <div className='hidden lg:block w-full overflow-x-auto'>
              <table className='w-full border-collapse border-2 border-textColor min-w-max'>
                <thead className='bg-textInactiveColor h-10'>
                  <tr className='border-b border-textColor'>
                    {COLUMNS.map((col) => (
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
                      <td colSpan={COLUMNS.length} className='text-center py-8'>
                        <Text variant='uppercase'>no products found</Text>
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <tr key={product.id} className='border-b border-text last:border-b-0 lg:w-24'>
                        {COLUMNS.map((col) => {
                          const isThumbnail = col.label === 'THUMBNAIL';
                          const isSelect = col.label === 'SELECT';
                          const cellContent = col.accessor(product);
                          return (
                            <td
                              key={col.label}
                              className={cn(
                                'border border-textColor text-center px-2 w-16 lg:w-auto',
                                col.className,
                              )}
                            >
                              {isThumbnail || isSelect ? cellContent : <Text>{cellContent}</Text>}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile: card list */}
            <div className='lg:hidden space-y-3'>
              {products.length === 0 ? (
                <div className='text-center py-8'>
                  <Text variant='uppercase'>no products found</Text>
                </div>
              ) : (
                products.map((product) => {
                  const isSelected = selectedProducts.some((p) => p.id === product.id);
                  const name =
                    product.productDisplay?.productBody?.translations?.[0]?.name ??
                    (product.productDisplay?.productBody as any)?.name;
                  const categoryId =
                    product.productDisplay?.productBody?.productBodyInsert?.topCategoryId ??
                    (product.productDisplay?.productBody as any)?.categoryId;
                  const category = dictionary?.categories?.find((c) => c.id === categoryId);
                  const categoryName = category
                    ? category.name?.replace('CATEGORY_ENUM_', '')
                    : 'Unknown';
                  return (
                    <div
                      key={product.id}
                      role='button'
                      tabIndex={0}
                      onClick={() => handleSelectProduct(product)}
                      className={cn(
                        'flex gap-3 items-center p-3 rounded cursor-pointer active:opacity-80',
                        isSelected
                          ? 'border-2 border-textColor'
                          : 'border border-textInactiveColor',
                      )}
                    >
                      <div className='w-16 h-16 shrink-0 overflow-hidden rounded'>
                        <Media
                          src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
                          alt='thumbnail'
                          aspectRatio='1/1'
                          fit='contain'
                        />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <Link
                          to={`${BASE_PATH}/products/${product.id}`}
                          target='_blank'
                          onClick={(e) => e.stopPropagation()}
                          className='text-blue-500 underline hover:text-blue-700 text-sm'
                        >
                          #{product.id}
                        </Link>
                        <Text className='block truncate'>{name}</Text>
                        <Text variant='uppercase' className='text-textInactiveColor text-xs'>
                          {categoryName}
                        </Text>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            {hasMore && <div ref={ref} className='h-4 shrink-0' />}
          </div>

          <div className='flex shrink-0 justify-end gap-3 mt-3 pt-3 border-t border-textInactiveColor'>
            <DialogPrimitives.Close asChild>
              <Button variant='secondary' size='lg' type='button'>
                cancel
              </Button>
            </DialogPrimitives.Close>
            <DialogPrimitives.Close asChild>
              <Button
                variant='main'
                size='lg'
                type='button'
                onClick={() => onSave?.()}
              >
                save
              </Button>
            </DialogPrimitives.Close>
          </div>
        </DialogPrimitives.Content>
      </DialogPrimitives.Portal>
    </DialogPrimitives.Root>
  );
}
