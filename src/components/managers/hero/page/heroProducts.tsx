import { common_Product } from 'api/proto-http/admin';
import { FC, useState } from 'react';
import styles from 'styles/hero.scss';

interface ProductProps {
  products: common_Product[] | undefined;
  productClick: (productId: number | undefined) => void;
  showHidden: boolean | undefined;
}

export const HeroProducts: FC<ProductProps> = ({ products, productClick, showHidden }) => {
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>(undefined);

  const handleProductClick = (productId: number | undefined) => {
    if (selectedProductId === productId) {
      setSelectedProductId(undefined);
    } else {
      setSelectedProductId(productId);
    }
    productClick(productId);
  };

  return (
    <ul className={styles.product_list}>
      {products?.map((product) => (
        <li
          key={product.id}
          onClick={() => handleProductClick(product.id)}
          className={`${product.productInsert?.hidden && showHidden ? styles.hidden_product : ''} ${
            selectedProductId === product.id ? styles.selected_product : ''
          }`}
        >
          <img src={product.productInsert?.thumbnail} alt='Product Image' />
          <h5>
            {product.productInsert?.name} - {product.id}
          </h5>
        </li>
      ))}
    </ul>
  );
};
