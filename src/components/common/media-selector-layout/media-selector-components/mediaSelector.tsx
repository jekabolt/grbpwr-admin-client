import { PreviewMediaForUpload } from 'components/common/cropper/previewMediaForUpload';
import { MediaSelectorInterface } from 'components/common/interfaces/mediaSelectorInterfaces';
import Text from 'components/ui/text';
import { useMediaSelectorStore } from 'lib/stores/media/store';
import { FC, useState } from 'react';
import 'react-advanced-cropper/dist/style.css';
import { ByUrl } from './byUrl';
import { DragDrop } from './dragDrop';
import { MediaList } from './listMedia';

export const MediaSelector: FC<MediaSelectorInterface> = ({
  allowMultiple,
  selectedMedia,
  enableModal,
  aspectRatio,
  hideVideos,
  isDeleteAccepted,
  select,
}) => {
  const [isCropperOpen, setIsCropperOpen] = useState<boolean>(false);
  const [isFullSizeModalOpen, setIsFullSizeModalOpen] = useState(false);
  const { uploadState, status, resetUpload } = useMediaSelectorStore();

  return (
    <div className='gap-10 flex items-center flex-col'>
      {status.isLoading && (
        <div className='fixed inset-0 bg-black/50 flex items-center justify-center z-50'>
          <div className='animate-spin w-10 h-10 border-2 border-gray-300 border-t-text rounded-full' />
        </div>
      )}
      <div className='flex flex-col gap-4 justify-between items-center py-4 border border-text w-1/2'>
        <div className='w-1/2'>
          <ByUrl />
        </div>
        <Text variant='uppercase'>OR</Text>
        <div className='w-3/4'>
          <DragDrop />
        </div>
      </div>
      {(uploadState.selectedFileUrl || uploadState.url) && !isFullSizeModalOpen && (
        <PreviewMediaForUpload
          b64Media={uploadState.selectedFileUrl || uploadState.url || ''}
          isCropperOpen={isCropperOpen}
          isMediaSelector={true}
          setIsCropperOpen={setIsCropperOpen}
          clear={resetUpload}
        />
      )}
      <MediaList
        allowMultiple={allowMultiple}
        selectedMedia={selectedMedia}
        enableModal={enableModal}
        aspectRatio={aspectRatio}
        hideVideos={hideVideos}
        isDeleteAccepted={isDeleteAccepted}
        select={select}
        onModalStateChange={setIsFullSizeModalOpen}
      />
    </div>
  );
};
