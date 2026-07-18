import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { common_Colorway } from 'api/proto-http/admin';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { FC, useCallback, useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { Button } from 'ui/components/button';
import MediaComponent from 'ui/components/media';
import Text from 'ui/components/text';
import { COLORWAY_STATUS_LABEL } from './productPickerModal';
import { HeroSchema } from './schema';
import { SortableEntity } from './sortable-entity';

interface HeroProductTableData {
  products: common_Colorway[];
  isFeaturedProducts?: boolean;
}

export const HeroProductTable: FC<
  HeroProductTableData & {
    id: number;
    onReorder?: (newOrder: common_Colorway[]) => void;
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

  // H11: drag-and-drop reorder (dnd-kit), matching the sibling block-rail's
  // pattern, instead of up/down-button-only.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commitOrder = useCallback(
    (newData: common_Colorway[]) => {
      setData(newData);
      onReorder?.(newData);
      setValue(
        `entities.${id}.featuredProducts.productIds` as any,
        newData.map((product) => product.id),
      );
    },
    [onReorder, setValue, id],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const fromIndex = data.findIndex((p) => String(p.id) === String(active.id));
      const toIndex = data.findIndex((p) => String(p.id) === String(over.id));
      if (fromIndex < 0 || toIndex < 0) return;
      const newData = [...data];
      const [item] = newData.splice(fromIndex, 1);
      newData.splice(toIndex, 0, item);
      commitOrder(newData);
    },
    [data, commitOrder],
  );

  const handleDelete = useCallback(
    (index: number) => commitOrder(data.filter((_, i) => i !== index)),
    [data, commitOrder],
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
    'status',
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

  const renderCells = (
    product: common_Colorway,
    index: number,
    dragHandleProps?: Record<string, any>,
  ) => (
    <>
      {isFeaturedProducts && (
        <td className='border border-text p-2'>
          <button
            type='button'
            className='flex w-full cursor-grab items-center justify-center touch-none select-none leading-none text-textInactiveColor hover:text-textColor active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            aria-label='drag to reorder product'
            {...(dragHandleProps || {})}
          >
            ⠿
          </button>
        </td>
      )}
      <td className='border border-text p-2'>
        <button
          onClick={() => navigate(`/products/${product.id}`)}
          className='text-blue underline hover:text-blue cursor-pointer'
        >
          {product.id}
        </button>
      </td>
      <td className='border border-text lg:w-16'>
        {product.display?.thumbnail?.media?.thumbnail?.mediaUrl && (
          <MediaComponent
            src={product.display?.thumbnail?.media?.thumbnail?.mediaUrl}
            alt='Thumbnail'
            type='image'
            className='w-[100px] h-auto object-contain'
          />
        )}
      </td>
      <td className='border border-text p-2'>
        <Text>{product.display?.translations?.[0]?.name}</Text>
      </td>
      <td className='border border-text p-2'>
        <Text variant={product.status === 'COLORWAY_LIFECYCLE_STATUS_ACTIVE' ? 'default' : 'error'}>
          {COLORWAY_STATUS_LABEL[product.status || ''] || 'unknown'}
        </Text>
      </td>
      <td className='border border-text p-2'>
        <Text>{`${product.prices?.[1].price?.value} ${product.prices?.[1].currency}`}</Text>
      </td>
      <td className='border border-text p-2'>
        <Text>{`${product.display?.merchandising?.salePercentage?.value} %`}</Text>
      </td>
      <td className='border border-text p-2'>
        <Text>{getCategoryName(product.display?.merchandising?.topCategoryId)}</Text>
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
    </>
  );

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
        {isFeaturedProducts ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis]}
            onDragEnd={handleDragEnd}
          >
            <tbody>
              <SortableContext
                items={data.map((p) => String(p.id))}
                strategy={verticalListSortingStrategy}
              >
                {data.map((product, index) => (
                  <SortableEntity key={product.id} uid={String(product.id)}>
                    {({ setNodeRef, style, dragHandleProps }) => (
                      <tr
                        ref={setNodeRef}
                        style={style}
                        className='border-b border-text hover:bg-bgColor/50 text-center'
                      >
                        {renderCells(product, index, dragHandleProps)}
                      </tr>
                    )}
                  </SortableEntity>
                ))}
              </SortableContext>
            </tbody>
          </DndContext>
        ) : (
          <tbody>
            {data.map((product, index) => (
              <tr key={product.id} className='border-b border-text hover:bg-bgColor/50 text-center'>
                {renderCells(product, index)}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
};
