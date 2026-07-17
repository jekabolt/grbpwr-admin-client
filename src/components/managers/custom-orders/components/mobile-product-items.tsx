import type { common_Category } from 'api/proto-http/admin';
import { common_Colorway } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { cn } from 'lib/utility';
import { Link } from 'react-router-dom';
import Media from 'ui/components/media';
import Text from 'ui/components/text';

export type ProductListProps = {
  products: common_Colorway[];
  pendingSelection: common_Colorway[];
  togglePending: (product: common_Colorway) => void;
  categories: common_Category[] | undefined;
};

export function MobileProductItems({
  products,
  pendingSelection,
  togglePending,
  categories,
}: ProductListProps) {
  return (
    <div className='lg:hidden space-y-3'>
      {products.length === 0 ? (
        <div className='text-center py-8'>
          <Text variant='uppercase'>no products found</Text>
        </div>
      ) : (
        products.map((product) => {
          const isSelected = pendingSelection.some((p) => p.id === product.id);
          const name =
            product.display?.productBody?.translations?.[0]?.name ??
            (product.display?.productBody as any)?.name;
          const categoryId =
            product.display?.productBody?.productBodyInsert?.topCategoryId ??
            (product.display?.productBody as any)?.categoryId;
          const category = categories?.find((c) => c.id === categoryId);
          const categoryName = category ? category.name?.replace('CATEGORY_ENUM_', '') : 'Unknown';
          return (
            <div
              key={product.id}
              role='button'
              tabIndex={0}
              onClick={() => togglePending(product)}
              className={cn(
                'flex gap-3 items-center p-3 rounded-none cursor-pointer active:opacity-80',
                isSelected
                  ? 'border-2 border-textInactiveColor'
                  : 'border border-textInactiveColor',
              )}
            >
              <div className='w-16 h-16 shrink-0 overflow-hidden rounded-none'>
                <Media
                  src={product.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
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
                  className='text-blue underline hover:text-blue text-textBaseSize'
                >
                  #{product.id}
                </Link>
                <Text className='block truncate'>{name}</Text>
                <Text variant='uppercase' className='text-textInactiveColor text-textBaseSize'>
                  {categoryName}
                </Text>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
