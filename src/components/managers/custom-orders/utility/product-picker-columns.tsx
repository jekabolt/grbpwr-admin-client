import type { common_Category } from 'api/proto-http/admin';
import { common_Product } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { Link } from 'react-router-dom';
import Media from 'ui/components/media';

export type ProductPickerColumnDef = {
  label: string;
  className?: string;
  accessor: (product: common_Product) => React.ReactNode;
};

export const PRODUCT_PICKER_COLUMNS = [
  { label: 'ID' },
  { label: 'THUMBNAIL' },
  { label: 'NAME' },
  { label: 'CATEGORY' },
] as const;

export function getProductPickerColumns(params: {
  categories: common_Category[] | undefined;
}): ProductPickerColumnDef[] {
  const { categories } = params;

  const accessors: Array<(product: common_Product) => React.ReactNode> = [
    (product) => (
      <Link
        to={`${BASE_PATH}/products/${product.id}`}
        target='_blank'
        onClick={(e) => e.stopPropagation()}
        className='cursor-pointer text-blue-500 underline hover:text-blue-700'
      >
        {product.id}
      </Link>
    ),
    (product) => (
      <div className='flex items-center justify-center w-24 max-w-full h-full mx-auto overflow-hidden'>
        <Media
          src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
          alt='thumbnail'
          aspectRatio='1/1'
          fit='contain'
        />
      </div>
    ),
    (product) =>
      product.productDisplay?.productBody?.translations?.[0]?.name ??
      (product.productDisplay?.productBody as any)?.name,
    (product) => {
      const categoryId =
        product.productDisplay?.productBody?.productBodyInsert?.topCategoryId ??
        (product.productDisplay?.productBody as any)?.categoryId;
      const category = categories?.find((c) => c.id === categoryId);
      return category ? category.name?.replace('CATEGORY_ENUM_', '') : 'Unknown';
    },
  ];

  return PRODUCT_PICKER_COLUMNS.map((col, i) => ({
    ...col,
    accessor: accessors[i]!,
  }));
}
