import { Grid } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { updateProductById } from 'api/byID';
import { FC } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';
import { SingleMediaViewAndSelect } from './components/singleMediaViewAndSelect';

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
      // TODO: fetchProduct need to wait till ipdateProduct completed
      await updateProductById({
        id: Number(id),
        product: updatedProductInsert,
      });
      fetchProduct();
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
      // TODO: fetchProduct need to wait till ipdateProduct completed
      await addMediaByID({
        productId: Number(id),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });
    }
    fetchProduct();
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
