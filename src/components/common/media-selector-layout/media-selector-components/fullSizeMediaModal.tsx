import { common_MediaInfo } from 'api/proto-http/admin';
import { PreviewMediaForUpload } from 'components/common/cropper/previewMediaForUpload';
import { FullSizeMediaModalInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import { CopyToClipboard } from 'components/common/utility/copyToClipboard';
import { Dialog } from 'components/common/utility/dialog';
import Text from 'components/ui/text';
import { isVideo } from 'features/utilitty/filterContentType';
import { FC, useEffect, useState } from 'react';

type MediaType = 'fullSize' | 'compressed' | 'thumbnail';
type VideoDimensions = Record<MediaType, string>;

const mediaTypes: MediaType[] = ['fullSize', 'compressed', 'thumbnail'];

export const FullSizeMediaModal: FC<FullSizeMediaModalInterface> = ({
  open,
  clickedMedia,
  croppedImage,
  close,
  setCroppedImage,
  handleUploadMedia,
}) => {
  const [videoDimensions, setVideoDimensions] = useState<Partial<VideoDimensions>>({});
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState<boolean>(true);

  const loadVideoDimensions = (url: string | undefined, type: MediaType) => {
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
      mediaTypes.forEach((type) => {
        const mediaInfo = clickedMedia[type] as common_MediaInfo | undefined;
        if (mediaInfo?.mediaUrl && isVideo(mediaInfo.mediaUrl)) {
          loadVideoDimensions(mediaInfo.mediaUrl, type);
        }
      });
    }
  }, [clickedMedia]);

  const clearDragDropSelector = () => {
    setCroppedImage('');
    setIsPreviewOpen(!isPreviewOpen);
  };

  const closePreviewAndModal = () => {
    close();
    setIsPreviewOpen(false);
  };

  return (
    <Dialog open={open} onClose={closePreviewAndModal}>
      <div className='flex flex-col items-center w-96 gap-4'>
        <PreviewMediaForUpload
          b64Media={clickedMedia?.thumbnail?.mediaUrl || ''}
          croppedImage={croppedImage}
          isCropperOpen={isCropperOpen}
          isMediaSelector={false}
          setCroppedImage={setCroppedImage}
          setIsCropperOpen={setIsCropperOpen}
          clear={clearDragDropSelector}
          handleUploadMedia={handleUploadMedia}
        />

        <div className='w-full'>
          {mediaTypes.map((type) => (
            <div key={type} className='flex gap-3 items-start'>
              <Text variant='uppercase'>{type}</Text>
              <CopyToClipboard text={clickedMedia?.[type]?.mediaUrl || ''} cutText={true} />
              <Text>
                {videoDimensions[type] ||
                  `${clickedMedia?.[type]?.width || 'N/A'}px x ${clickedMedia?.[type]?.height || 'N/A'}px`}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
};
