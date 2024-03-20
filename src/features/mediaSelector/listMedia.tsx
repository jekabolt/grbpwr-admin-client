import { Button, Grid, IconButton, ImageList, ImageListItem } from '@mui/material';
import { deleteFiles } from 'api/admin';
import { MediaSelectorMediaListProps } from 'features/interfaces/mediaSelectorInterfaces';
import { FC } from 'react';
import styles from 'styles/product-id-media.scss';

export const MediaList: FC<MediaSelectorMediaListProps> = ({
  media,
  handleSelectedMedia,
  setMedia,
  allowMultiple,
  select,
  selectedMedia,
}) => {
  const handleDeleteFile = async (id: number | undefined) => {
    await deleteFiles({ id });
    setMedia?.((currentFiles) => currentFiles?.filter((file) => file.id !== id));
  };

  return (
    <Grid container spacing={2} justifyContent='center'>
      <Grid item xs={11}>
        {media && (
          <ImageList
            variant='standard'
            sx={{
              width: '100%',
              height: 400,
              padding: 2,
            }}
            cols={3}
            gap={8}
            className={styles.thumbnail_picker_list}
            rowHeight={180}
          >
            {media.map((m) => (
              <ImageListItem key={m.id} className={styles.thumbnail_picker_item_wrapper}>
                <input
                  type='checkbox'
                  checked={selectedMedia?.includes(m.media?.fullSize ?? '')}
                  onChange={() => select(m.media?.fullSize ?? '', allowMultiple)}
                  id={`${m.id}`}
                  style={{ display: 'none' }}
                />
                <label htmlFor={`${m.id}`}>
                  {selectedMedia?.includes(m.media?.fullSize ?? '') ? (
                    <span className={styles.media_selector_img_number}>selected</span>
                  ) : null}
                  <img
                    key={m.id}
                    src={m.media?.fullSize}
                    alt='video'
                    className={`${
                      selectedMedia?.includes(m.media?.fullSize ?? '') ? styles.selected_media : ''
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
      <Grid item xs={2}>
        <Button
          onClick={handleSelectedMedia}
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