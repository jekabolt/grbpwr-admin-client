import { Button, Grid } from '@mui/material';
import { FC, useEffect, useRef } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaListPickerComponents } from '../../../utility/interfaces';
import { UploadThumbnailByUrl } from '../../thumbnail/thumbnail-features/uploadByUrl-uploadByDragDrop/uploadThumbByUrlDragDrop';
import { ListImage } from './imageList';

export const MediaListPicker: FC<MediaListPickerComponents> = ({
  reload,
  url,
  setUrl,
  updateNewMediaByUrl,
  closeThumbnailPicker,
  select,
  handleImage,
  selectedMedia,
  setMedia,
  media,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        closeThumbnailPicker?.();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, closeThumbnailPicker]);
  return (
    <div className={styles.thumbnail_picker_editor_overlay}>
      <Grid container spacing={2} className={styles.thumbnail_picker} ref={wrapperRef}>
        <Grid item xs={6}>
          <UploadThumbnailByUrl
            reload={reload}
            url={url}
            setUrl={setUrl}
            updateNewMediaByUrl={updateNewMediaByUrl}
          />
        </Grid>
        <Grid item xs={6}>
          <ListImage
            select={select}
            selectedMedia={selectedMedia}
            handleImage={handleImage}
            setMedia={setMedia}
            media={media}
          />
        </Grid>
        <Button
          sx={{ backgroundColor: 'black' }}
          variant='contained'
          size='small'
          className={styles.close_thumbnail_picker}
          onClick={closeThumbnailPicker}
        >
          x
        </Button>
      </Grid>
    </div>
  );
};
