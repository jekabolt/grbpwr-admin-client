import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { FC, useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';
import { HeroSchema } from './schema';

interface HeroProductTableData {
  products: common_Product[];
  isFeaturedProducts?: boolean;
}

export const HeroProductTable: FC<
  HeroProductTableData & {
    id: number;
    onReorder?: (newOrder: common_Product[]) => void;
  }
> = ({ products, id, onReorder, isFeaturedProducts }) => {
  const { setValue } = useFormContext<HeroSchema>();
  const { dictionary } = useDictionary();
  const categories = dictionary?.categories || [];
  const navigate = useNavigate();
  const [data, setData] = useState(products);

  useEffect(() => {
    setData(products);
  }, [products]);

  const moveRow = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex >= 0 && toIndex < data.length) {
        const newData = [...data];
        const item = newData.splice(fromIndex, 1)[0];
        newData.splice(toIndex, 0, item);
        setData(newData);
        onReorder?.(newData);
        setValue(
          `entities.${id}.featuredProducts.productIds` as any,
          newData.map((product) => product.id),
        );
      }
    },
    [data, onReorder, setValue, id],
  );

  const handleDelete = useCallback(
    (index: number) => {
      const newData = data.filter((_, i) => i !== index);
      setData(newData);
      onReorder?.(newData);
      setValue(
        `entities.${id}.featuredProducts.productIds` as any,
        newData.map((p) => p.id),
      );
    },
    [data, onReorder, setValue, id],
  );

  const getCategoryName = (categoryId?: number) => {
    if (!categoryId) return 'Unknown';
    const category = categories?.find((c) => c.id === categoryId);
    return category ? category.name?.replace('CATEGORY_ENUM_', '') : 'Unknown';
  };

  const columnLabels = [
    ...(isFeaturedProducts ? ['order'] : []),
    'id',
    'thumbnail',
    'name',
    'is hidden',
    'price',
    'sale percentage',
    'category',
    ...(isFeaturedProducts ? ['delete'] : []),
  ];

  if (data.length === 0) {
    return (
      <div className='py-8 text-center'>
        <Text>No products</Text>
      </div>
    );
  }

  return (
    <div className='overflow-x-auto'>
      <table className='w-full border-collapse border border-text'>
        <thead>
          <tr className='bg-bgColor border-b border-text'>
            {columnLabels.map((label) => (
              <th key={label} className='border border-text p-2 text-center'>
                <Text variant='uppercase'>{label}</Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((product, index) => (
            <tr key={product.id} className='border-b border-text hover:bg-bgColor/50 text-center'>
              {isFeaturedProducts && (
                <td className='border border-text p-2'>
                  <div className='flex'>
                    <Button
                      type='button'
                      variant='simple'
                      onClick={() => moveRow(index, index - 1)}
                      disabled={index === 0}
                      className='w-full'
                    >
                      ↑
                    </Button>
                    <Button
                      type='button'
                      variant='simple'
                      onClick={() => moveRow(index, index + 1)}
                      disabled={index === data.length - 1}
                      className='w-full'
                    >
                      ↓
                    </Button>
                  </div>
                </td>
              )}
              <td className='border border-text p-2'>
                <button
                  onClick={() => navigate(`/products/${product.id}`)}
                  className='text-blue-500 underline hover:text-blue-700 cursor-pointer'
                >
                  {product.id}
                </button>
              </td>
              <td className='border border-text lg:w-16'>
                {product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl && (
                  <MediaComponent
                    src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl}
                    alt='Thumbnail'
                    type='image'
                    className='w-[100px] h-auto object-contain'
                  />
                )}
              </td>
              <td className='border border-text p-2'>
                <Text>{product.productDisplay?.productBody?.translations?.[0].name}</Text>
              </td>
              <td className='border border-text p-2'>
                <Text>
                  {product.productDisplay?.productBody?.productBodyInsert?.hidden
                    ? 'hidden'
                    : 'shown'}
                </Text>
              </td>
              <td className='border border-text p-2'>
                <Text>{`${product.prices?.[1].price?.value} ${product.prices?.[1].currency}`}</Text>
              </td>
              <td className='border border-text p-2'>
                <Text>
                  {`${product.productDisplay?.productBody?.productBodyInsert?.salePercentage?.value} %`}
                </Text>
              </td>
              <td className='border border-text p-2'>
                <Text>
                  {getCategoryName(
                    product.productDisplay?.productBody?.productBodyInsert?.topCategoryId,
                  )}
                </Text>
              </td>
              {isFeaturedProducts && (
                <td className='border border-text'>
                  <Button
                    type='button'
                    onClick={() => handleDelete(index)}
                    className='w-full'
                    aria-label='delete'
                  >
                    ×
                  </Button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
