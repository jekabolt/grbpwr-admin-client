import ClearIcon from '@mui/icons-material/Clear';
import { Alert, Box, Button, Dialog, Grid, IconButton, Snackbar } from '@mui/material';
import { common_MediaFull } from 'api/proto-http/admin';
import { MediaSelectorProps } from 'features/interfaces/mediaSelectorInterfaces';
import useMediaSelector from 'features/utilitty/useMediaSelector';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { FilterMedias } from './filterMedias';
import { MediaList } from './listMedia';

export const MediaSelector: FC<MediaSelectorProps> = ({
  closeMediaSelector,
  allowMultiple,
  saveSelectedMedia,
}) => {
  const {
    media,
    reload,
    fetchFiles,
    setMedia,
    url,
    setUrl,
    updateLink,
    sortedAndFilteredMedia,
    filterByType,
    setFilterByType,
    sortByDate,
    setSortByDate,
    isLoading,
    snackBarMessage,
    closeSnackBar,
    isSnackBarOpen,
    showMessage,
    snackBarSeverity,
  } = useMediaSelector();
  const [selectedMedia, setSelectedMedia] = useState<common_MediaFull[]>([]);
  const [open, setOpen] = useState(true);

  const handleMediaAndCloseSelector = async () => {
    if (selectedMedia.length === 0) {
      showMessage('NO SELECTED MEDIA', 'error');
      return;
    }
    saveSelectedMedia(selectedMedia);
    handleClose();
  };

  // const select = (mediaUrl: string, allowMultiple: boolean) => {
  //   const extension = mediaUrl.split('.').pop()?.toLowerCase();

  //   if (extension) {
  //     const contentType = fileExtensionToContentType[extension] || undefined;

  //     const mediaType = contentType?.startsWith('image')
  //       ? 'image'
  //       : contentType?.startsWith('video')
  //         ? 'video'
  //         : undefined;

  //     if (mediaType) {
  //       setSelectedMedia((prevSelected) => {
  //         const newMedia = { url: mediaUrl, type: mediaType };
  //         return allowMultiple
  //           ? prevSelected.some((media) => media.url === mediaUrl)
  //             ? prevSelected.filter((media) => media.url !== mediaUrl)
  //             : [...prevSelected, newMedia]
  //           : [newMedia];
  //       });
  //     }
  //   }
  // };

  const select = (media: common_MediaFull, allowMultiple: boolean) => {
    setSelectedMedia((prevSelected) => {
      return allowMultiple
        ? prevSelected.some((item) => item.id === media.id)
          ? prevSelected.filter((item) => item.id !== media.id)
          : [...prevSelected, media]
        : [media];
    });
  };

  useEffect(() => {
    fetchFiles(50, 0);
  }, [fetchFiles]);

  const handleClose = () => {
    setOpen(false);
    closeMediaSelector();
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby='media-selector-dialog-title'
        fullWidth={true}
        maxWidth='xl'
        className={styles.modal}
      >
        <Grid container spacing={2} justifyContent='center'>
          <Grid item xs={11} className={styles.filter_upload_boxes}>
            <Box component='div' className={styles.filter_upload_media_container}>
              <ByUrl
                url={url}
                setUrl={setUrl}
                updateContentLink={updateLink}
                isLoading={isLoading}
              />
              <DragDrop reload={reload} />
              <FilterMedias
                filterByType={filterByType}
                setFilterByType={setFilterByType}
                sortByDate={sortByDate}
                setSortByDate={setSortByDate}
              />
            </Box>
          </Grid>
          <Grid item xs={12}>
            <MediaList
              setMedia={setMedia}
              media={media}
              allowMultiple={allowMultiple}
              select={select}
              selectedMedia={selectedMedia}
              sortedAndFilteredMedia={sortedAndFilteredMedia}
            />
          </Grid>
          <Grid item xs={12} display='flex' justifyContent='center'>
            <Button onClick={handleMediaAndCloseSelector} variant='contained' size='small'>
              Save
            </Button>
          </Grid>
          <IconButton
            className={styles.close_modal}
            size='small'
            aria-label='close'
            onClick={handleClose}
          >
            <ClearIcon />
          </IconButton>
        </Grid>
        <Snackbar open={isSnackBarOpen} autoHideDuration={3000} onClose={closeSnackBar}>
          <Alert severity={snackBarSeverity}>{snackBarMessage}</Alert>
        </Snackbar>
      </Dialog>
    </>
  );
};
