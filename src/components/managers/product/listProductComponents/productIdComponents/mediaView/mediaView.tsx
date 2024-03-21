import { Grid } from '@mui/material';
import { addMediaByID } from 'api/admin';
import { updateProductById } from 'api/byID';
import { FC, useState } from 'react';
import { ProductIdProps } from '../utility/interfaces';
import { ProductMedias } from './components/productIdMedias';
import { Thumbnail } from './components/thumbnail';

export const MediaView: FC<ProductIdProps> = ({ product, id, fetchProduct }) => {
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);

  const saveSelectedMedia = (newSelectedMedia: string[]) => {
    setSelectedMedia(newSelectedMedia);
  };

  const handleAddMedia = async () => {
    if (selectedMedia.length === 0) {
      console.warn('No images selected.');
      return;
    }
    const addedMediaUrls = new Set();

    for (const imageUrl of selectedMedia) {
      const compressedUrl = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');

      if (addedMediaUrls.has(imageUrl)) {
        console.warn(`Image already added: ${imageUrl}`);
        continue;
      }
      addedMediaUrls.add(imageUrl);

      await addMediaByID({
        productId: Number(id),
        fullSize: imageUrl,
        thumbnail: imageUrl,
        compressed: compressedUrl,
      });
    }
    fetchProduct?.();
    setSelectedMedia([]);
  };

  const handleThumbnail = async () => {
    if (!product?.product || !selectedMedia.length) {
      return;
    }
    const thumbnailUrl = selectedMedia[0];

    const baseProductInsert = product.product.productInsert;

    if (baseProductInsert) {
      const updatedProductInsert = {
        ...baseProductInsert,
        thumbnail: thumbnailUrl,
      };
      await updateProductById({
        id: Number(id),
        product: updatedProductInsert,
      });
    }
    setSelectedMedia([]);
    fetchProduct();
  };

  return (
    <Grid container spacing={4} direction='column'>
      <Grid item xs={4}>
        <Thumbnail
          product={product}
          handleSelectedMedia={handleThumbnail}
          saveSelectedMedia={saveSelectedMedia}
        />
      </Grid>
      <Grid item xs={8}>
        <ProductMedias
          product={product}
          handleSelectedMedia={handleAddMedia}
          fetchProduct={fetchProduct}
          saveSelectedMedia={saveSelectedMedia}
        />
      </Grid>
    </Grid>
  );
};
