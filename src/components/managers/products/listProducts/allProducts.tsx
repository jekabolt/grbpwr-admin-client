import { useNavigate } from '@tanstack/react-location';
import { deleteProductByID } from 'api/admin';
import { GetProductsPagedRequest, common_FilterConditions } from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import React, { FC, MouseEvent, useEffect, useState } from 'react';
import styles from 'styles/paged.scss';
import { Filter } from './filterComponents/filterProducts';
import { ListProducts } from './listProducts';
import useListProduct from './useListProduct/useListProduct';

export const PageProduct: FC = () => {
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

  const handleFilterChange = <
    K extends keyof GetProductsPagedRequest | keyof common_FilterConditions,
  >(
    key: K,
    value:
      | (K extends keyof GetProductsPagedRequest ? GetProductsPagedRequest[K] : never)
      | (K extends keyof common_FilterConditions ? common_FilterConditions[K] : never),
  ) => {
    setFilter(
      (prevFilter) =>
        ({
          ...prevFilter,
          ...(key in prevFilter
            ? { [key]: value }
            : {
                filterConditions: {
                  ...(prevFilter.filterConditions || {}),
                  [key]: value,
                },
              }),
        }) as GetProductsPagedRequest,
    );
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    fetchProducts(50, 0, filter);
  };

  return (
    <Layout>
      {deletionMessage && <div>{deletionMessage}</div>}
      <div className={styles.product_container}>
        <div className={styles.product_wrapper}>
          <ListProducts
            products={products}
            productClick={handleProductClick}
            deleteProduct={handleDeleteClick}
            confirmDeleteProductId={confirmDelete}
            deletingProductId={deletingProductId}
            showHidden={filter.showHidden}
          />
        </div>
        <Filter filter={filter} filterChange={handleFilterChange} onSubmit={handleSubmit} />
      </div>
    </Layout>
  );
};
