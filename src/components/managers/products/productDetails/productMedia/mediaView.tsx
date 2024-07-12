import { Grid, Typography } from '@mui/material';

import { UpsertProductRequest, common_MediaFull } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product }) => {
  const { values, setFieldValue } = useFormikContext<UpsertProductRequest>();
  const [thumbnailPreview, setThumbnailPreview] = useState<string | undefined>('');

  const saveThumbnail = async (newSelectedMedia: common_MediaFull[]) => {
    const thumbnail = newSelectedMedia[0].id;
    setThumbnailPreview(newSelectedMedia[0].media?.thumbnail?.mediaUrl);
    setFieldValue('product.thumbnailMediaId', thumbnail);
  };

  const saveMedia = async (newSelectedMedia: common_MediaFull[]) => {
    const mediaIds = newSelectedMedia
      .map((media) => media.id)
      .filter((id) => id !== undefined) as number[];

    if (mediaIds.length === 0) {
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
          link={
            thumbnailPreview ||
            product?.product?.productDisplay?.thumbnail?.media?.thumbnail?.mediaUrl
          }
          saveSelectedMedia={saveThumbnail}
        />
      </Grid>
      <Grid item xs={12}>
        <Typography variant='h4' textTransform='uppercase'>
          media
        </Typography>
        <ProductMedias product={product} saveSelectedMedia={saveMedia} />
      </Grid>
    </Grid>
  );
};
