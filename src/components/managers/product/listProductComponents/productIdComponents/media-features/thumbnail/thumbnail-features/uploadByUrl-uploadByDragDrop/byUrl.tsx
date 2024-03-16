import { Button, Grid, TextField } from '@mui/material';
import { updateThumbnail } from 'api/byID';
import { FC, useState } from 'react';
import { ProductIdMediaProps } from '../../../../utility/interfaces';

export const ByUrl: FC<ProductIdMediaProps> = ({ product, setProduct, id }) => {
  const [thumbnail, setThumbnail] = useState<string>('');

  const updateNewThumbnail = async () => {
    await updateThumbnail({
      productId: Number(id),
      thumbnail: thumbnail,
    });
    if (product && product.product && product.product.productInsert) {
      const updatedProductInsert = {
        ...product.product.productInsert,
        thumbnail: thumbnail,
      };
      const updatedProduct = {
        ...product.product,
        productInsert: updatedProductInsert,
      };

      setProduct?.({ ...product, product: updatedProduct });
    }
  };
  return (
    <Grid container spacing={2}>
      <Grid item>
        <TextField
          size='small'
          label='upload new thumbnail'
          value={thumbnail}
          onChange={(e) => setThumbnail(e.target.value)}
        />
      </Grid>
      <Grid item>
        <Button
          variant='contained'
          size='medium'
          sx={{ backgroundColor: 'black' }}
          onClick={updateNewThumbnail}
        >
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
