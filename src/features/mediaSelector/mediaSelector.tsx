import ClearIcon from '@mui/icons-material/Clear';
import { Button, Grid } from '@mui/material';
import { MediaSelectorProps } from 'features/interfaces/mediaSelectorInterfaces';
import { fileExtensionToContentType } from 'features/utilitty/filterExtentions';
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
  const [selectedMedia, setSelectedMedia] = useState<{ url: string; type: string }[]>([]);
  const [saveAttempted, setSaveAttempted] = useState(false);

  const handleMediaAndCloseSelector = async () => {
    setSaveAttempted(true);
    if (selectedMedia.length === 0) {
      return;
    }
    const url = selectedMedia.map((item) => item.url);
    saveSelectedMedia(url);
    closeMediaSelector();
  };

  const select = (mediaUrl: string, allowMultiple: boolean) => {
    const extension = mediaUrl.split('.').pop()?.toLowerCase();

    if (extension) {
      const contentType = fileExtensionToContentType[extension] || 'undefined';

      const mediaType = contentType.startsWith('image')
        ? 'image'
        : contentType.startsWith('video')
          ? 'video'
          : 'undefined';

      setSelectedMedia((prevSelected) => {
        const newMedia = { url: mediaUrl, type: mediaType };
        return allowMultiple
          ? prevSelected.some((media) => media.url === mediaUrl)
            ? prevSelected.filter((media) => media.url !== mediaUrl)
            : [...prevSelected, newMedia]
          : [newMedia];
      });
    }
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
        spacing={1}
        justifyContent='center'
        className={styles.thumbnail_picker}
        ref={wrapperRef}
      >
        <Grid item xs={7}>
          <UploadMediaByUrlByDragDrop
            reload={reload}
            closeMediaSelector={closeMediaSelector}
            url={url}
            setUrl={setUrl}
            updateContentLink={updateLink}
          />
        </Grid>
        <Grid item xs={12}>
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
