import { Button, Grid } from '@mui/material';
import { MediaSelectorProps } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useRef } from 'react';
import styles from 'styles/product-id-media.scss';
import { MediaList } from './listMedia';
import { UploadMediaByUrlByDragDrop } from './uploadMediaByUrlByDragDrop';

export const MediaSelector: FC<MediaSelectorProps> = ({
  url,
  setUrl,
  updateMediaByUrl,
  handleSelectedMedia,
  closeMediaSelecor,
  allowMultiple,
  select,
  selectedMedia,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { media, reload, isLoading, hasMore, fetchFiles, setMedia } = useMediaSelector();

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchFiles(5, media.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, media.length, fetchFiles]);

  useEffect(() => {
    fetchFiles(5, 0);
  }, [fetchFiles]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        closeMediaSelecor();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, closeMediaSelecor]);
  return (
    <div className={styles.thumbnail_picker_editor_overlay}>
      <Grid container spacing={2} className={styles.thumbnail_picker} ref={wrapperRef}>
        <Grid item xs={6}>
          <UploadMediaByUrlByDragDrop
            reload={reload}
            url={url}
            setUrl={setUrl}
            updateMediaByUrl={updateMediaByUrl}
          />
        </Grid>
        <Grid item xs={6}>
          <MediaList
            handleSelectedMedia={handleSelectedMedia}
            setMedia={setMedia}
            media={media}
            allowMultiple={allowMultiple}
            select={select}
            selectedMedia={selectedMedia}
          />
        </Grid>
        <Button
          sx={{ backgroundColor: 'black' }}
          variant='contained'
          size='small'
          className={styles.close_thumbnail_picker}
          onClick={closeMediaSelecor}
        >
          x
        </Button>
      </Grid>
    </div>
  );
};
