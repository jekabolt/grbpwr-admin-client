import { Box, Button, Grid } from '@mui/material';
import { Dispatch, FC, SetStateAction } from 'react';
import styles from 'styles/media-selector.scss';

interface PreviewMediaForUploadInterface {
  croppedImage: string | null;
  selectedFileUrl: string;
  handleUpload: () => void;
  setIsCropperOpen: Dispatch<SetStateAction<boolean>>;
  url: string;
  updateContentLink: () => Promise<void>;
  clear: () => void;
  mime: string;
}

export const PreviewMediaForUpload: FC<PreviewMediaForUploadInterface> = ({
  croppedImage,
  selectedFileUrl,
  handleUpload,
  setIsCropperOpen,
  url,
  updateContentLink,
  clear,
  mime,
}) => {
  const isHttpsMediaLink = (url: string) => {
    const lowerCaseUrl = url.toLowerCase();
    const pattern = /^https:\/\/.*\.(jpg|jpeg|png|gif|bmp|svg|mp4|avi|mov|wmv|webp|webm)$/i;
    return pattern.test(lowerCaseUrl);
  };

  const isVideo = (mimeType: string) => {
    return mimeType.startsWith('video/');
  };

  return (
    <Grid container justifyContent='center' alignItems='center' gap={1}>
      {(croppedImage || selectedFileUrl || (url && isHttpsMediaLink(url))) && (
        <>
          <Grid item xs={8} className={styles.preview_media_to_upload}>
            {isVideo(mime) ? (
              <video src={selectedFileUrl}></video>
            ) : (
              <img
                src={croppedImage || selectedFileUrl || (isHttpsMediaLink(url) ? url : undefined)}
                alt=''
              />
            )}
          </Grid>
          <Grid item xs={3}>
            {isHttpsMediaLink(url) && (
              <Button variant='contained' size='small' onClick={updateContentLink}>
                Upload
              </Button>
            )}
            {selectedFileUrl && (
              <Box display='grid' gap='10px'>
                {!isVideo(mime) && (
                  <Button variant='contained' size='small' onClick={() => setIsCropperOpen(true)}>
                    Crop
                  </Button>
                )}
                <Button variant='contained' size='small' onClick={handleUpload}>
                  Upload
                </Button>
                <Button variant='contained' size='small' onClick={clear}>
                  clear
                </Button>
              </Box>
            )}
          </Grid>
        </>
      )}
    </Grid>
  );
};
