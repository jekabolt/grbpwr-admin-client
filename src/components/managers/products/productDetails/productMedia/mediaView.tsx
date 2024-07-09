import { Grid, Typography } from '@mui/material';

import { UpsertProductRequest, common_MediaFull } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product, fetchProduct, showMessage }) => {
  const { values, setFieldValue } = useFormikContext<UpsertProductRequest>();

  const saveThumbnail = async (newSelectedMedia: common_MediaFull[]) => {
    const thumbnail = newSelectedMedia[0].id;
    setFieldValue('product.thumbnailMediaId', thumbnail);
  };

  const saveMedia = async (newSelectedMedia: common_MediaFull[]) => {
    const mediaIds = newSelectedMedia
      .map((media) => media.id)
      .filter((id) => id !== undefined) as number[];

    if (mediaIds.length === 0) {
      showMessage('NO MEDIAS SELECTED FOR UPLOAD', 'error');
      return;
    }
    const updatedMediaIds = [
      ...(values.product?.mediaIds || []),
      ...newSelectedMedia.map((media) => media.id),
    ];
    setFieldValue('mediaIds', updatedMediaIds);
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          thumbnail
        </Typography>
        <SingleMediaViewAndSelect
          link={product?.product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl}
          saveSelectedMedia={saveThumbnail}
        />
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          media
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
