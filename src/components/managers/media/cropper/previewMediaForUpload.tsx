import { common_MediaItem } from 'api/proto-http/admin';

import { isBase64Video, isVideo } from 'lib/features/filterContentType';
import { useMediaSelectorStore } from 'lib/stores/media/store';
import { FC } from 'react';
import { Button } from 'ui/components/button';
import Media from 'ui/components/media';
import { MediaCropper } from './cropper';

interface PreviewMediaForUploadProps {
  b64Media: string;
  isCropperOpen: boolean;
  isMediaSelector?: boolean;
  clickedMedia?: common_MediaItem;
  setIsCropperOpen: (open: boolean) => void;
  clear?: () => void;
}

export const PreviewMediaForUpload: FC<PreviewMediaForUploadProps> = ({
  b64Media,
  isCropperOpen,
  isMediaSelector = false,
  setIsCropperOpen,
  clear,
}) => {
  const { uploadState, uploadMedia, prepareUpload } = useMediaSelectorStore();

  const uploadCroppedMediaAndCloseModal = async () => {
    await uploadMedia();
    clear?.();
  };

  return (
    <div className='w-full flex justify-center'>
      {b64Media && (
        <div className='w-96 space-y-4'>
          <div className='w-full'>
            {isMediaSelector ? (
              <Media
                src={uploadState.croppedImage || b64Media || ''}
                alt={b64Media}
                type={isBase64Video(b64Media) ? 'video' : 'image'}
                aspectRatio={uploadState.croppedImage ? 'auto' : '4/5'}
                controls={isBase64Video(b64Media)}
              />
            ) : (
              <a href={b64Media} target='_blank' rel='noopener noreferrer'>
                <Media
                  src={uploadState.croppedImage || b64Media || ''}
                  alt={b64Media}
                  aspectRatio={uploadState.croppedImage ? 'auto' : '4/5'}
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
              disabled={!uploadState.croppedImage && !isMediaSelector}
              onClick={uploadCroppedMediaAndCloseModal}
            >
              upload
            </Button>
            <Button
              size='lg'
              disabled={!uploadState.croppedImage && !isMediaSelector}
              onClick={clear}
            >
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
          prepareUpload({ croppedImage: croppedImageUrl });
          setIsCropperOpen(false);
        }}
      />
    </div>
  );
};
