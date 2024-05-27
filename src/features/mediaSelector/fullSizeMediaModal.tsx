import { ContentCopy } from '@mui/icons-material';
import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import { common_MediaInsert } from 'api/proto-http/admin';
import { FullSizeMediaModalInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/media-selector.scss';

type MediaKey = keyof common_MediaInsert;
type VideoDimensions = {
  [key: string]: string | undefined;
};

export const FullSizeMediaModal: FC<FullSizeMediaModalInterface> = ({
  open,
  close,
  clickedMedia,
}) => {
  const [snackBarOpen, setSnackbarOpen] = useState(false);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions>({});

  const loadVideoDimensions = (url: string | undefined, type: string) => {
    if (!url) return;
    const video = document.createElement('video');
    video.addEventListener('loadedmetadata', () => {
      setVideoDimensions((prev) => ({
        ...prev,
        [type]: `${video.videoWidth}px x ${video.videoHeight}px`,
      }));
    });
    video.src = url;
    video.load();
  };

  useEffect(() => {
    if (clickedMedia) {
      ['fullSize', 'compressed', 'thumbnail'].forEach((type) => {
        if (
          clickedMedia[type as MediaKey]?.mediaUrl &&
          isVideo(clickedMedia[type as MediaKey]?.mediaUrl)
        ) {
          loadVideoDimensions(clickedMedia[type as MediaKey]?.mediaUrl, type);
        }
      });
    }
  }, [clickedMedia]);

  const showMessage = (message: string) => {
    setSnackBarMessage(message);
    setSnackbarOpen(true);
  };

  const handleCopyToClipboard = async (text: string | undefined) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      showMessage('URL copied to clipboard!');
    } catch (err) {
      showMessage('Failed to copy URL');
    }
  };

  const trimUrl = (url: string | undefined, maxLength = 30): string => {
    if (!url) return '';
    return url.length > maxLength ? `${url.substring(0, maxLength)}...` : url;
  };

  return (
    <>
      <Dialog open={open} onClose={close} scroll='paper' maxWidth='md'>
        <Box position='relative'>
          <DialogContent className={styles.dialog}>
            <Box component='div' className={styles.full_size_modal_media_container}>
              {clickedMedia &&
                (isVideo(clickedMedia.thumbnail?.mediaUrl) ? (
                  <video src={clickedMedia.thumbnail?.mediaUrl}></video>
                ) : (
                  <img src={clickedMedia.thumbnail?.mediaUrl} alt='' />
                ))}
            </Box>
            {['fullSize', 'compressed', 'thumbnail'].map((type) => (
              <Typography variant='body1' key={type}>
                {clickedMedia?.[type as MediaKey]?.mediaUrl ? (
                  <>
                    {`${type.charAt(0).toUpperCase() + type.slice(1)}: ${trimUrl(clickedMedia[type as MediaKey]?.mediaUrl)}`}
                    <Button
                      size='small'
                      onClick={() =>
                        handleCopyToClipboard(clickedMedia[type as MediaKey]?.mediaUrl)
                      }
                    >
                      <ContentCopy />
                    </Button>
                    {` Dimensions: ${videoDimensions[type] || `${clickedMedia[type as MediaKey]?.width || 'N/A'}px x ${clickedMedia[type as MediaKey]?.height || 'N/A'}px`}`}
                  </>
                ) : (
                  `No ${type} available`
                )}
              </Typography>
            ))}
          </DialogContent>
          <DialogActions>
            <IconButton onClick={close} style={{ position: 'absolute', right: '0', top: '0' }}>
              <CloseIcon fontSize='medium' />
            </IconButton>
          </DialogActions>
        </Box>
      </Dialog>
      <Snackbar
        open={snackBarOpen}
        autoHideDuration={6000}
        onClose={() => setSnackbarOpen(false)}
        message={snackBarMessage}
      />
    </>
  );
};
