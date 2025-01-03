import { Grid2 as Grid } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { deleteProductByID } from 'api/admin';
import { common_Product, GetProductsPagedRequest } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { useProductStore, useSnackBarStore } from 'lib/stores/store';
import debounce from 'lodash/debounce';
import { FC, MouseEvent, useCallback, useEffect, useState } from 'react';
import { Filter } from './filterProducts/filterProducts';
import { ListProducts } from './listProducts';

export const AllProducts: FC = () => {
  const { showMessage } = useSnackBarStore();
  const { updateFilter, products, setProducts, isLoading, hasMore, filter, fetchProducts } =
    useProductStore();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const [deletingProductId, setDeletingProductId] = useState<number | undefined>(undefined);
  const navigate = useNavigate();

  const handleProductClick = (id: number | undefined) => {
    navigate({ to: `${ROUTES.product}/${id}`, replace: true });
  };

  const handleCopyProductClick = (id: number | undefined) => {
    navigate({ to: `${ROUTES.copyProduct}/${id}` });
  };

  const handleDeleteClick = async (
    e: MouseEvent<HTMLButtonElement>,
    productId: number | undefined,
  ) => {
    e.stopPropagation();

    if (confirmDelete !== productId) {
      setConfirmDelete(productId);
    } else {
      setDeletingProductId(productId);
      try {
        await deleteProductByID({ id: productId });
        setProducts((prevProducts: common_Product[]) =>
          prevProducts?.filter((product) => product.id !== productId),
        );
        setTimeout(() => setDeletingProductId(undefined), 1000);
      } catch (error) {
        showMessage('the product cannot be removed', 'error');
      } finally {
        setConfirmDelete(undefined);
      }
    }
  };

  const debouncedFetchProducts = useCallback(
    debounce((values: GetProductsPagedRequest) => {
      fetchProducts(50, 0);
    }, 500),
    [fetchProducts],
  );

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchProducts(50, products.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, products.length, fetchProducts]);

  useEffect(() => {
    debouncedFetchProducts(filter);
  }, [filter, debouncedFetchProducts]);

  const handleFilterChange = (values: GetProductsPagedRequest) => {
    updateFilter(values);
    debouncedFetchProducts(values);
  };

  return (
    <Grid container spacing={2} overflow='hidden' justifyContent='center'>
      <Grid size={12}>
        <Filter onFilterChange={handleFilterChange} />
      </Grid>
      <Grid size={12}>
        <ListProducts
          productClick={handleProductClick}
          deleteProduct={handleDeleteClick}
          copy={handleCopyProductClick}
          confirmDeleteProductId={confirmDelete}
          deletingProductId={deletingProductId}
          showHidden={filter.showHidden}
        />
      </Grid>
    </Grid>
  );
};
