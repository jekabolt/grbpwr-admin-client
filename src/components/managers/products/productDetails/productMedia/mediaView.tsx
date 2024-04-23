import { Grid } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { updateProductById } from 'api/updateProductsById';
import { FC } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product, id, fetchProduct, showMessage }) => {
  const saveThumbnail = async (newSelectedMedia: string[]) => {
    const thumbnailUrl = newSelectedMedia[0];

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

  const saveMedia = async (newSelectedMedia: string[]) => {
    const addedMediaUrls = new Set();

    for (const imageUrl of newSelectedMedia) {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      if (addedMediaUrls.has(imageUrl)) {
        return;
      }
      addedMediaUrls.add(imageUrl);
      try {
        const response = await addMediaByID({
          productId: Number(id),
          fullSize: imageUrl,
          thumbnail: imageUrl,
          compressed: compressedUrl,
        });

        showMessage('PRODUCT HAS BEEN UPLOADED');

        if (response) {
          fetchProduct();
        }
      } catch (error) {
        showMessage('FAILED TO UPLOAD PROUCT WITH NEW MEDIAS');
      }
    }
  };

  return (
    <Grid container spacing={4}>
      <Grid item xs={12}>
        <SingleMediaViewAndSelect
          link={product?.product?.productInsert?.thumbnail}
          saveSelectedMedia={saveThumbnail}
        />
      </Grid>
      <Grid item xs={12}>
        <ProductMedias
          product={product}
          fetchProduct={fetchProduct}
          saveSelectedMedia={saveMedia}
        />
      </Grid>
    </Grid>
  );
};
