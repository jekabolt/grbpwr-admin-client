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
import { common_MediaItem } from 'api/proto-http/admin';
import { FullSizeMediaModalInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';
import styles from 'styles/media-selector.scss';
import { PreviewMediaForUpload } from './previewMediaForUpload';

type MediaKey = keyof common_MediaItem;
type VideoDimensions = {
  [key: string]: string | undefined;
};

export const FullSizeMediaModal: FC<FullSizeMediaModalInterface> = ({
  open,
  clickedMedia,
  croppedImage,
  close,
  setCroppedImage,
  handleUploadMedia,
}) => {
  const [snackBarOpen, setSnackbarOpen] = useState(false);
  const [snackBarMessage, setSnackBarMessage] = useState<string>('');
  const [videoDimensions, setVideoDimensions] = useState<VideoDimensions>({});
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(false);

  const togglePreviewMode = () => {
    setIsPreviewOpen(!isPreviewOpen);
  };

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

  const clearDragDropSelector = () => {
    setCroppedImage('');
    setIsPreviewOpen(!isPreviewOpen);
  };

  const closePreviewAndModal = () => {
    close();
    setIsPreviewOpen(false);
  };

  return (
    <>
      <Dialog open={open} onClose={closePreviewAndModal} scroll='paper' maxWidth='lg'>
        <Box position='relative'>
          <DialogContent className={styles.dialog}>
            <Box component='div' className={styles.full_size_modal_media_container}>
              {clickedMedia &&
                (isVideo(clickedMedia.thumbnail?.mediaUrl) ? (
                  <a href={clickedMedia.thumbnail?.mediaUrl} target='_blank'>
                    <video src={clickedMedia.thumbnail?.mediaUrl}></video>
                  </a>
                ) : (
                  <>
                    {isPreviewOpen ? (
                      <PreviewMediaForUpload
                        b64Media={clickedMedia.thumbnail?.mediaUrl || ''}
                        croppedImage={croppedImage}
                        isCropperOpen={isCropperOpen}
                        setCroppedImage={setCroppedImage}
                        setIsCropperOpen={setIsCropperOpen}
                        clear={clearDragDropSelector}
                        handleUploadMedia={handleUploadMedia}
                      />
                    ) : (
                      <a href={clickedMedia.thumbnail?.mediaUrl} target='_blank'>
                        <img src={clickedMedia.thumbnail?.mediaUrl} alt='' />
                      </a>
                    )}
                  </>
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
            <IconButton
              onClick={closePreviewAndModal}
              style={{ position: 'absolute', right: '0', top: '0' }}
            >
              <CloseIcon fontSize='medium' />
            </IconButton>
            <Button
              size='small'
              style={{ position: 'absolute', left: '0', top: '10px' }}
              variant='contained'
              onClick={() => togglePreviewMode()}
            >
              crop media
            </Button>
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
