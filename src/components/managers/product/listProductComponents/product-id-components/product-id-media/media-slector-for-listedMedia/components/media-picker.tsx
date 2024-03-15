import { Button, Grid, IconButton, ImageList, ImageListItem } from '@mui/material';
import { deleteFiles } from 'api/admin';
import { FC, useState } from 'react';
import styles from 'styles/product-id-media.scss';
import { ThumbnailProps } from '../../../interfaces-type/thumbnailInterface';

export const MediaPicker: FC<ThumbnailProps> = ({ mediaFile, isLoading, setMediaFile, id }) => {
  const [mediaNumber, setMediaNumber] = useState<number[]>([]);
  const [selectedImage, setSelectedImage] = useState<string[]>([]);

  const select = (imageUrl: string | number | undefined) => {
    if (typeof imageUrl === 'string') {
      if (setSelectedImage) {
        if (selectedImage?.includes(imageUrl)) {
          setSelectedImage((prevSelectedImage) =>
            prevSelectedImage?.filter((image) => image !== imageUrl),
          );
        } else {
          setSelectedImage([...(selectedImage || []), imageUrl]);
        }
      }
    } else if (typeof imageUrl === 'number') {
      if (mediaNumber.includes(imageUrl)) {
        setMediaNumber((prevMediaNumber) =>
          prevMediaNumber.filter((imageIndex) => imageIndex !== imageUrl),
        );
      } else {
        setMediaNumber([...mediaNumber, imageUrl]);
      }
    }
  };

  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    if (setMediaFile) {
      setMediaFile((currentFiles) => currentFiles?.filter((file) => file.id !== id));
    }
  };
  return (
    <Grid
      container
      spacing={2}
      justifyContent='center'
      className={styles.product_id_media_picker_container}
    >
      <Grid item>
        {mediaFile && (
          <ImageList
            sx={{ width: 400, height: 400, padding: 1 }}
            cols={3}
            gap={8}
            rowHeight={220}
            className={styles.media_picker_list}
          >
            {mediaFile.map((media) => (
              <ImageListItem key={media.id} className={styles.media_picker_item}>
                <input
                  type='checkbox'
                  checked={selectedImage?.includes(media.media?.fullSize ?? '')}
                  onChange={() => select(media.media?.fullSize ?? '')}
                  id={`${media.id}`}
                  style={{ display: 'none' }}
                />
                <label htmlFor={`${media.id}`}>
                  {selectedImage?.includes(media.media?.fullSize ?? '') ? (
                    <span className={styles.span}>
                      {selectedImage.indexOf(media.media?.fullSize ?? '') + 1}
                    </span>
                  ) : null}
                  <img src={media.media?.fullSize} alt='image' />
                </label>

                <IconButton
                  size='small'
                  onClick={() => handleDeleteFile(media.id)}
                  className={styles.media_picker_delete_btn}
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
          variant='contained'
          // onClick={() => handleImage?.()}
          className={styles.media_picker_btn}
        >
          add
        </Button>
      </Grid>
      {isLoading && <div></div>}
    </Grid>
  );
};
