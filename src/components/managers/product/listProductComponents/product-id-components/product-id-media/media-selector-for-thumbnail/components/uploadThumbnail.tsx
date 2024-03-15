import { Button, Grid, TextField } from '@mui/material';
import { updateThumbnail } from 'api/byID';
import { FC, useState } from 'react';
import { ThumbnailProps } from '../../../interfaces-type/thumbnailInterface';

export const UploadThumbnail: FC<ThumbnailProps> = ({ product, setProduct, id }) => {
  const [thumbnail, setThumbnail] = useState<string>('');

  const handleThumbnail = async () => {
    await updateThumbnail({
      productId: Number(id),
      thumbnail: thumbnail,
    });

    displayNewThumbnail(thumbnail);
    setThumbnail('');
  };

  const handleChangeThumbnail = (e: React.ChangeEvent<HTMLInputElement>) => {
    setThumbnail(e.target.value);
  };

  const displayNewThumbnail = (thumb: string | undefined) => {
    if (product && product.product && product.product.productInsert) {
      setProduct?.({
        ...product,
        product: {
          ...product.product,
          productInsert: {
            ...product.product.productInsert,
            thumbnail: thumb,
          },
        },
      });
    }
  };
  return (
    <Grid container spacing={2}>
      <Grid item>
        <TextField
          size='small'
          value={thumbnail}
          onChange={handleChangeThumbnail}
          label='upload new thumbnail'
        />
      </Grid>
      <Grid item>
        <Button variant='contained' onClick={handleThumbnail}>
          upload
        </Button>
      </Grid>
    </Grid>
  );
};
