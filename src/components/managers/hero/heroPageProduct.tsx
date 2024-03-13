import { getProductsPaged } from 'api/admin';
import {
  GetProductsPagedRequest,
  GetProductsPagedResponse,
  common_Product,
} from 'api/proto-http/admin';
import arrow from 'img/arrow-right.jpg';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/hero.scss';
import { initialFilter } from '../product/listProductComponents/filterComponents/initialFilterStates';
import { HeroProducts } from './page/heroProducts';

interface HeroProductsProps {
  productIds: number[];
  setProductIds: (value: number[]) => void;
}

export const HeroPageProduct: FC<HeroProductsProps> = ({ productIds, setProductIds }) => {
  const [products, setProducts] = useState<common_Product[] | undefined>([]);
  const [showProduct, setShowProducts] = useState(false);
  const [showIdInput, setShowIdInput] = useState(false);
  const [idInput, setIdInput] = useState('');
  const [filter, setFilter] = useState<GetProductsPagedRequest>(initialFilter);
  const [currentPage, setCurrentPage] = useState(1);
  const calculateOffset = (page: number, limit: number) => (page - 1) * limit;

  const handleIdInput = () => {
    const productId = parseInt(idInput, 10);
    if (!isNaN(productId) && !productIds.includes(productId)) {
      setProductIds([...productIds, productId]);
      setIdInput('');
    }
  };

  const handleProductVisibility = () => {
    setShowProducts(!showProduct);
  };

  const handleIdInputVisibility = () => {
    setShowIdInput(!showIdInput);
  };

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
    if (index !== undefined && !productIds.includes(index)) {
      setProductIds([...productIds, index]);
    }
  };

  return (
    <div className={styles.ids_container}>
      <div className={styles.ids_wrapper}>
        <h2 className={styles.ids_title}>ids</h2>
        <div className={styles.ids}>
          <button type='button' className={styles.btn} onClick={handleProductVisibility}>
            list products
          </button>
          <button type='button' className={styles.btn} onClick={handleIdInputVisibility}>
            add by id
          </button>
          {showIdInput && (
            <div>
              <input
                type='text'
                placeholder='enter id'
                value={idInput}
                onChange={(e) => setIdInput(e.target.value)}
              />
              <button type='button' onClick={handleIdInput}>
                add
              </button>
            </div>
          )}
          <button type='button' className={styles.btn}>
            upload new
          </button>
        </div>
      </div>
      {showProduct && (
        <div className={styles.pagination_wrapper}>
          <div className={styles.pagination}>
            <button onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage <= 1}>
              <img src={arrow} alt='' style={{ rotate: '180deg' }} />
            </button>
          </div>
          <HeroProducts
            products={products}
            productClick={handleProductClick}
            showHidden={filter.showHidden}
          />
          <div className={styles.pagination}>
            <button onClick={() => setCurrentPage(currentPage + 1)}>
              <img src={arrow} alt='' />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
