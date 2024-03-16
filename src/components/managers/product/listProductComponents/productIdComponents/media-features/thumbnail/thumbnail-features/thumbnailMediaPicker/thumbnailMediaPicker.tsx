import { Button, Grid, IconButton, ImageList, ImageListItem } from '@mui/material';
import { deleteFiles } from 'api/admin';
import { updateThumbnail } from 'api/byID';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ProductIdMediaProps } from '../../../../utility/interfaces';

export const ThumbnailMediaPicker: FC<ProductIdMediaProps> = ({
  media,
  setMedia,
  setProduct,
  product,
  id,
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const select = (imageUrl: string | null) => {
    setSelectedImage((prevSelectedImage) => (prevSelectedImage === imageUrl ? null : imageUrl));
  };

  const handleThumbnail = async () => {
    if (!product?.product) {
      return;
    }

    if (!selectedImage) {
      return;
    }

    await updateThumbnail({
      productId: Number(id),
      thumbnail: selectedImage,
    });

    if (product && product.product && product.product.productInsert) {
      const updatedProductInsert = {
        ...product.product.productInsert,
        thumbnail: selectedImage,
      };
      const updatedProduct = {
        ...product.product,
        productInsert: updatedProductInsert,
      };

      setProduct?.({ ...product, product: updatedProduct });
    }
  };

  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    setMedia?.((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  return (
    <Grid container spacing={2} justifyContent='center'>
      <Grid item>
        {media && (
          <ImageList
            variant='standard'
            sx={{ width: 400, height: 400, padding: 2 }}
            cols={3}
            gap={8}
            className={styles.thumbnail_picker_list}
            rowHeight={220}
          >
            {media.map((m) => (
              <ImageListItem key={m.id} className={styles.thumbnail_picker_item_wrapper}>
                <input
                  type='checkbox'
                  checked={selectedImage?.includes(m.media?.fullSize ?? '')}
                  onChange={() => select(m.media?.fullSize ?? '')}
                  id={`${m.id}`}
                  style={{ display: 'none' }}
                />
                <label htmlFor={`${m.id}`}>
                  {selectedImage?.includes(m.media?.fullSize ?? '') ? (
                    <span className={styles.media_selector_img_number}>selected</span>
                  ) : null}
                  <img
                    key={m.id}
                    src={m.media?.fullSize}
                    alt='video'
                    className={`${
                      selectedImage?.includes(m.media?.fullSize ?? '') ? styles.selected_media : ''
                    }`}
                  />
                </label>
                <IconButton
                  sx={{ backgroundColor: 'black', color: 'white' }}
                  aria-label='delete'
                  size='small'
                  onClick={() => handleDeleteFile(m.id)}
                  className={styles.thumb_picker_delete_btn}
                >
                  x
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        )}
      </Grid>
      <Grid item>
        <Button
          onClick={handleThumbnail}
          variant='contained'
          size='medium'
          sx={{ backgroundColor: 'black' }}
        >
          add
        </Button>
      </Grid>
    </Grid>
  );
};
