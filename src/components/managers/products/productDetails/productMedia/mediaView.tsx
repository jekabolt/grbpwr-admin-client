import { Grid, Typography } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { common_MediaFull } from 'api/proto-http/admin';
import { updateProductById } from 'api/updateProductsById';
import { FC } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product, id, fetchProduct, showMessage }) => {
  const saveThumbnail = async (newSelectedMedia: common_MediaFull[]) => {
    const thumbnailUrl = newSelectedMedia[0].media?.thumbnail?.mediaUrl ?? '';

    const baseProductInsert = product?.product?.productInsert;

    if (baseProductInsert) {
      const updatedProductInsert = {
        ...baseProductInsert,
        thumbnail: thumbnailUrl,
      };
      const response = await updateProductById({
        id: Number(id),
        product: updatedProductInsert,
      });
      if (response) {
        fetchProduct();
      }
    }
  };

  const saveMedia = async (newSelectedMedia: common_MediaFull[]) => {
    const mediaIds = newSelectedMedia
      .map((media) => media.id)
      .filter((id) => id !== undefined) as number[];

    if (mediaIds.length === 0) {
      showMessage('NO MEDIAS SELECTED FOR UPLOAD', 'error');
      return;
    }

    try {
      const response = await addMediaByID({
        productId: Number(id),
        mediaIds,
      });

      showMessage('PRODUCT HAS BEEN UPLOADED', 'success');

      if (response) {
        fetchProduct();
      }
    } catch (error) {
      showMessage('FAILED TO UPLOAD PRODUCT WITH NEW MEDIAS', 'error');
    }
  };

  return (
    <Grid container spacing={4}>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          thumbnail
        </Typography>
        <SingleMediaViewAndSelect
          link={product?.product?.productInsert?.thumbnail}
          saveSelectedMedia={saveThumbnail}
        />
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          product medias
        </Typography>
        <ProductMedias
          product={product}
          fetchProduct={fetchProduct}
          saveSelectedMedia={saveMedia}
        />
      </Grid>
    </Grid>
  );
};
