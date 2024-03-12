import { useNavigate } from '@tanstack/react-location';
import { deleteProductByID, getProductsPaged } from 'api/admin';
import {
  GetProductsPagedRequest,
  GetProductsPagedResponse,
  common_FilterConditions,
  common_Product,
} from 'api/proto-http/admin';
import { Layout } from 'components/login/layout';
import { ROUTES } from 'constants/routes';
import React, { FC, MouseEvent, useEffect, useState } from 'react';
import styles from 'styles/paged.scss';
import { Filter } from './componentsOfPageProduct/filterProducts';
import { initialFilter } from './componentsOfPageProduct/initialFilterStates';
import { Products } from './componentsOfPageProduct/products';

export const PageProduct: FC = () => {
  const [products, setProducts] = useState<common_Product[] | undefined>([]);
  const [filter, setFilter] = useState<GetProductsPagedRequest>(initialFilter);
  const [currentPage, setCurrentPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | undefined>(undefined);
  const [deletionMessage, setDeletionMessage] = useState('');
  const [deletingProductId, setDeletingProductId] = useState<number | undefined>(undefined);
  const calculateOffset = (page: number, limit: number) => (page - 1) * limit;
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, [currentPage]);

  const fetchData = async () => {
    const newLimit = filter.limit || 6;
    const offset = calculateOffset(currentPage, newLimit);
    const response: GetProductsPagedResponse = await getProductsPaged({
      ...filter,
      limit: newLimit,
      offset,
    });

    setProducts(response.products ? response.products.slice(0, newLimit) : []);
  };

  const handleProductClick = (index: number | undefined) => {
    navigate({ to: `${ROUTES.singleProduct}/${index}`, replace: true });
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
    fetchData();
  };

  return (
    <Layout>
      {deletionMessage && <div>{deletionMessage}</div>}
      <div className={styles.product_container}>
        <div className={styles.product_wrapper}>
          <Products
            products={products}
            productClick={handleProductClick}
            deleteProduct={handleDeleteClick}
            confirmDeleteProductId={confirmDelete}
            deletingProductId={deletingProductId}
            showHidden={filter.showHidden}
          />
          <div className={styles.product_pagination}>
            <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1}>
              Prev
            </button>
            <button onClick={() => setCurrentPage(currentPage + 1)}>Next</button>
          </div>
        </div>
        <Filter filter={filter} filterChange={handleFilterChange} onSubmit={handleSubmit} />
      </div>
    </Layout>
  );
};
