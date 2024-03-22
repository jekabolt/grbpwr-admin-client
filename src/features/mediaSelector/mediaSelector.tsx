import ClearIcon from '@mui/icons-material/Clear';
import { Button, Grid } from '@mui/material';
import { MediaSelectorProps } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useRef, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { MediaList } from './listMedia';
import { UploadMediaByUrlByDragDrop } from './uploadMediaByUrlByDragDrop';

export const MediaSelector: FC<MediaSelectorProps> = ({
  closeMediaSelector,
  allowMultiple,
  saveSelectedMedia,
}) => {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const { media, reload, isLoading, hasMore, fetchFiles, setMedia, url, setUrl, updateLink } =
    useMediaSelector();
  const [selectedMedia, setSelectedMedia] = useState<string[]>([]);
  const [saveAttempted, setSaveAttempted] = useState(false);

  const handleMediaAndCloseSelector = async () => {
    setSaveAttempted(true);
    if (selectedMedia.length === 0) {
      return;
    }
    console.log(selectedMedia);
    saveSelectedMedia(selectedMedia);
    closeMediaSelector();
  };

  const select = (imageUrl: string, allowMultiple: boolean) => {
    setSelectedMedia((prevSelected) => {
      const newSelected = allowMultiple
        ? prevSelected.includes(imageUrl)
          ? prevSelected.filter((id) => id !== imageUrl)
          : [...prevSelected, imageUrl]
        : [imageUrl];
      // saveSelectedMedia(selectedMedia);
      return newSelected;
    });
  };

  useEffect(() => {
    const handleScroll = () => {
      if (
        window.innerHeight + window.scrollY + 300 >= document.documentElement.offsetHeight &&
        !isLoading &&
        hasMore
      ) {
        fetchFiles(50, media.length);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isLoading, hasMore, media.length, fetchFiles]);

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        closeMediaSelector();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [wrapperRef, closeMediaSelector]);

  return (
    <div className={styles.thumbnail_picker_editor_overlay}>
      <Grid
        container
        spacing={2}
        alignItems='center'
        justifyContent='center'
        className={styles.thumbnail_picker}
        ref={wrapperRef}
      >
        <Grid item xs={6}>
          <UploadMediaByUrlByDragDrop
            reload={reload}
            closeMediaSelector={closeMediaSelector}
            url={url}
            setUrl={setUrl}
            updateContentLink={updateLink}
          />
        </Grid>
        <Grid item xs={6}>
          <MediaList
            setMedia={setMedia}
            media={media}
            allowMultiple={allowMultiple}
            select={select}
            selectedMedia={selectedMedia}
          />
        </Grid>
        <Grid item xs={12} sx={{ padding: '10px' }} display='flex' justifyContent='center'>
          <Button
            onClick={handleMediaAndCloseSelector}
            variant='contained'
            size='small'
            className={styles.media_selector_btn}
          >
            save
          </Button>
        </Grid>
        <Button
          sx={{ backgroundColor: 'black' }}
          aria-label='delete'
          variant='contained'
          size='small'
          className={styles.close_thumbnail_picker}
          onClick={closeMediaSelector}
        >
          <ClearIcon />
        </Button>
        <Grid item>
          {saveAttempted && selectedMedia.length === 0 && (
            <h4 className={styles.no_media_message}>
              No media selected. Please select or upload media.
            </h4>
          )}
        </Grid>
      </Grid>
    </div>
  );
};
