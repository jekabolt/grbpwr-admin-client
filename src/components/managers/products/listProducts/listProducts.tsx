import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { Grid, IconButton, Typography } from '@mui/material';
import { common_Product } from 'api/proto-http/admin';
import { TruncateText } from 'components/common/truncateText';
import { isVideo } from 'features/utilitty/filterContentType';
import React, { FC, useState } from 'react';
import styles from 'styles/paged.scss';

interface ProductProps {
  products: common_Product[] | undefined;
  productClick: (productId: number | undefined) => void;
  copy: (productId: number | undefined) => void;
  deleteProduct: (e: React.MouseEvent<HTMLButtonElement>, productId: number | undefined) => void;
  confirmDeleteProductId: number | undefined;
  deletingProductId: number | undefined;
  showHidden: boolean | undefined;
}

export const ListProducts: FC<ProductProps> = ({
  products,
  productClick,
  copy,
  deleteProduct,
  confirmDeleteProductId,
  deletingProductId,
  showHidden,
}) => {
  const [hoveredProductId, setHoveredProductId] = useState<number | undefined>(undefined);

  return (
    <Grid container spacing={3} justifyContent='flex-start'>
      {products?.map((product) => (
        <Grid item xs={12} md={4} lg={3}>
          <Grid container>
            <Grid
              item
              xs={12}
              key={product.id}
              onMouseEnter={() => setHoveredProductId(product.id)}
              onMouseLeave={() => setHoveredProductId(undefined)}
              onClick={() => productClick(product.id)}
              className={`${styles.product} ${product.productDisplay?.productBody?.hidden && showHidden ? styles.hidden_product : ''}`}
            >
              {deletingProductId === product.id ? (
                <Typography variant='h4'>product removed</Typography>
              ) : isVideo(product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl) ? (
                <video
                  src={product.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl}
                  controls
                />
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
              <IconButton
                onClick={(e) => {
                  e.stopPropagation();
                  copy(product.id);
                }}
                className={styles.copy_btn}
              >
                <ContentCopyIcon />
              </IconButton>
            </Grid>
            <Grid item xs={12}>
              <TruncateText
                text={`[${product.id}] ${product.productDisplay?.productBody?.brand} ${product.productDisplay?.productBody?.name}`}
                length={28}
              />
            </Grid>
          </Grid>
        </Grid>
      ))}
    </Grid>
  );
};
