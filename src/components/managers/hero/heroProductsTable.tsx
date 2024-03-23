import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import DeleteIcon from '@mui/icons-material/Delete';
import { Button, Checkbox } from '@mui/material';
import IconButton from '@mui/material/IconButton';
import { useNavigate } from '@tanstack/react-location';
import { getDictionary } from 'api/admin';
import { common_Category, common_Product } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import {
  MRT_TableContainer,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row,
} from 'material-react-table';
import { FC, useCallback, useEffect, useMemo, useState } from 'react';

interface HeroProductTableData {
  products: common_Product[];
}

export const HeroProductTable: FC<
  HeroProductTableData & { onReorder: (newOrder: common_Product[]) => void }
> = ({ products, onReorder }) => {
  const [categories, setCategories] = useState<common_Category[]>([]);

  const navigate = useNavigate();

  const [data, setData] = useState(products);

  useEffect(() => {
    setData(products);
  }, [products]);

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setCategories(response.dictionary?.categories ? response.dictionary?.categories : []);
    };
    fetchDictionary();
  }, []);

  const moveRow = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex >= 0 && toIndex < data.length) {
        const newData = [...data];
        const item = newData.splice(fromIndex, 1)[0];
        newData.splice(toIndex, 0, item);
        setData(newData);
        onReorder(newData);
      }
    },
    [data, onReorder],
  );

  const columns = useMemo<MRT_ColumnDef<common_Product>[]>(
    //column definitions...
    () => [
      {
        id: 'actions',
        header: 'Order',
        Cell: ({ row }) => (
          <div>
            <Button
              onClick={(event) => {
                event.stopPropagation();
                moveRow(row.index, row.index - 1);
              }}
              disabled={row.index === 0}
              size='small'
              variant='outlined'
            >
              <ArrowUpwardIcon fontSize='small' />
            </Button>
            <Button
              onClick={(event) => {
                event.stopPropagation();
                moveRow(row.index, row.index + 1);
              }}
              disabled={row.index === data.length - 1}
              size='small'
              variant='outlined'
            >
              <ArrowDownwardIcon fontSize='small' />
            </Button>
          </div>
        ),
      },
      {
        accessorKey: 'id',
        header: 'Id',
      },
      {
        accessorKey: 'productInsert.thumbnail',
        header: 'Thumbnail',
        Cell: ({ cell }) => (
          <img
            src={cell.getValue() as string}
            alt='Thumbnail'
            style={{ width: '100px', height: 'auto' }}
          />
        ),
      },
      {
        accessorKey: 'productInsert.name',
        header: 'Name',
      },
      {
        accessorKey: 'productInsert.hidden',
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
        accessorKey: 'productInsert.price.value',
        header: 'Price',
      },
      {
        accessorKey: 'productInsert.salePercentage.value',
        header: 'Sale percentage',
      },
      {
        accessorKey: 'productInsert.categoryId',
        header: 'Category',
        Cell: ({ cell }) => {
          const categoryId = cell.getValue() as number; // get the current row's categoryId
          const category = categories.find((c) => c.id === categoryId); // find the category in the state
          return <span>{category ? category.name!.replace('CATEGORY_ENUM_', '') : 'Unknown'}</span>; // return the category name or 'Unknown'
        },
      },
      {
        id: 'delete',
        header: 'Delete',
        Cell: ({ row }) => (
          <IconButton
            onClick={(event) => {
              event.stopPropagation(); // Prevent row click event
              const newData = data.filter((_, index) => index !== row.index);
              setData(newData);
              onReorder(newData);
            }}
            aria-label='delete'
            size='small'
          >
            <DeleteIcon fontSize='small' />
          </IconButton>
        ),
      },
    ],
    [categories, moveRow, setData, onReorder],
  );

  const table = useMaterialReactTable({
    autoResetPageIndex: false,
    columns,
    data,
    enableRowOrdering: true,
    enableSorting: false,
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
          onReorder(data);
        }
      },
    }),
    muiTableBodyRowProps: ({ row }) => ({
      onClick: () => {
        navigate({ to: `${ROUTES.singleProduct}/${row.original.id}` });
      },
      sx: {
        cursor: 'pointer',
      },
    }),
  });

  return <MRT_TableContainer table={table} />;
};
