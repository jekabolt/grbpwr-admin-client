import { Grid, Snackbar } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { deleteProductByID } from 'api/admin';
import { GetProductsPagedRequest } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import debounce from 'lodash/debounce';
import { FC, MouseEvent, useCallback, useEffect, useState } from 'react';
import { Filter } from './filterProducts/filterProducts';
import { ListProducts } from './listProducts';
import useListProduct from './useListProduct/useListProduct';

export const AllProducts: FC = () => {
  const { products, setProducts, filter, setFilter, isLoading, hasMore, fetchProducts } =
    useListProduct();
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const [deletingProductId, setDeletingProductId] = useState<number | undefined>(undefined);
  const [snackbarOpen, setSnackbarOpen] = useState<boolean>(false);
  const [snackbarMessage, setSnackbarMessage] = useState<string>('');
  const navigate = useNavigate();

  const handleProductClick = (id: number | undefined) => {
    navigate({ to: `${ROUTES.singleProduct}/${id}` });
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
        setProducts((prevProducts) => prevProducts?.filter((product) => product.id !== productId));
        setTimeout(() => setDeletingProductId(undefined), 1000);
      } catch (error) {
        setSnackbarMessage('THE PRODUCT CANNOT BE REMOVED');
        setSnackbarOpen(true);
      } finally {
        setConfirmDelete(undefined);
      }
    }
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const debouncedFetchProducts = useCallback(
    debounce((values: GetProductsPagedRequest) => {
      fetchProducts(50, 0, values);
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
        fetchProducts(50, products.length, filter);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, products.length, fetchProducts]);

  useEffect(() => {
    debouncedFetchProducts(filter);
  }, [filter, debouncedFetchProducts]);

  const handleFilterChange = (values: GetProductsPagedRequest) => {
    setFilter(values);
    debouncedFetchProducts(values);
  };

  return (
    <Grid container spacing={2} overflow='hidden' justifyContent='center'>
      <Grid item xs={12}>
        <Filter filter={filter} onFilterChange={handleFilterChange} />
      </Grid>
      <Grid item xs={12}>
        <ListProducts
          products={products}
          productClick={handleProductClick}
          deleteProduct={handleDeleteClick}
          copy={handleCopyProductClick}
          confirmDeleteProductId={confirmDelete}
          deletingProductId={deletingProductId}
          showHidden={filter.showHidden}
        />
      </Grid>
      <Snackbar
        open={snackbarOpen}
        message={snackbarMessage}
        autoHideDuration={6000}
        onClose={handleSnackbarClose}
      />
    </Grid>
  );
};
