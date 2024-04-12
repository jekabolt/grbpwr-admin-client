import { Grid } from '@mui/material';
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
  const [deletionMessage, setDeletionMessage] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<number | undefined>(undefined);
  const navigate = useNavigate();

  const handleProductClick = (index: number | undefined) => {
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
      setTimeout(async () => {
        await deleteProductByID({ id: productId });
        setProducts((prevProducts) => prevProducts?.filter((product) => product.id !== productId));
        setDeletingProductId(undefined);
        setTimeout(() => setDeletionMessage(''), 3000);
      }, 3000);
      setConfirmDelete(undefined);
    }
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
      {deletionMessage && <div>{deletionMessage}</div>}
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
    </Grid>
  );
};
