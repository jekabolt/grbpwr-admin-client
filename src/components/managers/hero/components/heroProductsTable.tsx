import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import { Checkbox } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import { common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useDictionaryStore } from 'lib/stores/store';
import {
  MRT_TableContainer,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row,
} from 'material-react-table';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
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
  const categories = useDictionaryStore((state) => state.dictionary?.categories || []);
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
    [data, onReorder, setValue],
  );

  const columns = useMemo<MRT_ColumnDef<common_Product>[]>(
    () => [
      ...(isFeaturedProducts
        ? [
            {
              id: 'actions',
              header: 'Order',
              Cell: ({ row }: { row: MRT_Row<common_Product> }) => (
                <div>
                  <IconButton
                    onClick={(event) => {
                      event.stopPropagation();
                      moveRow(row.index, row.index - 1);
                    }}
                    disabled={row.index === 0}
                  >
                    <ArrowUpwardIcon fontSize='small' />
                  </IconButton>
                  <IconButton
                    onClick={(event) => {
                      event.stopPropagation();
                      moveRow(row.index, row.index + 1);
                    }}
                    disabled={row.index === data.length - 1}
                  >
                    <ArrowDownwardIcon fontSize='small' />
                  </IconButton>
                </div>
              ),
            },
          ]
        : []),
      {
        accessorKey: 'id',
        header: 'Id',
        Cell: ({ cell, row }) => (
          <span
            style={{ color: 'blue', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigate(`${ROUTES.singleProduct}/${row.original.id}`)}
          >
            {cell.getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: 'productDisplay.thumbnail.media.thumbnail.mediaUrl',
        header: 'Thumbnail',
        Cell: ({ cell }) => (
          <img
            src={cell.getValue() as string}
            alt='Thumbnail'
            style={{ width: '100px', height: 'auto', objectFit: 'scale-down' }}
          />
        ),
      },
      {
        accessorKey: 'productDisplay.productBody.name',
        header: 'Name',
      },
      {
        accessorKey: 'productDisplay.productBody.hidden',
        header: 'isHidden',

        Cell: ({ cell }) => {
          const hidden = cell.getValue() as boolean;
          return (
            <Checkbox
              checked={hidden}
              disabled={true} // Makes the checkbox read-only
              inputProps={{ 'aria-label': 'hidden checkbox' }}
            />
          );
        },
      },
      {
        accessorKey: 'productDisplay.productBody.price.value',
        header: 'Price',
      },
      {
        accessorKey: 'productDisplay.productBody.salePercentage.value',
        header: 'Sale percentage',
      },
      {
        accessorKey: 'productDisplay.productBody.categoryId',
        header: 'Category',
        enableResizing: true,
        Cell: ({ cell }) => {
          const categoryId = cell.getValue() as number; // get the current row's categoryId
          const category = categories?.find((c) => c.id === categoryId); // find the category in the state
          return (
            <span>
              {category
                ? category.translations?.[0]?.name!.replace('CATEGORY_ENUM_', '')
                : 'Unknown'}
            </span>
          ); // return the category name or 'Unknown'
        },
      },
      ...(isFeaturedProducts
        ? [
            {
              id: 'delete',
              header: 'Delete',
              Cell: ({ row }: { row: MRT_Row<common_Product> }) => (
                <IconButton
                  onClick={(event) => {
                    event.stopPropagation();
                    const newData = data.filter((_, index) => index !== row.index);
                    setData(newData);
                    onReorder?.(newData);
                    setValue(
                      `entities.${id}.featuredProducts.productIds` as any,
                      newData.map((p) => p.id),
                    );
                  }}
                  aria-label='delete'
                  size='small'
                >
                  <DeleteIcon fontSize='small' />
                </IconButton>
              ),
            },
          ]
        : []),
    ],
    [categories, moveRow, setData, onReorder, isFeaturedProducts],
  );

  const table = useMaterialReactTable({
    autoResetPageIndex: false,
    columns,
    data,
    enableSorting: false,
    enableRowOrdering: isFeaturedProducts,
    muiRowDragHandleProps: ({ table }) => ({
      onDragEnd: () => {
        const { draggingRow, hoveredRow } = table.getState();
        if (hoveredRow && draggingRow) {
          data.splice(
            (hoveredRow as MRT_Row<common_Product>).index,
            0,
            data.splice(draggingRow.index, 1)[0],
          );
          setData([...data]);
          onReorder?.(data);
        }
      },
    }),
  });

  return <MRT_TableContainer table={table} />;
};
