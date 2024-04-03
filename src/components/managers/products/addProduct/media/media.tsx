import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, ImageList, ImageListItem } from '@mui/material';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { FC, useState } from 'react';
import styles from 'styles/addProd.scss';
import { AddProductMediaInterface } from '../interface/interface';

export const Media: FC<AddProductMediaInterface> = ({ product, setProduct }) => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string[]>([]);

  const uploadThumbnailInProduct = (newSelectedMedia: string[]) => {
    if (!product.product || !newSelectedMedia.length) {
      return;
    }

    const thumbnailUrl = newSelectedMedia[0];
    setImagePreviewUrl(thumbnailUrl);

    setProduct((prevProduct) => {
      const updatedProduct = { ...prevProduct };
      if (updatedProduct.product) {
        updatedProduct.product = {
          ...updatedProduct.product,
          thumbnail: thumbnailUrl,
        };
      }

      return updatedProduct;
    });
  };

  const uploadMediasInProduct = (newSelectedMedia: string[]) => {
    if (newSelectedMedia.length === 0) {
      alert('no selected media');
    }

    const newMedia = newSelectedMedia.map((imageUrl) => {
      const compressed = imageUrl.replace(/-og\.jpg$/, '-compressed.jpg');
      const thumbnail = imageUrl.replace(/-og\.jpg$/, '-thumbnail.jpg');

      return {
        fullSize: imageUrl,
        thumbnail: thumbnail,
        compressed: compressed,
      };
    });

    setMediaPreview((prevPreview) => [...prevPreview, ...newSelectedMedia]);

    setProduct((prevProduct) => ({
      ...prevProduct,
      media: [...(prevProduct.media || []), ...newMedia],
    }));
  };

  const removeSelectedMedia = (mediaUrlToRemove: string) => {
    setMediaPreview((currentMedia) => currentMedia.filter((url) => url !== mediaUrlToRemove));

    setProduct((currentProduct) => {
      const updatedMedia = currentProduct.media?.filter(
        (media) => media.fullSize !== mediaUrlToRemove,
      );
      return { ...currentProduct, media: updatedMedia };
    });
  };
  return (
    <Grid container display='grid' spacing={2}>
      <Grid item xs={10} width={500}>
        <SingleMediaViewAndSelect
          link={imagePreviewUrl}
          saveSelectedMedia={uploadThumbnailInProduct}
        />
      </Grid>
      <Grid item xs={5}>
        <MediaSelectorLayout
          allowMultiple={true}
          saveSelectedMedia={uploadMediasInProduct}
          label='select media'
        />
      </Grid>
      <Grid item>
        {mediaPreview && (
          <ImageList
            cols={2}
            gap={8}
            sx={{
              width: '70%',
              height: 'auto',
            }}
            rowHeight={220}
          >
            {mediaPreview.map((media, id) => (
              <ImageListItem key={id} className={styles.media_item}>
                <img
                  src={media}
                  alt=''
                  style={{ width: '100%', height: '220px', objectFit: 'scale-down' }}
                />
                <IconButton
                  onClick={() => removeSelectedMedia(media)}
                  className={styles.delete_btn}
                >
                  <ClearIcon />
                </IconButton>
              </ImageListItem>
            ))}
          </ImageList>
        )}
      </Grid>
    </Grid>
  );
};
