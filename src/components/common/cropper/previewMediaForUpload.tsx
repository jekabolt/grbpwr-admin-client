import { PreviewMediaForUploadInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import { Button } from 'components/ui/button';
import Media from 'components/ui/media';
import { checkIsHttpHttpsMediaLink } from 'features/utilitty/checkIsHttpHttpsLink';
import { isBase64Video, isVideo } from 'features/utilitty/filterContentType';
import { getBase64ImageFromUrl } from 'features/utilitty/getBase64';
import { FC, useEffect } from 'react';
import { MediaCropper } from './cropper';

export const PreviewMediaForUpload: FC<PreviewMediaForUploadInterface> = ({
  b64Media,
  croppedImage,
  isCropperOpen,
  isMediaSelector = false,
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
    <div className='w-full flex justify-center'>
      {b64Media && (
        <div className='w-96 space-y-4'>
          <div className='w-full'>
            {isMediaSelector ? (
              <Media
                src={croppedImage || b64Media || ''}
                alt={b64Media}
                type={isBase64Video(b64Media) ? 'video' : 'image'}
                aspectRatio={croppedImage ? 'auto' : '4/5'}
                controls={isBase64Video(b64Media)}
              />
            ) : (
              <a href={b64Media} target='_blank' rel='noopener noreferrer'>
                <Media
                  src={croppedImage || b64Media || ''}
                  alt=''
                  aspectRatio={croppedImage ? 'auto' : '4/5'}
                  type={isVideo(b64Media) ? 'video' : 'image'}
                  controls={isVideo(b64Media)}
                />
              </a>
            )}
          </div>
          <div className='grid grid-cols-3 gap-3'>
            <Button
              size='lg'
              onClick={() => setIsCropperOpen(true)}
              disabled={isBase64Video(b64Media)}
            >
              crop
            </Button>
            <Button
              size='lg'
              disabled={!croppedImage && !isMediaSelector}
              onClick={uploadCroppedMediaAndCloseModal}
            >
              upload
            </Button>
            <Button size='lg' disabled={!croppedImage && !isMediaSelector} onClick={clear}>
              clear
            </Button>
          </div>
        </div>
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
    </div>
  );
};
