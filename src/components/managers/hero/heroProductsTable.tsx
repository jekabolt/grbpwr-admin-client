import { Checkbox } from '@mui/material';
import { getDictionary } from 'api/admin';
import { common_Category, common_Product } from 'api/proto-http/admin';
import {
  MRT_TableContainer,
  useMaterialReactTable,
  type MRT_ColumnDef,
  type MRT_Row,
} from 'material-react-table';
import { FC, useEffect, useMemo, useState } from 'react';

interface HeroProductTableData {
  products: common_Product[];
}

export const HeroProductTable: FC<
  HeroProductTableData & { onReorder: (newOrder: common_Product[]) => void }
> = ({ products, onReorder }) => {
  const [categories, setCategories] = useState<common_Category[]>([]);

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

  const columns = useMemo<MRT_ColumnDef<common_Product>[]>(
    //column definitions...
    () => [
      {
        accessorKey: 'id',
        header: 'Id',
      },
      {
        accessorKey: 'productInsert.thumbnail',
        header: 'Data',
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
    ],
    [categories],
  );

  const [data, setData] = useState(products);

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
  });

  return <MRT_TableContainer table={table} />;
};
