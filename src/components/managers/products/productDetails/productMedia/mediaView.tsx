import { Grid, Typography } from '@mui/material';
import { common_MediaFull, common_ProductNew } from 'api/proto-http/admin';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product }) => {
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();
  const [mediaPreview, setMediaPreview] = useState<common_MediaFull[]>([]);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | undefined>('');

  const saveThumbnail = async (newSelectedMedia: common_MediaFull[]) => {
    const thumbnail = newSelectedMedia[0].id;
    setThumbnailPreview(newSelectedMedia[0].media?.thumbnail?.mediaUrl);
    setFieldValue('product.thumbnailMediaId', thumbnail);
  };

  const saveMedia = async (newSelectedMedia: common_MediaFull[]) => {
    const updatedMediaIds = [
      ...(values.mediaIds || []),
      ...newSelectedMedia.map((media) => media.id),
    ];
    const uniqueMediaIds = Array.from(new Set(updatedMediaIds));
    setMediaPreview((prevPreview) => [
      ...prevPreview,
      ...newSelectedMedia.filter((media) => !prevPreview.some((prev) => prev.id === media.id)),
    ]);
    setFieldValue('mediaIds', uniqueMediaIds);
  };

  const deleteMediaFromProduct = async (id: number | undefined) => {
    if (!id) {
      alert('no id');
      return;
    }
    setMediaPreview((prevPreview) => prevPreview.filter((media) => media.id !== id));
    const updatedMediaIds = values.mediaIds?.filter((mediaId) => mediaId !== id);
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
        <ProductMedias
          product={product}
          mediaPreview={mediaPreview}
          deleteMediaFromProduct={deleteMediaFromProduct}
          saveSelectedMedia={saveMedia}
        />
      </Grid>
    </Grid>
  );
};
