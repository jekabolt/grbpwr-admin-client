import { Box, Button, Grid } from '@mui/material';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
import { isBase64Video } from 'features/utilitty/filterContentType';
import { getBase64ImageFromUrl } from 'features/utilitty/getBase64';
import { Dispatch, FC, SetStateAction, useEffect } from 'react';
import styles from 'styles/media-selector.scss';
import { MediaCropper } from './cropper';

interface PreviewMediaForUploadInterface {
  b64Media: string;
  croppedImage: string | null;
  isCropperOpen: boolean;
  handleUploadMedia: () => Promise<void>;
  setCroppedImage: (img: string | null) => void;
  setIsCropperOpen: Dispatch<SetStateAction<boolean>>;
  clear: () => void;
}

export const PreviewMediaForUpload: FC<PreviewMediaForUploadInterface> = ({
  b64Media,
  croppedImage,
  isCropperOpen,
  handleUploadMedia,
  setCroppedImage,
  setIsCropperOpen,
  clear,
}) => {
  useEffect(() => {
    if (checkIsHttpHttpsMediaLink(b64Media)) {
      getBase64ImageFromUrl(b64Media);
    }
  }, [b64Media]);

  return (
    <Grid container justifyContent='center' alignItems='center' gap={1}>
      {b64Media && (
        <>
          <Grid item xs={8} className={styles.preview_media_to_upload}>
            {isBase64Video(b64Media) ? (
              <video src={b64Media} controls></video>
            ) : (
              <img src={croppedImage || b64Media} alt='' />
            )}
          </Grid>
          <Grid item xs={3}>
            {b64Media && (
              <Box display='grid' gap='10px'>
                <Button variant='contained' size='small' onClick={() => setIsCropperOpen(true)}>
                  Crop
                </Button>

                <Button variant='contained' size='small' onClick={handleUploadMedia}>
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

      <MediaCropper
        selectedFile={b64Media}
        open={isCropperOpen}
        close={() => setIsCropperOpen(false)}
        saveCroppedImage={(croppedImageUrl: string) => {
          setCroppedImage(croppedImageUrl);
          setIsCropperOpen(false);
        }}
      />
    </Grid>
  );
};
