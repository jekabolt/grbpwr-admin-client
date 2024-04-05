import ClearIcon from '@mui/icons-material/Clear';
import { Grid, IconButton, ImageList, ImageListItem } from '@mui/material';
import { common_ProductNew } from 'api/proto-http/admin';
import { SingleMediaViewAndSelect } from 'components/common/singleMediaViewAndSelect';
import { MediaSelectorLayout } from 'features/mediaSelector/mediaSelectorLayout';
import { useFormikContext } from 'formik';
import { FC, useState } from 'react';
import styles from 'styles/addProd.scss';

export const Media: FC = () => {
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [mediaPreview, setMediaPreview] = useState<string[]>([]);
  const { values, setFieldValue } = useFormikContext<common_ProductNew>();

  const uploadThumbnailInProduct = (newSelectedMedia: string[]) => {
    if (!newSelectedMedia.length) {
      return;
    }
    const thumbnailUrl = newSelectedMedia[0];
    setImagePreviewUrl(thumbnailUrl);

    setFieldValue('product.thumbnail', thumbnailUrl);
  };

  const uploadMediasInProduct = (newSelectedMedia: string[]) => {
    if (newSelectedMedia.length === 0) {
      alert('No selected media');
      return;
    }

    const newMedia = newSelectedMedia.map((imageUrl) => ({
      fullSize: imageUrl,
      thumbnail: imageUrl.replace(/-og\.jpg$/, '-thumbnail.jpg'),
      compressed: imageUrl.replace(/-og\.jpg$/, '-compressed.jpg'),
    }));

    setMediaPreview((prevPreview) => [...prevPreview, ...newSelectedMedia]);

    const updatedMediaList = [...(values.media || []), ...newMedia];
    setFieldValue('media', updatedMediaList);
  };

  const removeSelectedMedia = (mediaUrlToRemove: string) => {
    setMediaPreview((currentMedia) => currentMedia.filter((url) => url !== mediaUrlToRemove));

    const updatedMedia = values.media?.filter((media) => media.fullSize !== mediaUrlToRemove);

    setFieldValue('media', updatedMedia || []);
  };

  return (
    <Grid container display='grid' spacing={2}>
      <Grid item xs={11}>
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
            className={styles.media_list}
          >
            {mediaPreview.map((media, id) => (
              <ImageListItem key={id} className={styles.media_item}>
                <img src={media} alt='' className={styles.media} />
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
