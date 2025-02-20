import { Button, Grid } from '@mui/material';
import { PreviewMediaForUploadInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
import { isBase64Video } from 'features/utilitty/filterContentType';
import { getBase64ImageFromUrl } from 'features/utilitty/getBase64';
import { FC, useEffect } from 'react';
// import styles from 'styles/media-selector.scss';
import { MediaCropper } from './cropper';

export const PreviewMediaForUpload: FC<PreviewMediaForUploadInterface> = ({
  b64Media,
  croppedImage,
  isCropperOpen,
  isMediaSelector,
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

  const uploadCroppedMediaAndCloseModal = () => {
    handleUploadMedia();
    clear();
  };

  return (
    <Grid container padding='2%' spacing={2}>
      {b64Media && (
        <>
          <Grid
            item
            xs={12}
            // className={styles.preview_media_to_upload}
          >
            {isBase64Video(b64Media) ? (
              <video src={b64Media} controls></video>
            ) : isMediaSelector ? (
              <img src={croppedImage || b64Media} alt='' />
            ) : (
              <a href={b64Media} target='_blank'>
                <img src={croppedImage || b64Media} alt='' />
              </a>
            )}
          </Grid>
          <Grid item xs={4}>
            <Button
              variant='contained'
              fullWidth
              size='small'
              onClick={() => setIsCropperOpen(true)}
              disabled={isBase64Video(b64Media)}
            >
              crop
            </Button>
          </Grid>
          <Grid item xs={4}>
            <Button
              variant='contained'
              fullWidth
              size='small'
              disabled={!croppedImage && !isMediaSelector}
              onClick={uploadCroppedMediaAndCloseModal}
            >
              upload
            </Button>
          </Grid>
          <Grid item xs={4}>
            <Button
              variant='contained'
              fullWidth
              disabled={!croppedImage && !isMediaSelector}
              size='small'
              onClick={clear}
            >
              clear
            </Button>
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
