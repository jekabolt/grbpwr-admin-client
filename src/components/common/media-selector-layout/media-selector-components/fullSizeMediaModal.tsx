import { Grid2 as Grid, Snackbar, Theme, Typography, useMediaQuery } from '@mui/material';
import { common_MediaInfo, common_MediaItem } from 'api/proto-http/admin';
import { CopyToClipboard } from 'components/common/copyToClipboard';
import { PreviewMediaForUpload } from 'components/common/cropper/previewMediaForUpload';
import { Dialog } from 'components/common/dialog';
import { FullSizeMediaModalInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';

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
  const isMobile = useMediaQuery((theme: Theme) => theme.breakpoints.down('sm'));
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
          (clickedMedia[type as MediaKey] as common_MediaInfo)?.mediaUrl &&
          isVideo((clickedMedia[type as MediaKey] as common_MediaInfo)?.mediaUrl)
        ) {
          loadVideoDimensions((clickedMedia[type as MediaKey] as common_MediaInfo)?.mediaUrl, type);
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
      <Dialog open={open} onClose={closePreviewAndModal}>
        <Grid container gap={2}>
          <Grid size={{ xs: 12 }} container justifyContent='center'>
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
          {mediaTypes.map((type) => (
            <Grid size={{ xs: 12 }} key={type}>
              <Grid container gap={isMobile ? 'auto' : 2}>
                <Grid size={{ xs: isMobile ? 4 : 'auto' }}>
                  <Typography variant='body1'>
                    {(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.mediaUrl ? (
                      <>{`${type.charAt(0).toUpperCase() + type.slice(1)}`}</>
                    ) : (
                      `No ${type} available`
                    )}
                  </Typography>
                </Grid>
                <Grid>
                  <CopyToClipboard
                    text={(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.mediaUrl || ''}
                    displayText={
                      (clickedMedia?.[type as MediaKey] as common_MediaInfo)?.mediaUrl
                        ? `${(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.mediaUrl?.slice(0, 5)}...${(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.mediaUrl?.slice(-14)}`
                        : 'NO UUID'
                    }
                  />
                </Grid>
                <Grid>
                  <Typography
                    key={type}
                  >{` ${videoDimensions[type] || `${(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.width || 'N/A'}px x ${(clickedMedia?.[type as MediaKey] as common_MediaInfo)?.height || 'N/A'}px`}`}</Typography>
                </Grid>
              </Grid>
            </Grid>
          ))}
        </Grid>
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
