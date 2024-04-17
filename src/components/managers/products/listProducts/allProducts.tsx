import { Grid, Snackbar } from '@mui/material';
import { useNavigate } from '@tanstack/react-location';
import { deleteProductByID } from 'api/admin';
import { GetProductsPagedRequest } from 'api/proto-http/admin';
import { ROUTES } from 'constants/routes';
import { FC, MouseEvent, useEffect, useState } from 'react';
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

  const handleProductClick = (index: number | undefined) => {
    if (deletingProductId === index) {
      return;
    }
    navigate({ to: `${ROUTES.singleProduct}/${index}` });
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
    fetchProducts(50, 0, filter);
  }, [fetchProducts]);

  const handleSubmit = (values: GetProductsPagedRequest) => {
    fetchProducts(50, 0, values);
  };

  return (
    <Grid container spacing={1} justifyContent='center'>
      <Grid item xs={10}>
        <Filter filter={filter} onSubmit={handleSubmit} />
      </Grid>
      <Grid item xs={12}>
        <ListProducts
          products={products}
          productClick={handleProductClick}
          deleteProduct={handleDeleteClick}
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
