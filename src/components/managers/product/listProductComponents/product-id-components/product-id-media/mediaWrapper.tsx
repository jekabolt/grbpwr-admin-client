import { Grid } from '@mui/material';
import { FC } from 'react';
import { ThumbnailProps } from '../interfaces-type/thumbnailInterface';
import { ListedMedia } from './thumbnail-listedMedia-mediaSelector/listedMedia';
import { Thumbnail } from './thumbnail-listedMedia-mediaSelector/thumbnail';

export const MediaWrapper: FC<ThumbnailProps> = ({ product, setProduct, id }) => {
  return (
    <Grid container style={{ border: '1px solide black' }} direction='column' spacing={6}>
      <Grid item xs={4}>
        <Thumbnail product={product} setProduct={setProduct} id={id} />
      </Grid>
      <Grid item xs={8}>
        <ListedMedia product={product} setProduct={setProduct} />
      </Grid>
    </Grid>
  );
};
