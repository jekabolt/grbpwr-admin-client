import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { getDictionary, getProductsPaged } from 'api/admin';

import { GetProductsPagedRequest, common_Category, common_Product } from 'api/proto-http/admin';
import { initialFilter } from 'components/managers/products/listProducts/filterComponents/initialFilterStates';
import {
  MRT_TableContainer,
  useMaterialReactTable,
  type MRT_ColumnDef,
} from 'material-react-table';
import { FC, useEffect, useMemo, useState } from 'react';

interface ProductsPickerData {
  open: boolean;
  onClose: () => void;
  onSave: (newSelectedProducts: common_Product[]) => void;
  selectedProductIds: number[];
}

export const ProductPickerModal: FC<ProductsPickerData> = ({
  open,
  onClose,
  onSave,
  selectedProductIds,
}) => {
  const calculateOffset = (page: number, limit: number) => (page - 1) * limit;

  const [allProducts, setAllProducts] = useState<common_Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<common_Product[]>([]);
  const [data, setData] = useState(allProducts);
  const [categories, setCategories] = useState<common_Category[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<GetProductsPagedRequest>(initialFilter);
  const newLimit = filter.limit || 6;
  const offset = calculateOffset(currentPage, newLimit);

  useEffect(() => {
    if (open) {
      const fetchProducts = async () => {
        const response = await getProductsPaged({
          ...filter,
          limit: newLimit,
          offset,
        });
        setAllProducts(response.products ? response.products : []);
      };
      fetchProducts();
    }
  }, [open, currentPage, filter, newLimit, offset]);

  useEffect(() => {
    const fetchDictionary = async () => {
      const response = await getDictionary({});
      setCategories(response.dictionary?.categories ? response.dictionary?.categories : []);
    };
    fetchDictionary();
  }, []);

  useEffect(() => {
    // Filter allProducts based on selectedProductIds
    setData(allProducts);
    const newSelectedProducts = allProducts.filter((product) =>
      selectedProductIds.includes(product.id!),
    );
    setSelectedProducts(newSelectedProducts);
  }, [allProducts, selectedProductIds]);

  const handleSave = () => {
    onSave(selectedProducts);
    onClose();
  };

  const handleSelectionChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    product: common_Product,
  ) => {
    if (event.target.checked) {
      setSelectedProducts((prev) => [...prev, product]);
    } else {
      setSelectedProducts((prev) => prev.filter((p) => p.id !== product.id));
    }
  };

  const columns = useMemo<MRT_ColumnDef<common_Product>[]>(
    //column definitions...
    () => [
      {
        id: 'selection',
        header: 'Select',
        Cell: ({ row }) => {
          const isSelected = selectedProducts.some((product) => product.id === row.original.id);
          return (
            <Checkbox
              checked={isSelected}
              onChange={(event) => handleSelectionChange(event, row.original)}
            />
          );
        },
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
    ],
    [selectedProducts],
  );

  const table = useMaterialReactTable({
    autoResetPageIndex: false,
    columns,
    data,
    enableRowOrdering: false,
    enableSorting: false,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth='xl' fullWidth sx={{ width: 'auto' }}>
      <DialogTitle>Select Products</DialogTitle>
      <DialogContent>
        <MRT_TableContainer table={table} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  );
};
