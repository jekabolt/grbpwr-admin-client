import CloseIcon from '@mui/icons-material/Close';
import {
  Box,
  Dialog,
  DialogActions,
  DialogContent,
  Grid,
  IconButton,
  Snackbar,
  Typography,
} from '@mui/material';
import { common_MediaItem } from 'api/proto-http/admin';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { FullSizeMediaModalInterface } from 'features/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';
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
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(true);
  const mediaTypes = ['fullSize', 'compressed', 'thumbnail'];

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
      <Dialog open={open} onClose={closePreviewAndModal} scroll='paper' maxWidth='md'>
        <Box position='relative'>
          <Grid container spacing={2}>
            <DialogContent>
              <Grid xs={12} padding='2%'>
                {clickedMedia &&
                  (isVideo(clickedMedia.thumbnail?.mediaUrl) ? (
                    <a href={clickedMedia.thumbnail?.mediaUrl} target='_blank'>
                      <video src={clickedMedia.thumbnail?.mediaUrl} controls></video>
                    </a>
                  ) : (
                    <PreviewMediaForUpload
                      b64Media={clickedMedia.thumbnail?.mediaUrl || ''}
                      croppedImage={croppedImage}
                      isCropperOpen={isCropperOpen}
                      isMediaSelector={false}
                      setCroppedImage={setCroppedImage}
                      setIsCropperOpen={setIsCropperOpen}
                      clear={clearDragDropSelector}
                      handleUploadMedia={handleUploadMedia}
                    />
                  ))}
              </Grid>
            </DialogContent>
            <DialogContent>
              <Grid container spacing={2}>
                {mediaTypes.map((type) => (
                  <Grid item xs={12} key={type}>
                    <Grid container alignItems='center'>
                      <Grid item xs={4} sm={1}>
                        <Typography variant='body1'>
                          {clickedMedia?.[type as MediaKey]?.mediaUrl ? (
                            <>{`${type.charAt(0).toUpperCase() + type.slice(1)}`}</>
                          ) : (
                            `No ${type} available`
                          )}
                        </Typography>
                      </Grid>
                      <Grid item xs={8} sm={4}>
                        <CopyToClipboard
                          text={clickedMedia?.[type as MediaKey]?.mediaUrl || ''}
                          displayText={
                            clickedMedia?.[type as MediaKey]?.mediaUrl
                              ? `${clickedMedia?.[type as MediaKey]?.mediaUrl?.slice(0, 5)}...${clickedMedia?.[type as MediaKey]?.mediaUrl?.slice(-14)}`
                              : 'NO UUID'
                          }
                        />
                      </Grid>
                      <Grid item xs={12} sm={3}>
                        <Typography
                          key={type}
                        >{` ${videoDimensions[type] || `${clickedMedia?.[type as MediaKey]?.width || 'N/A'}px x ${clickedMedia?.[type as MediaKey]?.height || 'N/A'}px`}`}</Typography>
                      </Grid>
                    </Grid>
                  </Grid>
                ))}
              </Grid>
            </DialogContent>
          </Grid>
          <DialogActions>
            <IconButton
              onClick={closePreviewAndModal}
              style={{ position: 'absolute', right: '0', top: '0' }}
            >
              <CloseIcon fontSize='small' />
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
