import { Grid, Typography } from '@mui/material';

import { UpdateProductRequest, common_MediaFull } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({
  product,
  id,
  fetchProduct,
  showMessage,
  setThumbnailId,
}) => {
  const [thumbnailPreview, setThumbnailPreview] = useState('');
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const { values, setFieldValue } = useFormikContext<UpdateProductRequest>();
  const saveThumbnail = async (newSelectedMedia: common_MediaFull[]) => {
    const thumbnail = newSelectedMedia[0].id;
    const thumbnailUrl = newSelectedMedia[0].media?.thumbnail?.mediaUrl ?? '';
    setThumbnailPreview(thumbnailUrl);
    setFieldValue('product.thumbnailMediaId', thumbnail);
    // const baseProductInsert = product?.product?.productDisplay?.thumbnail;
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
      ...(values.mediaIds || []),
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
            thumbnailPreview || product?.product?.productDisplay?.thumbnail?.thumbnail?.mediaUrl
          }
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
