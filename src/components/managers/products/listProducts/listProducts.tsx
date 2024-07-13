import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_Product } from 'api/proto-http/admin';
import { isVideo } from 'features/utilitty/filterContentType';
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

  return (
    <Grid container spacing={3} justifyContent='flex-start'>
      {products?.map((product) => (
        <Grid
          key={product.id}
          item
          onMouseEnter={() => setHoveredProductId(product.id)}
          onMouseLeave={() => setHoveredProductId(undefined)}
          onClick={() => productClick(product.id)}
          className={`${styles.product} ${product.productDisplay?.productBody?.hidden && showHidden ? styles.hidden_product : ''}`}
          xs={12}
          md={4}
          lg={3}
        >
          {deletingProductId === product.id ? (
            <Typography variant='h4'>product removed</Typography>
          ) : isVideo(product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl) ? (
            <video src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl} controls />
          ) : (
            <img
              src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl}
              alt='Product Image'
            />
          )}
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
          <Typography
            variant='overline'
            noWrap
            className={styles.info}
          >{`[${product.id}] ${product.productDisplay?.productBody?.brand} ${product.productDisplay?.productBody?.name}`}</Typography>
        </Grid>
      ))}
    </Grid>
  );
};
