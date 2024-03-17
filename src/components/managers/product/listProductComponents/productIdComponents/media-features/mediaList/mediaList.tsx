import { Button, Grid, IconButton } from '@mui/material';
import { deleteMediaById } from 'api/byID';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaListProps } from '../../utility/interfaces';
import { MediaListPicker } from './mediaListComponents/mediaListPicker';

export const MediaList: FC<MediaListProps> = ({
  product,
  media,
  setMedia,
  reload,
  select,
  handleImage,
  url,
  setUrl,
  updateNewMediaByUrl,
  selectedMedia,
  fetchProduct,
}) => {
  const [mediaPicker, setMediaPicker] = useState(false);

  const handleMediaPickerVisibility = () => {
    setMediaPicker(!mediaPicker);
  };

  const handleDeleteMedia = async (id: number | undefined) => {
    await deleteMediaById({ productMediaId: id });
    fetchProduct();
  };

  return (
    <>
      <Grid container gap={5} className={styles.listed_media_container}>
        {product?.media?.map((media) => (
          <Grid item xs={5} key={media.id} className={styles.listed_media_wrapper}>
            <img src={media.productMediaInsert?.fullSize} alt='media' className={styles.media} />
            <IconButton
              aria-label='delete'
              size='small'
              onClick={() => handleDeleteMedia(media.id)}
              className={styles.media_btn}
            >
              x
            </IconButton>
          </Grid>
        ))}
        <Grid item>
          <Button
            variant='contained'
            sx={{ backgroundColor: 'black', cursor: 'pointer' }}
            onClick={handleMediaPickerVisibility}
            size='medium'
          >
            upload new media
          </Button>
        </Grid>
      </Grid>
      <div>
        {mediaPicker && (
          <MediaListPicker
            reload={reload}
            url={url}
            setUrl={setUrl}
            updateNewMediaByUrl={updateNewMediaByUrl}
            closeThumbnailPicker={handleMediaPickerVisibility}
            media={media}
            setMedia={setMedia}
            handleImage={handleImage}
            select={select}
            selectedMedia={selectedMedia}
          />
        )}
      </div>
    </>
  );
};
