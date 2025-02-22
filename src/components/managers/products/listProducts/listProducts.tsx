import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import { Button, Grid2 as Grid, IconButton, Typography } from '@mui/material';
import { TruncateText } from 'components/ui/components/truncateText';
import { isVideo } from 'lib/features/filterContentType';
import { useProductStore } from 'lib/stores/product/store';
import React, { FC, useState } from 'react';
// import styles from 'styles/paged.scss';

interface ProductProps {
  confirmDeleteProductId: number | undefined;
  deletingProductId: number | undefined;
  showHidden: boolean | undefined;
  productClick: (productId: number | undefined) => void;
  copy: (productId: number | undefined) => void;
  deleteProduct: (e: React.MouseEvent<HTMLButtonElement>, productId: number | undefined) => void;
}

export const ListProducts: FC<ProductProps> = ({
  confirmDeleteProductId,
  deletingProductId,
  showHidden,
  productClick,
  copy,
  deleteProduct,
}) => {
  const products = useProductStore((state) => state.products);
  const [hoveredProductId, setHoveredProductId] = useState<number | undefined>(undefined);

  return (
    <Grid container spacing={3} justifyContent='flex-start'>
      {products?.map((product) => (
        <Grid size={{ xs: 6, md: 4, lg: 3 }}>
          <Grid container>
            <Grid
              size={{ xs: 12 }}
              key={product.id}
              onMouseEnter={() => setHoveredProductId(product.id)}
              onMouseLeave={() => setHoveredProductId(undefined)}
              onClick={() => productClick(product.id)}
              // className={`${styles.product} ${product.productDisplay?.productBody?.hidden && showHidden ? styles.hidden_product : ''}`}
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
                  // className={styles.delete_btn}
                >
                  {confirmDeleteProductId === product.id ? <CheckIcon /> : <CloseIcon />}
                </IconButton>
              )}
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  copy(product.id);
                }}
                // className={styles.copy_btn}
                size='small'
                variant='contained'
              >
                copy
              </Button>
            </Grid>
            <Grid size={{ xs: 12 }}>
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
