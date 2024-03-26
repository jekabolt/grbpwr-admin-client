import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { IconButton } from '@mui/material';
import { common_Product } from 'api/proto-http/admin';
import { fileExtensionToContentType } from 'components/managers/media/mediaManager';
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

export const ListProducts: FC<ProductProps> = ({
  products,
  productClick,
  deleteProduct,
  confirmDeleteProductId,
  deletingProductId,
  showHidden,
}) => {
  const [hoveredProductId, setHoveredProductId] = useState<number | undefined>(undefined);

  const isVideo = (mediaUrl: string | undefined) => {
    if (mediaUrl) {
      const extension = mediaUrl.split('.').pop()?.toLowerCase();

      if (extension) {
        const contentType = fileExtensionToContentType[extension];
        return contentType?.startsWith('video/');
      }
    }
    return false;
  };

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
            <IconButton
              onClick={(e) => {
                e.stopPropagation();
                deleteProduct(e, product.id);
              }}
              className={styles.delete_btn}
            >
              {confirmDeleteProductId === product.id ? <CheckIcon /> : <CloseIcon />}
            </IconButton>
          )}
          {deletingProductId === product.id ? (
            <div>OK</div>
          ) : isVideo(product.productInsert?.thumbnail) ? (
            <video src={product.productInsert?.thumbnail} controls />
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
