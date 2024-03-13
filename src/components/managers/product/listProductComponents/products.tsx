import { common_Product } from 'api/proto-http/admin';
import React, { FC, useState } from 'react';
import styles from 'styles/paged.scss';

interface ProductProps {
  products: common_Product[] | undefined;
  productClick: (productId: number | undefined) => void;
  deleteProduct: (e: React.MouseEvent<HTMLButtonElement>, productId: number | undefined) => void;
  confirmDeleteProductId: number | undefined;
  deletingProductId: number | undefined;
  showHidden: boolean | undefined;
}

export const Products: FC<ProductProps> = ({
  products,
  productClick,
  deleteProduct,
  confirmDeleteProductId,
  deletingProductId,
  showHidden,
}) => {
  const [hoveredProductId, setHoveredProductId] = useState<number | undefined>(undefined);

  return (
    <ul className={styles.product_list}>
      {products?.map((product) => (
        <li
          key={product.id}
          onMouseEnter={() => setHoveredProductId(product.id)}
          onMouseLeave={() => setHoveredProductId(undefined)}
          onClick={() => productClick(product.id)}
          className={`${product.productInsert?.hidden && showHidden ? styles.hidden_product : ''}`}
        >
          {hoveredProductId === product.id && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteProduct(e, product.id);
              }}
              style={{ backgroundColor: confirmDeleteProductId === product.id ? 'red' : 'initial' }}
            >
              {confirmDeleteProductId === product.id ? 'Sure?' : 'X'}
            </button>
          )}
          {deletingProductId === product.id ? (
            <div>OK</div>
          ) : (
            <img src={product.productInsert?.thumbnail} alt='Product Image' />
          )}
          <h5>
            {product.productInsert?.name} - {product.id}
          </h5>
        </li>
      ))}
    </ul>
  );
};
