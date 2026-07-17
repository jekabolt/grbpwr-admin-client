import { adminService } from 'api/api';
import { common_Colorway } from 'api/proto-http/admin';
import { BASE_PATH } from 'constants/routes';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { cn } from 'lib/utility';
import { FC, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../../ui/components/button';
import Media from '../../../../ui/components/media';
import Text from '../../../../ui/components/text';
import { HeroModal } from './hero-modal';

const HIDDEN_ON_MOBILE_STYLE = 'hidden lg:table-cell';

type ColumnDef = {
  label: string;
  className?: string;
  accessor: (product: common_Colorway) => React.ReactNode;
};

interface ProductsPickerData {
  open: boolean;
  selectedProductIds: number[];
  onClose: () => void;
  onSave: (newSelectedProducts: common_Colorway[]) => void;
  onOpenRequest?: () => void;
  /** Single-select mode: radio picker, choosing one replaces any prior pick. */
  single?: boolean;
}

export const ProductPickerModal: FC<ProductsPickerData> = ({
  open,
  selectedProductIds,
  onClose,
  onSave,
  onOpenRequest,
  single = false,
}) => {
  const calculateOffset = (page: number, limit: number) => (page - 1) * limit;

  const [allProducts, setAllProducts] = useState<common_Colorway[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<common_Colorway[]>([]);
  const { dictionary } = useDictionary();
  const categories = dictionary?.categories || [];

  const [currentPage, setCurrentPage] = useState(1);
  const newLimit = 50;
  const offset = calculateOffset(currentPage, newLimit);

  useEffect(() => {
    if (open) {
      setAllProducts([]);
      setCurrentPage(1);
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      const fetchProducts = async () => {
        const response = await adminService.GetColorwaysPaged({
          limit: newLimit,
          offset: offset,
          sortFactors: ['SORT_FACTOR_CREATED_AT'],
          orderFactor: 'ORDER_FACTOR_DESC',
          filterConditions: undefined,
          statuses: undefined,
        });
        if (Array.isArray(response.colorways)) {
          setAllProducts((prevProducts) => {
            const combinedProducts = [...prevProducts, ...(response.colorways || [])];
            const uniqueProducts = combinedProducts.reduce<common_Colorway[]>((acc, current) => {
              if (!acc.find((product) => product.id === current.id)) {
                acc.push(current);
              }
              return acc;
            }, []);
            return uniqueProducts;
          });
        }
      };
      fetchProducts();
    }
  }, [open, currentPage, newLimit, offset]);

  useEffect(() => {
    const newSelectedProducts = allProducts.filter((product) =>
      selectedProductIds.includes(product.id!),
    );
    setSelectedProducts(newSelectedProducts);
  }, [allProducts, selectedProductIds]);

  const handleSave = () => {
    onSave(selectedProducts);
    onClose();
  };

  const handleSelectionChange = (product: common_Colorway) => {
    if (single) {
      // One target only — replace any prior pick.
      setSelectedProducts([product]);
      return;
    }
    const isSelected = selectedProducts.some((p) => p.id === product.id);
    if (isSelected) {
      setSelectedProducts((prev) => prev.filter((p) => p.id !== product.id));
    } else {
      setSelectedProducts((prev) => [...prev, product]);
    }
  };

  const loadMore = () => {
    setCurrentPage((prev) => prev + 1);
  };

  const COLUMNS = useMemo<ColumnDef[]>(
    () => [
      {
        label: 'SELECT',
        accessor: (product: common_Colorway) => {
          const isSelected = selectedProducts.some((p) => p.id === product.id);
          return (
            <input
              type={single ? 'radio' : 'checkbox'}
              name={single ? 'product-pick' : undefined}
              checked={isSelected}
              onChange={() => handleSelectionChange(product)}
              className='cursor-pointer'
            />
          );
        },
      },
      {
        label: 'ID',
        accessor: (product: common_Colorway) => (
          <Link
            to={`${BASE_PATH}/products/${product.id}`}
            target='_blank'
            className='cursor-pointer text-blue underline hover:text-blue'
          >
            {product.id}
          </Link>
        ),
      },
      {
        label: 'THUMBNAIL',
        accessor: (product: common_Colorway) => (
          <div className='flex items-center justify-center w-24 max-w-full h-full mx-auto overflow-hidden'>
            <Media
              src={product.display?.thumbnail?.media?.thumbnail?.mediaUrl || ''}
              alt='thumbnail'
              aspectRatio='1/1'
              fit='contain'
            />
          </div>
        ),
      },
      {
        label: 'NAME',
        accessor: (product: common_Colorway) => product.display?.translations?.[0]?.name,
      },
      {
        label: 'IS HIDDEN',
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (product: common_Colorway) => {
          const hidden = product.status === 'COLORWAY_LIFECYCLE_STATUS_HIDDEN';
          return hidden ? 'Yes' : 'No';
        },
      },
      {
        label: 'PRICE',
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (product: common_Colorway) => {
          const price = product.prices?.[1]?.price?.value;
          const currency = product.prices?.[1]?.currency ?? '';
          return `${price ?? ''} ${currency}`.trim();
        },
      },
      {
        label: 'SALE %',
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (product: common_Colorway) => {
          const sale = product.display?.merchandising?.salePercentage?.value;
          return sale != null ? `${sale}%` : '';
        },
      },
      {
        label: 'CATEGORY',
        className: HIDDEN_ON_MOBILE_STYLE,
        accessor: (product: common_Colorway) => {
          const categoryId = product.display?.merchandising?.topCategoryId;
          const category = categories.find((c) => c.id === categoryId);
          return category ? category.name?.replace('CATEGORY_ENUM_', '') : 'Unknown';
        },
      },
    ],
    [selectedProducts, categories, single],
  );

  return (
    <HeroModal
      handleSave={handleSave}
      open={open}
      onOpenChange={(isOpen) => {
        if (isOpen) onOpenRequest?.();
        else onClose();
      }}
    >
      <div className='w-full'>
        <div className='overflow-auto w-full max-h-[min(70vh,500px)]'>
          <table className='w-full border-collapse border-2 border-textInactiveColor min-w-max'>
            <thead className='bg-textInactiveColor h-10'>
              <tr className='border-b border-textInactiveColor'>
                {COLUMNS.map((col) => (
                  <th
                    key={col.label}
                    className={cn(
                      'sticky top-0 z-10 bg-textInactiveColor text-center w-auto lg:min-w-26 border border-r border-textInactiveColor px-2',
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
              {allProducts.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length} className='text-center py-8'>
                    <Text variant='uppercase'>no products found</Text>
                  </td>
                </tr>
              ) : (
                allProducts.map((product) => (
                  <tr key={product.id} className='border-b border-text last:border-b-0 lg:w-24'>
                    {COLUMNS.map((col) => {
                      const isThumbnail = col.label === 'THUMBNAIL';
                      const isSelect = col.label === 'SELECT';
                      const cellContent = col.accessor(product);
                      return (
                        <td
                          key={col.label}
                          className={cn(
                            'border border-textInactiveColor text-center px-2 w-16 lg:w-auto',
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
          <div className='flex justify-center py-2'>
            <Button
              type='button'
              size='lg'
              variant='simple'
              className='uppercase'
              onClick={loadMore}
            >
              Load more
            </Button>
          </div>
        </div>
      </div>
    </HeroModal>
  );
};
