import { Grid } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { updateProductById } from 'api/updateProductsById';
import { FC } from 'react';
import { SingleMediaViewAndSelect } from '../../../../common/singleMediaViewAndSelect';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';

export const MediaView: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const saveThumbnail = async (newSelectedMedia: string[]) => {
    if (!product?.product || !newSelectedMedia.length) {
      return;
    }
    const thumbnailUrl = newSelectedMedia[0];

    const baseProductInsert = product.product.productInsert;

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
    if (newSelectedMedia.length === 0) {
      console.warn('No images selected.');
      return;
    }
    const addedMediaUrls = new Set();

    for (const imageUrl of newSelectedMedia) {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');

      if (addedMediaUrls.has(imageUrl)) {
        console.warn(`Image already added: ${imageUrl}`);
        continue;
      }
      addedMediaUrls.add(imageUrl);
      const response = await addMediaByID({
        productId: Number(id),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });

      if (response) {
        fetchProduct();
      }
    }
  };
  return (
    <Grid container spacing={4} direction='column'>
      <Grid item xs={4}>
        <SingleMediaViewAndSelect
          link={product?.product?.productInsert?.thumbnail}
          saveSelectedMedia={saveThumbnail}
        />
      </Grid>
      <Grid item xs={8}>
        <ProductMedias
          product={product}
          fetchProduct={fetchProduct}
          saveSelectedMedia={saveMedia}
        />
      </Grid>
    </Grid>
  );
};
